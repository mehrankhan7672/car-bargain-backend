// src/controllers/car/CarController.js

import mongoose from 'mongoose';
import Car from '../../models/Car.js';
import { createLog } from '../../utils/logger.js';

// ==================================================
// Validate CP / NCP fields
// ==================================================

const validateCarTypeFields = (data) => {
  const carType = data.carType;

  if (carType === 'CP (Custom Paid)') {
    if (
      !data.registrationCity ||
      !String(data.registrationCity).trim()
    ) {
      return 'Registration city is required for a registered (CP) car';
    }

    if (
      !data.registrationNumber ||
      !String(data.registrationNumber).trim()
    ) {
      return 'Registration number is required for a registered (CP) car';
    }
  }

  if (carType === 'NCP (Non-Custom Paid)') {
    if (
      !data.localNumber ||
      !String(data.localNumber).trim()
    ) {
      return 'Local number is required for a non-custom-paid (NCP) car';
    }
  }

  return null;
};

// ==================================================
// Remove fields that don't belong to current car type
// ==================================================

const stripInapplicableCarTypeFields = (data) => {
  if (data.carType === 'CP (Custom Paid)') {
    delete data.localNumber;
  }

  if (data.carType === 'NCP (Non-Custom Paid)') {
    delete data.registrationCity;
    delete data.registrationNumber;
  }
};

// ==================================================
// Validate Exchange Car ID
// ==================================================

const validateExchangeCarId = async (data, userId) => {
  // Direct purchase doesn't need exchange car
  if (data.transactionType !== 'Exchange with Bargain') {
    delete data.exchangeCarId;
    delete data.exchangeCarDetails;
    delete data.exchangeType;
    delete data.exchangeMoneyAmount;
    delete data.exchangeAdditionalAmount;

    return null;
  }

  // Exchange transaction requires exchange car
  if (!data.exchangeCarId) {
    return 'Exchange car ID is required for an exchange transaction';
  }

  // Check MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(data.exchangeCarId)) {
    return 'Invalid exchange car ID';
  }

  // Don't allow a car to exchange with itself
  if (data._id && String(data._id) === String(data.exchangeCarId)) {
    return 'A car cannot be exchanged with itself';
  }

  // Check that exchange car exists AND belongs to this same user
  const exchangeCar = await Car.findOne({ _id: data.exchangeCarId, userId })
    .select('_id company model year');

  if (!exchangeCar) {
    return 'Exchange car not found';
  }

  return null;
};

// ==================================================
// CREATE CAR
// ==================================================

export const createCar = async (req, res) => {
  try {
    console.log('📥 Request body:', req.body);
    console.log('📥 Request files:', req.files);

    const carData = req.body;

    if (!carData || Object.keys(carData).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'No data received. Please check your form submission.',
      });
    }

    // ----------------------------------------------
    // Car type validation
    // ----------------------------------------------

    const carTypeError = validateCarTypeFields(carData);

    if (carTypeError) {
      return res.status(400).json({
        success: false,
        message: carTypeError,
      });
    }

    stripInapplicableCarTypeFields(carData);

    // ----------------------------------------------
    // Exchange car validation
    // ----------------------------------------------

    const exchangeCarError =
      await validateExchangeCarId(carData, req.userId);

    if (exchangeCarError) {
      return res.status(400).json({
        success: false,
        message: exchangeCarError,
      });
    }

    // ----------------------------------------------
    // Exchange money validation
    // ----------------------------------------------

    const exchangeType = carData.exchangeType;
    const exchangeMoneyAmount =
      carData.exchangeMoneyAmount;

    if (
      exchangeType === 'Car + Money' &&
      (
        !exchangeMoneyAmount ||
        Number(exchangeMoneyAmount) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Money amount is required when exchange type is "Car + Money"',
      });
    }

    // ----------------------------------------------
    // Images
    // ----------------------------------------------

    if (req.files && req.files.length > 0) {
      carData.images = req.files.map(
        (file) => `/uploads/cars/${file.filename}`
      );
    }

    // ----------------------------------------------
    // Convert number fields
    // ----------------------------------------------

    const numberFields = [
      'year',
      'mileage',
      'engineCC',
      'purchasePrice',
      'salePrice',
      'expectedPrice',
      'exchangeAdditionalAmount',
      'exchangeMoneyAmount',
    ];

    numberFields.forEach((field) => {
      if (
        carData[field] !== undefined &&
        carData[field] !== null &&
        carData[field] !== ''
      ) {
        carData[field] = Number(carData[field]);
      }
    });

    // ----------------------------------------------
    // Create car
    // ----------------------------------------------

    // Always tie the record to the logged-in user — never trust a
    // client-supplied userId.
    carData.userId = req.userId;

    console.log(
      '📦 Processed car data:',
      carData
    );

    const car = new Car(carData);

    await car.save();

    // ----------------------------------------------
    // Populate exchange car in response
    // ----------------------------------------------

    await car.populate({
      path: 'exchangeCarId',
      select:
        'company model variant year registrationNumber localNumber color salePrice status images',
    });

    await createLog({
      userId: req.userId,
      category: 'Car',
      action: 'Created',
      title: `Car added: ${car.company} ${car.model} (${car.year})`,
      description: `Added by ${car.userName} · Status: ${car.status}`,
      refId: car._id,
      refModel: 'Car',
      amount: car.salePrice || null,
      performedBy: req.body.performedBy || 'System',
    });

    res.status(201).json({
      success: true,
      message: 'Car added successfully',
      data: car,
    });

  } catch (error) {

    console.error(
      'Error creating car:',
      error
    );

    // Duplicate
    if (error.code === 11000) {
      const field =
        Object.keys(error.keyPattern)[0];

      return res.status(400).json({
        success: false,
        message:
          `Duplicate ${field}. Please use a unique value.`,
      });
    }

    // Validation
    if (error.name === 'ValidationError') {
      const errors =
        Object.values(error.errors)
          .map((err) => err.message);

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    // Invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid car ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
};

// ==================================================
// GET ALL CARS
// ==================================================

export const getAllCars = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-dateAdded',
      status,
      company,
      model,
      fuelType,
      transmission,
      condition,
      minPrice,
      maxPrice,
      search,
    } = req.query;

    const filter = { userId: req.userId };

    if (status) filter.status = status;
    if (company) filter.company = company;

    if (model) {
      filter.model = {
        $regex: model,
        $options: 'i',
      };
    }

    if (fuelType) {
      filter.fuelType = fuelType;
    }

    if (transmission) {
      filter.transmission = transmission;
    }

    if (condition) {
      filter.condition = condition;
    }

    if (minPrice || maxPrice) {
      filter.salePrice = {};

      if (minPrice) {
        filter.salePrice.$gte = Number(minPrice);
      }

      if (maxPrice) {
        filter.salePrice.$lte = Number(maxPrice);
      }
    }

    if (search) {
      filter.$or = [
        {
          company: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          model: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          registrationNumber: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          userName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          userPhone: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          dealerName: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip =
      (pageNumber - 1) * limitNumber;

    const listFields =
      'company model variant year userName userPhone userAddress ' +
      'registrationNumber localNumber carType color condition ' +
      'engineNumber chassisNumber engineCC ' +
      'salePrice status dateAdded images dealerName dealerId ' +
      'transactionType exchangeCarId exchangeCarDetails ' +
      'exchangeType exchangeMoneyAmount exchangeAdditionalAmount';

    const [cars, totalCount] =
      await Promise.all([
        Car.find(filter)
          .select(listFields)
          .populate({
            path: 'exchangeCarId',
            select:
              'company model variant year registrationNumber localNumber color salePrice status',
          })
          .sort(sort)
          .skip(skip)
          .limit(limitNumber)
          .lean(),

        Car.countDocuments(filter),
      ]);

    res.status(200).json({
      success: true,
      data: cars,
      pagination: {
        currentPage: pageNumber,
        totalPages:
          Math.ceil(
            totalCount / limitNumber
          ),
        totalItems: totalCount,
        itemsPerPage: limitNumber,
      },
    });

  } catch (error) {

    console.error(
      'Error fetching cars:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ==================================================
// GET CAR BY ID
// ==================================================

export const getCarById = async (req, res) => {
  try {
    const { id } = req.params;

    const car = await Car.findOne({ _id: id, userId: req.userId })
      .populate({
        path: 'exchangeCarId',
        select:
          'company model variant year registrationNumber localNumber color mileage engineCC fuelType transmission condition chassisNumber engineNumber carType salePrice images status',
      });

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found',
      });
    }

    res.status(200).json({
      success: true,
      data: car,
    });

  } catch (error) {

    console.error(
      'Error fetching car:',
      error
    );

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid car ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ==================================================
// UPDATE CAR
// ==================================================

export const updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log(
      '📥 Updating car with ID:',
      id
    );

    console.log(
      '📥 Update data:',
      updateData
    );

    console.log(
      '📥 New files:',
      req.files
    );

    if (
      !updateData ||
      Object.keys(updateData).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'No update data received. Please check your form submission.',
      });
    }

    // ----------------------------------------------
    // Check current car exists
    // ----------------------------------------------

    const existingCar =
      await Car.findOne({ _id: id, userId: req.userId });

    if (!existingCar) {
      return res.status(404).json({
        success: false,
        message: 'Car not found',
      });
    }

    // ----------------------------------------------
    // Car type validation
    // ----------------------------------------------

    const carTypeError =
      validateCarTypeFields(updateData);

    if (carTypeError) {
      return res.status(400).json({
        success: false,
        message: carTypeError,
      });
    }

    stripInapplicableCarTypeFields(
      updateData
    );

    // ----------------------------------------------
    // Exchange car validation
    // ----------------------------------------------

    updateData._id = id;

    const exchangeCarError =
      await validateExchangeCarId(
        updateData,
        req.userId
      );

    if (exchangeCarError) {
      return res.status(400).json({
        success: false,
        message: exchangeCarError,
      });
    }

    delete updateData._id;

    // ----------------------------------------------
    // Exchange money validation
    // ----------------------------------------------

    if (
      updateData.exchangeType ===
        'Car + Money' &&
      (
        !updateData.exchangeMoneyAmount ||
        Number(updateData.exchangeMoneyAmount) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Money amount is required when exchange type is "Car + Money"',
      });
    }

    // ----------------------------------------------
    // Images
    // ----------------------------------------------

    const existingImagesFromBody =
      updateData.images
        ? (
            Array.isArray(updateData.images)
              ? updateData.images
              : [updateData.images]
          )
        : null;

    const newImagePaths =
      req.files &&
      req.files.length > 0
        ? req.files.map(
            (file) =>
              `/uploads/cars/${file.filename}`
          )
        : [];

    if (
      existingImagesFromBody !== null ||
      newImagePaths.length > 0
    ) {
      updateData.images = [
        ...(existingImagesFromBody || []),
        ...newImagePaths,
      ];
    } else {
      delete updateData.images;
    }

    // ----------------------------------------------
    // Number conversion
    // ----------------------------------------------

    const numberFields = [
      'year',
      'mileage',
      'engineCC',
      'purchasePrice',
      'salePrice',
      'expectedPrice',
      'exchangeAdditionalAmount',
      'exchangeMoneyAmount',
    ];

    numberFields.forEach((field) => {
      if (
        updateData[field] !== undefined &&
        updateData[field] !== null &&
        updateData[field] !== ''
      ) {
        updateData[field] =
          Number(updateData[field]);
      }
    });

    // ----------------------------------------------
    // Remove Mongo fields
    // ----------------------------------------------

    delete updateData.__v;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // ----------------------------------------------
    // Fields to unset
    // ----------------------------------------------

    const unsetFields = {};

    const unsettable = [
      'registrationCity',
      'registrationNumber',
      'localNumber',
    ];

    unsettable.forEach((field) => {
      if (!(field in updateData)) {
        unsetFields[field] = '';
      }
    });

    // ----------------------------------------------
    // Create update operations
    // ----------------------------------------------

    const updateOps = {
      $set: {
        ...updateData,
        updatedAt: Date.now(),
      },
    };

    if (
      Object.keys(unsetFields).length > 0
    ) {
      updateOps.$unset = unsetFields;
    }

    console.log(
      '📝 About to write:',
      JSON.stringify(
        updateOps,
        null,
        2
      )
    );

    // ----------------------------------------------
    // Update
    // ----------------------------------------------

    const car =
      await Car.findOneAndUpdate(
        { _id: id, userId: req.userId },
        updateOps,
        {
          new: true,
          runValidators: true,
          context: 'query',
        }
      ).populate({
        path: 'exchangeCarId',
        select:
          'company model variant year registrationNumber localNumber color salePrice status images',
      });

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found',
      });
    }

    await createLog({
      userId: req.userId,
      category: 'Car',
      action: 'Status Changed',
      title: `Car updated: ${car.company} ${car.model} (${car.year})`,
      description: `Status: ${car.status}`,
      refId: car._id,
      refModel: 'Car',
      amount: car.salePrice || null,
      performedBy: req.body?.performedBy || 'System',
    });

    res.status(200).json({
      success: true,
      message: 'Car updated successfully',
      data: car,
    });

  } catch (error) {

    console.error(
      'Error updating car:',
      error
    );

    if (error.code === 11000) {
      const field =
        Object.keys(error.keyPattern)[0];

      let fieldName = field;

      if (
        field === 'registrationNumber'
      ) {
        fieldName =
          'Registration number';
      } else if (
        field === 'chassisNumber'
      ) {
        fieldName =
          'Chassis number';
      } else if (
        field === 'engineNumber'
      ) {
        fieldName =
          'Engine number';
      }

      return res.status(400).json({
        success: false,
        message:
          `${fieldName} is already taken by another car. Please use a unique value.`,
      });
    }

    if (
      error.name === 'ValidationError'
    ) {
      const errors =
        Object.values(error.errors)
          .map((err) => err.message);

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }

    if (
      error.name === 'CastError'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid car ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
};

// ==================================================
// DELETE CAR
// ==================================================

export const deleteCar = async (req, res) => {
  try {
    const { id } = req.params;

    const car =
      await Car.findOneAndDelete({ _id: id, userId: req.userId });

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Car not found',
      });
    }

    await createLog({
      userId: req.userId,
      category: 'Car',
      action: 'Deleted',
      title: `Car removed: ${car.company} ${car.model} (${car.year})`,
      refId: car._id,
      refModel: 'Car',
      amount: car.salePrice || null,
      performedBy: req.body?.performedBy || 'System',
    });

    res.status(200).json({
      success: true,
      message: 'Car deleted successfully',
      data: car,
    });

  } catch (error) {

    console.error(
      'Error deleting car:',
      error
    );

    if (
      error.name === 'CastError'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid car ID format',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ==================================================
// CAR STATISTICS
// ==================================================

export const getCarStats = async (req, res) => {
  try {
    const ownerFilter = { userId: req.userId };

    const [
      totalCars,
      availableCars,
      soldCars,
      reservedCars,
      totalValue,
      companyStats,
    ] = await Promise.all([
      Car.countDocuments(ownerFilter),

      Car.countDocuments({
        ...ownerFilter,
        status: 'Available',
      }),

      Car.countDocuments({
        ...ownerFilter,
        status: 'Sold',
      }),

      Car.countDocuments({
        ...ownerFilter,
        status: 'Reserved',
      }),

      Car.aggregate([
        { $match: ownerFilter },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$salePrice',
            },
          },
        },
      ]),

      Car.aggregate([
        { $match: ownerFilter },
        {
          $group: {
            _id: '$company',
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
        {
          $limit: 10,
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCars,
        availableCars,
        soldCars,
        reservedCars,
        totalValue:
          totalValue[0]?.total || 0,
        topCompanies:
          companyStats,
      },
    });

  } catch (error) {

    console.error(
      'Error fetching car stats:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// ==================================================
// SEARCH CARS BY USER
// ==================================================

export const searchCarsByUser = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    const cars =
      await Car.find({
        userId: req.userId,
        $or: [
          {
            userName: {
              $regex: query,
              $options: 'i',
            },
          },
          {
            userPhone: {
              $regex: query,
              $options: 'i',
            },
          },
          {
            userCnic: {
              $regex: query,
              $options: 'i',
            },
          },
          {
            userAddress: {
              $regex: query,
              $options: 'i',
            },
          },
          {
            dealerName: {
              $regex: query,
              $options: 'i',
            },
          },
        ],
      })
      .populate({
        path: 'exchangeCarId',
        select:
          'company model variant year registrationNumber localNumber color salePrice status',
      })
      .limit(20);

    res.status(200).json({
      success: true,
      data: cars,
      count: cars.length,
    });

  } catch (error) {

    console.error(
      'Error searching cars by user:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};