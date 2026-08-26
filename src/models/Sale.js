// src/models/Sale.js
import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      required: [true, 'carId is required'],
    },
    carSnapshot: {
      company: { type: String, trim: true },
      model: { type: String, trim: true },
      variant: { type: String, trim: true },
      year: { type: Number },
      registrationNumber: { type: String, trim: true },
      localNumber: { type: String, trim: true },
      carType: { type: String, trim: true },
      salePrice: { type: Number },
    },
     sellerSnapshot: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      cnic: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    buyerName: {
      type: String,
      required: [true, 'Buyer name is required'],
      trim: true,
    },
    buyerFatherName: {
      type: String,
      required: [true, "Buyer's father name is required"],
      trim: true,
    },
    buyerAddress: {
      type: String,
      required: [true, 'Buyer address is required'],
      trim: true,
    },
    buyerPhone: {
      type: String,
      required: [true, 'Buyer phone number is required'],
      trim: true,
    },
    buyerCnic: {
      type: String,
      required: [true, 'Buyer CNIC is required'],
      trim: true,
    },

    paymentType: {
      type: String,
      enum: ['Full Payment', 'Instalment'],
      required: [true, 'Payment type is required'],
    },
    fullPaymentAmount: {
      type: Number,
      min: [0, 'Amount cannot be negative'],
    },
    advancePayment: {
      type: Number,
      min: [0, 'Advance payment cannot be negative'],
    },
    monthlyInstalment: {
      type: Number,
      min: [0, 'Monthly instalment cannot be negative'],
    },
    instalmentDate: {
      type: Date,
    },
    payments: [{
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        note: { type: String, trim: true },
    }],
    saleDate: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ['Completed', 'Pending'],
      default: 'Completed',
    },

    formLanguage: {
      type: String,
      enum: ['en', 'ur'],
      default: 'en',
    },
  },
  {
    timestamps: true,
  },
);

saleSchema.index({ userId: 1, saleDate: -1 });

const Sale = mongoose.model('Sale', saleSchema);

export default Sale;