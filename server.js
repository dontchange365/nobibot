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
    const { type, keyword, pattern, replies, priority, isDefault } = req.body;
    if (!replies) return res.send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>'));

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
            <a href="/admin/delete-reply/${r._id}" onclick="return confirm('Are you sure you want to delete this reply?')">🗑️</a>
        </td>
    </tr>`).join('');
    const replyListContent = `
    <h2>Chat Replies</h2>
    <table>
        <thead>
            <tr>
                <th>Type</th>
                <th>Keywords</th>
                <th>Priority</th>
                <th>Replies</th>
                <th>Default</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${list}
        </tbody>
    </table>
    <br>
    <a href="/admin/dashboard">← Back to Dashboard</a>`;
    res.send(getHtmlTemplate('Chat Reply List', replyListContent));
});

// EDIT REPLY
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const r = await ChatReply.findById(req.params.id);
    if (!r) {
        return res.send(getHtmlTemplate('Error', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to Reply List</a>'));
    }
    const editReplyForm = `
    <form method="POST" action="/admin/edit-reply/${r._id}">
        <h2>Edit Reply</h2>
        <label for="type">Type:</label>
        <input name="type" id="type" value="${r.type}" readonly />
        <label for="keyword">Keyword(s):</label>
        <input name="keyword" id="keyword" value="${r.keyword || ''}" />
        <label for="pattern">Regex Pattern:</label>
        <input name="pattern" id="pattern" value="${r.pattern || ''}" />
        <label for="replies">Replies (use &lt;#&gt; between lines):</label>
        <textarea name="replies" id="replies">${r.replies.join(' <#> ')}</textarea>
        <label for="priority">Priority:</label>
        <input type="number" name="priority" id="priority" value="${r.priority}" />
        <label for="isDefault">Is Default?</label>
        <select name="isDefault" id="isDefault">
            <option value="false" ${!r.isDefault ? 'selected' : ''}>No</option>
            <option value="true" ${r.isDefault ? 'selected' : ''}>Yes</option>
        </select>
        <button type="submit">Update Reply</button>
    </form>
    <br>
    <a href="/admin/reply-list">← Back to Reply List</a>`;
    res.send(getHtmlTemplate('Edit Chat Reply', editReplyForm));
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
