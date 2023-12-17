const mongoose = require('mongoose');

const actionCampMapSchema = new mongoose.Schema({
    campaign_id: {
        type: String,
        unique: true
    },
    action_name: {
        type: String
    },
    campaign_budget: {
        type: String
    },
    isExecuted: {
        type: String
    }

});


const ActionCampMapping = mongoose.model('ActionCampMapping', actionCampMapSchema);

module.exports = ActionCampMapping;