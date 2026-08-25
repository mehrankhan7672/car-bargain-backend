import express from "express";
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
} from "../controllers/employee/employeeController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every employee route requires a logged-in user
router.use(protect);

// Routes
router.route("/").get(getEmployees).post(createEmployee);

router.route("/stats").get(getEmployeeStats);

router
  .route("/:id")
  .get(getEmployee)
  .put(updateEmployee)
  .delete(deleteEmployee);

export default router;
