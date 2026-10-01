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

/**
 * checkPermission(moduleName, action)
 *
 * @param {string} moduleName - The module to check ("cars", "sales", "dealers", etc.)
 * @param {string} action     - The action to check ("view", "add", "edit", "delete")
 *
 * Usage examples:
 *   checkPermission("cars", "view")
 *   checkPermission("sales", "add")
 *   checkPermission("expenses", "delete")
 *
 * Notes:
 *  - The account owner (user without a tenantId) is always allowed.
 *  - Staff users are checked against their nested permissions object.
 */
export const checkPermission = (moduleName, action) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authorized" });
  }

  // Owner (no tenantId) has full access to everything
  const isOwner = !req.user.tenantId;
  if (isOwner) return next();

  // Check the nested permission: permissions[moduleName][action]
  const modulePermissions = req.user.permissions?.[moduleName];
  const allowed = modulePermissions?.[action] === true;

  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: `You don't have permission to ${action} ${moduleName}. Ask the account owner to grant it.`,
    });
  }

  next();
};

/**
 * ownerOnly
 *
 * Allows only the account owner (a user WITHOUT a tenantId).
 * Use it for things staff must never do, no matter what permissions they have:
 * managing staff accounts, changing permissions, reading activity logs.
 */
export const ownerOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authorized" });
  }

  if (req.user.tenantId) {
    return res.status(403).json({
      success: false,
      message: "Only the account owner can do this.",
    });
  }

  next();
};

export default protect;