import mongoose from 'mongoose';
import httpStatus from 'http-status';

/**
 * It checks if the database is connected and returns a response
 * @param req - The request object.
 * @param res - The response object.
 * @returns - The function is returning a response object with the following properties:
 *         - status: 200
 *         - message: 'Working Fine'
 *         - data: { db: !!mongoose.connection.readyState }
 *     - The !!mongoose.connection.readyState is a boolean value that is being returned.
 *     - The !! is a double neg
 */
export const checkConnection = async (req, res) => {
    return res.create(httpStatus.OK, 'Working Fine', { db: !!mongoose.connection.readyState });
};
