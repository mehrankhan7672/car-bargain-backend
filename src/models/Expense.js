// src/models/Expense.js
import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Expense title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["Repair", "Fuel", "Office", "Salary", "Marketing", "Other"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ title: "text", notes: "text" });

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;
