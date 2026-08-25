import mongoose from "mongoose";

const adjustmentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["Discount", "Extra Charge", "Negotiation"],
      default: "Negotiation",
    },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

// Person details — dealer (stock) / Customer 1 (manual) / the customer / Customer 2
const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    cnic: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { _id: false },
);

const exchangeSchema = new mongoose.Schema(
  {
    // Owning account (the authenticated user who created this exchange)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    dealNumber: { type: String, unique: true, trim: true },

    // ---- Showroom-side vehicle (stock car OR Customer 1's vehicle in manual mode) ----
    showroomCar: {
      source: { type: String, enum: ["stock", "manual"], default: "stock" },
      carId: { type: mongoose.Schema.Types.ObjectId, ref: "Car" }, // stock only

      company: { type: String, trim: true },
      model: { type: String, trim: true },
      year: { type: Number },
      registrationNumber: { type: String, trim: true },
      carType: {
        type: String,
        enum: ["NCP (Non-Custom Paid)", "CP (Custom Paid)"],
      },
      registrationCity: { type: String, trim: true },
      localNumber: { type: String, trim: true },
      chassisNumber: { type: String, trim: true },
      mileage: { type: Number },
      condition: { type: String, trim: true },
      actualValue: { type: Number, min: 0 },
      salePrice: { type: Number, min: 0 }, // stock only
      value: { type: Number, required: true, min: 0 },

      dealerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Dealer",
        default: null,
      }, // stock only
      dealerName: { type: String, trim: true }, // stock only, display only

      // Dealer details (stock) OR Customer 1 details (manual) — always here
      owner: { type: ownerSchema, default: () => ({}) },
    },

    // ---- Customer-side vehicle (the customer, or Customer 2 in manual mode) ----
    customerCar: {
      company: { type: String, required: true, trim: true },
      model: { type: String, required: true, trim: true },
      year: { type: Number },
      registrationNumber: { type: String, trim: true },
      chassisNumber: { type: String, trim: true },
      mileage: { type: Number },
      condition: { type: String, trim: true },
      carType: {
        type: String,
        enum: ["NCP (Non-Custom Paid)", "CP (Custom Paid)"],
        default: "NCP (Non-Custom Paid)",
      },
      registrationCity: { type: String, trim: true },
      localNumber: { type: String, trim: true },
      value: { type: Number, required: true, min: 0 },
      actualValue: { type: Number, min: 0 },

      owner: { type: ownerSchema, required: true },
    },

    // ---- System-calculated fields ----
    difference: { type: Number, default: 0 },
    exchangeType: {
      type: String,
      enum: ["Head-to-Head", "Car + Money Giving", "Car + Money Getting"],
      default: "Head-to-Head",
    },
    settlementDirection: {
      type: String,
      enum: ["none", "showroom_pays_customer", "customer_pays_showroom"],
      default: "none",
    },
    settlementAmount: { type: Number, default: 0 },

    adjustments: { type: [adjustmentSchema], default: [] },
    adjustmentTotal: { type: Number, default: 0 },

    finalAmount: { type: Number, default: 0 },
    finalDirection: {
      type: String,
      enum: ["none", "showroom_pays_customer", "customer_pays_showroom"],
      default: "none",
    },

    amountReceivedFromCustomer: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, default: 0 },
    amountPaidToCustomer: { type: Number, default: 0, min: 0 },
    dueFromShowroom: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      default: "Pending",
    },
    date: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

// ---- Pre‑validate hook: validation & auto‑calculation (unchanged logic) ----
exchangeSchema.pre("validate", function (next) {
  if (this.showroomCar.source === "stock" && !this.showroomCar.carId) {
    return next(
      new Error("Showroom vehicle is required when selecting from stock"),
    );
  }

  const salePrice = Number(this.showroomCar?.salePrice || 0);
  const showroomValue = Number(this.showroomCar?.value || 0);
  if (salePrice > 0 && showroomValue > salePrice) {
    return next(
      new Error(
        `Agreed value (PKR ${showroomValue}) cannot exceed the showroom vehicle's sale price (PKR ${salePrice})`,
      ),
    );
  }

  const customerValue = Number(this.customerCar?.value || 0);
  const D = customerValue - showroomValue;
  this.difference = D;

  if (D === 0) {
    this.exchangeType = "Head-to-Head";
    this.settlementDirection = "none";
    this.settlementAmount = 0;
  } else if (D > 0) {
    this.exchangeType = "Car + Money Giving";
    this.settlementDirection = "showroom_pays_customer";
    this.settlementAmount = D;
  } else {
    this.exchangeType = "Car + Money Getting";
    this.settlementDirection = "customer_pays_showroom";
    this.settlementAmount = Math.abs(D);
  }

  const adjustmentTotal = (this.adjustments || []).reduce(
    (sum, adj) => sum + Number(adj.amount || 0),
    0,
  );
  this.adjustmentTotal = adjustmentTotal;

  let final = this.settlementAmount + adjustmentTotal;
  let direction = this.settlementDirection;

  if (final < 0) {
    direction =
      direction === "showroom_pays_customer"
        ? "customer_pays_showroom"
        : direction === "customer_pays_showroom"
          ? "showroom_pays_customer"
          : "none";
    final = Math.abs(final);
  }
  if (final === 0) direction = "none";

  this.finalAmount = final;
  this.finalDirection = direction;

  const amountReceived = Number(this.amountReceivedFromCustomer || 0);
  const amountPaid = Number(this.amountPaidToCustomer || 0);

  if (this.finalDirection === "customer_pays_showroom") {
    this.dueAmount = Math.max(0, this.finalAmount - amountReceived);
    this.dueFromShowroom = 0;
  } else if (this.finalDirection === "showroom_pays_customer") {
    this.dueFromShowroom = Math.max(0, this.finalAmount - amountPaid);
    this.dueAmount = 0;
  } else {
    this.dueAmount = 0;
    this.dueFromShowroom = 0;
  }
});

const Exchange = mongoose.model("Exchange", exchangeSchema);
export default Exchange;
