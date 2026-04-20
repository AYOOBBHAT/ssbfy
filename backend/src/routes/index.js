import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import postRoutes from './postRoutes.js';
import subjectRoutes from './subjectRoutes.js';
import topicRoutes from './topicRoutes.js';
import questionRoutes from './questionRoutes.js';
import testRoutes from './testRoutes.js';
import resultRoutes from './resultRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import dailyPracticeRoutes from './dailyPracticeRoutes.js';
import leaderboardRoutes from './leaderboardRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/subjects', subjectRoutes);
router.use('/topics', topicRoutes);
router.use('/questions', questionRoutes);
router.use('/tests', testRoutes);
router.use('/results', resultRoutes);
router.use('/payments', paymentRoutes);
router.use('/daily-practice', dailyPracticeRoutes);
router.use('/leaderboard', leaderboardRoutes);

export default router;
