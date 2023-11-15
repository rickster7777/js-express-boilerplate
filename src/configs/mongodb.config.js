import mongoose from 'mongoose';
import connectToDatabase from '@tczdigital/node-utilities/database/mongodb';
import logger from '@tczdigital/node-utilities/logger';

const connectionURI = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.atytxe2.mongodb.net/DANDYSNEEZE?retryWrites=true&w=majority`;

const config = {
    autoIndex: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
};

connectToDatabase(mongoose, connectionURI, config).catch((error) => {
    logger.error(`Error connecting to MongoDB: ${error}`);
});
