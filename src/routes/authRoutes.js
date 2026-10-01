// src/routes/authRoutes.js
import express from "express";
import {
  register,
  login,
  getMe,
  getUsers,
  getUserById,
  upload,
  addStaff,
  getAllStaff,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
} from "../controllers/auth/authController.js";
import { protect, ownerOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes — no auth required
router.post("/register", upload.single("logo"), register);
router.post("/login", login);

// Everything below requires a valid, logged-in user
router.use(protect);

router.get("/me", getMe);

// Testing routes (remove in production) — now require auth so account
// data can't be scraped by anyone who finds the URL.
router.get("/users", getUsers);
router.get("/users/:id", getUserById);

// Staff management — OWNER ONLY (staff can never create users or change permissions)
router.post("/staff", ownerOnly, addStaff);
router.get("/staff", ownerOnly, getAllStaff);
router.put("/staff/:id", ownerOnly, updateStaff);

// FIXED: Changed from .put to .patch to match your frontend staffService.setStatus()
router.patch("/staff/:id/status", ownerOnly, updateStaffStatus);

router.delete("/staff/:id", ownerOnly, deleteStaff);

export default router;