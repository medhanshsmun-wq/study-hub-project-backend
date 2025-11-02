const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema({
    title: String,
    points: [String],
    isUserNote: { type: Boolean, default: true },
    semKey: String,
    subjectKey: String,
    topicKey: String, // The main topic, e.g., "Unit 1"
    subTopicKey: String, // The specific sub-topic, e.g., "Hardness of Water"
    _user: { type: Schema.Types.ObjectId, ref: 'users' } // Link to the user who created it
});

mongoose.model('notes', noteSchema);