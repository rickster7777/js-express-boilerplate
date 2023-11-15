import { Router } from 'express';

import { checkConnection } from './health.controller';

import { catchAsync } from '@tczdigital/node-utilities/errors';

const router = Router();

/* Creating a route for the health check. */
router.route('/').get(catchAsync(checkConnection));

export default router;
