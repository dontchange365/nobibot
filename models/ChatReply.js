// models/ChatReply.js
const mongoose = require('mongoose');

const ChatReplySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['welcome_message', 'exact_match', 'pattern_matching', 'expert_pattern_matching', 'default_message'],
        required: true
    },
    keyword: {
        type: String,
        trim: true,
        sparse: true
    },
    replies: {
        type: [String],
        required: true
    },
    pattern: {
        type: String,
        trim: true
    },
    priority: {
        type: Number,
        default: 0
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

ChatReplySchema.index({ type: 1, keyword: 1 });

module.exports = mongoose.model('ChatReply', ChatReplySchema);
