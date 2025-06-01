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

// Admin Schema
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

// Chat Reply Schema
const ChatReplySchema = new mongoose.Schema({
    type: { type: String, required: true },
    keyword: String,
    pattern: String,
    replies: [String],
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false }
});
const ChatReply = mongoose.model('ChatReply', ChatReplySchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'MySuperStrongSecretKey!',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) return next();
    return res.redirect('/admin/login');
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// CHATBOT API
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";

    try {
        // 1. Exact Match
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) return res.json({ reply: randomReply(exact.replies) });

        // 2. Pattern Matching (comma keywords)
        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: randomReply(reply.replies) });
            }
        }

        // 3. Expert Regex
        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                if (new RegExp(reply.pattern, 'i').test(userMessage)) {
                    return res.json({ reply: randomReply(reply.replies) });
                }
            } catch (e) { }
        }

        // 4. Default
        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: randomReply(fallback.replies) });

    } catch (e) {
        console.error(e);
        botReply = "Nobi Bot error: try again later.";
    }

    res.json({ reply: botReply });
});
const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ADMIN LOGIN
app.get('/admin/login', (req, res) => {
    res.send(`
    <form method="POST" action="/admin/login">
    <h2>Login</h2>
    <input name="username" placeholder="Username" required />
    <input type="password" name="password" placeholder="Password" required />
    <button>Login</button>
    </form>`);
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
        return res.send('Login failed. <a href="/admin/login">Try again</a>');
    }
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/admin/dashboard');
});

// ADMIN DASHBOARD
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    res.send(`<h1>Welcome Admin: ${req.session.username}</h1>
    <a href="/admin/add-chat-replies">Add Chat Reply</a> |
    <a href="/admin/reply-list">View Replies</a> |
    <a href="/admin/logout">Logout</a>`);
});

// LOGOUT
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// ADD REPLY FORM
app.get('/admin/add-chat-replies', isAuthenticated, (req, res) => {
    res.send(`
    <form method="POST" action="/admin/add-chat-replies">
    <h2>Add Chat Reply</h2>
    <label>Type</label>
    <select name="type" required>
        <option>exact_match</option>
        <option>pattern_matching</option>
        <option>expert_pattern_matching</option>
        <option>welcome_message</option>
        <option>default_message</option>
    </select>
    <label>Keyword(s) (comma separated)</label>
    <input name="keyword" placeholder="e.g. hi, hello" />
    <label>Regex Pattern</label>
    <input name="pattern" placeholder="Only for expert_pattern_matching" />
    <label>Replies (use <#> between lines)</label>
    <textarea name="replies"></textarea>
    <label>Priority</label>
    <input type="number" name="priority" value="0" />
    <label>Is Default?</label>
    <select name="isDefault"><option value="false">No</option><option value="true">Yes</option></select>
    <button>Add</button></form>`);
});

app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { type, keyword, pattern, replies, priority, isDefault } = req.body;
    if (!replies) return res.send('Replies required');

    if (type === 'default_message' && isDefault === 'true') {
        await ChatReply.updateMany({ type: 'default_message' }, { isDefault: false });
    }

    const newReply = new ChatReply({
        type,
        keyword: keyword || '',
        pattern: pattern || '',
        replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
        priority: parseInt(priority),
        isDefault: isDefault === 'true'
    });

    await newReply.save();
    res.redirect('/admin/reply-list');
});

// REPLY LIST
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    const replies = await ChatReply.find().sort({ priority: -1 });
    const list = replies.map(r => `
    <tr>
    <td>${r.type}</td>
    <td>${r.keyword}</td>
    <td>${r.priority}</td>
    <td>${r.replies.slice(0, 2).join(' | ')}${r.replies.length > 2 ? '...' : ''}</td>
    <td>${r.isDefault ? '✅' : ''}</td>
    <td>
        <a href="/admin/edit-reply/${r._id}">✏️</a>
        <a href="/admin/delete-reply/${r._id}" onclick="return confirm('Delete?')">🗑️</a>
    </td></tr>`).join('');
    res.send(`<table border="1"><tr>
    <th>Type</th><th>Keywords</th><th>Priority</th><th>Replies</th><th>Default</th><th>Actions</th>
    </tr>${list}</table><br><a href="/admin/dashboard">← Back</a>`);
});

// EDIT REPLY
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const r = await ChatReply.findById(req.params.id);
    res.send(`
    <form method="POST" action="/admin/edit-reply/${r._id}">
    <h2>Edit Reply</h2>
    <input name="type" value="${r.type}" readonly />
    <input name="keyword" value="${r.keyword || ''}" />
    <input name="pattern" value="${r.pattern || ''}" />
    <textarea name="replies">${r.replies.join(' <#> ')}</textarea>
    <input type="number" name="priority" value="${r.priority}" />
    <select name="isDefault">
        <option value="false" ${!r.isDefault && 'selected'}>No</option>
        <option value="true" ${r.isDefault && 'selected'}>Yes</option>
    </select>
    <button>Update</button>
    </form>`);
});

app.post('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const { keyword, pattern, replies, priority, isDefault } = req.body;
    const update = {
        keyword: keyword || '',
        pattern: pattern || '',
        replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
        priority: parseInt(priority),
        isDefault: isDefault === 'true'
    };
    if (update.isDefault) {
        await ChatReply.updateMany({ type: 'default_message' }, { isDefault: false });
    }
    await ChatReply.findByIdAndUpdate(req.params.id, update);
    res.redirect('/admin/reply-list');
});

// DELETE
app.get('/admin/delete-reply/:id', isAuthenticated, async (req, res) => {
    await ChatReply.findByIdAndDelete(req.params.id);
    res.redirect('/admin/reply-list');
});

// START
app.listen(PORT, () => {
    console.log(`NOBITA Bot Server Running @ http://localhost:${PORT}`);
});