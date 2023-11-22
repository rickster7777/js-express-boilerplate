const mongoose = require('mongoose');
//require('dotenv').config();

const db = 'mongodb+srv://rickster:eusjwRx9US1IFGe6@cluster0.7otfiqs.mongodb.net/Hector?retryWrites=true&w=majority';

mongoose.set('strictQuery', false);

const mongoConnection = mongoose
    .connect(db, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log('Connection successful');
    })
    .catch((err) => {
        console.log(err);
    });

module.exports = mongoConnection;
