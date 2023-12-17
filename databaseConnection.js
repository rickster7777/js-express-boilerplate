const mongoose = require('mongoose');

const connectToMongo = async () => {
    try {
        const db = 'mongodb+srv://rickster:eusjwRx9US1IFGe6@cluster0.7otfiqs.mongodb.net/Hector?retryWrites=true&w=majority';
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
