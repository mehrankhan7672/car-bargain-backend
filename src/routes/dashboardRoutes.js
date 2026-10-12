// src/routes/dashboardRoutes.js
import express from "express";
import { getDashboard } from "../controllers/dashboard/dashboardController.js";
import { protect, checkPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every dashboard route requires a logged-in user
router.use(protect);

// GET /api/dashboard?months=6
// Staff need "dashboard:view". Inside the controller each section is ALSO
// filtered by that module's own "view" permission (cars, sales, salaries...).
router.get("/", checkPermission("dashboard", "view"), getDashboard);

export default router;