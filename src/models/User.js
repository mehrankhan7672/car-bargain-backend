// src/models/User.js
import mongoose from "mongoose";

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
    permissions: {
      canView: { type: Boolean, default: true },
      canAdd: { type: Boolean, default: true },
      canEdit: { type: Boolean, default: true },
      canDelete: { type: Boolean, default: true },
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

// NO PRE-SAVE HOOK FOR PASSWORD HASHING - It's done in controller

// Get public profile (exclude sensitive fields)
userSchema.methods.getPublicProfile = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

const User = mongoose.model("User", userSchema);

export default User;
