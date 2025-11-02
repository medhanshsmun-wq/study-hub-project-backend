const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    // Content is only required if there is no file attached.
    required: function() {
      return !this.file || !this.file.name;
    }
  },
  file: {
    type: Object,
    of: {
      name: String,
      url: String,
      type: String,
    }
  },
}, { timestamps: true });

const chatSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  title: { type: String, required: true },
  messages: [messageSchema]
}, { timestamps: true }); // Adds createdAt and updatedAt

module.exports = mongoose.model('Chat', chatSchema);