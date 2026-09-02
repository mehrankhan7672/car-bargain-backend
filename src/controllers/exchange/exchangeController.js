// src/controllers/exchange/exchangeController.js
import mongoose from "mongoose";
import Exchange from "../../models/Exchange.js";
import ExchangePayment from "../../models/exchangeDues.js";
import Car from "../../models/Car.js";
import { createLog } from "../../utils/logger.js";

// ==================================================
// Helpers
// ==================================================

const generateDealNumber = async (userId) => {
  const count = await Exchange.countDocuments({ userId });
  return `EXC-${String(count + 1).padStart(4, "0")}`;
};

// Add "powerCC" to numeric fields (engineNumber stays string)
const numberFields = ["year", "mileage", "value", "actualValue", "salePrice", "powerCC"];

const cleanNestedNumbers = (obj = {}) => {
  const out = { ...obj };
  numberFields.forEach((f) => {
    if (out[f] !== undefined && out[f] !== null && out[f] !== "") {
      out[f] = Number(out[f]);
    }
  });
  return out;
};

const buildOwner = (o = {}) => ({
  name: o.name || "",
  fatherName: o.fatherName || "",
  cnic: o.cnic || "",
  phone: o.phone || "",
  address: o.address || "",
});

// Build snapshot from a stock car – includes engineNumber, color, powerCC
const buildShowroomCarSnapshot = (incoming = {}, stockCar) => ({
  carId: stockCar._id,
  company: incoming.company || stockCar.company,
  model: incoming.model || stockCar.model,
  year: incoming.year || stockCar.year,
  registrationNumber: incoming.registrationNumber || stockCar.registrationNumber,
  carType: stockCar.carType,
  registrationCity: stockCar.registrationCity,
  localNumber: stockCar.localNumber,
  salePrice: stockCar.salePrice,
  value: incoming.value,
  dealerId: stockCar.dealerId,
  dealerName: stockCar.dealerName,
  chassisNumber: stockCar.chassisNumber || "",
  engineNumber: stockCar.engineNumber || incoming.engineNumber || "",  // 👈 NEW
  mileage: stockCar.mileage || "",
  color: stockCar.color || incoming.color || "",                       // 👈 NEW
  powerCC: stockCar.powerCC || incoming.powerCC || "",                 // 👈 NEW
  condition: stockCar.condition || "",
  actualValue: stockCar.actualValue || 0,
  owner: {
    name: stockCar.dealerName || stockCar.userName || "",
    fatherName: stockCar.userFatherName || "",
    cnic: stockCar.userCnic || "",
    phone: stockCar.userPhone || "",
    address: stockCar.userAddress || "",
  },
});

const buildCustomerCarSnapshot = (customerCar = {}) => {
  const snap = cleanNestedNumbers({
    company: customerCar.company,
    model: customerCar.model,
    year: customerCar.year,
    registrationNumber: customerCar.registrationNumber,
    chassisNumber: customerCar.chassisNumber,
    engineNumber: customerCar.engineNumber,     // 👈 NEW
    mileage: customerCar.mileage,
    color: customerCar.color,                   // 👈 NEW
    powerCC: customerCar.powerCC,               // 👈 NEW
    condition: customerCar.condition,
    carType: customerCar.carType,
    registrationCity: customerCar.registrationCity,
    localNumber: customerCar.localNumber,
    value: customerCar.value,
    actualValue: customerCar.actualValue,
  });
  snap.owner = buildOwner(customerCar.owner);
  return snap;
};

const exceedsSalePrice = (agreedValue, salePrice) =>
  salePrice && Number(agreedValue) > Number(salePrice);

// ==================================================
// CREATE EXCHANGE
// ==================================================
// @route  POST /api/exchanges
export const createExchange = async (req, res) => {
  try {
    const {
      showroomCar,
      customerCar,
      adjustments,
      status,
      date,
      notes,
      amountReceivedFromCustomer,
      amountPaidToCustomer,
    } = req.body;

    // --- Customer (2) vehicle + owner ---
    if (!customerCar?.owner?.name || !customerCar?.owner?.phone) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Customer name and phone are required",
        });
    }
    if (!customerCar?.company || !customerCar?.model) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please enter the customer vehicle's make and model",
        });
    }
    if (!customerCar?.value) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please enter the customer vehicle's agreed value",
        });
    }
    const customerCarSnapshot = buildCustomerCarSnapshot(customerCar);

    const source = showroomCar?.source === "manual" ? "manual" : "stock";
    let stockCar = null;
    let showroomCarSnapshot;

    // --- Manual mode: Customer 1's vehicle ---
    if (source === "manual") {
      if (!showroomCar?.company || !showroomCar?.model) {
        return res.status(400).json({
          success: false,
          message: "Please enter the other vehicle's make and model",
        });
      }
      if (!showroomCar?.value) {
        return res.status(400).json({
          success: false,
          message: "Please enter the other vehicle's agreed value",
        });
      }
      if (!showroomCar?.owner?.name || !showroomCar?.owner?.phone) {
        return res.status(400).json({
          success: false,
          message: "Customer 1 name and phone are required",
        });
      }

      showroomCarSnapshot = cleanNestedNumbers({
        source: "manual",
        company: showroomCar.company,
        model: showroomCar.model,
        year: showroomCar.year,
        carType: showroomCar.carType,
        registrationNumber: showroomCar.registrationNumber,
        registrationCity: showroomCar.registrationCity,
        localNumber: showroomCar.localNumber,
        chassisNumber: showroomCar.chassisNumber,
        engineNumber: showroomCar.engineNumber,   // 👈 NEW
        mileage: showroomCar.mileage,
        color: showroomCar.color,                 // 👈 NEW
        powerCC: showroomCar.powerCC,             // 👈 NEW
        condition: showroomCar.condition,
        actualValue: showroomCar.actualValue,
        value: showroomCar.value,
      });
      showroomCarSnapshot.owner = buildOwner(showroomCar.owner);
    } else {
      // --- Stock mode ---
      if (!showroomCar?.carId) {
        return res.status(400).json({
          success: false,
          message: "Please select a showroom vehicle from stock",
        });
      }
      if (!mongoose.Types.ObjectId.isValid(showroomCar.carId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid showroom vehicle selected",
        });
      }

      stockCar = await Car.findOne({
        _id: showroomCar.carId,
        userId: req.userId,
      });
      if (!stockCar) {
        return res.status(404).json({
          success: false,
          message: "Selected showroom vehicle was not found in stock",
        });
      }
      if (stockCar.status === "Sold") {
        return res.status(400).json({
          success: false,
          message:
            "This vehicle is already sold and cannot be used in a new exchange",
        });
      }
      if (exceedsSalePrice(showroomCar.value, stockCar.salePrice)) {
        return res.status(400).json({
          success: false,
          message: `Agreed value cannot exceed this vehicle's sale price (PKR ${stockCar.salePrice})`,
        });
      }

      showroomCarSnapshot = cleanNestedNumbers({
        source: "stock",
        ...buildShowroomCarSnapshot(showroomCar, stockCar),
      });
    }

    // --- Create exchange document ---
    const exchange = new Exchange({
      userId: req.userId,
      showroomCar: showroomCarSnapshot,
      customerCar: customerCarSnapshot,
      adjustments: Array.isArray(adjustments) ? adjustments : [],
      status: status || "Pending",
      date: date || Date.now(),
      notes,
      amountReceivedFromCustomer: Number(amountReceivedFromCustomer || 0),
      amountPaidToCustomer: Number(amountPaidToCustomer || 0),
    });

    exchange.dealNumber = await generateDealNumber(req.userId);
    await exchange.save();

    // Reserve the stock car if used
    if (stockCar) {
      stockCar.status = "Reserved";
      await stockCar.save();
    }

    // Log
    await createLog({
      userId: req.userId,
      category: "Exchange",
      action: "Created",
      title: `Exchange ${exchange.dealNumber} created`,
      description: `${exchange.exchangeType} · ${exchange.customerCar.owner.name} · Vehicle A (${source}): ${exchange.showroomCar.company} ${exchange.showroomCar.model} ↔ Vehicle B: ${exchange.customerCar.company} ${exchange.customerCar.model}`,
      refId: exchange._id,
      refModel: "Exchange",
      amount: exchange.finalAmount,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    if (exchange.showroomCar.carId) {
      await exchange.populate({
        path: "showroomCar.carId",
        select:
          "company model variant year registrationNumber images status salePrice dealerName",
      });
    }

    res.status(201).json({
      success: true,
      message: "Exchange deal saved successfully",
      data: exchange,
    });
  } catch (error) {
    console.error("Create exchange error:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res
        .status(400)
        .json({ success: false, message: "Validation error", errors });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create exchange deal",
      error: error.message,
    });
  }
};

// ==================================================
// GET ALL EXCHANGES
// ==================================================
// @route  GET /api/exchanges
export const getExchanges = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const status = req.query.status;
    const exchangeType = req.query.exchangeType;

    const skip = (page - 1) * limit;

    const filter = { userId: req.userId };
    if (status) filter.status = status;
    if (exchangeType) filter.exchangeType = exchangeType;
    if (search) {
      filter.$or = [
        { "customerCar.owner.name": { $regex: search, $options: "i" } },
        { "customerCar.owner.phone": { $regex: search, $options: "i" } },
        { "customerCar.owner.cnic": { $regex: search, $options: "i" } },
        { "showroomCar.owner.name": { $regex: search, $options: "i" } },
        { dealNumber: { $regex: search, $options: "i" } },
        { "showroomCar.company": { $regex: search, $options: "i" } },
        { "showroomCar.model": { $regex: search, $options: "i" } },
        { "customerCar.company": { $regex: search, $options: "i" } },
        { "customerCar.model": { $regex: search, $options: "i" } },
      ];
    }

    const [exchanges, total] = await Promise.all([
      Exchange.find(filter)
        .populate({
          path: "showroomCar.carId",
          select: "company model year registrationNumber images",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Exchange.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: exchanges,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      message: "Exchanges retrieved successfully",
    });
  } catch (error) {
    console.error("Get exchanges error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to get exchanges",
        error: error.message,
      });
  }
};

// ==================================================
// GET EXCHANGE BY ID
// ==================================================
// @route  GET /api/exchanges/:id
export const getExchangeById = async (req, res) => {
  try {
    const { id } = req.params;

    const exchange = await Exchange.findOne({
      _id: id,
      userId: req.userId,
    }).populate({
      path: "showroomCar.carId",
      select:
        "company model variant year registrationNumber images status salePrice dealerName",
    });

    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }

    res
      .status(200)
      .json({
        success: true,
        data: exchange,
        message: "Exchange retrieved successfully",
      });
  } catch (error) {
    console.error("Get exchange by ID error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to get exchange",
        error: error.message,
      });
  }
};

// ==================================================
// UPDATE EXCHANGE
// ==================================================
// @route  PUT /api/exchanges/:id
export const updateExchange = async (req, res) => {
  try {
    const { id } = req.params;
    const exchange = await Exchange.findOne({ _id: id, userId: req.userId });
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }

    const {
      showroomCar,
      customerCar,
      adjustments,
      status,
      date,
      notes,
      amountReceivedFromCustomer,
      amountPaidToCustomer,
    } = req.body;

    if (status !== undefined) exchange.status = status;
    if (date !== undefined) exchange.date = date;
    if (notes !== undefined) exchange.notes = notes;
    if (Array.isArray(adjustments)) exchange.adjustments = adjustments;
    if (amountReceivedFromCustomer !== undefined) {
      exchange.amountReceivedFromCustomer = Number(amountReceivedFromCustomer);
    }
    if (amountPaidToCustomer !== undefined) {
      exchange.amountPaidToCustomer = Number(amountPaidToCustomer);
    }

    // --- Update showroom car ---
    if (showroomCar) {
      const newSource = showroomCar.source === "manual" ? "manual" : "stock";
      const oldSource = exchange.showroomCar.source || "stock";
      const previousCarId = exchange.showroomCar.carId
        ? String(exchange.showroomCar.carId)
        : null;

      if (newSource === "manual") {
        if (!showroomCar.company || !showroomCar.model) {
          return res.status(400).json({
            success: false,
            message: "Please enter the other vehicle's make and model",
          });
        }
        if (!showroomCar.owner?.name || !showroomCar.owner?.phone) {
          return res.status(400).json({
            success: false,
            message: "Customer 1 name and phone are required",
          });
        }

        if (oldSource === "stock" && previousCarId) {
          await Car.findOneAndUpdate(
            { _id: previousCarId, userId: req.userId },
            { status: "Available" },
          );
        }

        const manualSnapshot = cleanNestedNumbers({
          source: "manual",
          company: showroomCar.company,
          model: showroomCar.model,
          year: showroomCar.year,
          carType: showroomCar.carType,
          registrationNumber: showroomCar.registrationNumber,
          registrationCity: showroomCar.registrationCity,
          localNumber: showroomCar.localNumber,
          chassisNumber: showroomCar.chassisNumber,
          engineNumber: showroomCar.engineNumber,   // 👈 NEW
          mileage: showroomCar.mileage,
          color: showroomCar.color,                 // 👈 NEW
          powerCC: showroomCar.powerCC,             // 👈 NEW
          condition: showroomCar.condition,
          actualValue: showroomCar.actualValue,
          value: showroomCar.value,
        });
        manualSnapshot.owner = buildOwner(showroomCar.owner);
        exchange.showroomCar = manualSnapshot;
      } else {
        const carIdChanged =
          showroomCar.carId && showroomCar.carId !== previousCarId;

        let merged = {
          ...exchange.showroomCar.toObject(),
          ...cleanNestedNumbers(showroomCar),
          source: "stock",
        };

        if (carIdChanged || oldSource === "manual") {
          if (
            !showroomCar.carId ||
            !mongoose.Types.ObjectId.isValid(showroomCar.carId)
          ) {
            return res
              .status(400)
              .json({
                success: false,
                message: "Please select a showroom vehicle from stock",
              });
          }
          const newStockCar = await Car.findOne({
            _id: showroomCar.carId,
            userId: req.userId,
          });
          if (!newStockCar) {
            return res
              .status(404)
              .json({
                success: false,
                message: "Selected showroom vehicle was not found in stock",
              });
          }

          merged = cleanNestedNumbers({
            source: "stock",
            ...buildShowroomCarSnapshot(showroomCar, newStockCar),
          });

          if (
            oldSource === "stock" &&
            previousCarId &&
            previousCarId !== String(newStockCar._id)
          ) {
            await Car.findOneAndUpdate(
              { _id: previousCarId, userId: req.userId },
              { status: "Available" },
            );
          }
          newStockCar.status = "Reserved";
          await newStockCar.save();
        }

        if (exceedsSalePrice(merged.value, merged.salePrice)) {
          return res.status(400).json({
            success: false,
            message: `Agreed value cannot exceed this vehicle's sale price (PKR ${merged.salePrice})`,
          });
        }

        exchange.showroomCar = merged;
      }
    }

    // --- Update customer vehicle (owner + car) ---
    if (customerCar) {
      const merged = {
        ...exchange.customerCar.toObject(),
        ...cleanNestedNumbers(customerCar),
      };
      if (customerCar.owner) {
        const existingOwner = exchange.customerCar.owner?.toObject
          ? exchange.customerCar.owner.toObject()
          : exchange.customerCar.owner || {};
        merged.owner = { ...existingOwner, ...customerCar.owner };
      }
      exchange.customerCar = merged;
    }

    await exchange.save();

    // Log
    await createLog({
      userId: req.userId,
      category: "Exchange",
      action: "Updated",
      title: `Exchange ${exchange.dealNumber} updated`,
      description: `${exchange.exchangeType} · Final amount PKR ${exchange.finalAmount}`,
      refId: exchange._id,
      refModel: "Exchange",
      amount: exchange.finalAmount,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    if (exchange.showroomCar.carId) {
      await exchange.populate({
        path: "showroomCar.carId",
        select:
          "company model variant year registrationNumber images status salePrice dealerName",
      });
    }

    res
      .status(200)
      .json({
        success: true,
        data: exchange,
        message: "Exchange updated successfully",
      });
  } catch (error) {
    console.error("Update exchange error:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res
        .status(400)
        .json({ success: false, message: "Validation error", errors });
    }
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update exchange",
        error: error.message,
      });
  }
};

// ==================================================
// DELETE EXCHANGE
// ==================================================
// @route  DELETE /api/exchanges/:id
export const deleteExchange = async (req, res) => {
  try {
    const { id } = req.params;

    const exchange = await Exchange.findOne({ _id: id, userId: req.userId });
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }

    if (exchange.showroomCar?.carId) {
      await Car.findOneAndUpdate(
        { _id: exchange.showroomCar.carId, userId: req.userId },
        { status: "Available" },
      );
    }

    // Optionally delete all associated payment records
    await ExchangePayment.deleteMany({ exchangeId: id, userId: req.userId });

    await Exchange.findOneAndDelete({ _id: id, userId: req.userId });

    await createLog({
      userId: req.userId,
      category: "Exchange",
      action: "Deleted",
      title: `Exchange ${exchange.dealNumber} deleted`,
      refId: exchange._id,
      refModel: "Exchange",
      amount: exchange.finalAmount,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res
      .status(200)
      .json({
        success: true,
        data: {},
        message: "Exchange deleted successfully",
      });
  } catch (error) {
    console.error("Delete exchange error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete exchange",
        error: error.message,
      });
  }
};

// ==================================================
// RECORD PAYMENT (with ExchangePayment model)
// ==================================================
// @route  PATCH /api/exchanges/:id/payment
export const recordPayment = async (req, res) => {
  console.log("🔥 recordPayment HIT!");
  try {
    const { id } = req.params;
    const { amount, direction, date, method, notes } = req.body;

    // Validate inputs
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Valid positive amount is required" });
    }

    const validDirections = [
      "customer_pays_showroom",
      "showroom_pays_customer",
    ];
    if (!direction || !validDirections.includes(direction)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid direction" });
    }

    const exchange = await Exchange.findOne({ _id: id, userId: req.userId });
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }

    const amountNum = Number(amount);
    let due = 0;

    // Determine which due amount applies
    if (direction === "customer_pays_showroom") {
      if (exchange.finalDirection !== "customer_pays_showroom") {
        return res.status(400).json({
          success: false,
          message:
            "This direction is not consistent with the exchange settlement",
        });
      }
      due = Number(exchange.dueAmount) || 0;
      if (amountNum > due) {
        return res.status(400).json({
          success: false,
          message: `Payment exceeds the remaining due amount of ${due}`,
        });
      }
    } else {
      // showroom_pays_customer
      if (exchange.finalDirection !== "showroom_pays_customer") {
        return res.status(400).json({
          success: false,
          message:
            "This direction is not consistent with the exchange settlement",
        });
      }
      due = Number(exchange.dueFromShowroom) || 0;
      if (amountNum > due) {
        return res.status(400).json({
          success: false,
          message: `Payment exceeds the remaining due amount of ${due}`,
        });
      }
    }

    // Create the payment record
    const payment = new ExchangePayment({
      userId: req.userId,
      exchangeId: exchange._id,
      amount: amountNum,
      date: date ? new Date(date) : new Date(),
      method: method || "Cash",
      direction:
        direction === "customer_pays_showroom"
          ? "customer_to_showroom"
          : "showroom_to_customer",
      notes: notes || "",
      recordedBy: req.userId,
    });
    await payment.save();

    // Update the exchange
    if (direction === "customer_pays_showroom") {
      const currentReceived = Number(exchange.amountReceivedFromCustomer) || 0;
      exchange.amountReceivedFromCustomer = currentReceived + amountNum;
    } else {
      const currentPaid = Number(exchange.amountPaidToCustomer) || 0;
      exchange.amountPaidToCustomer = currentPaid + amountNum;
    }

    await exchange.save();

    // Log
    await createLog({
      userId: req.userId,
      category: "Exchange",
      action: "Payment",
      title: `Payment of ${amountNum} recorded for ${exchange.dealNumber}`,
      description: `${direction} — ${exchange.customerCar.owner.name}`,
      refId: exchange._id,
      refModel: "Exchange",
      amount: amountNum,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    // Populate and return updated exchange with payments
    await exchange.populate({
      path: "showroomCar.carId",
      select:
        "company model variant year registrationNumber images status salePrice dealerName",
    });

    // Also include the payment record in response
    const updatedPayment = await ExchangePayment.findOne({
      _id: payment._id,
      userId: req.userId,
    });

    res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        exchange,
        payment: updatedPayment,
      },
    });
  } catch (error) {
    console.error("Record payment error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to record payment",
        error: error.message,
      });
  }
};

// ==================================================
// GET PAYMENTS FOR AN EXCHANGE (optional)
// ==================================================
// @route  GET /api/exchanges/:id/payments
export const getExchangePayments = async (req, res) => {
  try {
    const { id } = req.params;

    const exchange = await Exchange.findOne({
      _id: id,
      userId: req.userId,
    }).select("_id");
    if (!exchange) {
      return res
        .status(404)
        .json({ success: false, message: "Exchange not found" });
    }

    const payments = await ExchangePayment.find({
      exchangeId: id,
      userId: req.userId,
    })
      .sort({ date: -1 })
      .populate("recordedBy", "name email");
    res.status(200).json({
      success: true,
      data: payments,
      message: "Payments retrieved successfully",
    });
  } catch (error) {
    console.error("Get payments error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to get payments",
        error: error.message,
      });
  }
};

// ==================================================
// EXCHANGE STATS
// ==================================================
// @route  GET /api/exchanges/stats
export const getExchangeStats = async (req, res) => {
  try {
    const ownerFilter = { userId: req.userId };
    const [total, pending, completed, headToHead, giving, getting] =
      await Promise.all([
        Exchange.countDocuments(ownerFilter),
        Exchange.countDocuments({ ...ownerFilter, status: "Pending" }),
        Exchange.countDocuments({ ...ownerFilter, status: "Completed" }),
        Exchange.countDocuments({
          ...ownerFilter,
          exchangeType: "Head-to-Head",
        }),
        Exchange.countDocuments({
          ...ownerFilter,
          exchangeType: "Car + Money Giving",
        }),
        Exchange.countDocuments({
          ...ownerFilter,
          exchangeType: "Car + Money Getting",
        }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        completed,
        byType: {
          headToHead,
          carMoneyGiving: giving,
          carMoneyGetting: getting,
        },
      },
      message: "Exchange statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Get exchange stats error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to get exchange statistics",
        error: error.message,
      });
  }
};