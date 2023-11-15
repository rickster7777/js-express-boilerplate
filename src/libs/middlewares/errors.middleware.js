import httpStatus from 'http-status';

/**
 * It sends an error response to the client
 * @param err - The error object that was thrown.
 * @param req - The request object.
 * @param res - The response object.
 * @returns a response object.
 */
export const sendErrorResponse = (err, req, res) => {
    /* Handle errors that are not programming errors. */
    if (err.isOperational) {
        return res.create(err.statusCode, err.message);
    }

    return res.create(err.statusCode, err.message, process.env.NODE_ENV === 'development' ? err : {});
};

/**
 * It returns a response with a message that says "Can't find {requested url} on this server!" and a
 * status code of 404
 * @param req - The request object
 * @param res - The response object
 * @returns A function that takes in a request and response object and returns a response object.
 */
export const apiNotFoundError = (req, res) => {
    return res.create(httpStatus.NOT_FOUND, `Can't find ${req.originalUrl} on this server!`);
};
