import express from "express";
import {
  createDealer,
  getDealers,
  getDealerById,
  updateDealer,
  deleteDealer,
  getDealerStats,
  searchDealers,
} from "../controllers/dealer/dealerController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Every dealer route requires a logged-in user
router.use(protect);

// Routes with specific paths first
router.route("/stats").get(getDealerStats);

router.route("/search").get(searchDealers);

// Generic CRUD routes
router.route("/").post(createDealer).get(getDealers);

router.route("/:id").get(getDealerById).put(updateDealer).delete(deleteDealer);

export default router;
