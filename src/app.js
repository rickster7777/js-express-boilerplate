import 'core-js/stable';
import 'regenerator-runtime/runtime';

import logger from '@tczdigital/node-utilities/logger';
import app from './configs/express.config';

/* This is a catch-all for any uncaught exceptions. */
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception  💥  : ${err}`);
    process.exit(1);
});

/* This is a catch-all for any unhandled rejections. */
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection  💥  at ${promise}, reason: ${reason}`);
    process.exit(1);
});

/* This is a callback function that is called when the server is started. */
app.listen(process.env.PORT, () => {
    logger.info(`Server Started on Port : ${process.env.PORT} 💚`);
});

export default app;
