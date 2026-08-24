// src/models/Log.js
import mongoose from 'mongoose';

const logSchema = new mongoose.Schema(
  {
    // Owning account (the authenticated user this log entry belongs to)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Log category is required'],
            enum: ['Car', 'Exchange', 'Employee', 'Salary', 'Dealer', 'Expense', 'Auth', 'Other'],
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Log action is required'],
            enum: ['Created', 'Updated', 'Deleted', 'Status Changed', 'Payment', 'Login'],
    },
    title: {
      type: String,
      required: [true, 'Log title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    refModel: {
      type: String,
      trim: true,
      default: null,
    },
    amount: {
      type: Number,
      default: null,
    },
       performedBy: {
      type: String,
      trim: true,
      default: 'System',
    },
    // Real, queryable reference to which staff account performed this
    // action — performedBy alone was just a display string, sourced from
    // req.body, which no form ever actually populated.
    performedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

logSchema.index({ createdAt: -1 });
logSchema.index({ category: 1, createdAt: -1 });

const Log = mongoose.model('Log', logSchema);

export default Log;
