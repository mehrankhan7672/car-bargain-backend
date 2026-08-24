import Dealer from '../../models/Dealer.js';
import { createLog } from '../../utils/logger.js';

// @desc    Create a new dealer
// @route   POST /api/dealers
// @access  Public
export const createDealer = async (req, res) => {
  try {
    const { name, phone, cnic, address, notes } = req.body;

    // Check if THIS user already has a dealer with the same CNIC
    const existingDealer = await Dealer.findOne({ cnic, userId: req.userId });
    if (existingDealer) {
      return res.status(400).json({
        success: false,
        message: 'Dealer with this CNIC already exists'
      });
    }

    const dealer = await Dealer.create({
      userId: req.userId,
      name,
      phone,
      cnic,
      address,
      notes: notes || ''
    });

      await createLog({
      userId: req.userId,
      category: 'Dealer',
      action: 'Created',
      title: `Dealer added: ${dealer.name}`,
      description: `Phone: ${dealer.phone} · CNIC: ${dealer.cnic}`,
      refId: dealer._id,
      refModel: 'Dealer',
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: dealer,
      message: 'Dealer created successfully'
    });
  } catch (error) {
    console.error('Create dealer error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(function(err) {
        return err.message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create dealer',
      error: error.message
    });
  }
};

// @desc    Get all dealers with pagination and search
// @route   GET /api/dealers
// @access  Public
export const getDealers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    // Build search query
    let query = { userId: req.userId };
    if (search) {
      query = {
        userId: req.userId,
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } },
          { cnic: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const dealers = await Dealer.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await Dealer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: dealers,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      },
      message: 'Dealers retrieved successfully'
    });
  } catch (error) {
    console.error('Get dealers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dealers',
      error: error.message
    });
  }
};

// @desc    Get single dealer by ID
// @route   GET /api/dealers/:id
// @access  Public
export const getDealerById = async (req, res) => {
  try {
    const { id } = req.params;

    const dealer = await Dealer.findOne({ _id: id, userId: req.userId });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: dealer,
      message: 'Dealer retrieved successfully'
    });
  } catch (error) {
    console.error('Get dealer by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dealer',
      error: error.message
    });
  }
};

// @desc    Update dealer
// @route   PUT /api/dealers/:id
// @access  Public
export const updateDealer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, cnic, address, notes } = req.body;

    // Check if dealer exists and belongs to this user
    const dealer = await Dealer.findOne({ _id: id, userId: req.userId });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Check for duplicate CNIC within this user's own dealers (excluding current dealer)
    if (cnic && cnic !== dealer.cnic) {
      const existingDealer = await Dealer.findOne({ 
        cnic: cnic, 
        userId: req.userId,
        _id: { $ne: id } 
      });
      if (existingDealer) {
        return res.status(400).json({
          success: false,
          message: 'Dealer with this CNIC already exists'
        });
      }
    }

    // Update fields
    const updatedDealer = await Dealer.findOneAndUpdate(
      { _id: id, userId: req.userId },
      {
        name: name || dealer.name,
        phone: phone || dealer.phone,
        cnic: cnic || dealer.cnic,
        address: address || dealer.address,
        notes: notes !== undefined ? notes : dealer.notes
      },
      {
        new: true,
        runValidators: true
      }
    );

        await createLog({
        userId: req.userId,
        category: 'Dealer',
        action: 'Updated',
        title: `Dealer updated: ${updatedDealer.name}`,
        description: `Phone: ${updatedDealer.phone} · CNIC: ${updatedDealer.cnic}`,
        refId: updatedDealer._id,
        refModel: 'Dealer',
        performedBy: req.user.name,
        performedByUserId: req.user._id,
      });

    res.status(200).json({
      success: true,
      data: updatedDealer,
      message: 'Dealer updated successfully'
    });
  } catch (error) {
    console.error('Update dealer error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(function(err) {
        return err.message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update dealer',
      error: error.message
    });
  }
};

// @desc    Delete dealer
// @route   DELETE /api/dealers/:id
// @access  Public
export const deleteDealer = async (req, res) => {
  try {
    const { id } = req.params;

    const dealer = await Dealer.findOne({ _id: id, userId: req.userId });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

      await Dealer.findOneAndDelete({ _id: id, userId: req.userId });

      await createLog({
        userId: req.userId,
        category: 'Dealer',
        action: 'Deleted',
        title: `Dealer removed: ${dealer.name}`,
        description: `Phone: ${dealer.phone} · CNIC: ${dealer.cnic}`,
        refId: dealer._id,
        refModel: 'Dealer',
        performedBy: req.user.name,
        performedByUserId: req.user._id,
      });

      res.status(200).json({
        success: true,
        data: {},
        message: 'Dealer deleted successfully'
      });
  } catch (error) {
    console.error('Delete dealer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete dealer',
      error: error.message
    });
  }
};

// @desc    Get dealer statistics
// @route   GET /api/dealers/stats
// @access  Public
export const getDealerStats = async (req, res) => {
  try {
    const totalDealers = await Dealer.countDocuments({ userId: req.userId });
    const recentDealers = await Dealer.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        totalDealers: totalDealers,
        recentDealers: recentDealers
      },
      message: 'Dealer statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Get dealer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dealer statistics',
      error: error.message
    });
  }
};

// @desc    Search dealers by query
// @route   GET /api/dealers/search
// @access  Public
export const searchDealers = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const dealers = await Dealer.find({
      userId: req.userId,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { cnic: { $regex: query, $options: 'i' } }
      ]
    }).limit(20);

    res.status(200).json({
      success: true,
      data: dealers,
      message: 'Dealers searched successfully'
    });
  } catch (error) {
    console.error('Search dealers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search dealers',
      error: error.message
    });
  }
};