import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
// ...your other imports stay the same

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel's filesystem is read-only except /tmp
const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "cars")
  : path.join(__dirname, "../../uploads/cars");

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.error("Could not create upload dir:", err.message);
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

// ✅ FIXED: Two-argument checkPermission(module, action)
router.get("/stats", checkPermission("cars", "view"), getCarStats);
router.get("/search/user", checkPermission("cars", "view"), searchCarsByUser);

router.post(
  "/",
  checkPermission("cars", "add"),
  upload.array("images", 10),
  createCar,
);

router.get("/", checkPermission("cars", "view"), getAllCars);
router.get("/:id", checkPermission("cars", "view"), getCarById);

router.put(
  "/:id",
  checkPermission("cars", "edit"),
  upload.array("images", 10),
  updateCar,
);

router.delete("/:id", checkPermission("cars", "delete"), deleteCar);

export default router;