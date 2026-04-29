import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import postRoutes from './postRoutes.js';
import subjectRoutes from './subjectRoutes.js';
import topicRoutes from './topicRoutes.js';
import questionRoutes from './questionRoutes.js';
import testRoutes from './testRoutes.js';
import noteRoutes from './noteRoutes.js';
import resultRoutes from './resultRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import dailyPracticeRoutes from './dailyPracticeRoutes.js';
import leaderboardRoutes from './leaderboardRoutes.js';
import savedMaterialRoutes from './savedMaterialRoutes.js';
import subscriptionPlanRoutes from './subscriptionPlanRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/subjects', subjectRoutes);
router.use('/topics', topicRoutes);
router.use('/questions', questionRoutes);
router.use('/tests', testRoutes);
router.use('/notes', noteRoutes);
router.use('/results', resultRoutes);
router.use('/payments', paymentRoutes);
router.use('/daily-practice', dailyPracticeRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/saved-materials', savedMaterialRoutes);
router.use('/subscription-plans', subscriptionPlanRoutes);

export default router;
