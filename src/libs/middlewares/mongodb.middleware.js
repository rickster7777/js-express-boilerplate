import mongoose from 'mongoose';
import httpStatus from 'http-status';

/**
 * If the environment variable MONGODB_CONNECTION_CHECK is set to true, then the function will return
 * the next() function. If the environment variable is not set to true, then the function will check if
 * the mongoose connection is ready. If the connection is not ready, then the function will return a
 * response with a message and a status code of 500. If the connection is ready, then the function will
 * return the next() function
 * @param req - The request object
 * @param res - The response object.
 * @param next - The next middleware function in the stack.
 * @returns A function that takes in 3 parameters.
 */
export const mongoConnectionCheck = async (req, res, next) => {
    // eslint-disable-next-line no-extra-boolean-cast
    if (!!process.env.MONGODB_CONNECTION_CHECK) return next();

    if (!mongoose.connection.readyState) return res.create(httpStatus.INTERNAL_SERVER_ERROR, 'We\'ll be back up soon! Please try again after some time.');
    return next();
};
