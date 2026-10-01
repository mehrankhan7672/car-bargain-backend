// index.js

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import connectDB from "./src/config/database.js";

import authRoutes from "./src/routes/authRoutes.js";
import carRoutes from "./src/routes/carRoutes.js";
import dealerRoutes from "./src/routes/dealerRoutes.js";
import employeeRoutes from "./src/routes/employeeRoutes.js";
import salaryRoutes from "./src/routes/salaryRoutes.js";
import exchangeRoutes from "./src/routes/exchangeRoutes.js";
import logRoutes from "./src/routes/logRoutes.js";
import expenseRoutes from "./src/routes/expenseRoutes.js";
import saleRoutes from "./src/routes/saleRoutes.js";

import { protect } from "./src/middleware/authMiddleware.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

// ======================================================
// CORS
// ======================================================

const allowedOrigin =
  process.env.FRONTEND_URL || "http://localhost:8080";

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Explicitly handle CORS preflight requests
app.options("*", cors());

// ======================================================
// BODY PARSING
// ======================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// LOGGING
// ======================================================

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url}`
  );
  next();
});

// ======================================================
// STATIC FILES
// ======================================================

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ======================================================
// DATABASE CONNECTION
// ======================================================

// Connect to MongoDB
connectDB();

// ======================================================
// ROOT ROUTE
// ======================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Car Bargain Backend API is running 🚗",
    status: "OK",
  });
});

// ======================================================
// AUTH ROUTES
// ======================================================

app.use("/api/auth", authRoutes);

// ======================================================
// OTHER ROUTES
// ======================================================

app.use("/api/cars", carRoutes);

app.use("/api/dealers", dealerRoutes);

app.use("/api/employees", employeeRoutes);

app.use("/api/salaries", salaryRoutes);

app.use("/api/exchanges", exchangeRoutes);

app.use("/api/logs", logRoutes);

app.use("/api/expenses", protect, expenseRoutes);

app.use("/api/sales", protect, saleRoutes);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ======================================================
// ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map(
      (e) => e.message
    );

    return res.status(400).json({
      success: false,
      message: messages.join(", "),
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = err.keyPattern
      ? Object.keys(err.keyPattern)[0]
      : "Field";

    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // JWT error
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  // File too large
  if (err.code === "FILE_TOO_LARGE") {
    return res.status(413).json({
      success: false,
      message: `File too large. Maximum size is ${
        process.env.MAX_FILE_SIZE || 5
      }MB.`,
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : undefined,
  });
});

// ======================================================
// LOCAL DEVELOPMENT SERVER
// ======================================================

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(
      `🚀 Server running on http://localhost:${PORT}`
    );

    console.log(
      `📁 Uploads directory: ${path.join(
        __dirname,
        "uploads"
      )}`
    );

    console.log(
      `📊 Environment: ${
        process.env.NODE_ENV || "development"
      }`
    );
  });
}

// ======================================================
// VERCEL
// ======================================================

export default app;