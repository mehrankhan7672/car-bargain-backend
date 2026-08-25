// src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Protects a route: requires a valid JWT in the Authorization header
// (Bearer <token>). On success it attaches the logged-in user's document
// to req.user (password excluded) and their id to req.userId, so every
// downstream controller can scope queries/creates to that user only.
export const protect = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Please login to continue.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
      );
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please login again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Not authorized. Invalid token.",
      });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. User no longer exists.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    req.user = user;
    req.userId = user.tenantId || user._id;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication",
    });
  }
};

export const checkPermission = (permissionKey) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authorized" });
  }

  const isOwner = !req.user.tenantId;
  if (isOwner) return next();

  const allowed = req.user.permissions?.[permissionKey];
  if (!allowed) {
    const actionLabel = permissionKey.replace("can", "").toLowerCase();
    return res.status(403).json({
      success: false,
      message: `You don't have permission to ${actionLabel} records. Ask the account owner to grant it.`,
    });
  }

  next();
};

export default protect;
