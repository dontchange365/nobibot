
// ================== SERVER.JS FILE ===================
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

// ===== Models =====
const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
AdminSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});
AdminSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};
const Admin = mongoose.model('Admin', AdminSchema);

const ChatReplySchema = new mongoose.Schema({
    ruleName: { type: String, required: true },
    type: { type: String, required: true },
    keyword: String,
    pattern: String,
    replies: [String],
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    sendMethod: { type: String, enum: ['random', 'all', 'once'], default: 'random' }
});
const ChatReply = mongoose.model('ChatReply', ChatReplySchema);

const CustomReplacementSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    values: [{ type: String }]
});
const CustomReplacement = mongoose.model('CustomReplacement', CustomReplacementSchema);

// ===== Middleware =====
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(session({
    secret: 'MySuperStrongSecretKey!',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) return next();
    return res.redirect('/admin/login');
}

// ===== Helper for Replacements =====
const applyCustomReplacements = async (text) => {
    if (!text) return '';
    const now = new Date();
    const builtIns = {
        month: now.toLocaleString('default', { month: 'long' }),
        'month(short)': now.toLocaleString('default', { month: 'short' }),
        year: now.getFullYear(),
        'year(short)': now.getFullYear().toString().slice(-2),
        dayofmonth: now.getDate(),
        dayofweek: now.toLocaleString('default', { weekday: 'long' }),
        'dayofweek(short)': now.toLocaleString('default', { weekday: 'short' }),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
        ampm: now.getHours() >= 12 ? 'PM' : 'AM',
    };
    Object.entries(builtIns).forEach(([key, val]) => {
        text = text.replaceAll(`%${key}%`, val);
    });
    const customs = await CustomReplacement.find();
    customs.forEach(item => {
        const regex = new RegExp(`%${item.key}%`, 'g');
        if (text.match(regex)) {
            const random = item.values[Math.floor(Math.random() * item.values.length)];
            text = text.replace(regex, random);
        }
    });
    return text;
};

const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

function handleReplySend(replyObj) {
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";
    switch (replyObj.sendMethod) {
        case 'once': return replyObj.replies[0];
        case 'all': return replyObj.replies.join('\n');
        case 'random':
        default: return randomReply(replyObj.replies);
    }
}

// ===== Routes =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: await applyCustomReplacements(randomReply(welcomeReply.replies)) });
            }
        } catch (e) {
            console.error("Welcome message error:", e);
        }
    }

    try {
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) return res.json({ reply: await applyCustomReplacements(handleReplySend(exact)) });

        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: await applyCustomReplacements(randomReply(reply.replies)) });
            }
        }

        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                if (new RegExp(reply.pattern, 'i').test(userMessage)) {
                    return res.json({ reply: await applyCustomReplacements(randomReply(reply.replies)) });
                }
            } catch (e) { }
        }

        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: await applyCustomReplacements(randomReply(fallback.replies)) });

    } catch (e) {
        console.error(e);
        botReply = "Nobi Bot error: try again later.";
    }

    res.json({ reply: botReply });
});

app.post('/api/update-priorities', async (req, res) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ message: 'Invalid data' });
    try {
        for (const item of updates) {
            await ChatReply.findByIdAndUpdate(item.id, { priority: item.priority });
        }
        res.json({ message: 'Priorities updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ===== Server Start =====
app.listen(PORT, () => {
    console.log(`NOBITA Bot Server Running @ http://localhost:${PORT}`);
});