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

// Schemas
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

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'SuperSecureSecret123',
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

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chatbot API
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Nobi Bot: I didn't understand that.";

    try {
        const exactMatch = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
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
    }

    res.json({ reply: botReply });
});

// Admin Login Page
app.get('/admin/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/admin/dashboard');
    res.send(`
    <html><head><title>Login</title>
    <style>
    body { margin:0; font-family:sans-serif; background:#eef; display:flex; align-items:center; justify-content:center; height:100vh; }
    .box { background:#fff; padding:30px; box-shadow:0 0 20px rgba(0,0,0,0.1); border-radius:8px; width:300px; }
    input { width:100%; margin:10px 0; padding:10px; border-radius:4px; border:1px solid #ccc; }
    button { width:100%; padding:10px; background:#007bff; color:#fff; border:none; border-radius:4px; cursor:pointer; }
    button:hover { background:#0056b3; }
    </style>
    </head>
    <body>
    <div class="box">
        <h2 style="text-align:center">Admin Login</h2>
        ${req.query.error ? `<p style="color:red;text-align:center">Invalid credentials</p>` : ''}
        <form method="POST">
            <input name="username" placeholder="Username" required />
            <input name="password" type="password" placeholder="Password" required />
            <button type="submit">Login</button>
        </form>
    </div></body></html>
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
    <html><head><title>Dashboard</title>
    <style>
    body { font-family: sans-serif; background:#f8f9fa; margin:0; padding:0; display:flex; justify-content:center; align-items:center; height:100vh; }
    .card { background:white; padding:40px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.1); width:400px; text-align:center; }
    a { display:block; margin:10px 0; padding:10px; background:#007bff; color:white; text-decoration:none; border-radius:5px; }
    a:hover { background:#0056b3; }
    </style>
    </head><body>
    <div class="card">
        <h2>Welcome, ${req.session.username}</h2>
        <a href="/admin/add-chat-replies">➕ Add Chat Replies</a>
        <a href="/admin/logout" style="background:#dc3545;">🚪 Logout</a>
    </div>
    </body></html>
    `);
});

// Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// Add Chat Replies Form (GET)
app.get('/admin/add-chat-replies', isAuthenticated, (req, res) => {
    res.send(`
    <html><head><title>Add Chat Replies</title>
    <style>
    body { background:#f2f2f2; font-family:sans-serif; margin:0; padding:40px; }
    .form-container { max-width:600px; background:#fff; margin:auto; padding:30px; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.1); }
    input, select, textarea, button { width:100%; margin-bottom:15px; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:16px; }
    button { background:#28a745; color:#fff; border:none; cursor:pointer; }
    button:hover { background:#218838; }
    .back { background:#007bff; text-align:center; display:inline-block; padding:10px 20px; border-radius:5px; color:#fff; text-decoration:none; }
    </style>
    </head><body>
    <div class="form-container">
        <h2>Add New Chat Reply</h2>
        ${req.query.success ? '<p style="color:green">✅ Reply Added Successfully!</p>' : ''}
        ${req.query.error ? `<p style="color:red">❌ ${req.query.error_msg || 'Something went wrong.'}</p>` : ''}
        <form method="POST">
            <select name="type" required>
                <option value="">Select Type</option>
                <option>welcome_message</option>
                <option>exact_match</option>
                <option>pattern_matching</option>
                <option>expert_pattern_matching</option>
                <option>default_message</option>
            </select>
            <input name="keyword" placeholder="Keyword (optional)" />
            <input name="pattern" placeholder="Pattern (Regex) (optional)" />
            <textarea name="replies" placeholder="Reply lines (use <#> to separate)" required></textarea>
            <input type="number" name="priority" placeholder="Priority" value="0" />
            <button type="submit">Save Reply</button>
        </form>
        <a href="/admin/dashboard" class="back">← Back to Dashboard</a>
    </div></body></html>
    `);
});

// Add Chat Replies Form (POST)
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { type, keyword, replies, pattern, priority } = req.body;

    try {
        const replyLines = replies.split('<#>').map(line => line.trim()).filter(Boolean);
        if (!type || replyLines.length === 0) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Missing required fields.');
        }

        if ((type === 'exact_match' || type === 'pattern_matching') && !keyword) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Keyword is required.');
        }

        if (type === 'expert_pattern_matching' && !pattern) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Pattern is required.');
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
        res.redirect(`/admin/add-chat-replies?error=true&error_msg=${encodeURIComponent(err.message)}`);
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});