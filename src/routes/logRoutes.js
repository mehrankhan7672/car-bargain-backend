import express from 'express';
import { getLogs, getLogStats, deleteLog } from '../controllers/log/logController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Every log route requires a logged-in user
router.use(protect);

router.route('/stats').get(getLogStats);

router.route('/').get(getLogs);

router.route('/:id').delete(deleteLog);

export default router;
