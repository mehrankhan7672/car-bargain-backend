// src/routes/saleRoutes.js
import express from 'express';
import {
  createSale,
  getSales,
  getSaleById,
  updateSale,
  deleteSale,
  getSaleStats,
  addPayment,          // <-- Import the new controller
} from '../controllers/sale/saleController.js';

const router = express.Router();

router.route('/stats').get(getSaleStats);
router.route('/').post(createSale).get(getSales);
router.route('/:id').get(getSaleById).put(updateSale).delete(deleteSale);

// Add payment to a sale – use :id to match the others
router.post('/:id/payments', addPayment);

export default router;