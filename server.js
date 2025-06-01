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
    ruleName: { type: String, required: true },
    type: { type: String, required: true },
    keyword: String,
    pattern: String,
    replies: [String],
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    sendMethod: { type: String, enum: ['random', 'all', 'once'], default: 'random' } // ✅ new field
});
const ChatReply = mongoose.model('ChatReply', ChatReplySchema);

app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(session({
    secret: 'MySuperStrongSecretKey!',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public'))); // This line serves static files from the 'public' directory

// Middleware
function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) return next();
    return res.redirect('/admin/login');
}

// Helper to create a consistent HTML structure with linked CSS
function getHtmlTemplate(title, bodyContent) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link rel="stylesheet" href="/style.css"> </head>
    <body>
        ${bodyContent}
    </body>
    </html>
    `;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// CHATBOT API (no change needed here as it's an API endpoint)
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";

    // 🆕 First-time welcome
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: randomReply(welcomeReply.replies) });
            }
        } catch (e) {
            console.error("Welcome message error:", e);
        }
    }

    try {
        // 1. Exact Match
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) {
        return res.json({ reply: handleReplySend(exact) });
    }

        // 2. Pattern Matching
        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: randomReply(reply.replies) });
            }
        }

        // 3. Regex Matching
        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                if (new RegExp(reply.pattern, 'i').test(userMessage)) {
                    return res.json({ reply: randomReply(reply.replies) });
                }
            } catch (e) { }
        }

        // 4. Default Fallback
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
    const loginForm = `
    <form method="POST" action="/admin/login">
        <h2>Admin Login</h2>
        <label for="username">Username:</label>
        <input name="username" id="username" placeholder="Username" required />
        <label for="password">Password:</label>
        <input type="password" name="password" id="password" placeholder="Password" required />
        <button type="submit">Login</button>
    </form>`;
    res.send(getHtmlTemplate('Admin Login', loginForm));
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
        return res.send(getHtmlTemplate('Login Failed', `
            <p>Login failed. <a href="/admin/login">Try again</a></p>
        `));
    }
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/admin/dashboard');
});

// ADMIN DASHBOARD
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    const dashboardContent = `
        <h1>Welcome Admin: ${req.session.username}</h1>
        <div class="admin-links">
            <a href="/admin/add-chat-replies">Add Chat Reply</a>
            <a href="/admin/reply-list">View Replies</a>
            <a href="/admin/logout">Logout</a>
        </div>`;
    res.send(getHtmlTemplate('Admin Dashboard', dashboardContent));
});

// LOGOUT
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// ADD REPLY FORM
app.get('/admin/add-chat-replies', isAuthenticated, (req, res) => {
    const addReplyForm = `
    <form method="POST" action="/admin/add-chat-replies" id="replyForm">
        <label for="ruleName">Rule Name:</label>
        <input name="ruleName" id="ruleName" placeholder="e.g. Greet User" required />
        <label for="sendMethod">Send Method:</label>
<select name="sendMethod" id="sendMethod">
    <option value="random">Random</option>
    <option value="all">All</option>
    <option value="once">Once (first one)</option>
</select>
        <h2>Add Chat Reply</h2>
        <label for="type">Type:</label>
        <select name="type" id="type" required onchange="handleTypeChange()">
            <option value="">--Select Type--</option>
            <option value="exact_match">Exact Match</option>
            <option value="pattern_matching">Pattern Matching</option>
            <option value="expert_pattern_matching">Expert Regex</option>
            <option value="welcome_message">Welcome Message</option>
            <option value="default_message">Default Message</option>
        </select>

        <div id="keywordField" style="display:none;">
            <label for="keyword">Keyword(s):</label>
            <input name="keyword" id="keyword" placeholder="e.g. hi, hello" />
        </div>

        <div id="patternField" style="display:none;">
            <label for="pattern">Regex Pattern:</label>
            <input name="pattern" id="pattern" placeholder="Only for Expert Regex" />
        </div>

        <label for="replies">Replies (use &lt;#&gt; between lines):</label>
        <textarea name="replies" id="replies" required></textarea>

        <label for="priority">Priority:</label>
        <input type="number" name="priority" id="priority" value="0" />

        <div id="isDefaultField" style="display:none;">
            <label for="isDefault">Is Default?</label>
            <select name="isDefault" id="isDefault">
                <option value="false">No</option>
                <option value="true">Yes</option>
            </select>
        </div>

        <button type="submit">Add Reply</button>
    </form>

    <script>
    function handleTypeChange() {
        const type = document.getElementById('type').value;
        const keywordField = document.getElementById('keywordField');
        const patternField = document.getElementById('patternField');
        const isDefaultField = document.getElementById('isDefaultField');

        keywordField.style.display = 'none';
        patternField.style.display = 'none';
        isDefaultField.style.display = 'none';

        if (type === 'exact_match' || type === 'pattern_matching') {
            keywordField.style.display = 'block';
        }

        if (type === 'expert_pattern_matching') {
            patternField.style.display = 'block';
        }

        if (type === 'default_message') {
            isDefaultField.style.display = 'block';
        }
    }
    </script>
    `;
    res.send(getHtmlTemplate('Add Chat Reply', addReplyForm));
});

app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    if (!replies) return res.send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>'));

    if (type === 'default_message' && isDefault === 'true') {
        await ChatReply.updateMany({ type: 'default_message' }, { isDefault: false });
    }

    const newReply = new ChatReply({
    ruleName,
    type,
    keyword: keyword || '',
    pattern: pattern || '',
    replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
    priority: parseInt(priority),
    isDefault: isDefault === 'true',
    sendMethod: sendMethod || 'random'
});

    await newReply.save();
    res.redirect('/admin/reply-list');
});

// REPLY LIST
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    const replies = await ChatReply.find().sort({ priority: -1 });

    const listItems = replies.map((r, index) => `
        <li class="reply-item" data-id="${r._id}" draggable="true">
            <div class="title">
                <strong>${r.ruleName}</strong>
                <span class="type">(${r.type})</span>
            </div>
            ${r.keyword ? `<div class="keywords">${r.keyword.slice(0, 60)}${r.keyword.length > 60 ? '...' : ''}</div>` : ''}
            <div class="actions">
                <a href="/admin/edit-reply/${r._id}" class="edit-btn">✏️</a>
                <a href="/admin/delete-reply/${r._id}" class="delete-btn" onclick="return confirm('Delete this rule?')">🗑️</a>
            </div>
        </li>
    `).join('');

    const content = `
    <h2>🧠 Chat Rules (Drag to Reorder, Tap to Set Priority)</h2>
    <ul id="replyList" class="reply-list">${listItems}</ul>
    <a href="/admin/dashboard">← Back to Dashboard</a>

    <style>
        .reply-list {
            list-style: none;
            max-height: 80vh;
            overflow-y: auto;
            padding: 0;
            margin: 20px 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .reply-item {
            background: #fff;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            cursor: grab;
            transition: transform 0.2s;
            user-select: none;
            cursor: grab;
        }
        .reply-item:active {
            transform: scale(1.02);
            cursor: grabbing;
        }
        .title {
            font-size: 16px;
            margin-bottom: 5px;
        }
        .type {
            font-size: 12px;
            color: #555;
            margin-left: 5px;
        }
        .keywords {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
        }
        .actions a {
            padding: 6px 10px;
            border-radius: 5px;
            font-size: 14px;
            text-decoration: none;
            margin-right: 8px;
        }
        .edit-btn {
            background: #2563eb;
            color: #fff;
        }
        .delete-btn {
            background: #ef4444;
            color: #fff;
        }
    </style>

    <script>
        const list = document.getElementById('replyList');
        let dragged;

        // Drag start
        list.addEventListener('dragstart', (e) => {
        dragged = e.target.closest('li.reply-item');
        if (!dragged) return;
        dragged.style.opacity = 0.5;
});

        // Drag over
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const after = [...list.children].find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
            if (after == null) {
                list.appendChild(dragged);
            } else {
                list.insertBefore(dragged, after);
            }
        });

        list.addEventListener('dragend', () => {
            dragged.style.opacity = 1;
            const ids = [...list.children].map((el, i) => ({ id: el.dataset.id, priority: list.children.length - i }));
            fetch('/api/update-priorities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: ids })
            });
        });

        // Click to set priority manually
        list.addEventListener('click', (e) => {
            const item = e.target.closest('li.reply-item');
            if (!item) return;
            const input = prompt('Enter new priority number (1 = top)');
            if (!input || isNaN(input)) return;

            const newPos = parseInt(input);
            const total = list.children.length;
            if (newPos < 1 || newPos > total) return alert('Invalid position');

            list.insertBefore(item, list.children[total - newPos]);
            const ids = [...list.children].map((el, i) => ({ id: el.dataset.id, priority: list.children.length - i }));
            fetch('/api/update-priorities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: ids })
            });
        });
    </script>
    `;

    res.send(getHtmlTemplate('Chat Reply List', content));
});

// EDIT REPLY
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const r = await ChatReply.findById(req.params.id);
    if (!r) {
        return res.send(getHtmlTemplate('Error', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to Reply List</a>'));
    }
    const editReplyForm = `
    <form method="POST" action="/admin/edit-reply/${r._id}">
        <label for="ruleName">Rule Name:</label>
        <input name="ruleName" id="ruleName" value="${r.ruleName}" required />
        <label for="sendMethod">Send Method:</label>
<select name="sendMethod" id="sendMethod">
    <option value="random" ${r.sendMethod === 'random' ? 'selected' : ''}>Random</option>
    <option value="all" ${r.sendMethod === 'all' ? 'selected' : ''}>All</option>
    <option value="once" ${r.sendMethod === 'once' ? 'selected' : ''}>Once</option>
</select>
        <h2>Edit Reply</h2>
        <label for="type">Type:</label>
        <input name="type" id="type" value="${r.type}" readonly />

        <div id="keywordField" style="display:none;">
            <label for="keyword">Keyword(s):</label>
            <input name="keyword" id="keyword" value="${r.keyword || ''}" />
        </div>

        <div id="patternField" style="display:none;">
            <label for="pattern">Regex Pattern:</label>
            <input name="pattern" id="pattern" value="${r.pattern || ''}" />
        </div>

        <label for="replies">Replies (use &lt;#&gt; between lines):</label>
        <textarea name="replies" id="replies">${r.replies.join(' <#> ')}</textarea>

        <label for="priority">Priority:</label>
        <input type="number" name="priority" id="priority" value="${r.priority}" />

        <div id="isDefaultField" style="display:none;">
            <label for="isDefault">Is Default?</label>
            <select name="isDefault" id="isDefault">
                <option value="false" ${!r.isDefault ? 'selected' : ''}>No</option>
                <option value="true" ${r.isDefault ? 'selected' : ''}>Yes</option>
            </select>
        </div>

        <button type="submit">Update Reply</button>
    </form>

    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const type = "${r.type}";
        const keywordField = document.getElementById('keywordField');
        const patternField = document.getElementById('patternField');
        const isDefaultField = document.getElementById('isDefaultField');

        if (type === 'exact_match' || type === 'pattern_matching') {
            keywordField.style.display = 'block';
        }
        if (type === 'expert_pattern_matching') {
            patternField.style.display = 'block';
        }
        if (type === 'default_message') {
            isDefaultField.style.display = 'block';
        }
    });
    </script>

    <br>
    <a href="/admin/reply-list">← Back to Reply List</a>
    `;
    res.send(getHtmlTemplate('Edit Chat Reply', editReplyForm));
});

app.post('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const { ruleName, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    const update = {
    ruleName,
    keyword: keyword || '',
    pattern: pattern || '',
    replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
    priority: parseInt(priority),
    isDefault: isDefault === 'true',
    sendMethod: sendMethod || 'random'
};
    if (update.isDefault) {
        await ChatReply.updateMany({ type: 'default_message' }, { isDefault: false });
    }
    await ChatReply.findByIdAndUpdate(req.params.id, update);
    res.redirect('/admin/reply-list');
});

function handleReplySend(replyObj) {
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";

    switch (replyObj.sendMethod) {
        case 'once':
            return replyObj.replies[0]; // First one always
        case 'all':
            return replyObj.replies.join('\n'); // All line by line
        case 'random':
        default:
            return randomReply(replyObj.replies); // Random default
    }
}

// DELETE
app.get('/admin/delete-reply/:id', isAuthenticated, async (req, res) => {
    await ChatReply.findByIdAndDelete(req.params.id);
    res.redirect('/admin/reply-list');
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

// START
app.listen(PORT, () => {
    console.log(`NOBITA Bot Server Running @ http://localhost:${PORT}`);
});
