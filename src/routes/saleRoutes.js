// src/routes/saleRoutes.js
import express from "express";
import {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
  getSaleStats,
  addPayment,
} from "../controllers/sale/saleController.js";
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Every sale route requires a logged-in user (was missing before)
router.use(protect);

router
  .route("/stats")
  .get(checkPermission("sales", "view"), getSaleStats);

router
  .route("/")
  .post(checkPermission("sales", "add"), createSale)
  .get(checkPermission("sales", "view"), getSales);

router
  .route("/:id")
  .get(checkPermission("sales", "view"), getSaleById)
  .put(checkPermission("sales", "edit"), updateSale)
  .delete(checkPermission("sales", "delete"), deleteSale);

// Add payment to a sale – use :id to match the others
router.post(
  "/:id/payments",
  checkPermission("sales", "edit"),
  addPayment,
);

export default router;