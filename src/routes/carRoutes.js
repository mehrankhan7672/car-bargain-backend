// src/routes/carRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  createCar,
  getAllCars,
  getCarById,
  updateCar,
  deleteCar,
  getCarStats,
  searchCarsByUser,
} from "../controllers/car/CarController.js";
import { protect } from "../middleware/authMiddleware.js";
import { checkPermission } from "../middleware/authMiddleware.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "../../uploads/cars");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `car-${uniqueSuffix}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter,
});

const router = express.Router();

// Every car route requires a logged-in user
router.use(protect);

router.get("/stats", checkPermission("canView"), getCarStats);
router.get("/search/user", checkPermission("canView"), searchCarsByUser);
router.post(
  "/",
  checkPermission("canAdd"),
  upload.array("images", 10),
  createCar,
);
router.get("/", checkPermission("canView"), getAllCars);
router.get("/:id", checkPermission("canView"), getCarById);
router.put(
  "/:id",
  checkPermission("canEdit"),
  upload.array("images", 10),
  updateCar,
);
router.delete("/:id", checkPermission("canDelete"), deleteCar);

export default router;
