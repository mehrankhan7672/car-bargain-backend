// src/controllers/log/logController.js
import Log from "../../models/Log.js";

// @desc    Get all logs with pagination, category filter & search
// @route   GET /api/logs
export const getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { category, action, search, startDate, endDate } = req.query;

    const skip = (page - 1) * limit;

    const filter = { userId: req.userId };
    if (category && category !== "All") filter.category = category;
    if (action && action !== "All") filter.action = action;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { performedBy: { $regex: search, $options: "i" } },
      ];
    }

    const [logs, total] = await Promise.all([
      Log.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Log.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      message: "Logs retrieved successfully",
    });
  } catch (error) {
    console.error("Get logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get logs",
      error: error.message,
    });
  }
};

// @desc    Get log counts grouped by category (for the listing page tabs)
// @route   GET /api/logs/stats
export const getLogStats = async (req, res) => {
  try {
    const [byCategory, total] = await Promise.all([
      Log.aggregate([
        { $match: { userId: req.userId } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Log.countDocuments({ userId: req.userId }),
    ]);

    const counts = byCategory.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: { total, byCategory: counts },
      message: "Log statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Get log stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get log statistics",
      error: error.message,
    });
  }
};

// @desc    Delete a single log entry
// @route   DELETE /api/logs/:id
export const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findOne({ _id: id, userId: req.userId });
    if (!log) {
      return res.status(404).json({ success: false, message: "Log not found" });
    }
    await Log.findOneAndDelete({ _id: id, userId: req.userId });
    res
      .status(200)
      .json({ success: true, data: {}, message: "Log deleted successfully" });
  } catch (error) {
    console.error("Delete log error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete log",
      error: error.message,
    });
  }
};
