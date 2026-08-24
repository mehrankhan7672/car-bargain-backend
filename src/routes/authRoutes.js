// src/routes/authRoutes.js
import express from "express";
import {
    register,
    login,
    getMe,
    getUsers,
    getUserById,
    upload
} from "../controllers/auth/authController.js";
import { protect } from "../middleware/authMiddleware.js";

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

export default router;