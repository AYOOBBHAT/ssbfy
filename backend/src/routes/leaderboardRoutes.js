import { Router } from 'express';
import { leaderboardController } from '../controllers/leaderboardController.js';

const router = Router();

router.get('/', leaderboardController.list);

export default router;
