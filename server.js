// ========== server.js ==========
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB URI ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=appName=nobifeedback';

// --- Connect MongoDB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas ---
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

const CustomVariableSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true }
});
const CustomVariable = mongoose.model('CustomVariable', CustomVariableSchema);

// --- Middleware ---
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

// --- Helper Functions ---
function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) return next();
    return res.redirect('/admin/login');
}
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
const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ======= NESTED VARIABLE RESOLVER (TRUE RECURSIVE) =========
async function resolveVariables(text, customVariables, maxDepth = 8) {
    let varMap = {};
    customVariables.forEach(v => { varMap[v.name] = v.value; });

    // Pehle har variable ki value me bhi replace run kar
    for (let depth = 0; depth < maxDepth; depth++) {
        let changed = false;
        for (let name in varMap) {
            let oldValue = varMap[name];
            let newValue = oldValue.replace(/%([a-zA-Z0-9_]+)%/g, (match, vname) => {
                // Agar value exist karti hai aur khud se refer nahi kar rha
                if (varMap[vname] !== undefined && vname !== name) {
                    return varMap[vname];
                }
                return match;
            });
            if (newValue !== oldValue) {
                varMap[name] = newValue;
                changed = true;
            }
        }
        if (!changed) break; // Agar is iteration mein koi change nahi hua, toh aage badhne ki zaroorat nahi
    }

    // Ab reply text pe bhi nested replace lagao
    let result = text;
    for (let depth = 0; depth < maxDepth; depth++) {
        const prev = result;
        result = result.replace(/%([a-zA-Z0-9_]+)%/g, (match, vname) => {
            if (varMap[vname] !== undefined) {
                return varMap[vname];
            }
            return match;
        });
        if (result === prev) break; // Agar result change hi nahi hua to break
    }
    return result;
}

// --- handleReplySend (main reply engine with variables support) ---
async function handleReplySend(replyObj, userMessage, matchedRegexGroups = null, reqSession = {}) {
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";
    let replyText;
    switch (replyObj.sendMethod) {
        case 'once': replyText = replyObj.replies[0]; break;
        case 'all': replyText = replyObj.replies.join('\n'); break;
        case 'random':
        default: replyText = randomReply(replyObj.replies); break;
    }

    try {
        // --- Custom variable replacement (with recursion for nested) ---
        // Fetch all custom variables from the database
        const customVariables = await CustomVariable.find({});
        // Resolve all custom variables, including nested ones, using the new true recursive logic
        replyText = await resolveVariables(replyText, customVariables);
    } catch (error) {
        console.error("Custom variable resolution error:", error);
        // Optionally, you might want to return an error message to the user
        // or just continue with the partially resolved text.
    }

    // --- (Variable replacements for message, name, time, etc.) ---
    // These are non-custom variables, processed after custom ones.
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    replyText = replyText.replace(/%message%/g, userMessage || '');
    replyText = replyText.replace(/%message_(\d+)%/g, (match, len) => (userMessage || '').substring(0, parseInt(len)));
    if (matchedRegexGroups) {
        replyText = replyText.replace(/%capturing_group_(\d+)%/g, (match, groupId) => {
            return matchedRegexGroups[parseInt(groupId)] || '';
        });
    }
    const userName = reqSession.username || 'User';
    replyText = replyText.replace(/%name%/g, userName);
    replyText = replyText.replace(/%first_name%/g, userName.split(' ')[0] || '');
    replyText = replyText.replace(/%last_name%/g, userName.split(' ').slice(1).join(' ') || '');
    replyText = replyText.replace(/%chat_name%/g, userName);

    // --- Date & time variables ---
    const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    replyText = replyText.replace(/%date%/g, now.toLocaleDateString('en-IN', optionsDate));
    replyText = replyText.replace(/%time%/g, now.toLocaleTimeString('en-IN', optionsTime));
    replyText = replyText.replace(/%hour%/g, now.toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true }).split(' ')[0]);
    replyText = replyText.replace(/%minute%/g, String(now.getMinutes()).padStart(2, '0'));
    replyText = replyText.replace(/%second%/g, String(now.getSeconds()).padStart(2, '0'));
    replyText = replyText.replace(/%am\/pm%/g, now.getHours() >= 12 ? 'pm' : 'am');
    replyText = replyText.replace(/%day_of_month%/g, String(now.getDate()).padStart(2, '0'));
    replyText = replyText.replace(/%month%/g, String(now.getMonth() + 1).padStart(2, '0'));
    replyText = replyText.replace(/%year%/g, String(now.getFullYear()));
    return replyText;
}

// --- Public Home Page (index.html in /public) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- Chatbot Message API Route ---
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";
    let matchedRegexGroups = null;

    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: await handleReplySend(welcomeReply, userMessage, null, req.session) });
            }
        } catch (e) { console.error("Welcome message error:", e); }
    }

    try {
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) return res.json({ reply: await handleReplySend(exact, userMessage, null, req.session) });

        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: await handleReplySend(reply, userMessage, null, req.session) });
            }
        }

        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                const regex = new RegExp(reply.pattern, 'i');
                const match = regex.exec(userMessage);
                if (match) {
                    matchedRegexGroups = match;
                    return res.json({ reply: await handleReplySend(reply, userMessage, matchedRegexGroups, req.session) });
                }
            } catch (e) { console.error("Regex pattern error:", e); }
        }
        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: await handleReplySend(fallback, userMessage, null, req.session) });
    } catch (e) {
        console.error(e);
        botReply = "Nobi Bot error: try again later.";
    }
    res.json({ reply: botReply });
});

// ========== ADMIN ROUTES ==========
// --- Admin Login ---
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
        .admin-links-list { list-style: none; padding: 0; margin: 20px 0; display: flex; flex-direction: column; gap: 12px;}
        .admin-links-list li a { display: block; background-color: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 6px; font-size: 16px; text-decoration: none; transition: background 0.3s;}
        .admin-links-list li a:hover { background-color: #4338ca; }
    </style>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Dashboard', dashboardContent));
});
app.get('/admin/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });

// ========== VIEW ALL CHAT REPLIES ==========
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    try {
        const replies = await ChatReply.find({}).sort({ priority: -1, ruleName: 1 });
        let listHtml = `
            <h2 style="margin-top:0;">All Chat Replies</h2>
            <a href="/admin/add-chat-replies" class="btn" style="margin-bottom:14px;display:inline-block;">➕ Add New Reply</a>
            <table border="0" cellpadding="10" style="width:100%;max-width:900px;margin:auto;background:#fff;border-radius:12px;">
            <thead>
                <tr style="background:#efecff;">
                    <th>Rule Name</th>
                    <th>Type</th>
                    <th>Keyword / Pattern</th>
                    <th>Replies</th>
                    <th>Send Method</th>
                    <th>Priority</th>
                    <th>Default</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
        `;
        if (replies.length === 0) {
            listHtml += `<tr><td colspan="8" style="text-align:center; padding: 20px;">No chat replies found. Add one!</td></tr>`;
        } else {
            for (let rep of replies) {
                listHtml += `
                    <tr>
                        <td>${rep.ruleName}</td>
                        <td>${rep.type}</td>
                        <td>${rep.keyword || rep.pattern || ''}</td>
                        <td style="max-width:220px;font-size:15px;">${rep.replies.map(r => `<div style="background:#f4f1ff;padding:5px 10px;border-radius:7px;margin-bottom:2px;color:#222;">${r.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`).join('')}</td>
                        <td>${rep.sendMethod}</td>
                        <td>${rep.priority}</td>
                        <td>${rep.isDefault ? '✅' : ''}</td>
                        <td>
                            <a href="/admin/edit-reply/${rep._id}" style="color:#3a82fa;font-weight:bold;text-decoration:none;">Edit</a> | 
                            <a href="/admin/delete-reply/${rep._id}" onclick="return confirm('Delete this reply?')" style="color:#e53131;font-weight:bold;text-decoration:none;">Delete</a>
                        </td>
                    </tr>
                `;
            }
        }
        listHtml += `</tbody></table>
        <a href="/admin/dashboard" class="btn back" style="margin-top:22px;display:inline-block;">← Back to Dashboard</a>
        <style>
            table { border-collapse: separate; border-spacing: 0; } /* Ensures rounded corners work */
            table th, table td { padding: 9px 10px; border-bottom: 1px solid #ececec; }
            table thead tr { border-bottom: 2px solid #ddd; } /* Thicker line for header */
            table th { background: #ede7fe; color: #482998; font-weight:700; text-align: left;} /* Align header text left */
            table thead tr:first-child th:first-child { border-top-left-radius: 12px; } /* Top-left corner for header */
            table thead tr:first-child th:last-child { border-top-right-radius: 12px; } /* Top-right corner for header */

            .btn.back { background:#e6eaff;color:#444;padding:8px 23px;border-radius:8px;border:none;font-size:17px;font-weight:600; text-decoration: none;}
            .btn.back:hover { background:#d0d7f0; } /* Hover for back button */
            .btn { /* General button style if not already defined for + Add New Reply */
                background:#296aff;color:#fff;font-weight:700;font-size:18px;border:none;border-radius:8px;padding:10px 20px;text-decoration:none;
                transition: background 0.2s ease-in-out;
            }
            .btn:hover { background:#1e53e0; }
        </style>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('View Chat Replies', listHtml));
    } catch (err) {
        console.error('Error fetching reply list:', err);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading reply list.</p>'));
    }
});


// ---- Add Chat Reply FORM with DYNAMIC Variables PICKER ----
app.get('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const customVariables = await CustomVariable.find({});
    const customVarArr = customVariables.map(v => `%${v.name}%`);
    // All vars to be used for picker (default + custom)
    const defaultVars = [
        "%message%", "%message_LENGTH%", "%capturing_group_ID%", "%name%",
        "%first_name%", "%last_name%", "%chat_name%", "%date%", "%time%",
        "%hour%", "%minute%", "%second%", "%am/pm%", "%day_of_month%", "%month%", "%year%", "%rule_id%"
    ];
    const allVars = [...defaultVars, ...customVarArr];
    // Make HTML for variable buttons server-side (no allVars.map in browser!)
    const variableButtonsHTML = allVars.map(v =>
        `<button onclick="insertVariable('replies','${v.replace(/'/g,"\\'")}')">${v}</button>`
    ).join('');

    const addReplyForm = `
    <form method="POST" action="/admin/add-chat-replies" style="max-width:480px;margin:auto;">
        <label for="ruleName"><b>Rule Name:</b></label>
        <input name="ruleName" id="ruleName" placeholder="e.g. Greet User" required />
        <label for="sendMethod"><b>Send Method:</b></label>
        <select name="sendMethod" id="sendMethod">
            <option value="random">Random</option>
            <option value="all">All</option>
            <option value="once">Once (first one)</option>
        </select>
        <h2 style="text-align:center;margin:18px 0 5px 0;">Add Chat Reply</h2>
        <label for="type"><b>Type:</b></label>
        <select name="type" id="type" required onchange="handleTypeChange()">
            <option value="">--Select Type--</option>
            <option value="exact_match">Exact Match</option>
            <option value="pattern_matching">Pattern Matching</option>
            <option value="expert_pattern_matching">Expert Regex</option>
            <option value="welcome_message">Welcome Message</option>
            <option value="default_message">Default Message</option>
        </select>
        <div id="keywordField" style="display:none;">
            <label for="keyword"><b>Keyword(s):</b></label>
            <input name="keyword" id="keyword" placeholder="e.g. hi, hello" />
        </div>
        <div id="patternField" style="display:none;">
            <label for="pattern"><b>Regex Pattern:</b></label>
            <input name="pattern" id="pattern" placeholder="Expert Regex. Use () for capturing groups." />
        </div>
        <label for="replies"><b>Replies (use &lt;#&gt; between lines):</b></label>
        <div style="display:flex;align-items:stretch;gap:6px;">
            <button type="button" title="Insert Variable" onclick="showVariablePicker('replies')" style="height:40px;width:40px;display:flex;align-items:center;justify-content:center;background:#1a1a3c;border:none;border-radius:7px;margin-right:4px;cursor:pointer;">
                <svg width="23" height="23" stroke="#ffd870" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
            <textarea name="replies" id="replies" required style="flex:1;min-height:90px;font-size:16px;padding:8px;border-radius:8px;border:1.5px solid #b6b6d1;resize:vertical;"></textarea>
        </div>
        <label for="priority" style="margin-top:14px;"><b>Priority:</b></label>
        <input type="number" name="priority" id="priority" value="0" />
        <div id="isDefaultField" style="display:none;">
            <label for="isDefault">Is Default?</label>
            <select name="isDefault" id="isDefault">
                <option value="false">No</option>
                <option value="true">Yes</option>
            </select>
        </div>
        <button type="submit" style="width:100%;margin-top:20px;padding:12px 0;background:#296aff;color:#fff;font-weight:700;font-size:18px;border:none;border-radius:8px;">Add Reply</button>
    </form>
    <script>
    // Server-side generated HTML for variable buttons
    window.variableButtonsHTML = \`${variableButtonsHTML}\`;

    function showVariablePicker(inputId) {
        let modal = document.getElementById('varPickerModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'varPickerModal';
            modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#19193be3;display:flex;align-items:center;justify-content:center;z-index:5000;";
            modal.innerHTML = \`
              <div class="custom-var-popup">
                <div class="var-popup-header">
                    <span>Insert Variable</span>
                    <button onclick="document.getElementById('varPickerModal').remove()" class="close-var-popup">×</button>
                </div>
                <div class="var-popup-list">
                    \${window.variableButtonsHTML || ''}
                </div>
              </div>
            \`;
            document.body.appendChild(modal);
        }
    }
    function insertVariable(inputId, value) {
        const el = document.getElementById(inputId);
        if (el) {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            el.value = el.value.substring(0, start) + value + el.value.substring(end);
            el.focus();
            el.selectionStart = el.selectionEnd = start + value.length;
        }
        document.getElementById('varPickerModal')?.remove();
    }
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
    <style>
    input, textarea, select {
        width: 100%;
        margin-bottom: 14px;
        font-size: 16px;
        border-radius: 8px;
        border: 1.5px solid #b6b6d1;
        padding: 8px 12px;
        background: #f8f8fd;
        color: #202050;
        font-family: 'Inter', sans-serif;
        outline: none;
    }
    input:focus, textarea:focus, select:focus { border-color: #367aff; background: #f4f8ff;}
    label { font-weight: 600; color: #212245; margin-bottom: 5px; display:block; }
    /* --- Styles for Custom Variable Popup --- */
    .custom-var-popup {
        background: linear-gradient(97deg,#eaf3ff 65%,#fafdff 100%);
        border: 1.5px solid #b3d1fa;
        border-radius: 16px;
        box-shadow: 0 4px 22px #83befc33;
        width: 345px;
        max-width: 95vw;
        padding: 0 0 16px 0;
        display: flex;
        flex-direction: column;
        animation: fadeInVarPopup .19s;
    }
    @keyframes fadeInVarPopup { from { opacity:0; transform: scale(0.98);} to {opacity:1;} }
    .var-popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 18px 7px 18px;
        border-bottom: 1px solid #dde9f8;
        font-family: 'Lexend', 'Inter', sans-serif;
        font-size: 20px;
        font-weight: 800;
        color: #2172c9;
    }
    .close-var-popup {
        background: none;
        border: none;
        color: #a2b4d7;
        font-size: 26px;
        font-weight: bold;
        cursor: pointer;
        margin-left: 10px;
        transition: color .18s;
    }
    .close-var-popup:hover { color: #2172c9; }
    .var-popup-list {
        display: grid;
        grid-template-columns: repeat(2,1fr);
        gap: 11px 12px;
        padding: 18px 16px 2px 16px;
    }
    .var-popup-list button {
        border: 1.5px solid #b3d1fa;
        background: #eaf3ff;
        color: #2276ce;
        border-radius: 10px;
        font-family: 'Roboto Mono', monospace;
        font-size: 15px;
        font-weight: 600;
        padding: 9px 0;
        cursor: pointer;
        transition: background .13s, color .13s, border-color .13s, transform .1s;
        box-shadow: 0 1.5px 8px #acd7fa22;
    }
    .var-popup-list button:hover {
        background: #d7eafe;
        color: #1760a9;
        border-color: #97c3ee;
        transform: translateY(-2px) scale(1.05);
    }
    </style>
    `;
    res.set({ 'Content-Type': 'text/html', 'Content-Disposition': 'inline' }).send(getHtmlTemplate('Add Chat Reply', addReplyForm));
});

// --- Edit Chat Reply (same fix for variable picker) ---
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    try {
        const reply = await ChatReply.findById(req.params.id);
        if (!reply) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to List</a>'));
        }
        const customVariables = await CustomVariable.find({});
        const customVarArr = customVariables.map(v => `%${v.name}%`);
        const defaultVars = [
            "%message%", "%message_LENGTH%", "%capturing_group_ID%", "%name%",
            "%first_name%", "%last_name%", "%chat_name%", "%date%", "%time%",
            "%hour%", "%minute%", "%second%", "%am/pm%", "%day_of_month%", "%month%", "%year%", "%rule_id%"
        ];
        const allVars = [...defaultVars, ...customVarArr];
        const variableButtonsHTML = allVars.map(v =>
            `<button onclick="insertVariable('replies','${v.replace(/'/g,"\\'")}')">${v}</button>`
        ).join('');
        const editReplyForm = `
        <form method="POST" action="/admin/edit-reply/${reply._id}" style="max-width:480px;margin:auto;">
            <label for="ruleName"><b>Rule Name:</b></label>
            <input name="ruleName" id="ruleName" value="${reply.ruleName || ''}" required />
            <label for="sendMethod"><b>Send Method:</b></label>
            <select name="sendMethod" id="sendMethod">
                <option value="random" ${reply.sendMethod === 'random' ? 'selected' : ''}>Random</option>
                <option value="all" ${reply.sendMethod === 'all' ? 'selected' : ''}>All</option>
                <option value="once" ${reply.sendMethod === 'once' ? 'selected' : ''}>Once (first one)</option>
            </select>
            <h2 style="text-align:center;margin:18px 0 5px 0;">Edit Chat Reply</h2>
            <label for="type"><b>Type:</b></label>
            <select name="type" id="type" required onchange="handleTypeChange()">
                <option value="">--Select Type--</option>
                <option value="exact_match" ${reply.type === 'exact_match' ? 'selected' : ''}>Exact Match</option>
                <option value="pattern_matching" ${reply.type === 'pattern_matching' ? 'selected' : ''}>Pattern Matching</option>
                <option value="expert_pattern_matching" ${reply.type === 'expert_pattern_matching' ? 'selected' : ''}>Expert Regex</option>
                <option value="welcome_message" ${reply.type === 'welcome_message' ? 'selected' : ''}>Welcome Message</option>
                <option value="default_message" ${reply.type === 'default_message' ? 'selected' : ''}>Default Message</option>
            </select>
            <div id="keywordField" style="${(reply.type === 'exact_match' || reply.type === 'pattern_matching') ? 'display:block;' : 'display:none;'}">
                <label for="keyword"><b>Keyword(s):</b></label>
                <input name="keyword" id="keyword" value="${reply.keyword || ''}" placeholder="e.g. hi, hello" />
            </div>
            <div id="patternField" style="${reply.type === 'expert_pattern_matching' ? 'display:block;' : 'display:none;'}">
                <label for="pattern"><b>Regex Pattern:</b></label>
                <input name="pattern" id="pattern" value="${reply.pattern || ''}" placeholder="Expert Regex. Use () for capturing groups." />
            </div>
            <label for="replies"><b>Replies (use &lt;#&gt; between lines):</b></label>
            <div style="display:flex;align-items:stretch;gap:6px;">
                <button type="button" title="Insert Variable" onclick="showVariablePicker('replies')" style="height:40px;width:40px;display:flex;align-items:center;justify-content:center;background:#1a1a3c;border:none;border-radius:7px;margin-right:4px;cursor:pointer;">
                    <svg width="23" height="23" stroke="#ffd870" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                </button>
                <textarea name="replies" id="replies" required style="flex:1;min-height:90px;font-size:16px;padding:8px;border-radius:8px;border:1.5px solid #b6b6d1;resize:vertical;">${reply.replies.join('<#>')}</textarea>
            </div>
            <label for="priority" style="margin-top:14px;"><b>Priority:</b></label>
            <input type="number" name="priority" id="priority" value="${reply.priority}" />
            <div id="isDefaultField" style="${reply.type === 'default_message' ? 'display:block;' : 'display:none;'}">
                <label for="isDefault">Is Default?</label>
                <select name="isDefault" id="isDefault">
                    <option value="false" ${!reply.isDefault ? 'selected' : ''}>No</option>
                    <option value="true" ${reply.isDefault ? 'selected' : ''}>Yes</option>
                </select>
            </div>
            <button type="submit" style="width:100%;margin-top:20px;padding:12px 0;background:#296aff;color:#fff;font-weight:700;font-size:18px;border:none;border-radius:8px;">Update Reply</button>
        </form>
        <script>
        // Server-side generated HTML for variable buttons
        window.variableButtonsHTML = \`${variableButtonsHTML}\`;

        function showVariablePicker(inputId) {
            let modal = document.getElementById('varPickerModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'varPickerModal';
                modal.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#19193be3;display:flex;align-items:center;justify-content:center;z-index:5000;";
                modal.innerHTML = \`
                  <div class="custom-var-popup">
                    <div class="var-popup-header">
                        <span>Insert Variable</span>
                        <button onclick="document.getElementById('varPickerModal').remove()" class="close-var-popup">×</button>
                    </div>
                    <div class="var-popup-list">
                        \${window.variableButtonsHTML || ''}
                    </div>
                  </div>
                \`;
                document.body.appendChild(modal);
            }
        }
        function insertVariable(inputId, value) {
            const el = document.getElementById(inputId);
            if (el) {
                const start = el.selectionStart;
                const end = el.selectionEnd;
                el.value = el.value.substring(0, start) + value + el.value.substring(end);
                el.focus();
                el.selectionStart = el.selectionEnd = start + value.length;
            }
            document.getElementById('varPickerModal')?.remove();
        }
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
        <style>
        input, textarea, select {
            width: 100%;
            margin-bottom: 14px;
            font-size: 16px;
            border-radius: 8px;
            border: 1.5px solid #b6b6d1;
            padding: 8px 12px;
            background: #f8f8fd;
            color: #202050;
            font-family: 'Inter', sans-serif;
            outline: none;
        }
        input:focus, textarea:focus, select:focus {  
            border-color: #367aff;  
            background: #f4f8ff;
        }
        label {  
            font-weight: 600;  
            color: #212245;  
            margin-bottom: 5px;  
            display: block;  
        }
        /* --- Styles for Custom Variable Popup --- */
        .custom-var-popup {
            background: linear-gradient(97deg,#eaf3ff 65%,#fafdff 100%);
            border: 1.5px solid #b3d1fa;
            border-radius: 16px;
            box-shadow: 0 4px 22px #83befc33;
            width: 345px;
            max-width: 95vw;
            padding: 0 0 16px 0;
            display: flex;
            flex-direction: column;
            animation: fadeInVarPopup .19s;
        }
        @keyframes fadeInVarPopup { from { opacity:0; transform: scale(0.98);} to {opacity:1;} }
        .var-popup-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 18px 7px 18px;
            border-bottom: 1px solid #dde9f8;
            font-family: 'Lexend', 'Inter', sans-serif;
            font-size: 20px;
            font-weight: 800;
            color: #2172c9;
        }
        .close-var-popup {
            background: none;
            border: none;
            color: #a2b4d7;
            font-size: 26px;
            font-weight: bold;
            cursor: pointer;
            margin-left: 10px;
            transition: color .18s;
        }
        .close-var-popup:hover { color: #2172c9; }
        .var-popup-list {
            display: grid;
            grid-template-columns: repeat(2,1fr);
            gap: 11px 12px;
            padding: 18px 16px 2px 16px;
        }
        .var-popup-list button {
            border: 1.5px solid #b3d1fa;
            background: #eaf3ff;
            color: #2276ce;
            border-radius: 10px;
            font-family: 'Roboto Mono', monospace;
            font-size: 15px;
            font-weight: 600;
            padding: 9px 0;
            cursor: pointer;
            transition: background .13s, color .13s, border-color .13s, transform .1s;
            box-shadow: 0 1.5px 8px #acd7fa22;
        }
        .var-popup-list button:hover {
            background: #d7eafe;
            color: #1760a9;
            border-color: #97c3ee;
            transform: translateY(-2px) scale(1.05);
        }
        </style>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Chat Reply', editReplyForm));
    } catch (error) {
        console.error('Error fetching reply for edit:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading reply for edit.</p><br><a href="/admin/reply-list">Back to List</a>'));
    }
});

app.post('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const { value } = req.body;
    try {
        await CustomVariable.findByIdAndUpdate(req.params.id, { value });
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error updating custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', `<p>Error updating custom variable.</p><br><a href="/admin/edit-custom-variable/${req.params.id}">Try again</a>`));
    }
});

// Delete custom variable
app.get('/admin/delete-custom-variable/:id', isAuthenticated, async (req, res) => {
    try {
        await CustomVariable.findByIdAndDelete(req.params.id);
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error deleting custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting custom variable.</p><br><a href="/admin/custom-variables">Back to List</a>'));
    }
});

// ========== SERVER START ==========
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});