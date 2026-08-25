// src/backend/routes/salaryRoutes.js
import express from "express";
import {
  getSalaries,
  getSalary,
  createSalary,
  updateSalary,
  deleteSalary,
  getSalaryStats,
  getEmployeeSalaryHistory,
  getEmployeeBalance,
} from "../controllers/employee/salaryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every salary route requires a logged-in user
router.use(protect);

// Routes
router.route("/").get(getSalaries).post(createSalary);

router.route("/stats").get(getSalaryStats);

router.route("/balance/:employeeId").get(getEmployeeBalance);

router.route("/employee/:employeeId").get(getEmployeeSalaryHistory);

router.route("/:id").get(getSalary).put(updateSalary).delete(deleteSalary);

export default router;
