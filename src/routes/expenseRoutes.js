// src/routes/expenseRoutes.js
import express from "express";
import {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseStats,
} from "../controllers/expense/expenseController.js";
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Every expense route requires a logged-in user (was missing before)
router.use(protect);

router
  .route("/stats")
  .get(checkPermission("expenses", "view"), getExpenseStats);

router
  .route("/")
  .post(checkPermission("expenses", "add"), createExpense)
  .get(checkPermission("expenses", "view"), getExpenses);

router
  .route("/:id")
  .get(checkPermission("expenses", "view"), getExpenseById)
  .put(checkPermission("expenses", "edit"), updateExpense)
  .delete(checkPermission("expenses", "delete"), deleteExpense);

export default router;