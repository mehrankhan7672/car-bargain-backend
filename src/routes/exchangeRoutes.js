// src/routes/exchangeRoutes.js
import express from "express";
import {
  createExchange,
  getExchanges,
  getExchangeById,
  updateExchange,
  deleteExchange,
  getExchangeStats,
  recordPayment,
  getExchangePayments,
} from "../controllers/exchange/exchangeController.js";
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every exchange route requires a logged-in user
router.use(protect);

// ✅ Specific routes FIRST
router
  .route("/stats")
  .get(checkPermission("exchanges", "view"), getExchangeStats);

router
  .route("/:id/payment")
  .put(checkPermission("exchanges", "edit"), recordPayment); // 👈 MUST come before /:id

router
  .route("/:id/payments")
  .get(checkPermission("exchanges", "view"), getExchangePayments);

// ✅ Generic CRUD routes LAST
router
  .route("/")
  .post(checkPermission("exchanges", "add"), createExchange)
  .get(checkPermission("exchanges", "view"), getExchanges);

router
  .route("/:id")
  .get(checkPermission("exchanges", "view"), getExchangeById)
  .put(checkPermission("exchanges", "edit"), updateExchange)
  .delete(checkPermission("exchanges", "delete"), deleteExchange);

export default router;