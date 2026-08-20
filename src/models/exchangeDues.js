// src/models/ExchangePayment.js
import mongoose from 'mongoose';

const exchangePaymentSchema = new mongoose.Schema(
  {
    exchangeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exchange',
      required: [true, 'Exchange ID is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    date: {
      type: Date,
      default: Date.now,
      required: [true, 'Payment date is required'],
    },
    method: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Cheque', 'Mobile Wallet'],
      default: 'Cash',
    },
    direction: {
      type: String,
      enum: ['customer_to_showroom', 'showroom_to_customer'],
      required: [true, 'Payment direction is required'],
      // 'customer_to_showroom' means the customer is paying the showroom (or Customer 2 pays Customer 1)
      // 'showroom_to_customer' means the showroom (or Customer 1) is paying the customer (or Customer 2)
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    // The authenticated user who recorded this payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
exchangePaymentSchema.index({ exchangeId: 1, date: -1 });
exchangePaymentSchema.index({ direction: 1 });

const ExchangePayment = mongoose.model('ExchangePayment', exchangePaymentSchema);

export default ExchangePayment;