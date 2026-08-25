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
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every exchange route requires a logged-in user
router.use(protect);

// ✅ Specific routes FIRST
router.route("/stats").get(getExchangeStats);
router.route("/:id/payment").put(recordPayment); // 👈 MUST come before /:id
router.route("/:id/payments").get(getExchangePayments);

// ✅ Generic CRUD routes LAST
router.route("/").post(createExchange).get(getExchanges);
router
  .route("/:id")
  .get(getExchangeById)
  .put(updateExchange)
  .delete(deleteExchange);

export default router;
