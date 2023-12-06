const mongoose = require('mongoose');


const actionDetailsSchema = new mongoose.Schema({
    name: String,
    key: String,
});


const actionTypesSchema = new mongoose.Schema({
    type_name: String,
    details: [actionDetailsSchema],
});


const actionsStoredSchema = new mongoose.Schema({
    ruleId: String,
    action: {
        type: actionTypesSchema,
    },
});


const Action = mongoose.model('Action', actionsStoredSchema);

module.exports = Action;