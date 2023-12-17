// Create a module to export the documents
module.exports = async function fetchDocuments() {
    const Rule = require('./model');
    const mongoose = require('mongoose');

    // Connect to the database
    await mongoose.connect('mongodb+srv://rickster:eusjwRx9US1IFGe6@cluster0.7otfiqs.mongodb.net/Hector?retryWrites=true&w=majority', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    try {
      // Fetch documents from the Rule model
      const documents = await Rule.find({});
      console.log('Documents type:', documents.length);

      // Close the connection after fetching documents
      // await mongoose.connection.close();

      // Return the fetched documents
      return documents;
    } catch (err) {
      console.error('Error fetching documents:', err);
      await mongoose.connection.close();
      throw err; 
    }
  };
