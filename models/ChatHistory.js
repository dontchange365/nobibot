const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  from: { type: String, enum: ['user', 'bot'], required: true },
  text: { type: String, required: true },
  time: { type: Date, default: Date.now }
});

const ChatHistorySchema = new mongoose.Schema({
  user: { type: String, required: true, unique: true },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatHistory', ChatHistorySchema);