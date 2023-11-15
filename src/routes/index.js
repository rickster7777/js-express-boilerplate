import express from 'express';

import healthRoutes from '../modules/health/health.routes';
import userRoutes from '../modules/user/user.routes';

/* Creating a new router object. */
const router = express.Router();

/* Telling the router to use the healthRoutes object when the url is /health-check. */
router.use('/health-check', healthRoutes);

/* Telling the router to use the userRoutes object when the url is /user. */
router.use('/user', userRoutes);

export default router;
