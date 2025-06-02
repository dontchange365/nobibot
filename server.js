const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==== MONGODB URI (production me env se lena) ====
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

// ==== CONNECT MONGOOSE ====
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

// ==== MONGOOSE SCHEMAS ====

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

// ChatReply Schema
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

// Custom Variable Schema
const CustomVariableSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true }
});
const CustomVariable = mongoose.model('CustomVariable', CustomVariableSchema);

// ==== MIDDLEWARES ====
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'MySuperStrongSecretKey!',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ==== HELPER FUNCTIONS ====

// Auth checker
function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) return next();
    return res.redirect('/admin/login');
}

// HTML template
function getHtmlTemplate(title, bodyContent) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        ${bodyContent}
    </body>
    </html>
    `;
}

// ==== REPLY LIST HELPERS ==== (yeh functions sirf ek jagah hona chahiye)
function getReplyIcon(r) {
    if (r.type && r.type.includes('react')) return "😂";
    if (r.type === 'exact_match') return "🎯";
    if (r.type === 'pattern_matching') return "🧩";
    if (r.type === 'expert_pattern_matching') return "🧠";
    if (r.type === 'welcome_message') return "👋";
    if (r.type === 'default_message') return "💬";
    return "";
}
function formatReceive(r) {
    if (r.type === 'exact_match' || r.type === 'pattern_matching') return r.keyword || '-';
    if (r.type === 'expert_pattern_matching') return r.pattern || '-';
    return (r.keyword || r.pattern || '-');
}
function formatSend(r) {
    return (r.replies || []).join('<#>').slice(0, 600) + ((r.replies.join('<#>').length > 600) ? ' ...' : '');
}

// ==== ROUTES ====

// 1. Home
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 2. ADMIN LOGIN
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
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Login', loginForm));
});
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
        return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Login Failed', `
            <p>Login failed. <a href="/admin/login">Try again</a></p>
        `));
    }
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/admin/dashboard');
});
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// 3. DASHBOARD
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    const dashboardContent = `
    <h1>Welcome Admin: ${req.session.username}</h1>
    <ul class="admin-links-list">
        <li><a href="/admin/add-chat-replies">➕ Add Chat Reply</a></li>
        <li><a href="/admin/reply-list">📃 View Replies</a></li>
        <li><a href="/admin/custom-variables">🔧 Manage Custom Variables</a></li>
        <li><a href="/admin/logout">🚪 Logout</a></li>
    </ul>
    <style>
        .admin-links-list {
            list-style: none;
            padding: 0;
            margin: 20px 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .admin-links-list li a {
            display: block;
            background-color: #4f46e5;
            color: #fff;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 16px;
            text-decoration: none;
            transition: background 0.3s;
        }
        .admin-links-list li a:hover {
            background-color: #4338ca;
        }
    </style>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Dashboard', dashboardContent));
});

// 4. ADD REPLY FORM
app.get('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    let customVarList = '';
    try {
        const customVariables = await CustomVariable.find({});
        customVarList = customVariables.map(v => `<code>%${v.name}%</code>`).join(', ');
        if (customVarList) customVarList = `<br>**Custom Variables:** ${customVarList}`;
    } catch (e) { }
    const addReplyForm = `
    <form method="POST" action="/admin/add-chat-replies">
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
            <input name="pattern" id="pattern" placeholder="Only for Expert Regex. Use () for capturing groups." />
        </div>
        <label for="replies">Replies (use &lt;#&gt; between lines):</label>
        <textarea name="replies" id="replies" required></textarea>
        <small>
            **Available replacements:**<br>
            **Message:** %message%, %message_LENGTH%, %capturing_group_ID%<br>
            **Name:** %name%, %first_name%, %last_name%, %chat_name%<br>
            **Date & Time:** %date%, %time%, %hour%, %hour_short%, %hour_of_day%, %hour_of_day_short%, %minute%, %second%, %millisecond%, %am/pm%, %day_of_month%, %day_of_month_short%, %month%, %month_short%, %month_name%, %month_name_short%, %year%, %year_short%, %day_of_week%, %day_of_week_short%<br>
            **AutoResponder:** %rule_id%<br>
            **Random:** %rndm_num_A_B%, %rndm_custom_LENGTH_A,B,C%, %rndm_abc_lower_LENGTH%, %rndm_abc_upper_LENGTH%, %rndm_abc_LENGTH%, %rndm_abcnum_lower_LENGTH%, %rndm_abcnum_upper_LENGTH%, %rndm_abcnum_LENGTH%, %rndm_ascii_LENGTH%, %rndm_symbol_LENGTH%, %rndm_grawlix_LENGTH%
            ${customVarList}
        </small>
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
        if (type === 'exact_match' || type === 'pattern_matching') keywordField.style.display = 'block';
        if (type === 'expert_pattern_matching') patternField.style.display = 'block';
        if (type === 'default_message') isDefaultField.style.display = 'block';
    }
    </script>
    `;
    res.set({ 'Content-Type': 'text/html', 'Content-Disposition': 'inline' }).send(getHtmlTemplate('Add Chat Reply', addReplyForm));
});
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    if (!replies) return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>'));
    if (type === 'default_message' && isDefault === 'true') await ChatReply.updateMany({ type: 'default_message' }, { isDefault: false });
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

// 5. REPLY LIST (STYLISH)
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    const replies = await ChatReply.find().sort({ priority: -1 });
    const listItems = replies.map((r, index) => `
        <div class="reply-card">
            <div class="reply-header">
                <span class="reply-title">${r.ruleName.toUpperCase()} ${getReplyIcon(r)}</span>
            </div>
            <div class="reply-inner">
                <div class="reply-row">
                    <span class="reply-label receive">Receive:</span>
                    <span class="reply-receive">${formatReceive(r)}</span>
                </div>
                <hr>
                <div class="reply-row">
                    <span class="reply-label send">Send:</span>
                    <span class="reply-send">${formatSend(r)}</span>
                </div>
            </div>
            <div class="reply-actions">
                <a href="/admin/edit-reply/${r._id}" title="Edit">
                  <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4l-9.5 9.5-4 1 1-4L17 3Z"/><path d="M15 5l4 4"/></svg>
                </a>
                <a href="/admin/delete-reply/${r._id}" title="Delete" onclick="return confirm('Delete this rule?')">
                  <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>
                </a>
            </div>
        </div>
    `).join('');
    const content = `
        <div class="nobita-reply-panel">
            <h2 class="nobita-title">REPLY LIST</h2>
            ${listItems || '<em>No replies found.</em>'}
            <a class="btn back" href="/admin/dashboard" style="margin-top:24px;">← Back to Dashboard</a>
        </div>
        <style>
            body { background: #1a1a1a; }
            .nobita-title { color: #fff; font-family: 'Lexend', 'Inter', sans-serif; letter-spacing: 1px; margin-bottom: 24px; text-align: center; font-weight: 700; font-size: 28px; }
            .nobita-reply-panel { max-width: 600px; margin: 32px auto 60px auto; padding: 0 6px; }
            .reply-card { background: linear-gradient(98deg, #272733 80%, #3d1153 100%); border: 1.5px solid #d074f9cc; border-radius: 16px; box-shadow: 0 3px 18px #0006; padding: 16px 16px 12px 16px; margin-bottom: 30px; position: relative; }
            .reply-header { font-size: 19px; font-weight: 700; color: #fff; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .reply-title { text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
            .reply-inner { background: rgba(34,34,40,0.75); border-radius: 10px; padding: 12px 14px 8px 14px; }
            .reply-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 7px; flex-wrap: wrap; }
            .reply-label { min-width: 70px; color: #ffc952; font-family: 'Lexend', 'Inter', sans-serif; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; }
            .reply-label.send { color: #ff6f61; }
            .reply-label.receive { color: #46e579; }
.reply-receive, .reply-send {
                color: #fff;
                font-family: 'Roboto Mono', monospace;
                font-size: 15px;
                white-space: pre-line;
                word-break: break-all;
            }
            hr {
                border: 0;
                border-top: 1.5px dashed #b197d6;
                margin: 8px 0 8px 0;
            }
            .reply-actions {
                position: absolute;
                top: 14px;
                right: 20px;
                display: flex;
                gap: 10px;
            }
            .reply-actions a svg {
                stroke: #ffc952;
                background: #232337;
                border-radius: 6px;
                padding: 2px;
                transition: background 0.15s, stroke 0.15s;
            }
            .reply-actions a:hover svg {
                background: #ffc952;
                stroke: #232337;
            }
            .btn.back {
                background: #282836;
                color: #ffc952;
                padding: 10px 22px;
                border-radius: 7px;
                text-decoration: none;
                font-weight: 700;
                font-size: 16px;
                margin-left: 0;
                display: block;
                width: fit-content;
            }
            .btn.back:hover { background: #ffc952; color: #282836; }
        </style>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Reply List', content));
});
// EDIT REPLY
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    try {
        const reply = await ChatReply.findById(req.params.id);
        if (!reply) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to List</a>'));
        }

        let customVarList = '';
        try {
            const customVariables = await CustomVariable.find({});
            customVarList = customVariables.map(v => `<code>%${v.name}%</code>`).join(', ');
            if (customVarList) {
                customVarList = `<br>**Custom Variables:** ${customVarList}`;
            }
        } catch (e) {
            console.error("Error fetching custom variables for form:", e);
        }

        const editReplyForm = `
        <form method="POST" action="/admin/edit-reply/${reply._id}">
            <label for="ruleName">Rule Name:</label>
            <input name="ruleName" id="ruleName" value="${reply.ruleName}" required />
            <label for="sendMethod">Send Method:</label>
            <select name="sendMethod" id="sendMethod">
                <option value="random" ${reply.sendMethod === 'random' ? 'selected' : ''}>Random</option>
                <option value="all" ${reply.sendMethod === 'all' ? 'selected' : ''}>All</option>
                <option value="once" ${reply.sendMethod === 'once' ? 'selected' : ''}>Once (first one)</option>
            </select>
            <h2>Edit Chat Reply</h2>
            <label for="type">Type:</label>
            <select name="type" id="type" required onchange="handleTypeChange()">
                <option value="exact_match" ${reply.type === 'exact_match' ? 'selected' : ''}>Exact Match</option>
                <option value="pattern_matching" ${reply.type === 'pattern_matching' ? 'selected' : ''}>Pattern Matching</option>
                <option value="expert_pattern_matching" ${reply.type === 'expert_pattern_matching' ? 'selected' : ''}>Expert Regex</option>
                <option value="welcome_message" ${reply.type === 'welcome_message' ? 'selected' : ''}>Welcome Message</option>
                <option value="default_message" ${reply.type === 'default_message' ? 'selected' : ''}>Default Message</option>
            </select>

            <div id="keywordField" style="${(reply.type === 'exact_match' || reply.type === 'pattern_matching') ? 'display:block;' : 'display:none;'}">
                <label for="keyword">Keyword(s):</label>
                <input name="keyword" id="keyword" value="${reply.keyword || ''}" placeholder="e.g. hi, hello" />
            </div>

            <div id="patternField" style="${reply.type === 'expert_pattern_matching' ? 'display:block;' : 'display:none;'}">
                <label for="pattern">Regex Pattern:</label>
                <input name="pattern" id="pattern" value="${reply.pattern || ''}" placeholder="Only for Expert Regex. Use () for capturing groups." />
            </div>

            <label for="replies">Replies (use &lt;#&gt; between lines):</label>
            <textarea name="replies" id="replies" required>${reply.replies.join('<#>')}</textarea>
            <small>
                **Available replacements:**<br>
                **Message:** %message%, %message_LENGTH%, %capturing_group_ID%<br>
                **Name:** %name%, %first_name%, %last_name%, %chat_name%<br>
                **Date & Time:** %date%, %time%, %hour%, %hour_short%, %hour_of_day%, %hour_of_day_short%, %minute%, %second%, %millisecond%, %am/pm%, %day_of_month%, %day_of_month_short%, %month%, %month_short%, %month_name%, %month_name_short%, %year%, %year_short%, %day_of_week%, %day_of_week_short%<br>
                **AutoResponder:** %rule_id%<br>
                **Random:** %rndm_num_A_B%, %rndm_custom_LENGTH_A,B,C%, %rndm_abc_lower_LENGTH%, %rndm_abc_upper_LENGTH%, %rndm_abc_LENGTH%, %rndm_abcnum_lower_LENGTH%, %rndm_abcnum_upper_LENGTH%, %rndm_abcnum_LENGTH%, %rndm_ascii_LENGTH%, %rndm_symbol_LENGTH%, %rndm_grawlix_LENGTH%
                ${customVarList}
            </small>

            <label for="priority">Priority:</label>
            <input type="number" name="priority" id="priority" value="${reply.priority}" />

            <div id="isDefaultField" style="${reply.type === 'default_message' ? 'display:block;' : 'display:none;'}">
                <label for="isDefault">Is Default?</label>
                <select name="isDefault" id="isDefault">
                    <option value="false" ${!reply.isDefault ? 'selected' : ''}>No</option>
                    <option value="true" ${reply.isDefault ? 'selected' : ''}>Yes</option>
                </select>
            </div>

            <button type="submit">Update Reply</button>
        </form>
        <a href="/admin/reply-list">← Back to List</a>

        <script>
        // Re-run handleTypeChange on page load for edit form to set initial visibility
        document.addEventListener('DOMContentLoaded', handleTypeChange);
        </script>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Chat Reply', editReplyForm));
    } catch (error) {
        console.error('Error fetching reply for edit:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading reply for edit.</p><br><a href="/admin/reply-list">Back to List</a>'));
    }
});

app.post('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    const replyId = req.params.id;

    if (!replies) return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/edit-reply/' + replyId + '">Back to Edit Reply</a>'));

    try {
        // If updating to a new default message, unset existing ones
        if (type === 'default_message' && isDefault === 'true') {
            await ChatReply.updateMany({ type: 'default_message', _id: { $ne: replyId } }, { isDefault: false });
        }

        await ChatReply.findByIdAndUpdate(replyId, {
            ruleName,
            type,
            keyword: keyword || '',
            pattern: pattern || '',
            replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
            priority: parseInt(priority),
            isDefault: isDefault === 'true',
            sendMethod: sendMethod || 'random'
        });
        res.redirect('/admin/reply-list');
    } catch (error) {
        console.error('Error updating reply:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating reply.</p><br><a href="/admin/edit-reply/' + replyId + '">Back to Edit Reply</a>'));
    }
});

// DELETE REPLY
app.get('/admin/delete-reply/:id', isAuthenticated, async (req, res) => {
    try {
        await ChatReply.findByIdAndDelete(req.params.id);
        res.redirect('/admin/reply-list');
    } catch (error) {
        console.error('Error deleting reply:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting reply.</p><br><a href="/admin/reply-list">Back to List</a>'));
    }
});

// --- Custom Variables Management (As per your initial code - manage page, add/edit/delete routes) ---

// List Custom Variables
// List Custom Variables (with stylish box UI)
app.get('/admin/custom-variables', isAuthenticated, async (req, res) => {
    try {
        const variables = await CustomVariable.find({});
        const listItems = variables.map(v => `
            <div class="custom-var-box">
                <div class="var-header">
                    <div class="var-name">%${v.name}%</div>
                    <div class="var-actions">
                        <a title="Edit" href="/admin/edit-custom-variable/${v._id}"><svg height="22" width="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil"><path d="M17 3a2.828 2.828 0 1 1 4 4l-9.5 9.5-4 1 1-4L17 3Z"/><path d="M15 5l4 4"/></svg></a>
                        <a title="Delete" href="/admin/delete-custom-variable/${v._id}" onclick="return confirm('Delete this variable?')"><svg height="22" width="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg></a>
                    </div>
                </div>
                <div class="var-value">${v.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            </div>
        `).join('');

        const content = `
            <h2 style="margin-top:0;">Manage Custom Variables</h2>
            <div class="custom-var-list">${listItems || '<em>No variables found.</em>'}</div>
            <a class="btn" href="/admin/add-custom-variable">➕ Add New Variable</a>
            <a class="btn back" href="/admin/dashboard">← Back to Dashboard</a>
            <style>
            .custom-var-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin: 18px 0 30px 0;
    width: 100%;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
}
.custom-var-box {
    background: linear-gradient(95deg, #fff, #f2e6ff 60%);
    border: 1.5px solid #c7b0fa;
    border-radius: 14px;
    box-shadow: 0 2px 12px #b785fa22;
    padding: 14px 22px 10px 22px;
    position: relative;
    transition: box-shadow 0.18s;
    width: 100%;           /* FIX 1: Box will always be 100% */
    min-height: 85px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    box-sizing: border-box; /* FIX 2: Include padding in width */
}
.custom-var-box:hover {
    box-shadow: 0 4px 18px #bb6ffa33;
}
.var-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    gap: 18px;
}
.var-name {
    font-family: 'Lexend', 'Inter', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #7339b3;
    word-break: break-all;
}
.var-actions a {
    display: inline-flex;
    align-items: center;
    color: #656565;
    margin-left: 10px;
    opacity: 0.82;
    transition: color 0.18s, opacity 0.12s;
}
.var-actions a:hover {
    color: #9e2cff;
    opacity: 1;
}
.var-actions svg {
    vertical-align: middle;
    margin-bottom: 1.5px;
}
.var-value {
    font-family: 'Roboto Mono', monospace;
    font-size: 15px;
    color: #272b34;
    max-height: 52px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    background: #f8f6fa;
    border-radius: 8px;
    padding: 9px 14px;
    margin-bottom: 2px;
    word-break: break-all;
    width: 100%;         /* FIX 3: Always 100% width of parent */
    min-height: 34px;
    box-sizing: border-box;
    /* NEW: Always expand to parent width */
    display: block;
}
</style>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Manage Custom Variables', content));
    } catch (error) {
        console.error('Error listing custom variables:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading custom variables.</p>'));
    }
});

// Add Custom Variable Form
app.get('/admin/add-custom-variable', isAuthenticated, (req, res) => {
    const form = `
        <h2>Add New Custom Variable</h2>
        <form method="POST" action="/admin/add-custom-variable">
            <label for="name">Variable Name (e.g., my_city, admin_email):</label>
            <input name="name" id="name" placeholder="Should be unique, no spaces, e.g., welcome_greeting" required />
            <label for="value">Variable Value:</label>
            <textarea name="value" id="value" placeholder="The actual text this variable will replace." required></textarea>
            <button type="submit">Add Variable</button>
        </form>
        <a href="/admin/custom-variables">← Back to Variables</a>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Add Custom Variable', form));
});

// Add Custom Variable POST
app.post('/admin/add-custom-variable', isAuthenticated, async (req, res) => {
    const { name, value } = req.body;
    try {
        const newVariable = new CustomVariable({ name: name.trim(), value });
        await newVariable.save();
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error adding custom variable:', error);
        let errorMessage = 'Error adding custom variable.';
        if (error.code === 11000) { //   Duplicate key error
            errorMessage = `Variable name '%${name}%' already exists. Please choose a different name.`;
        }
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', `<p>${errorMessage}</p><br><a href="/admin/add-custom-variable">Try again</a>`));
    }
});

// Edit Custom Variable Form
app.get('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    try {
        const variable = await CustomVariable.findById(req.params.id);
        if (!variable) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Variable not found.</p><br><a href="/admin/custom-variables">Back to List</a>'));
        }

        const form = `
            <h2>Edit Custom Variable</h2>
            <form method="POST" action="/admin/edit-custom-variable/${variable._id}">
                <label for="name">Variable Name:</label>
                <input name="name" id="name" value="${variable.name}" readonly />
                <label for="value">Variable Value:</label>
                <textarea name="value" id="value" required>${variable.value}</textarea>
                <button type="submit">Update Variable</button>
            </form>
            <a href="/admin/custom-variables">← Back to Variables</a>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Custom Variable', form));
    } catch (error) {
        console.error('Error fetching custom variable for edit:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading variable for edit.</p><br><a href="/admin/custom-variables">Back to List</a>'));
    }
});

// Edit Custom Variable POST
app.post('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const { value } = req.body; // Name is readonly, so only value can be updated
    try {
        await CustomVariable.findByIdAndUpdate(req.params.id, { value });
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error updating custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating custom variable.</p><br><a href="/admin/edit-custom-variable/' + req.params.id + '">Try again</a>'));
    }
});

// Delete Custom Variable
app.get('/admin/delete-custom-variable/:id', isAuthenticated, async (req, res) => {
    try {
        await CustomVariable.findByIdAndDelete(req.params.id);
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error deleting custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting custom variable.</p><br><a href="/admin/custom-variables">Back to List</a>'));
    }
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
