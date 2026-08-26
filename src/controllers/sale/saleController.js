  // src/controllers/sale/saleController.js
  import Sale from '../../models/Sale.js';
  import Car from '../../models/Car.js';
  import { createLog } from '../../utils/logger.js';

  // controllers/saleController.js (or wherever your createSale is defined)

  export const createSale = async (req, res) => {
    try {
      const {
        carId,
        buyerName,
        buyerFatherName,
        buyerAddress,
        buyerPhone,
        buyerCnic,
        paymentType,
        fullPaymentAmount,
        advancePayment,
        monthlyInstalment,
        instalmentDate,
        saleDate,
        formLanguage,
      } = req.body;

      // 1. Validate carId
      if (!carId) {
        return res.status(400).json({ success: false, message: 'Please select a car' });
      }

      // 2. Find the car and ensure it belongs to the logged‑in user
      const car = await Car.findOne({ _id: carId, userId: req.userId });
      if (!car) {
        return res.status(404).json({
          success: false,
          message: 'Selected car was not found in your stock',
        });
      }
      if (car.status === 'Sold') {
        return res.status(400).json({
          success: false,
          message: 'This car has already been sold',
        });
      }

      // 3. Build seller snapshot from car data
      const sellerSnapshot = {
        name: car.userName || '',
        phone: car.userPhone || '',
        cnic: car.userCnic || '',
        address: car.userAddress || '',
      };

      // 4. Create the sale record
      const sale = await Sale.create({
        userId: req.userId,
        carId: car._id,
        carSnapshot: {
          company: car.company,
          model: car.model,
          variant: car.variant,
          year: car.year,
          registrationNumber: car.registrationNumber,
          localNumber: car.localNumber,
          carType: car.carType,
          salePrice: car.salePrice,
        },
        sellerSnapshot,   // <<< added here
        buyerName,
        buyerFatherName,
        buyerAddress,
        buyerPhone,
        buyerCnic,
        paymentType,
        fullPaymentAmount: fullPaymentAmount !== undefined ? Number(fullPaymentAmount) : undefined,
        advancePayment: advancePayment !== undefined ? Number(advancePayment) : undefined,
        monthlyInstalment: monthlyInstalment !== undefined ? Number(monthlyInstalment) : undefined,
        instalmentDate: instalmentDate || undefined,
        saleDate: saleDate || Date.now(),
        status: paymentType === 'Instalment' ? 'Pending' : 'Completed',
        formLanguage: formLanguage === 'ur' ? 'ur' : 'en',
      });

      // 5. Mark car as sold
      car.status = 'Sold';
      await car.save();

      // 6. Create log entry (unchanged)
      await createLog({
        userId: req.userId,
        category: 'Sale',
        action: 'Created',
        title: `Car sold: ${car.company} ${car.model} (${car.year})`,
        description: `Buyer: ${sale.buyerName} · ${sale.paymentType}`,
        refId: sale._id,
        refModel: 'Sale',
        amount: sale.fullPaymentAmount || car.salePrice || null,
        performedBy: req.user.name,
        performedByUserId: req.user._id,
      });

      // 7. Return success response
      res.status(201).json({
        success: true,
        message: 'Sale recorded successfully',
        data: sale,
      });
    } catch (error) {
      console.error('Create sale error:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ success: false, message: 'Validation error', errors });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to record sale',
        error: error.message,
      });
    }
  };

  export const getSales = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const search = req.query.search || '';
      const status = req.query.status;
      const paymentType = req.query.paymentType;

      const skip = (page - 1) * limit;

      const filter = { userId: req.userId };
      if (status) filter.status = status;
      if (paymentType) filter.paymentType = paymentType;
      if (search) {
        filter.$or = [
          { buyerName: { $regex: search, $options: 'i' } },
          { buyerPhone: { $regex: search, $options: 'i' } },
          { buyerCnic: { $regex: search, $options: 'i' } },
          { 'carSnapshot.company': { $regex: search, $options: 'i' } },
          { 'carSnapshot.model': { $regex: search, $options: 'i' } },
        ];
      }

      const [sales, total] = await Promise.all([
        Sale.find(filter).sort({ saleDate: -1 }).skip(skip).limit(limit),
        Sale.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: sales,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        message: 'Sales retrieved successfully',
      });
    } catch (error) {
      console.error('Get sales error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get sales',
        error: error.message,
      });
    }
  };

  export const getSaleById = async (req, res) => {
    try {
      const { id } = req.params;
      const sale = await Sale.findOne({ _id: id, userId: req.userId }).populate(
        'carId',
        'company model variant year registrationNumber localNumber images status',
      );
      if (!sale) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }
      res.status(200).json({ success: true, data: sale, message: 'Sale retrieved successfully' });
    } catch (error) {
      console.error('Get sale by ID error:', error);
      if (error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'Invalid sale ID' });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to get sale',
        error: error.message,
      });
    }
  };

  export const updateSale = async (req, res) => {
    try {
      const { id } = req.params;
      const {
        buyerName,
        buyerFatherName,
        buyerAddress,
        buyerPhone,
        buyerCnic,
        paymentType,
        fullPaymentAmount,
        advancePayment,
        monthlyInstalment,
        instalmentDate,
        status,
        formLanguage,
      } = req.body;

      const sale = await Sale.findOne({ _id: id, userId: req.userId });
      if (!sale) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }

      if (buyerName !== undefined) sale.buyerName = buyerName;
      if (buyerFatherName !== undefined) sale.buyerFatherName = buyerFatherName;
      if (buyerAddress !== undefined) sale.buyerAddress = buyerAddress;
      if (buyerPhone !== undefined) sale.buyerPhone = buyerPhone;
      if (buyerCnic !== undefined) sale.buyerCnic = buyerCnic;
      if (paymentType !== undefined) sale.paymentType = paymentType;
      if (fullPaymentAmount !== undefined) sale.fullPaymentAmount = Number(fullPaymentAmount);
      if (advancePayment !== undefined) sale.advancePayment = Number(advancePayment);
      if (monthlyInstalment !== undefined) sale.monthlyInstalment = Number(monthlyInstalment);
      if (instalmentDate !== undefined) sale.instalmentDate = instalmentDate;
      if (status !== undefined) sale.status = status;
      if (formLanguage === 'ur' || formLanguage === 'en') sale.formLanguage = formLanguage;

      await sale.save();

      await createLog({
        userId: req.userId,
        category: 'Sale',
        action: 'Updated',
        title: `Sale updated: ${sale.buyerName}`,
        description: `${sale.carSnapshot.company} ${sale.carSnapshot.model} · ${sale.paymentType}`,
        refId: sale._id,
        refModel: 'Sale',
        amount: sale.fullPaymentAmount || null,
        performedBy: req.user.name,
        performedByUserId: req.user._id,
      });

      res.status(200).json({ success: true, data: sale, message: 'Sale updated successfully' });
    } catch (error) {
      console.error('Update sale error:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ success: false, message: 'Validation error', errors });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to update sale',
        error: error.message,
      });
    }
  };

  export const deleteSale = async (req, res) => {
    try {
      const { id } = req.params;
      const sale = await Sale.findOne({ _id: id, userId: req.userId });
      if (!sale) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }

      await Car.findOneAndUpdate(
        { _id: sale.carId, userId: req.userId },
        { status: 'Available' },
      );

      await Sale.findOneAndDelete({ _id: id, userId: req.userId });

      await createLog({
        userId: req.userId,
        category: 'Sale',
        action: 'Deleted',
        title: `Sale removed: ${sale.buyerName}`,
        description: `${sale.carSnapshot.company} ${sale.carSnapshot.model}`,
        refId: sale._id,
        refModel: 'Sale',
        amount: sale.fullPaymentAmount || null,
        performedBy: req.user.name,
        performedByUserId: req.user._id,
      });

      res.status(200).json({ success: true, data: {}, message: 'Sale deleted successfully' });
    } catch (error) {
      console.error('Delete sale error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete sale',
        error: error.message,
      });
    }
  };

  export const getSaleStats = async (req, res) => {
    try {
      const owner = req.userId;

      const [totalAgg, count, byPaymentType] = await Promise.all([
        Sale.aggregate([
          { $match: { userId: owner } },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ['$fullPaymentAmount', '$carSnapshot.salePrice'] } },
            },
          },
        ]),
        Sale.countDocuments({ userId: owner }),
        Sale.aggregate([
          { $match: { userId: owner } },
          { $group: { _id: '$paymentType', count: { $sum: 1 } } },
        ]),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalRevenue: totalAgg[0]?.total || 0,
          totalSales: count,
          byPaymentType,
        },
        message: 'Sale statistics retrieved successfully',
      });
    } catch (error) {
      console.error('Get sale stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get sale statistics',
        error: error.message,
      });
    }
  };

  // Add payment to an instalment sale
 export const addPayment = async (req, res) => {
  try {
    const { id } = req.params;               // use :id like other routes
    const { amount, date, note } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number',
      });
    }

    // Find the sale and ensure it belongs to the logged-in user
    const sale = await Sale.findOne({ _id: id, userId: req.userId });
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found or you do not have permission',
      });
    }

    // Only instalment sales can receive payments
    if (sale.paymentType !== 'Instalment') {
      return res.status(400).json({
        success: false,
        message: 'Payments can only be added to instalment sales',
      });
    }

    // Build new payment object
    const newPayment = {
      amount: Number(amount),
      date: date || new Date(),
      note: note?.trim() || '',
    };

    // Add payment to array
    sale.payments.push(newPayment);

    // Recalculate total paid and update status if fully paid
    const car = await Car.findById(sale.carId).select('salePrice');
    const totalPrice = sale.carSnapshot?.salePrice || car?.salePrice || 0;
    const advance = sale.advancePayment || 0;
    const totalPaid = advance + sale.payments.reduce((sum, p) => sum + p.amount, 0);

    if (totalPaid >= totalPrice && sale.status !== 'Completed') {
      sale.status = 'Completed';
    }

    await sale.save();

    // Create a log entry (optional but recommended)
    await createLog({
      userId: req.userId,
      category: 'Sale',
      action: 'Payment',
      title: `Payment received for sale: ${sale.buyerName}`,
      description: `Amount: ${newPayment.amount} ${newPayment.note ? '· ' + newPayment.note : ''}`,
      refId: sale._id,
      refModel: 'Sale',
      amount: newPayment.amount,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: sale,
    });
  } catch (error) {
    console.error('Add payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
};