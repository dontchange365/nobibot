const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Schema: Admin
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

// Schema: ChatReply
const ChatReplySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['welcome_message', 'exact_match', 'pattern_matching', 'expert_pattern_matching', 'default_message'],
        required: true
    },
    keyword: { type: String, trim: true, sparse: true },
    replies: { type: [String], required: true },
    pattern: { type: String, trim: true },
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false }
}, { timestamps: true });
ChatReplySchema.index({ type: 1, keyword: 1 });
const ChatReply = mongoose.model('ChatReply', ChatReplySchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'SuperSecureSecret!123',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGO_URI,
        ttl: 1000 * 60 * 60 * 24,
        autoRemove: 'interval',
        autoRemoveInterval: 60
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: false,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) next();
    else res.redirect('/admin/login');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Nobi Bot: I didn't understand that.";

    try {
        const exactMatch = await ChatReply.findOne({
            type: 'exact_match',
            keyword: userMessage.toLowerCase()
        }).sort({ priority: -1 });

        if (exactMatch) {
            const reply = exactMatch.replies[Math.floor(Math.random() * exactMatch.replies.length)];
            return res.json({ reply });
        }

        const patternMatches = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const entry of patternMatches) {
            const keywords = entry.keyword.toLowerCase().split(' ');
            const words = userMessage.toLowerCase().split(' ');
            if (keywords.some(k => words.includes(k))) {
                const reply = entry.replies[Math.floor(Math.random() * entry.replies.length)];
                return res.json({ reply });
            }
        }

        const expertPatterns = await ChatReply.find({ type: 'expert_pattern_matching' }).sort({ priority: -1 });
        for (const entry of expertPatterns) {
            try {
                const regex = new RegExp(entry.pattern, 'i');
                if (regex.test(userMessage)) {
                    const reply = entry.replies[Math.floor(Math.random() * entry.replies.length)];
                    return res.json({ reply });
                }
            } catch (e) {
                console.error('Regex Error:', e);
            }
        }

        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) {
            const reply = fallback.replies[Math.floor(Math.random() * fallback.replies.length)];
            return res.json({ reply });
        }

    } catch (err) {
        console.error('Chat Error:', err);
        botReply = "Bot is confused. Try again later.";
    }

    res.json({ reply: botReply });
});

// Admin Login
app.get('/admin/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/admin/dashboard');
    res.send(`
        <h2>Admin Login</h2>
        ${req.query.error ? '<p style="color:red">Invalid credentials</p>' : ''}
        <form method="POST">
            <input name="username" placeholder="Username" required /><br>
            <input type="password" name="password" placeholder="Password" required /><br>
            <button type="submit">Login</button>
        </form>
    `);
});
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await Admin.findOne({ username });
        if (!admin || !(await admin.comparePassword(password))) {
            return res.redirect('/admin/login?error=true');
        }
        req.session.loggedIn = true;
        req.session.username = admin.username;
        req.session.save(() => res.redirect('/admin/dashboard'));
    } catch (e) {
        console.error('Login error:', e);
        res.redirect('/admin/login?error=true');
    }
});

// Dashboard
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    res.send(`
        <h1>Welcome ${req.session.username}</h1>
        <a href="/admin/list-admins">Manage Admins</a><br>
        <a href="/admin/add-chat-replies">Add Chat Replies</a><br>
        <a href="/admin/logout">Logout</a>
    `);
});

// Admin List
app.get('/admin/list-admins', isAuthenticated, async (req, res) => {
    const admins = await Admin.find({}, 'username');
    const list = admins.map(a => `<li>${a.username}</li>`).join('');
    res.send(`<h3>Admins:</h3><ul>${list}</ul><a href="/admin/dashboard">Back</a>`);
});

// Chat Reply Form
app.get('/admin/add-chat-replies', isAuthenticated, (req, res) => {
    res.send(`
        <h2>Add Chat Reply</h2>
        ${req.query.success ? '<p style="color:green">Success!</p>' : ''}
        ${req.query.error ? `<p style="color:red">${req.query.error_msg || 'Error occurred.'}</p>` : ''}
        <form method="POST">
            <label>Type</label>
            <select name="type" required>
                <option value="">--select--</option>
                <option>welcome_message</option>
                <option>exact_match</option>
                <option>pattern_matching</option>
                <option>expert_pattern_matching</option>
                <option>default_message</option>
            </select><br>
            <label>Keyword:</label><input name="keyword"><br>
            <label>Pattern (regex):</label><input name="pattern"><br>
            <label>Replies:</label><textarea name="replies" required></textarea><br>
            <label>Priority:</label><input type="number" name="priority" value="0"><br>
            <small>Separate replies with '&lt;#&gt;'</small><br><br>
            <button type="submit">Submit</button>
        </form>
        <a href="/admin/dashboard">Back</a>
    `);
});
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { type, keyword, replies, pattern, priority } = req.body;

    try {
        const replyLines = replies.split('<#>').map(line => line.trim()).filter(Boolean);
        if (replyLines.length === 0) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=No valid reply lines.');
        }

        if ((type === 'exact_match' || type === 'pattern_matching') && !keyword) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Keyword required.');
        }
        if (type === 'expert_pattern_matching' && !pattern) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Pattern required.');
        }

        if (type === 'default_message') {
            await ChatReply.updateMany({ isDefault: true, type: 'default_message' }, { $set: { isDefault: false } });
        }
        if (type === 'welcome_message') {
            await ChatReply.updateMany({ type: 'welcome_message' }, { $set: { type: 'exact_match', keyword: 'welcome_msg_fallback', priority: -1 } });
        }

        const newReply = new ChatReply({
            type,
            keyword: ['exact_match', 'pattern_matching'].includes(type) ? keyword.toLowerCase() : null,
            pattern: type === 'expert_pattern_matching' ? pattern : null,
            replies: replyLines,
            priority: parseInt(priority) || 0,
            isDefault: type === 'default_message'
        });

        await newReply.save();
        res.redirect('/admin/add-chat-replies?success=true');

    } catch (err) {
        console.error('🔥 Chat Reply Save Error:', err);
        res.redirect('/admin/add-chat-replies?error=true&error_msg=' + encodeURIComponent(err.message));
    }
});

// Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});