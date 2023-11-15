import passport from 'passport';
import httpStatus from 'http-status';
import AppError from '@tczdigital/node-utilities/errors/AppError';

/**
 * It authenticates the user using the JWT strategy
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function in the chain.
 */
export const authenticateUser = async (req, res, next) => {
    passport.authenticate('jwt', { session: false }, (error, userDtls, info) => {
        /* Checking if the userDtls is undefined, if it is undefined then it will log the error and return a 401 error. */
        if (!userDtls && !error && !info) return next(new AppError(httpStatus[httpStatus.UNAUTHORIZED], httpStatus.UNAUTHORIZED));

        if (error || info) return next(error || info);

        req.user = userDtls;
        return next();
    })(req, res, next);
};
