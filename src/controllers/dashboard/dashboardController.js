// src/controllers/dashboard/dashboardController.js
//
// ONE endpoint feeds the whole dashboard:  GET /api/dashboard?period=monthly&count=6
//
// Design rules (why it is built this way):
//  1. Tenant safety  - every query is scoped by `userId: owner`, where owner is
//     req.userId (= tenantId for staff, own _id for the owner). We cast it to an
//     ObjectId because aggregate() does NOT auto-cast like find() does.
//  2. Permission safety - the route only checks "dashboard:view". A staff member
//     who may see the dashboard but NOT salaries must not receive salary data,
//     so every section is computed only if the user has "<module>:view".
//     Sections the user cannot see come back as `null`.
//  3. Resilience - each section runs on its own. If one aggregation fails the
//     rest of the dashboard still loads and the failure is listed in `errors`.
//  4. Few round-trips - one $facet aggregate per collection instead of 30 small
//     queries, all sections running in parallel.
//  5. Honest numbers - Car.purchasePrice is no longer collected, so we do NOT
//     fake a "profit" figure. We report real money movement (cash in / out).

import mongoose from "mongoose";
import Car from "../../models/Car.js";
import Sale from "../../models/Sale.js";
import Exchange from "../../models/Exchange.js";
import Expense from "../../models/Expense.js";
import Employee from "../../models/Employee.js";
import Salary from "../../models/employeeSalary.js";
import Dealer from "../../models/Dealer.js";
import Log from "../../models/Log.js";

// ---------------------------------------------------------------------------
// Config & small helpers
// ---------------------------------------------------------------------------
const TZ = process.env.APP_TIMEZONE || "Asia/Karachi";
const DAY_MS = 24 * 60 * 60 * 1000;
// The three views of the dashboard. `fmt` is the MongoDB $dateToString format
// that puts a date into its bucket (ISO week "2026-W42", month "2026-10", year "2026").
const PERIODS = {
  weekly: { unit: "week", fmt: "%G-W%V", defaultCount: 8, min: 2, max: 26 },
  monthly: { unit: "month", fmt: "%Y-%m", defaultCount: 6, min: 2, max: 24 },
  yearly: { unit: "year", fmt: "%Y", defaultCount: 3, min: 2, max: 10 },
};

const OLD_STOCK_DAYS = 90;

// Expenses categorised as "Salary" are treated as payroll, so the cash-flow
// numbers do not count them twice when the Salaries module is used as well.
const PAYROLL_EXPENSE_CATEGORY = "Salary";

const num = (v) => Number(v) || 0;

// % change vs previous period. null = "no baseline" (previous was 0, current > 0)
const pctChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

// Today's calendar date in the business timezone (not the server timezone),
// returned as a UTC-midnight Date so day arithmetic is simple and DST-proof.
const todayInTz = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
};

// ISO-8601 week key ("2026-W42") for a UTC-midnight date. Matches MongoDB's
// %G-W%V, so JS buckets and database buckets line up exactly. Weeks start Monday.
const isoWeekKey = (date) => {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday of this ISO week
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - new Date(Date.UTC(year, 0, 1))) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

// Oldest -> newest list of buckets: [{ key, label, start }]
//   weekly : label "12 Oct"  (the Monday that starts the week)
//   monthly: label "Oct"     ("Oct 25" when more than 12 months are shown)
//   yearly : label "2026"
const buildBuckets = (period, count) => {
  const today = todayInTz();
  const buckets = [];

  if (period === "weekly") {
    const monday = new Date(today.getTime() - ((today.getUTCDay() || 7) - 1) * DAY_MS);
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(monday.getTime() - i * 7 * DAY_MS);
      buckets.push({
        key: isoWeekKey(start),
        label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
        start,
      });
    }
  } else if (period === "yearly") {
    for (let i = count - 1; i >= 0; i--) {
      const year = today.getUTCFullYear() - i;
      buckets.push({ key: String(year), label: String(year), start: new Date(Date.UTC(year, 0, 1)) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const mon = start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      buckets.push({
        key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
        label: count > 12 ? `${mon} ${String(start.getUTCFullYear()).slice(2)}` : mon,
        start,
      });
    }
  }
  return buckets;
};

// Start of the query window, widened by 14h so timezone offsets can never cut
// off the first bucket. Rows outside the bucket list are dropped when filling.
const windowStartFor = (buckets) => new Date(buckets[0].start.getTime() - 14 * 60 * 60 * 1000);

// Turns aggregate rows ({_id: "2026-W42", ...}) into one entry per bucket,
// filling buckets that have no data with zeros so charts never have gaps.
const fillBuckets = (buckets, rows, fields) => {
  const byKey = new Map(rows.map((r) => [r._id, r]));
  return buckets.map(({ key, label }) => {
    const row = byKey.get(key) || {};
    const entry = { key, label };
    fields.forEach((f) => {
      entry[f] = num(row[f]);
    });
    return entry;
  });
};

const sumOf = (list, field) => list.reduce((s, x) => s + num(x[field]), 0);
const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r]));

// ---------------------------------------------------------------------------
// Reusable Mongo expressions for a Sale document
// ---------------------------------------------------------------------------
// Agreed sale price: same rule as getSaleStats (fullPaymentAmount, else the
// price snapshot taken when the sale was created).
const SALE_TOTAL = {
  $ifNull: ["$fullPaymentAmount", { $ifNull: ["$carSnapshot.salePrice", 0] }],
};

const saleMoneyStages = [
  {
    $addFields: {
      _total: SALE_TOTAL,
      // Cash actually received so far
      _collected: {
        $cond: [
          { $eq: ["$paymentType", "Instalment"] },
          {
            $add: [
              { $ifNull: ["$advancePayment", 0] },
              { $sum: "$payments.amount" },
            ],
          },
          SALE_TOTAL,
        ],
      },
      // Cash received on the day of the sale itself
      _initialCash: {
        $cond: [
          { $eq: ["$paymentType", "Instalment"] },
          { $ifNull: ["$advancePayment", 0] },
          SALE_TOTAL,
        ],
      },
    },
  },
  {
    $addFields: {
      _outstanding: { $max: [0, { $subtract: ["$_total", "$_collected"] }] },
    },
  },
];

// ---------------------------------------------------------------------------
// Section builders - each returns a plain object (or throws)
// ---------------------------------------------------------------------------
const buildCars = async ({ owner, buckets, windowStart, bucketOf }) => {
  const [result] = await Car.aggregate([
    { $match: { userId: owner } },
    {
      $addFields: {
        _age: {
          $max: [
            0,
            { $floor: { $divide: [{ $subtract: ["$$NOW", "$dateAdded"] }, DAY_MS] } },
          ],
        },
      },
    },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$salePrice", 0] } },
            },
          },
        ],
        // Only cars still in the showroom (not sold) matter for aging
        aging: [
          { $match: { status: { $in: ["Available", "Reserved"] } } },
          {
            $group: {
              _id: {
                $switch: {
                  branches: [
                    { case: { $lte: ["$_age", 30] }, then: "0-30" },
                    { case: { $lte: ["$_age", 60] }, then: "31-60" },
                    { case: { $lte: ["$_age", 90] }, then: "61-90" },
                  ],
                  default: "90+",
                },
              },
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$salePrice", 0] } },
            },
          },
        ],
        avgAge: [
          { $match: { status: { $in: ["Available", "Reserved"] } } },
          { $group: { _id: null, avg: { $avg: "$_age" } } },
        ],
        byCompany: [
          { $match: { status: { $in: ["Available", "Reserved"] } } },
          {
            $group: {
              _id: "$company",
              count: { $sum: 1 },
              value: { $sum: { $ifNull: ["$salePrice", 0] } },
            },
          },
          { $sort: { count: -1, value: -1 } },
          { $limit: 6 },
        ],
        added: [
          { $match: { dateAdded: { $gte: windowStart } } },
          { $group: { _id: bucketOf("$dateAdded"), count: { $sum: 1 } } },
        ],
        oldest: [
          { $match: { status: "Available" } },
          { $sort: { dateAdded: 1 } },
          { $limit: 5 },
          {
            $project: {
              company: 1,
              model: 1,
              variant: 1,
              year: 1,
              salePrice: 1,
              dateAdded: 1,
              ageDays: "$_age",
              image: { $arrayElemAt: ["$images", 0] },
            },
          },
        ],
      },
    },
  ]);

  const status = toMap(result.byStatus);
  const count = (s) => num(status[s]?.count);
  const inStock = count("Available") + count("Reserved");
  const stockValue = num(status.Available?.value) + num(status.Reserved?.value);

  const agingMap = toMap(result.aging);
  const agingBuckets = ["0-30", "31-60", "61-90", "90+"].map((range) => ({
    range,
    count: num(agingMap[range]?.count),
    value: num(agingMap[range]?.value),
  }));

  return {
    summary: {
      total: count("Available") + count("Reserved") + count("Sold"),
      available: count("Available"),
      reserved: count("Reserved"),
      sold: count("Sold"),
      inStock,
      stockValue,
      avgAgeDays: Math.round(num(result.avgAge[0]?.avg)),
      oldStockCount: num(agingMap["90+"]?.count),
    },
    byStatus: ["Available", "Reserved", "Sold"].map((name) => ({
      name,
      value: count(name),
    })),
    aging: agingBuckets,
    topCompanies: result.byCompany.map((c) => ({
      name: c._id || "Unknown",
      count: c.count,
      value: c.value,
    })),
    addedTrend: fillBuckets(buckets, result.added, ["count"]),
    oldestStock: result.oldest,
  };
};

const buildSales = async ({ owner, buckets, windowStart, bucketOf }) => {
  const [result] = await Sale.aggregate([
    { $match: { userId: owner } },
    ...saleMoneyStages,
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              revenue: { $sum: "$_total" },
              collected: { $sum: "$_collected" },
              outstanding: { $sum: "$_outstanding" },
            },
          },
        ],
        paymentMix: [
          {
            $group: {
              _id: "$paymentType",
              count: { $sum: 1 },
              revenue: { $sum: "$_total" },
            },
          },
        ],
        monthly: [
          { $match: { saleDate: { $gte: windowStart } } },
          {
            $group: {
              _id: bucketOf("$saleDate"),
              count: { $sum: 1 },
              revenue: { $sum: "$_total" },
              initialCash: { $sum: "$_initialCash" },
            },
          },
        ],
        // Money received later on instalment sales, bucketed by payment date
        instalmentCash: [
          { $match: { paymentType: "Instalment" } },
          { $unwind: "$payments" },
          { $match: { "payments.date": { $gte: windowStart } } },
          {
            $group: {
              _id: bucketOf("$payments.date"),
              amount: { $sum: "$payments.amount" },
            },
          },
        ],
        pendingCount: [
          { $match: { paymentType: "Instalment", _outstanding: { $gt: 0 } } },
          { $count: "n" },
        ],
        pending: [
          { $match: { paymentType: "Instalment", _outstanding: { $gt: 0 } } },
          { $sort: { _outstanding: -1 } },
          { $limit: 5 },
          {
            $project: {
              buyerName: 1,
              buyerPhone: 1,
              instalmentDate: 1,
              monthlyInstalment: 1,
              car: {
                company: "$carSnapshot.company",
                model: "$carSnapshot.model",
                year: "$carSnapshot.year",
              },
              total: "$_total",
              collected: "$_collected",
              outstanding: "$_outstanding",
            },
          },
        ],
        recent: [
          { $sort: { saleDate: -1, createdAt: -1 } },
          { $limit: 6 },
          {
            $project: {
              buyerName: 1,
              paymentType: 1,
              status: 1,
              saleDate: 1,
              car: {
                company: "$carSnapshot.company",
                model: "$carSnapshot.model",
                year: "$carSnapshot.year",
              },
              total: "$_total",
              outstanding: "$_outstanding",
            },
          },
        ],
      },
    },
  ]);

  const totals = result.totals[0] || {};
  const trend = fillBuckets(buckets, result.monthly, ["count", "revenue", "initialCash"]);
  const instalmentCash = fillBuckets(buckets, result.instalmentCash, ["amount"]);
  // cash received per bucket = on-the-day cash + later instalment payments
  const cashTrend = trend.map((t, i) => ({
    key: t.key,
    label: t.label,
    collected: t.initialCash + instalmentCash[i].amount,
  }));

  const cur = trend[trend.length - 1];
  const prev = trend[trend.length - 2];

  return {
    summary: {
      totalSales: num(totals.count),
      totalRevenue: num(totals.revenue),
      totalCollected: num(totals.collected),
      outstanding: num(totals.outstanding),
      pendingInstalments: num(result.pendingCount[0]?.n),
      currentCount: cur.count,
      previousCount: prev.count,
      countChange: pctChange(cur.count, prev.count),
      currentRevenue: cur.revenue,
      previousRevenue: prev.revenue,
      revenueChange: pctChange(cur.revenue, prev.revenue),
      windowCount: sumOf(trend, "count"),
      windowRevenue: sumOf(trend, "revenue"),
    },
    trend: trend.map(({ key, label, count, revenue }) => ({ key, label, count, revenue })),
    cashTrend,
    paymentMix: result.paymentMix.map((p) => ({
      name: p._id,
      value: p.count,
      revenue: p.revenue,
    })),
    pendingInstalments: result.pending,
    recent: result.recent,
  };
};

const buildExchanges = async ({ owner, buckets, windowStart, bucketOf }) => {
  const live = { status: { $ne: "Cancelled" } };
  const [result] = await Exchange.aggregate([
    { $match: { userId: owner } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byType: [
          { $match: live },
          { $group: { _id: "$exchangeType", count: { $sum: 1 } } },
        ],
        money: [
          { $match: live },
          {
            $group: {
              _id: null,
              receivable: { $sum: "$dueAmount" },
              payable: { $sum: "$dueFromShowroom" },
              received: { $sum: "$amountReceivedFromCustomer" },
              paid: { $sum: "$amountPaidToCustomer" },
            },
          },
        ],
        monthly: [
          { $match: { ...live, date: { $gte: windowStart } } },
          {
            $group: {
              _id: bucketOf("$date"),
              count: { $sum: 1 },
              cashIn: { $sum: "$amountReceivedFromCustomer" },
              cashOut: { $sum: "$amountPaidToCustomer" },
            },
          },
        ],
        dues: [
          {
            $match: {
              ...live,
              $or: [{ dueAmount: { $gt: 0 } }, { dueFromShowroom: { $gt: 0 } }],
            },
          },
          { $addFields: { _due: { $max: ["$dueAmount", "$dueFromShowroom"] } } },
          { $sort: { _due: -1 } },
          { $limit: 5 },
          {
            $project: {
              dealNumber: 1,
              date: 1,
              finalDirection: 1,
              dueAmount: 1,
              dueFromShowroom: 1,
              customerName: "$customerCar.owner.name",
              customerCar: {
                company: "$customerCar.company",
                model: "$customerCar.model",
                year: "$customerCar.year",
              },
            },
          },
        ],
        recent: [
          { $sort: { date: -1, createdAt: -1 } },
          { $limit: 6 },
          {
            $project: {
              dealNumber: 1,
              date: 1,
              status: 1,
              exchangeType: 1,
              finalAmount: 1,
              finalDirection: 1,
              customerName: "$customerCar.owner.name",
              customerCar: {
                company: "$customerCar.company",
                model: "$customerCar.model",
              },
              showroomCar: {
                company: "$showroomCar.company",
                model: "$showroomCar.model",
              },
            },
          },
        ],
      },
    },
  ]);

  const status = toMap(result.byStatus);
  const money = result.money[0] || {};
  const trend = fillBuckets(buckets, result.monthly, ["count", "cashIn", "cashOut"]);
  const cur = trend[trend.length - 1];
  const prev = trend[trend.length - 2];

  return {
    summary: {
      total: sumOf(result.byStatus, "count"),
      pending: num(status.Pending?.count),
      completed: num(status.Completed?.count),
      cancelled: num(status.Cancelled?.count),
      receivable: num(money.receivable), // customers still owe the showroom
      payable: num(money.payable), // showroom still owes customers
      currentCount: cur.count,
      countChange: pctChange(cur.count, prev.count),
    },
    byType: result.byType.map((t) => ({ name: t._id, value: t.count })),
    byStatus: ["Pending", "Completed", "Cancelled"].map((name) => ({
      name,
      value: num(status[name]?.count),
    })),
    trend,
    dues: result.dues,
    recent: result.recent,
  };
};

const buildExpenses = async ({ owner, buckets, windowStart, bucketOf }) => {
  const [result] = await Expense.aggregate([
    { $match: { userId: owner } },
    {
      $facet: {
        monthly: [
          { $match: { date: { $gte: windowStart } } },
          {
            $group: {
              _id: bucketOf("$date"),
              total: { $sum: "$amount" },
              nonPayroll: {
                $sum: {
                  $cond: [{ $eq: ["$category", PAYROLL_EXPENSE_CATEGORY] }, 0, "$amount"],
                },
              },
            },
          },
        ],
        byCategory: [
          { $match: { date: { $gte: windowStart } } },
          {
            $group: {
              _id: "$category",
              value: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { value: -1 } },
        ],
        biggest: [
          { $match: { date: { $gte: windowStart } } },
          { $sort: { amount: -1 } },
          { $limit: 1 },
          { $project: { title: 1, category: 1, amount: 1, date: 1 } },
        ],
        recent: [
          { $sort: { date: -1, createdAt: -1 } },
          { $limit: 5 },
          { $project: { title: 1, category: 1, amount: 1, date: 1 } },
        ],
      },
    },
  ]);

  const trend = fillBuckets(buckets, result.monthly, ["total", "nonPayroll"]);
  const cur = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const windowTotal = sumOf(trend, "total");

  return {
    summary: {
      current: cur.total,
      previous: prev.total,
      change: pctChange(cur.total, prev.total),
      windowTotal,
      avgPerPeriod: Math.round(windowTotal / buckets.length),
      biggest: result.biggest[0] || null,
    },
    trend: trend.map(({ key, label, total }) => ({ key, label, total })),
    // used by the cash-flow section only
    _nonPayrollTrend: trend.map((t) => t.nonPayroll),
    byCategory: result.byCategory.map((c) => ({
      name: c._id,
      value: c.value,
      count: c.count,
    })),
    recent: result.recent,
  };
};

const buildPayroll = async ({ owner, buckets, windowStart, bucketOf }) => {
  // Deductions are stored as NEGATIVE payments, so a plain sum is the net paid.
  const rows = await Salary.aggregate([
    {
      $match: {
        userId: owner,
        status: { $in: ["Paid", "Partially Paid"] },
        paidDate: { $gte: windowStart },
      },
    },
    {
      $group: {
        _id: bucketOf("$paidDate"),
        paid: { $sum: "$payment" },
        count: { $sum: 1 },
      },
    },
  ]);

  const trend = fillBuckets(buckets, rows, ["paid", "count"]);
  const cur = trend[trend.length - 1];
  const prev = trend[trend.length - 2];

  return {
    summary: {
      currentPaid: cur.paid,
      previousPaid: prev.paid,
      change: pctChange(cur.paid, prev.paid),
      windowPaid: sumOf(trend, "paid"),
    },
    trend: trend.map(({ key, label, paid }) => ({ key, label, paid })),
  };
};

const buildEmployees = async ({ owner }) => {
  const active = { userId: owner, isActive: { $ne: false } };
  const [byRole, inactive] = await Promise.all([
    Employee.aggregate([
      { $match: active },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
          payroll: { $sum: "$salary" },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Employee.countDocuments({ userId: owner, isActive: false }),
  ]);

  return {
    summary: {
      active: sumOf(byRole, "count"),
      inactive,
      monthlyCommitment: sumOf(byRole, "payroll"),
    },
    byRole: byRole.map((r) => ({
      name: r._id,
      count: r.count,
      payroll: r.payroll,
    })),
  };
};

const buildDealers = async ({ owner }) => {
  const [total, top] = await Promise.all([
    Dealer.countDocuments({ userId: owner }),
    Car.aggregate([
      { $match: { userId: owner, dealerId: { $ne: null } } },
      {
        $group: {
          _id: "$dealerId",
          name: { $first: "$dealerName" },
          cars: { $sum: 1 },
          sold: { $sum: { $cond: [{ $eq: ["$status", "Sold"] }, 1, 0] } },
        },
      },
      { $sort: { cars: -1 } },
      { $limit: 5 },
    ]),
  ]);

  return {
    summary: { total },
    top: top.map((d) => ({
      id: d._id,
      name: d.name || "Unnamed dealer",
      cars: d.cars,
      sold: d.sold,
    })),
  };
};

// Activity logs are OWNER ONLY everywhere else in the app, so same rule here.
const buildActivity = async ({ owner }) => {
  return Log.find({ userId: owner })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("category action title description performedBy amount createdAt")
    .lean();
};

// Money in vs money out. Only built when the user can see ALL four money
// modules; otherwise the totals would be misleading.
const buildCashflow = ({ buckets, sales, exchanges, expenses, payroll }) => {
  const series = buckets.map((m, i) => {
    const moneyIn = sales.cashTrend[i].collected + exchanges.trend[i].cashIn;
    const moneyOut =
      expenses._nonPayrollTrend[i] + payroll.trend[i].paid + exchanges.trend[i].cashOut;
    return {
      key: m.key,
      label: m.label,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
    };
  });

  const cur = series[series.length - 1];
  const prev = series[series.length - 2];

  return {
    summary: {
      currentIn: cur.moneyIn,
      currentOut: cur.moneyOut,
      currentNet: cur.net,
      previousNet: prev.net,
      windowIn: sumOf(series, "moneyIn"),
      windowOut: sumOf(series, "moneyOut"),
      windowNet: sumOf(series, "net"),
    },
    series,
  };
};

// "Needs attention" items shown as a strip at the top of the page
const buildAlerts = ({ cars, sales, exchanges }) => {
  const alerts = [];

  if (sales?.summary.outstanding > 0) {
    alerts.push({
      id: "instalments",
      tone: "warning",
      title: "Instalments to collect",
      detail: `${sales.summary.pendingInstalments} sale(s) still have a balance`,
      amount: sales.summary.outstanding,
      to: "/sales",
    });
  }
  if (exchanges?.summary.receivable > 0) {
    alerts.push({
      id: "exchange-receivable",
      tone: "warning",
      title: "Customers owe you (exchanges)",
      detail: "Unpaid balance on exchange deals",
      amount: exchanges.summary.receivable,
      to: "/exchanges",
    });
  }
  if (exchanges?.summary.payable > 0) {
    alerts.push({
      id: "exchange-payable",
      tone: "info",
      title: "You owe customers (exchanges)",
      detail: "Showroom still has to pay on exchange deals",
      amount: exchanges.summary.payable,
      to: "/exchanges",
    });
  }
  if (cars?.summary.oldStockCount > 0) {
    alerts.push({
      id: "old-stock",
      tone: "warning",
      title: `${cars.summary.oldStockCount} car(s) unsold for ${OLD_STOCK_DAYS}+ days`,
      detail: "Consider a price review or promotion",
      amount: null,
      to: "/cars",
    });
  }
  if (cars?.summary.reserved > 0) {
    alerts.push({
      id: "reserved",
      tone: "info",
      title: `${cars.summary.reserved} reserved car(s)`,
      detail: "Follow up to close or release them",
      amount: null,
      to: "/cars",
    });
  }
  if (exchanges?.summary.pending > 0) {
    alerts.push({
      id: "pending-exchanges",
      tone: "info",
      title: `${exchanges.summary.pending} pending exchange(s)`,
      detail: "Deals waiting to be completed",
      amount: null,
      to: "/exchanges",
    });
  }

  return alerts;
};

// ---------------------------------------------------------------------------
// @desc    Everything the dashboard page needs, in one request
// @route   GET /api/dashboard?period=monthly&count=6
// @access  Private  (dashboard:view; each section also needs its own module:view)
// ---------------------------------------------------------------------------
export const getDashboard = async (req, res) => {
  try {
    const owner = new mongoose.Types.ObjectId(String(req.userId));
    // ?period=weekly|monthly|yearly  &count=<how many buckets>  (old ?months= still works)
    const period = Object.hasOwn(PERIODS, req.query.period) ? req.query.period : "monthly";
    const cfg = PERIODS[period];
    const requested = parseInt(req.query.count ?? req.query.months, 10);
    const count = Math.min(
      cfg.max,
      Math.max(cfg.min, Number.isFinite(requested) ? requested : cfg.defaultCount),
    );
    const buckets = buildBuckets(period, count);
    const windowStart = windowStartFor(buckets);
    const bucketOf = (field) => ({
      $dateToString: { format: cfg.fmt, date: field, timezone: TZ },
    });
    const ctx = { owner, buckets, windowStart, bucketOf };

    // Owner (no tenantId) sees everything. Staff need "<module>:view".
    const isOwner = !req.user.tenantId;
    const allowed = (moduleName) =>
      isOwner || req.user.permissions?.[moduleName]?.view === true;

    const errors = {};
    const run = async (name, moduleName, fn) => {
      if (!allowed(moduleName)) return null;
      try {
        return await fn(ctx);
      } catch (err) {
        console.error(`Dashboard section "${name}" failed:`, err);
        errors[name] = err.message;
        return null;
      }
    };

    const [cars, sales, exchanges, expenses, payroll, employees, dealers] =
      await Promise.all([
        run("cars", "cars", buildCars),
        run("sales", "sales", buildSales),
        run("exchanges", "exchanges", buildExchanges),
        run("expenses", "expenses", buildExpenses),
        run("payroll", "salaries", buildPayroll),
        run("employees", "employees", buildEmployees),
        run("dealers", "dealers", buildDealers),
      ]);

    const activity = isOwner
      ? await (async () => {
          try {
            return await buildActivity(ctx);
          } catch (err) {
            console.error('Dashboard section "activity" failed:', err);
            errors.activity = err.message;
            return null;
          }
        })()
      : null;

    const cashflow =
      sales && exchanges && expenses && payroll
        ? buildCashflow({ buckets, sales, exchanges, expenses, payroll })
        : null;

    // internal helper field, not for the client
    if (expenses) delete expenses._nonPayrollTrend;

    res.status(200).json({
      success: true,
      message: "Dashboard data retrieved successfully",
      data: {
        meta: {
          generatedAt: new Date().toISOString(),
          period,
          unit: cfg.unit,
          count,
          timezone: TZ,
          currency: "PKR",
          oldStockDays: OLD_STOCK_DAYS,
        },
        cars,
        sales,
        exchanges,
        expenses,
        payroll,
        employees,
        dealers,
        cashflow,
        activity,
        alerts: buildAlerts({ cars, sales, exchanges }),
        errors,
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
      error: error.message,
    });
  }
};