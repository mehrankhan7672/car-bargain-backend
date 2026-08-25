// src/backend/models/Employee.js
import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    // Owning account (the authenticated user who created this employee record)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Employee name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: [
        "Manager",
        "Salesman",
        "Accountant",
        "Driver",
        "Watchman",
        "Cleaner",
        "Cook",
        "Waiter",
      ],
      default: "Salesman",
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [
        /^03\d{9}$/,
        "Please enter a valid Pakistani phone number (e.g., 03001234567)",
      ],
    },
    joiningDate: {
      type: String,
      required: [true, "Joining date is required"],
    },
    salary: {
      type: Number,
      required: [true, "Salary is required"],
      min: [0, "Salary must be a positive number"],
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Index for search
employeeSchema.index({ name: "text", phone: "text" });

// Virtual for formatted salary
employeeSchema.virtual("formattedSalary").get(function () {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
  }).format(this.salary);
});

// Ensure virtuals are included in JSON output
employeeSchema.set("toJSON", { virtuals: true });
employeeSchema.set("toObject", { virtuals: true });

const Employee = mongoose.model("Employee", employeeSchema);

export default Employee;
