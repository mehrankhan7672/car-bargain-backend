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

const router = express.Router();

router.route("/stats").get(getExpenseStats);

router.route("/").post(createExpense).get(getExpenses);

router
  .route("/:id")
  .get(getExpenseById)
  .put(updateExpense)
  .delete(deleteExpense);

export default router;
