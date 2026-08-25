// src/models/Car.js
import mongoose from "mongoose";

const carSchema = new mongoose.Schema(
  {
    // Owning account (the authenticated user/dealer who created this record)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    // Customer Information (Step 1) - the buyer/seller this car deal is with,
    // NOT the logged-in account. Kept as userName/userPhone/etc. for backwards
    // compatibility with the existing frontend forms.
    userName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    userPhone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [
        /^(\d{4}-\d{7}|\d{11})$/,
        "Please enter a valid phone number (e.g., 0300-1234567 or 03001234567)",
      ],
    },
    userCnic: {
      type: String,
      required: [true, "CNIC number is required"],
      trim: true,
      match: [
        /^\d{13}$/,
        "CNIC must be exactly 13 digits (e.g., 1234567890123)",
      ],
    },
    userAddress: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      default: null,
    },
    dealerName: {
      type: String,
      trim: true,
    },
    // Car Information (Step 2)
    company: {
      type: String,
      required: [true, "Company is required"],
      trim: true,
    },
    model: {
      type: String,
      required: [true, "Model is required"],
      trim: true,
    },
    variant: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
      required: [true, "Year is required"],
      min: [1900, "Year must be 1900 or later"],
      max: [new Date().getFullYear() + 1, "Year cannot be in the future"],
    },
    // FIX: conditionally required based on carType — required when the car is
    // "CP (Custom Paid)" (registered), optional/hidden when "NCP".
    //
    // FIX 2: removed `unique: true, sparse: true` from here. `sparse` only
    // skips indexing a field that is completely MISSING (undefined) — it
    // still indexes an empty string "" as a real value. Two NCP cars that
    // both ended up with registrationNumber: "" (e.g. from before the
    // controller was fixed to delete the key entirely) would collide on that
    // index even though neither one actually has a registration number. The
    // real intent — "only enforce uniqueness when a genuine value is
    // present" — is expressed correctly below via a partial index instead.
    registrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function (value) {
          if (this.carType === "CP (Custom Paid)") {
            return !!(value && value.trim().length > 0);
          }
          return true;
        },
        message: "Registration number is required for a registered (CP) car",
      },
    },
    // FIX: conditionally required based on carType — required when "CP (Custom Paid)".
    registrationCity: {
      type: String,
      trim: true,
      validate: {
        validator: function (value) {
          if (this.carType === "CP (Custom Paid)") {
            return !!(value && value.trim().length > 0);
          }
          return true;
        },
        message: "Registration city is required for a registered (CP) car",
      },
    },
    // FIX: new field — the frontend was already sending this in defaultValues
    // but the schema had nowhere to put it, so Mongoose silently dropped it.
    // Required when carType is "NCP (Non-Custom Paid)".
    localNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (value) {
          if (this.carType === "NCP (Non-Custom Paid)") {
            return !!(value && value.trim().length > 0);
          }
          return true;
        },
        message: "Local number is required for a non-custom-paid (NCP) car",
      },
    },
    color: {
      type: String,
      required: [true, "Color is required"],
      trim: true,
    },
    customColor: {
      type: String,
      trim: true,
    },
    mileage: {
      type: Number,
      required: [true, "Mileage is required"],
      min: [0, "Mileage cannot be negative"],
    },
    engineCC: {
      type: Number,
      required: [true, "Engine CC is required"],
      min: [0, "Engine CC cannot be negative"],
    },
    fuelType: {
      type: String,
      required: [true, "Fuel type is required"],
      enum: ["Petrol", "Diesel", "Electric", "Hybrid", "CNG"],
    },
    transmission: {
      type: String,
      required: [true, "Transmission is required"],
      enum: ["Automatic", "Manual", "CVT", "DCT"],
    },
    condition: {
      type: String,
      required: [true, "Condition is required"],
      enum: ["New", "Used", "Certified Pre-Owned"],
    },
    chassisNumber: {
      type: String,
      required: [true, "Chassis number is required"],
      trim: true,
      unique: true,
      sparse: true,
    },
    engineNumber: {
      type: String,
      required: [true, "Engine number is required"],
      trim: true,
      unique: true,
      sparse: true,
    },
    carType: {
      type: String,
      required: [true, "Car type is required"],
      enum: ["NCP (Non-Custom Paid)", "CP (Custom Paid)"],
    },

    // Pricing (Step 3)
    // FIX: no longer required — the frontend now only collects salePrice.
    // Kept as an optional field (not deleted from the schema) so any existing
    // car documents that already have a purchasePrice value aren't affected.
    purchasePrice: {
      type: Number,
      min: [0, "Purchase price cannot be negative"],
    },
    salePrice: {
      type: Number,
      min: [0, "Sale price cannot be negative"],
    },
    expectedPrice: {
      type: Number,
      min: [0, "Expected price cannot be negative"],
    },
    transactionType: {
      type: String,
      required: [true, "Transaction type is required"],
      enum: ["Direct Purchase", "Exchange with Bargain"],
      default: "Direct Purchase",
    },
    exchangeCarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      default: null,
    },

    // Optional text/details about the exchange car
    exchangeCarDetails: {
      type: String,
      trim: true,
    },
    exchangeAdditionalAmount: {
      type: Number,
      min: [0, "Additional amount cannot be negative"],
    },
    exchangeType: {
      type: String,
      enum: ["Car Only", "Car + Money"],
    },
    exchangeMoneyAmount: {
      type: Number,
      min: [0, "Money amount cannot be negative"],
      validate: {
        validator: function (value) {
          // If exchangeType is 'Car + Money', money amount is required
          if (this.exchangeType === "Car + Money") {
            return value && value > 0;
          }
          return true;
        },
        message: 'Money amount is required when exchange type is "Car + Money"',
      },
    },

    // Inventory & Additional (Step 4)
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: ["Available", "Reserved", "Sold"],
      default: "Available",
    },
    dateAdded: {
      type: Date,
      required: [true, "Date added is required"],
      default: Date.now,
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// FIX: partial unique index — this is the actual "only check uniqueness if
// a value is present" behavior. Unlike `sparse`, a partial index with this
// filter expression excludes BOTH a missing field AND an empty string from
// the uniqueness check, so:
//   - Any number of NCP cars (no registrationNumber at all) never collide.
//   - Any leftover "" values from old records never collide with anything.
//   - Two CP cars with the same real registrationNumber still correctly
//     get rejected as duplicates.
carSchema.index(
  { registrationNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      registrationNumber: { $type: "string", $gt: "" },
    },
  },
);

const Car = mongoose.model("Car", carSchema);

export default Car;
