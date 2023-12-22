const mongoose = require('mongoose');
require("dotenv").config();

const connectToMongo = async () => {
    try {
        const db = process.env.MONGO_ATLAS_URL;
        mongoose.set('strictQuery', false);

        const mongoOutput = await mongoose.connect(db, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('Connection successful');
        return mongoOutput
    } catch (err) {
        console.error(err);
    }
}

module.exports = connectToMongo;
