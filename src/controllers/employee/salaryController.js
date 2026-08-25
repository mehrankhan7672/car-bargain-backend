// src/backend/controllers/salaryController.js
import Salary from "../../models/employeeSalary.js";
import Employee from "../../models/Employee.js";
import mongoose from "mongoose";
import { createLog } from "../../utils/logger.js";

// @desc    Get all salary payments
// @route   GET /api/salaries
// @access  Public
export const getSalaries = async (req, res) => {
  try {
    const {
      employeeId,
      month,
      startDate,
      endDate,
      method,
      status,
      paymentType,
    } = req.query;

    let query = { userId: req.userId };

    if (employeeId) query.employeeId = employeeId;
    if (month) query.month = month;
    if (method) query.method = method;
    if (status) query.status = status;
    if (paymentType) query.paymentType = paymentType;

    if (startDate || endDate) {
      query.paidDate = {};
      if (startDate) query.paidDate.$gte = new Date(startDate);
      if (endDate) query.paidDate.$lte = new Date(endDate);
    }

    const salaries = await Salary.find(query)
      .sort({ paidDate: -1 })
      .populate("employeeId", "name role phone salary");

    res.status(200).json({
      success: true,
      count: salaries.length,
      data: salaries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching salaries",
      error: error.message,
    });
  }
};

// @desc    Get single salary payment
// @route   GET /api/salaries/:id
// @access  Public
export const getSalary = async (req, res) => {
  try {
    const salary = await Salary.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).populate("employeeId", "name role phone salary");

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }

    res.status(200).json({
      success: true,
      data: salary,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error fetching salary",
      error: error.message,
    });
  }
};

// @desc    Create new salary payment
// @route   POST /api/salaries
// @access  Public
export const createSalary = async (req, res) => {
  try {
    const {
      employeeId,
      payment,
      month,
      paidDate,
      method,
      paymentType,
      notes,
      isPartial,
      isAdvance,
    } = req.body;

    // Validate required fields
    if (
      !employeeId ||
      payment === undefined ||
      !month ||
      !paidDate ||
      !method
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: employeeId, payment, month, paidDate, method",
      });
    }

    const employee = await Employee.findOne({
      _id: employeeId,
      userId: req.userId,
    });
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const fullSalary = employee.salary;
    const paymentAmount = Number(payment);
    let dueSalary = 0;
    let finalStatus = "Paid";
    let finalPaymentType = paymentType || "Full Salary";

    // --- Handle Deduction ---
    if (finalPaymentType === "Deduction") {
      // Ensure payment is negative
      if (paymentAmount >= 0) {
        return res.status(400).json({
          success: false,
          message: "Deduction amount must be negative",
        });
      }

      // Get all previous payments for this month (exclude other deductions)
      const previousPayments = await Salary.find({
        employeeId,
        userId: req.userId,
        month,
        status: { $in: ["Paid", "Partially Paid"] },
        paymentType: { $ne: "Deduction" },
      });

      const totalPaidSoFar = previousPayments.reduce(
        (sum, p) => sum + p.payment,
        0,
      );
      const newTotalPaid = totalPaidSoFar + paymentAmount; // paymentAmount is negative

      // Prevent deduction larger than total paid
      if (newTotalPaid < 0) {
        return res.status(400).json({
          success: false,
          message: `Deduction cannot exceed total paid (${formatPKR(totalPaidSoFar)})`,
        });
      }

      dueSalary = fullSalary - newTotalPaid;
      if (dueSalary < 0) dueSalary = 0;

      // If dueSalary > 0, status becomes Partially Paid
      finalStatus = dueSalary > 0 ? "Partially Paid" : "Paid";

      // Create deduction record
      const salary = await Salary.create({
        userId: req.userId,
        employeeId,
        employeeName: employee.name,
        payment: paymentAmount,
        fullSalary,
        dueSalary,
        month,
        paidDate: new Date(paidDate),
        method,
        paymentType: "Deduction",
        status: finalStatus,
        notes: notes || `Deduction from overpaid amount`,
      });

      // Update any previous overpaid records? Not necessary.

      return res.status(201).json({
        success: true,
        message: `Deduction applied. Due salary: ${dueSalary}`,
        data: salary,
        dueSalary,
      });
    }

    // --- Normal Payment (Positive) ---
    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be positive for non-deduction types",
      });
    }

    // FIX: amount is only capped against the fixed salary for "Full Salary"
    // and "Partial Salary" — Advance, Bonus and Commission are free amounts
    // the business decides on, unrelated to the fixed monthly figure.
    const isSalaryCappedType =
      finalPaymentType === "Full Salary" ||
      finalPaymentType === "Partial Salary";
    if (isSalaryCappedType && paymentAmount > fullSalary) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed salary (${formatPKR(fullSalary)})`,
      });
    }

    // FIX: only "Partial Salary" payments track/merge against a previous
    // partial record — Advance no longer gets accidentally glued onto it.
    let existingPartial = null;
    if (finalPaymentType === "Partial Salary" && paymentAmount < fullSalary) {
      existingPartial = await Salary.findOne({
        employeeId,
        userId: req.userId,
        month,
        paymentType: "Partial Salary",
        status: { $in: ["Paid", "Partially Paid"] },
      });
    }

    if (existingPartial) {
      // Update existing partial payment
      const totalPaid = existingPartial.payment + paymentAmount;
      if (totalPaid >= fullSalary) {
        dueSalary = 0;
        finalStatus = "Paid";
      } else {
        dueSalary = fullSalary - totalPaid;
        finalStatus = "Partially Paid";
      }

      await Salary.findOneAndUpdate(
        { _id: existingPartial.id, userId: req.userId },
        {
          payment: totalPaid,
          dueSalary,
          status: finalStatus,
          notes:
            notes ||
            existingPartial.notes + `\nAdditional payment: ${paymentAmount}`,
        },
      );

      const newSalary = await Salary.create({
        userId: req.userId,
        employeeId,
        employeeName: employee.name,
        payment: paymentAmount,
        fullSalary,
        dueSalary,
        month,
        paidDate: new Date(paidDate),
        method,
        paymentType: "Partial Salary",
        status: finalStatus,
        notes: notes || `Additional partial payment. Total paid: ${totalPaid}`,
        referenceId: existingPartial.id,
      });

      return res.status(201).json({
        success: true,
        message: `Partial salary added. Due: ${dueSalary}`,
        data: newSalary,
        dueSalary,
      });
    }

    // First partial payment or full payment
    if (paymentAmount < fullSalary && finalPaymentType === "Full Salary") {
      finalPaymentType = "Partial Salary";
      dueSalary = fullSalary - paymentAmount;
      finalStatus = dueSalary > 0 ? "Partially Paid" : "Paid";
    } else {
      dueSalary = 0;
      finalStatus = "Paid";
    }

    const salary = await Salary.create({
      userId: req.userId,
      employeeId,
      employeeName: employee.name,
      payment: paymentAmount,
      fullSalary,
      dueSalary,
      month,
      paidDate: new Date(paidDate),
      method,
      paymentType: finalPaymentType,
      status: finalStatus,
      notes: notes || "",
    });

    await createLog({
      userId: req.userId,
      category: "Salary",
      action: "Created",
      title: `Salary paid: ${employee.name}`,
      description: `${finalPaymentType} · ${month} · Status: ${finalStatus}`,
      refId: salary._id,
      refModel: "Salary",
      amount: paymentAmount,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Salary paid successfully",
      data: salary,
      dueSalary,
    });
  } catch (error) {
    console.error("Error creating salary:", error);
    res.status(500).json({
      success: false,
      message: "Error creating salary payment",
      error: error.message,
    });
  }
};
// @desc    Update salary payment
// @route   PUT /api/salaries/:id
// @access  Public
export const updateSalary = async (req, res) => {
  try {
    const { payment, month, paidDate, method, status, notes, paymentType } =
      req.body;

    const salary = await Salary.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }

    const updateData = {};

    // Update payment amount
    if (payment) {
      const newPayment = Number(payment);
      updateData.payment = newPayment;

      // Recalculate due salary
      const employee = await Employee.findOne({
        _id: salary.employeeId,
        userId: req.userId,
      });
      if (employee) {
        // Get all payments for this employee and month (excluding current)
        const otherPayments = await Salary.find({
          employeeId: salary.employeeId,
          userId: req.userId,
          month: salary.month,
          _id: { $ne: salary.id },
          status: "Paid",
        });

        const totalOtherPayments = otherPayments.reduce(
          (sum, p) => sum + p.payment,
          0,
        );
        const totalPaid = totalOtherPayments + newPayment;

        if (totalPaid >= employee.salary) {
          updateData.dueSalary = 0;
          updateData.status = "Paid";
        } else {
          updateData.dueSalary = employee.salary - totalPaid;
          updateData.status = "Partially Paid";
        }
      }
    }

    if (month) updateData.month = month;
    if (paidDate) updateData.paidDate = new Date(paidDate);
    if (method) updateData.method = method;
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (paymentType) updateData.paymentType = paymentType;
    updateData.updatedAt = Date.now();

    const updatedSalary = await Salary.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updateData,
      {
        new: true,
        runValidators: true,
      },
    ).populate("employeeId", "name role phone");

    await createLog({
      userId: req.userId,
      category: "Salary",
      action: "Updated",
      title: `Salary record updated: ${updatedSalary.employeeName}`,
      description: `${updatedSalary.paymentType} · ${updatedSalary.month} · Status: ${updatedSalary.status}`,
      refId: updatedSalary._id,
      refModel: "Salary",
      amount: updatedSalary.payment,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Salary payment updated successfully",
      data: updatedSalary,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error updating salary payment",
      error: error.message,
    });
  }
};

// @desc    Delete salary payment
// @route   DELETE /api/salaries/:id
// @access  Public
export const deleteSalary = async (req, res) => {
  try {
    const salary = await Salary.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }

    // If it's a partial payment, also delete linked records
    if (
      salary.paymentType === "Partial Salary" ||
      salary.paymentType === "Partially Paid"
    ) {
      await Salary.deleteMany({ referenceId: salary.id, userId: req.userId });
    }

    await Salary.findOneAndDelete({ _id: req.params.id, userId: req.userId });

    await createLog({
      userId: req.userId,
      category: "Salary",
      action: "Deleted",
      title: `Salary record removed: ${salary.employeeName}`,
      description: `${salary.paymentType} · ${salary.month}`,
      refId: salary._id,
      refModel: "Salary",
      amount: salary.payment,
      performedBy: req.user.name,
      performedByUserId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Salary payment deleted successfully",
      data: {},
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Salary payment not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error deleting salary payment",
      error: error.message,
    });
  }
};

// @desc    Get salary statistics
// @route   GET /api/salaries/stats
// @access  Public
export const getSalaryStats = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;

    const matchQuery = { status: "Paid", userId: req.userId };
    if (employeeId) {
      matchQuery.employeeId = new mongoose.Types.ObjectId(employeeId);
    }
    if (month) {
      matchQuery.month = { $regex: month, $options: "i" };
    }
    if (year) {
      matchQuery.month = { $regex: year, $options: "i" };
    }

    const stats = await Salary.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$employeeId",
          totalPaid: { $sum: "$payment" },
          totalFullSalary: { $sum: "$fullSalary" },
          totalDueSalary: { $sum: "$dueSalary" },
          count: { $sum: 1 },
          avgPayment: { $avg: "$payment" },
          byPaymentType: {
            $push: {
              paymentType: "$paymentType",
              payment: "$payment",
              fullSalary: "$fullSalary",
              dueSalary: "$dueSalary",
              month: "$month",
            },
          },
        },
      },
      {
        $lookup: {
          from: "employees",
          localField: "_id",
          foreignField: "_id",
          as: "employee",
        },
      },
      {
        $unwind: {
          path: "$employee",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          employeeId: "$_id",
          employeeName: "$employee.name",
          employeeRole: "$employee.role",
          employeeSalary: "$employee.salary",
          totalPaid: 1,
          totalFullSalary: 1,
          totalDueSalary: 1,
          count: 1,
          avgPayment: 1,
          byPaymentType: { $slice: ["$byPaymentType", 10] },
        },
      },
      { $sort: { totalPaid: -1 } },
    ]);

    // Get total salary paid
    const totalPaid = await Salary.aggregate([
      { $match: { status: "Paid", userId: req.userId } },
      { $group: { _id: null, total: { $sum: "$payment" } } },
    ]);

    // Get total full salary
    const totalFullSalary = await Salary.aggregate([
      { $match: { status: "Paid", userId: req.userId } },
      { $group: { _id: null, total: { $sum: "$fullSalary" } } },
    ]);

    // Get total due salary
    const totalDueSalary = await Salary.aggregate([
      {
        $match: {
          status: { $in: ["Paid", "Partially Paid"] },
          userId: req.userId,
        },
      },
      { $group: { _id: null, total: { $sum: "$dueSalary" } } },
    ]);

    // Get monthly summary
    const monthlySummary = await Salary.aggregate([
      { $match: { status: "Paid", userId: req.userId } },
      {
        $group: {
          _id: "$month",
          totalPayment: { $sum: "$payment" },
          totalFullSalary: { $sum: "$fullSalary" },
          totalDueSalary: { $sum: "$dueSalary" },
          count: { $sum: 1 },
          fullSalary: {
            $sum: {
              $cond: [{ $eq: ["$paymentType", "Full Salary"] }, "$payment", 0],
            },
          },
          partialSalary: {
            $sum: {
              $cond: [
                { $in: ["$paymentType", ["Partial Salary", "Partially Paid"]] },
                "$payment",
                0,
              ],
            },
          },
          advance: {
            $sum: {
              $cond: [{ $eq: ["$paymentType", "Advance"] }, "$payment", 0],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats,
        totalPaid: totalPaid.length > 0 ? totalPaid[0].total : 0,
        totalFullSalary:
          totalFullSalary.length > 0 ? totalFullSalary[0].total : 0,
        totalDueSalary: totalDueSalary.length > 0 ? totalDueSalary[0].total : 0,
        monthlySummary,
      },
    });
  } catch (error) {
    console.error("Error fetching salary stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching salary statistics",
      error: error.message,
    });
  }
};

// @desc    Get employee's balance
// @route   GET /api/salaries/balance/:employeeId
// @access  Public
export const getEmployeeBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month } = req.query;

    const employee = await Employee.findOne({
      _id: employeeId,
      userId: req.userId,
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const currentMonth =
      month ||
      new Date().toLocaleString("default", { month: "long", year: "numeric" });

    // Get all payments for this employee in the current month (including deductions)
    const payments = await Salary.find({
      employeeId: employeeId,
      userId: req.userId,
      month: currentMonth,
      status: { $in: ["Paid", "Partially Paid"] },
    }).sort({ paidDate: 1 });

    let totalPaid = 0;
    payments.forEach((p) => {
      totalPaid += p.payment; // this includes negative deductions
    });

    // Due salary = salary - totalPaid (if totalPaid may be negative due to deduction, due increases)
    let dueSalary = employee.salary - totalPaid;
    let overpaid = 0;
    if (dueSalary < 0) {
      overpaid = Math.abs(dueSalary);
      dueSalary = 0;
    }

    const isFullPaid = dueSalary === 0 && overpaid === 0;

    res.status(200).json({
      success: true,
      data: {
        employeeName: employee.name,
        employeeId: employee.id,
        monthlySalary: employee.salary,
        totalPaid: totalPaid,
        dueSalary: dueSalary,
        overpaid: overpaid,
        isFullPaid: isFullPaid,
        paymentCount: payments.length,
        month: currentMonth,
        payments: payments.map((p) => ({
          id: p.id,
          payment: p.payment,
          fullSalary: p.fullSalary,
          dueSalary: p.dueSalary,
          paymentType: p.paymentType,
          paidDate: p.paidDate,
          status: p.status,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching employee balance:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employee balance",
      error: error.message,
    });
  }
};

// @desc    Get employee salary history
// @route   GET /api/salaries/employee/:employeeId
// @access  Public
export const getEmployeeSalaryHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { limit = 10, startDate, endDate } = req.query;

    const employee = await Employee.findOne({
      _id: employeeId,
      userId: req.userId,
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const query = { employeeId, userId: req.userId };
    if (startDate || endDate) {
      query.paidDate = {};
      if (startDate) query.paidDate.$gte = new Date(startDate);
      if (endDate) query.paidDate.$lte = new Date(endDate);
    }

    const salaries = await Salary.find(query)
      .sort({ paidDate: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: salaries.length,
      data: salaries,
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
      message: "Error fetching salary history",
      error: error.message,
    });
  }
};
