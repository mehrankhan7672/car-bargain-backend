// src/controllers/expense/expenseController.js
import Expense from '../../models/Expense.js';
import { createLog } from '../../utils/logger.js';

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private
export const createExpense = async (req, res) => {
  try {
    const { title, category, amount, date, notes } = req.body;

    const expense = await Expense.create({
      userId: req.userId,
      title,
      category,
      amount,
      date: date || Date.now(),
      notes: notes || '',
    });

    await createLog({
      userId: req.userId,
      category: 'Expense',
      action: 'Created',
      title: `Expense added: ${expense.title}`,
      description: `${expense.category} · PKR ${expense.amount}`,
      refId: expense._id,
      refModel: 'Expense',
      amount: expense.amount,
      performedBy: req.body.performedBy || 'System',
    });

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense added successfully',
    });
  } catch (error) {
    console.error('Create expense error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message,
    });
  }
};

// @desc    Get all expenses (search, filter by category/date, pagination)
// @route   GET /api/expenses
// @access  Private
export const getExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 500; // list page computes stats client-side over all rows
    const search = req.query.search || '';
    const category = req.query.category;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const skip = (page - 1) * limit;

    const filter = { userId: req.userId };
    if (category && category !== 'All') filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const [expenses, total] = await Promise.all([
      Expense.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: expenses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      message: 'Expenses retrieved successfully',
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get expenses',
      error: error.message,
    });
  }
};

// @desc    Get a single expense by ID
// @route   GET /api/expenses/:id
// @access  Private
export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findOne({ _id: id, userId: req.userId });
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.status(200).json({
      success: true,
      data: expense,
      message: 'Expense retrieved successfully',
    });
  } catch (error) {
    console.error('Get expense by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid expense ID' });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to get expense',
      error: error.message,
    });
  }
};

// @desc    Update an expense
// @route   PUT /api/expenses/:id
// @access  Private
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, amount, date, notes } = req.body;

    const expense = await Expense.findOne({ _id: id, userId: req.userId });
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    if (title !== undefined) expense.title = title;
    if (category !== undefined) expense.category = category;
    if (amount !== undefined) expense.amount = amount;
    if (date !== undefined) expense.date = date;
    if (notes !== undefined) expense.notes = notes;

    await expense.save();

    await createLog({
      userId: req.userId,
      category: 'Expense',
      action: 'Updated',
      title: `Expense updated: ${expense.title}`,
      description: `${expense.category} · PKR ${expense.amount}`,
      refId: expense._id,
      refModel: 'Expense',
      amount: expense.amount,
      performedBy: req.body?.performedBy || 'System',
    });

    res.status(200).json({
      success: true,
      data: expense,
      message: 'Expense updated successfully',
    });
  } catch (error) {
    console.error('Update expense error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message,
    });
  }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findOneAndDelete({ _id: id, userId: req.userId });
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    await createLog({
      userId: req.userId,
      category: 'Expense',
      action: 'Deleted',
      title: `Expense removed: ${expense.title}`,
      refId: expense._id,
      refModel: 'Expense',
      amount: expense.amount,
      performedBy: req.body?.performedBy || 'System',
    });

    res.status(200).json({
      success: true,
      data: {},
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message,
    });
  }
};

// @desc    Expense statistics (total, count, by category)
// @route   GET /api/expenses/stats
// @access  Private
export const getExpenseStats = async (req, res) => {
  try {
    const ownerFilter = { userId: req.userId };

    const [totalAgg, count, byCategory] = await Promise.all([
      Expense.aggregate([
        { $match: ownerFilter },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.countDocuments(ownerFilter),
      Expense.aggregate([
        { $match: ownerFilter },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalAmount: totalAgg[0]?.total || 0,
        totalEntries: count,
        byCategory,
      },
      message: 'Expense statistics retrieved successfully',
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get expense statistics',
      error: error.message,
    });
  }
};