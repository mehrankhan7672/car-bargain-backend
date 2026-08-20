// src/utils/logger.js
import Log from '../models/Log.js';

// FIX: centralized log writer so every controller (cars, salaries,
// employees, dealers, exchanges) can drop a single line to record an
// activity log, without duplicating try/catch boilerplate everywhere.
//
// This NEVER throws — logging must never break the main request flow.
// If writing the log fails, we just print a warning and move on.
export const createLog = async ({
  userId,
  category,
  action,
  title,
  description = '',
  refId = null,
  refModel = null,
  amount = null,
  performedBy = 'System',
  meta = {},
}) => {
  try {
    if (!userId) {
      console.error('⚠️  Skipped log entry: userId is required ("' + title + '")');
      return;
    }
    await Log.create({
      userId,
      category,
      action,
      title,
      description,
      refId,
      refModel,
      amount,
      performedBy,
      meta,
    });
  } catch (error) {
    console.error('⚠️  Failed to write log entry:', error.message);
  }
};

export default createLog;
