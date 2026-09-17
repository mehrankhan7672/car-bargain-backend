// src/routes/employeeRoutes.js
import express from "express";
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
} from "../controllers/employee/employeeController.js";
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every employee route requires a logged-in user
router.use(protect);

// Routes
router
  .route("/")
  .get(checkPermission("employees", "view"), getEmployees)
  .post(checkPermission("employees", "add"), createEmployee);

router
  .route("/stats")
  .get(checkPermission("employees", "view"), getEmployeeStats);

router
  .route("/:id")
  .get(checkPermission("employees", "view"), getEmployee)
  .put(checkPermission("employees", "edit"), updateEmployee)
  .delete(checkPermission("employees", "delete"), deleteEmployee);

export default router;