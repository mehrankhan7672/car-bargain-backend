// src/routes/salaryRoutes.js
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
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every salary route requires a logged-in user
router.use(protect);

// Routes
router
  .route("/")
  .get(checkPermission("salaries", "view"), getSalaries)
  .post(checkPermission("salaries", "add"), createSalary);

router
  .route("/stats")
  .get(checkPermission("salaries", "view"), getSalaryStats);

router
  .route("/balance/:employeeId")
  .get(checkPermission("salaries", "view"), getEmployeeBalance);

router
  .route("/employee/:employeeId")
  .get(checkPermission("salaries", "view"), getEmployeeSalaryHistory);

router
  .route("/:id")
  .get(checkPermission("salaries", "view"), getSalary)
  .put(checkPermission("salaries", "edit"), updateSalary)
  .delete(checkPermission("salaries", "delete"), deleteSalary);

export default router;