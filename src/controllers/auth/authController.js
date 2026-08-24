// src/controllers/auth/authController.js
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import User from "../../models/User.js";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads - FIXED PATH
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "logos",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const fileFilter = (req, file, cb) => {
  console.log("File type:", file.mimetype);
  const allowedTypes = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, SVG, and WebP are allowed."), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Generate JWT Token (Only used at login)
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      email: user.email,
      name: user.name,
      bargainName: user.bargainName,
      role: user.role,
    },
    process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
    { expiresIn: "7d" }
  );
};

// Register User - Password Hashing DONE IN CONTROLLER
export const register = async (req, res) => {
  console.log("=== REGISTRATION STARTED ===");
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);
  
  try {
    const { name, email, password, bargainName } = req.body;
    const logoFile = req.file;

    // Validation
    if (!name || !email || !password || !bargainName) {
      console.log("Missing fields");
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("Invalid email format:", email);
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Password strength validation
    if (password.length < 6) {
      console.log("Password too short:", password.length);
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("User already exists:", email);
      return res.status(400).json({
        success: false,
        message: "Email already registered. Please use a different email or login.",
      });
    }

    // HASH PASSWORD IN CONTROLLER (Not in model)
    console.log("Original password:", password);
    console.log("Original password length:", password.length);
    
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("Hashed password:", hashedPassword);
    console.log("Is hashed?", hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'));

    // Create user with hashed password
    const user = new User({
      name,
      email,
      password: hashedPassword, // Store the hashed password
      bargainName,
      logo: logoFile ? logoFile.path : null,
      logoFileName: logoFile ? logoFile.filename : null,
    });

    // Save user to database
    await user.save();
    console.log("User created successfully:", user.email);

    // Verify password is hashed (for debugging)
    const savedUser = await User.findOne({ email }).select('+password');
    console.log("Stored password in DB:", savedUser.password);
    console.log("Is password hashed?", savedUser.password.startsWith('$2a$') || savedUser.password.startsWith('$2b$'));

    // Get public profile (excludes password)
    const userPublic = user.getPublicProfile();

    console.log("=== REGISTRATION COMPLETED SUCCESSFULLY ===");
    
    // Return success WITHOUT token - User must login to get token
    res.status(201).json({
      success: true,
      message: "Account created successfully. Please login to continue.",
      user: userPublic,
    });
  } catch (error) {
    console.error("=== REGISTRATION ERROR ===");
    console.error(error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Login User - COMPARES HASHED PASSWORD IN CONTROLLER
export const login = async (req, res) => {
  console.log("=== LOGIN STARTED ===");
  console.log("Login attempt:", { email: req.body.email });
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user with password field included
    const user = await User.findOne({ email }).select('+password');
    
    // Check if user exists
    if (!user) {
      console.log("User not found:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Debug: Check stored password format
    console.log("Stored password (hashed):", user.password);
    console.log("Is password hashed?", user.password.startsWith('$2a$') || user.password.startsWith('$2b$'));

    // Check if user account is active
    if (!user.isActive) {
      console.log("User account is inactive:", email);
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // COMPARE PASSWORD IN CONTROLLER (Not in model)
    console.log("Comparing passwords in controller...");
    console.log("Input password:", password);
    console.log("Stored hash:", user.password);
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log("Password comparison result:", isPasswordValid);
    
    if (!isPasswordValid) {
      console.log("Invalid password for user:", email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate JWT token
    const token = generateToken(user);
    const userPublic = user.getPublicProfile();

    console.log("Login successful:", email);
    console.log("=== LOGIN COMPLETED ===");

    // Return success response with token
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userPublic,
    });
  } catch (error) {
    console.error("=== LOGIN ERROR ===");
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get the currently logged-in user's own profile
// @route   GET /api/auth/me
// @access  Private (requires valid token)
export const getMe = async (req, res) => {
  try {
    // req.user is already populated by the `protect` middleware and
    // already excludes the password field.
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.error("Error getting current user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get all users (for testing)
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get single user by ID
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};