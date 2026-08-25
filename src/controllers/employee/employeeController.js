import Employee from "../../models/Employee.js";
import { createLog } from "../../utils/logger.js";

// @desc    Get all employees
// @route   GET /api/employees
// @access  Public
export const getEmployees = async (req, res) => {
  try {
    const { search, role } = req.query;

    let query = { userId: req.userId };

    // Search filter
    if (search) {
      query.$text = { $search: search };
    }

    // Role filter
    if (role && role !== "All") {
      query.role = role;
    }

    const employees = await Employee.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message,
    });
  }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Public
export const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error fetching employee",
      error: error.message,
    });
  }
};

// @desc    Create new employee
// @route   POST /api/employees
// @access  Public
export const createEmployee = async (req, res) => {
  try {
    const { name, role, phone, joiningDate, salary } = req.body;

    // Validate required fields
    if (!name || !role || !phone || !joiningDate || !salary) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Convert salary to number
    const salaryNumber = Number(salary);
    if (isNaN(salaryNumber) || salaryNumber < 0) {
      return res.status(400).json({
        success: false,
        message: "Salary must be a positive number",
      });
    }

    const employee = await Employee.create({
      userId: req.userId,
      name,
      role,
      phone,
      joiningDate,
      salary: salaryNumber,
    });

    await createLog({
      userId: req.userId,
      category: "Employee",
      action: "Created",
      title: `Employee added: ${employee.name}`,
      description: `Role: ${employee.role} · Salary: PKR ${employee.salary}`,
      refId: employee._id,
      refModel: "Employee",
      amount: employee.salary,
      sperformedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: employee,
    });
  } catch (error) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate employee entry",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating employee",
      error: error.message,
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Public
export const updateEmployee = async (req, res) => {
  try {
    const { name, role, phone, joiningDate, salary } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (phone) updateData.phone = phone;
    if (joiningDate) updateData.joiningDate = joiningDate;
    if (salary) {
      const salaryNumber = Number(salary);
      if (isNaN(salaryNumber) || salaryNumber < 0) {
        return res.status(400).json({
          success: false,
          message: "Salary must be a positive number",
        });
      }
      updateData.salary = salaryNumber;
    }
    updateData.updatedAt = Date.now();

    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updateData,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    await createLog({
      userId: req.userId,
      category: "Employee",
      action: "Updated",
      title: `Employee updated: ${employee.name}`,
      refId: employee._id,
      refModel: "Employee",
      amount: employee.salary,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: employee,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating employee",
      error: error.message,
    });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Public
export const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    await createLog({
      userId: req.userId,
      category: "Employee",
      action: "Deleted",
      title: `Employee removed: ${employee.name}`,
      refId: employee._id,
      refModel: "Employee",
      amount: employee.salary,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
      data: {},
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error deleting employee",
      error: error.message,
    });
  }
};

// @desc    Get employee statistics
// @route   GET /api/employees/stats
// @access  Public
export const getEmployeeStats = async (req, res) => {
  try {
    const ownerFilter = { userId: req.userId };
    const totalEmployees = await Employee.countDocuments(ownerFilter);
    const roleStats = await Employee.aggregate([
      { $match: ownerFilter },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
          totalSalary: { $sum: "$salary" },
          avgSalary: { $avg: "$salary" },
        },
      },
    ]);

    const totalSalary = await Employee.aggregate([
      { $match: ownerFilter },
      {
        $group: {
          _id: null,
          total: { $sum: "$salary" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        roleStats,
        totalMonthlySalary: totalSalary.length > 0 ? totalSalary[0].total : 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching employee statistics",
      error: error.message,
    });
  }
};
