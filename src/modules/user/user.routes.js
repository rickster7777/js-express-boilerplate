import { Router } from 'express';

import { registerUser } from './user.controller';
import { updateEmail } from './user.middleware';

import { catchAsync } from '@tczdigital/node-utilities/errors';
import paramValidator from '@tczdigital/node-utilities/validator';

import { createUser } from './user.validations';

const router = Router();

/* Creating a route for the register endpoint. */
router.route('/register').post(paramValidator(createUser), catchAsync(updateEmail), catchAsync(registerUser));

export default router;
