// src/backend/models/Salary.js
import mongoose from "mongoose";

const salarySchema = new mongoose.Schema(
  {
    // Owning account (the authenticated user who recorded this payment)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Employee ID is required"],
    },
    employeeName: {
      type: String,
      required: [true, "Employee name is required"],
    },
    // Payment amount (what was actually paid)
    payment: {
      type: Number,
      required: [true, "Payment amount is required"],
      // min: [0, 'Payment must be greater than 0'],
    },
    // Full salary (employee's monthly salary)
    fullSalary: {
      type: Number,
      required: [true, "Full salary is required"],
      min: [0, "Full salary must be greater than 0"],
    },
    // Due salary (remaining balance)
    dueSalary: {
      type: Number,
      default: 0,
      min: [0, "Due salary cannot be negative"],
    },
    month: {
      type: String,
      required: [true, "Month is required"],
    },
    paidDate: {
      type: Date,
      required: [true, "Paid date is required"],
      default: Date.now,
    },
    method: {
      type: String,
      required: [true, "Payment method is required"],
      enum: ["Cash", "Bank Transfer", "Cheque", "Mobile Wallet"],
      default: "Cash",
    },
    paymentType: {
      type: String,
      enum: [
        "Full Salary",
        "Partial Salary",
        "Advance",
        "Bonus",
        "Commission",
        "Deduction",
      ],
      default: "Full Salary",
    },
    status: {
      type: String,
      enum: ["Paid", "Pending", "Cancelled", "Partially Paid"],
      default: "Paid",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salary",
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
salarySchema.index({ employeeId: 1, month: 1 });
salarySchema.index({ paidDate: -1 });
salarySchema.index({ paymentType: 1 });

// Ensure virtuals are included in JSON output
salarySchema.set("toJSON", { virtuals: true });
salarySchema.set("toObject", { virtuals: true });

const Salary = mongoose.model("Salary", salarySchema);

export default Salary;
