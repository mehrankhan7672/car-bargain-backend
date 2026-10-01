// src/models/User.js
import mongoose from "mongoose";

// Define the modules that match your frontend
export const MODULES = [
  "dashboard",
  "cars",
  "sales",
  "exchanges",
  "dealers",
  "expenses",
  "employees",
  "salaries",
];

// Helper to create the default permission object for a module
const defaultModulePermission = {
  view: { type: Boolean, default: false },
  add: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
};

// Build the permissions schema dynamically
const permissionsSchema = {};
MODULES.forEach((mod) => {
  permissionsSchema[mod] = defaultModulePermission;
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Don't return password by default in queries
    },
    bargainName: {
      type: String,
      required: [true, "Bargain name is required"],
      trim: true,
      minlength: [2, "Bargain name must be at least 2 characters"],
      maxlength: [50, "Bargain name cannot exceed 50 characters"],
    },
    logo: {
      type: String,
      default: null,
    },
    logoFileName: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "admin", "staff"],
      default: "user",
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // NEW: Nested permissions object matching your frontend modules
    permissions: {
      type: permissionsSchema,
      default: () => {
        const initialPerms = {};
        MODULES.forEach((mod) => {
          initialPerms[mod] = { view: false, add: false, edit: false, delete: false };
        });
        return initialPerms;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Get public profile (exclude sensitive fields)
userSchema.methods.getPublicProfile = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

const User = mongoose.model("User", userSchema);

export default User;