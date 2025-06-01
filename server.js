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
        const salt = await bcrypt.genGenSalt(10); // Fixed: bcrypt.genSalt -> bcrypt.genGenSalt
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
    sendMethod: { type: String, enum: ['random', 'all', 'once'], default: 'random' }
});
const ChatReply = mongoose.model('ChatReply', ChatReplySchema);

// --- NEW CODE: Custom Variable Schema ---
const CustomVariableSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., "random_custom_1_HEY"
    value: { type: String, required: true }
});
const CustomVariable = mongoose.model('CustomVariable', CustomVariableSchema);
// --- END NEW CODE ---

app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(session({
    secret: 'MySuperStrongSecretKey!', // CHANGE THIS IN PRODUCTION!
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

// CHATBOT API (modified to use handleReplySend with await)
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";

    // 🆕 First-time welcome
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: await handleReplySend(welcomeReply) });
            }
        } catch (e) {
            console.error("Welcome message error:", e);
        }
    }

    try {
        // 1. Exact Match
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) {
            return res.json({ reply: await handleReplySend(exact) });
        }

        // 2. Pattern Matching
        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: await handleReplySend(reply) });
            }
        }

        // 3. Regex Matching
        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                if (new RegExp(reply.pattern, 'i').test(userMessage)) {
                    return res.json({ reply: await handleReplySend(reply) });
                }
            } catch (e) { /* Regex compilation error, skip */ }
        }

        // 4. Default Fallback
        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: await handleReplySend(fallback) });

    } catch (e) {
        console.error(e);
        return res.json({ reply: "Nobi Bot error: try again later." });
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

// ADMIN DASHBOARD (modified to include Custom Variables link)
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    const dashboardContent = `
        <h1>Welcome Admin: ${req.session.username}</h1>
        <div class="admin-links">
            <a href="/admin/add-chat-replies">Add Chat Reply</a>
            <a href="/admin/reply-list">View Replies</a>
            <a href="/admin/custom-variables">Manage Custom Variables</a> <a href="/admin/logout">Logout</a>
        </div>`;
    res.send(getHtmlTemplate('Admin Dashboard', dashboardContent));
});

// LOGOUT
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// ADD REPLY FORM (modified for variable insertion UI)
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
        <button type="button" id="insertVariableBtn" style="margin-top: 5px; padding: 8px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Insert Variable</button>
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

    <div id="variableModal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; overflow:auto; background-color: rgba(0,0,0,0.4);">
        <div style="background-color:#fefefe; margin: 10% auto; padding:20px; border:1px solid #888; width:80%; max-width:600px; border-radius: 8px; position: relative;">
            <span id="closeModalBtn" style="color:#aaa; float:right; font-size:28px; font-weight:bold; cursor:pointer;">&times;</span>
            <h3>Select Variable to Insert</h3>
            <input type="text" id="variableSearch" placeholder="Search variables..." style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;">
            <div id="variableList" style="max-height:300px; overflow-y:auto; border:1px solid #eee; padding:5px; border-radius:4px;">
                </div>
            <button type="button" onclick="document.getElementById('variableModal').style.display='none'" style="margin-top:15px; padding:8px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
    </div>
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

    // --- NEW JAVASCRIPT FOR VARIABLE MODAL ---
    document.addEventListener('DOMContentLoaded', () => {
        handleTypeChange(); // Call this to set initial field visibility

        const insertVariableBtn = document.getElementById('insertVariableBtn');
        const variableModal = document.getElementById('variableModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const variableList = document.getElementById('variableList');
        const variableSearch = document.getElementById('variableSearch');
        const repliesTextarea = document.getElementById('replies');

        let allVariables = []; // To store all variables including custom ones

        const defaultVariables = [
            // Date/Time
            { name: '%DAYOFMONTH%', type: 'Date/Time' },
            { name: '%DAYOFMONTH_SHORT%', type: 'Date/Time' },
            { name: '%MONTH%', type: 'Date/Time' },
            { name: '%MONTH_SHORT%', type: 'Date/Time' },
            { name: '%YEAR%', type: 'Date/Time' },
            { name: '%YEAR_SHORT%', type: 'Date/Time' },
            { name: '%DAYNAME%', type: 'Date/Time' },
            { name: '%DAYNAME_SHORT%', type: 'Date/Time' },
            { name: '%HOUR%', type: 'Date/Time' }, // 24-hour format
            { name: '%MINUTE%', type: 'Date/Time' },
            { name: '%SECOND%', type: 'Date/Time' },
            { name: '%TIMESTAMP%', type: 'Date/Time' },
            { name: '%HOUR12%', type: 'Date/Time' },
            { name: '%HOUR12_WITH_AMPM%', type: 'Date/Time' },
            { name: '%HOUR24%', type: 'Date/Time' }, // Same as %HOUR%
            { name: '%AMPM%', type: 'Date/Time' }, // AM or PM
            { name: '%DAYOFYEAR%', type: 'Date/Time' },
            { name: '%WEEKOFYEAR%', type: 'Date/Time' },
            // Random Generators
            { name: '%RANDOM_ASCII_SYMBOL_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_A-Z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_A-Z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_A-Z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_A-Z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_CUSTOM_<LENGTH>_<OPT1,OPT2,...>%', type: 'Random' },
            { name: '%RANDOM_NUMBER_<MIN>-<MAX>%', type: 'Random' },
            // Placeholder for advanced variables (will need backend integration later)
            { name: '%RECEIVED_MESSAGE_<MAXLENGTH>%', type: 'Advanced (Placeholder)' },
            { name: '%PREVIOUS_MESSAGE_<RULEID1,RULEID2,...>_<OFFSET>%', type: 'Advanced (Placeholder)' },
            { name: '%REPLY_COUNT_OVERALL%', type: 'Advanced (Placeholder)' },
            { name: '%RULE_ID%', type: 'Advanced (Placeholder)' },
            { name: '%NAME%', type: 'Advanced (Placeholder)' }, // User's name
            { name: '%CAPTURING_GROUP_<ID>%', type: 'Advanced (Placeholder)' }, // For Regex captures
        ];

        async function loadVariables() {
            try {
                const response = await fetch('/api/custom-variables'); // New API endpoint to fetch custom variables
                const customVars = await response.json();
                allVariables = [
                    ...defaultVariables,
                    ...customVars.map(v => ({ name: `%${v.name}%`, type: 'Custom', value: v.value }))
                ];
                displayVariables(allVariables);
            } catch (error) {
                console.error('Error loading variables:', error);
                variableList.innerHTML = '<p>Error loading variables. Please try again.</p>';
            }
        }

        function displayVariables(variablesToDisplay) {
            variableList.innerHTML = '';
            if (variablesToDisplay.length === 0) {
                variableList.innerHTML = '<p>No variables found.</p>';
                return;
            }

            const groupedVariables = variablesToDisplay.reduce((acc, varObj) => {
                (acc[varObj.type] = acc[varObj.type] || []).push(varObj);
                return acc;
            }, {});

            // Sort types for consistent display order
            const sortedTypes = ['Date/Time', 'Random', 'Custom', 'Advanced (Placeholder)'].filter(type => groupedVariables[type]);

            sortedTypes.forEach(type => {
                const typeHeader = document.createElement('h4');
                typeHeader.textContent = type;
                typeHeader.style.marginTop = '10px';
                typeHeader.style.marginBottom = '5px';
                typeHeader.style.color = '#333';
                variableList.appendChild(typeHeader);

                groupedVariables[type].forEach(varObj => {
                    const varItem = document.createElement('div');
                    varItem.className = 'variable-item';
                    varItem.style.padding = '8px';
                    varItem.style.borderBottom = '1px solid #eee';
                    varItem.style.cursor = 'pointer';
                    varItem.style.backgroundColor = '#f9f9f9';
                    varItem.style.marginBottom = '2px';
                    varItem.style.borderRadius = '3px';
                    varItem.style.transition = 'background-color 0.2s';
                    varItem.onmouseover = () => varItem.style.backgroundColor = '#e6e6e6';
                    varItem.onmouseout = () => varItem.style.backgroundColor = '#f9f9f9';


                    varItem.innerHTML = `<strong>${varObj.name}</strong> ${varObj.type === 'Custom' ? `<small>(Value: ${varObj.value.slice(0, 50)}${varObj.value.length > 50 ? '...' : ''})</small>` : ''}`;

                    varItem.onclick = () => {
                        const cursorPos = repliesTextarea.selectionStart;
                        const textBefore = repliesTextarea.value.substring(0, cursorPos);
                        const textAfter = repliesTextarea.value.substring(cursorPos, repliesTextarea.value.length);
                        repliesTextarea.value = textBefore + varObj.name + textAfter;
                        repliesTextarea.selectionStart = repliesTextarea.selectionEnd = cursorPos + varObj.name.length;
                        variableModal.style.display = 'none';
                        repliesTextarea.focus(); // Focus back on textarea
                    };
                    variableList.appendChild(varItem);
                });
            });
        }
    }

    insertVariableBtn.addEventListener('click', () => {
        loadVariables(); // Load and display variables every time button is clicked
        variableModal.style.display = 'block';
        variableSearch.value = ''; // Clear search on open
        variableSearch.focus(); // Focus search input
    });

    closeModalBtn.addEventListener('click', () => {
        variableModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == variableModal) {
            variableModal.style.display = 'none';
        }
    });

    variableSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredVariables = allVariables.filter(varObj =>
            varObj.name.toLowerCase().includes(searchTerm) ||
            (varObj.type === 'Custom' && varObj.value.toLowerCase().includes(searchTerm))
        );
        displayVariables(filteredVariables);
    });
    });
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
        <div class="drag-handle" title="Drag to reorder">⠿</div>
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
    display: flex;
    align-items: center;
    gap: 15px;
    user-select: none;
    cursor: grab;
    background: #fff;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    transition: transform 0.2s;
}

.reply-item:active {
    cursor: grabbing;
    transform: scale(1.02);
}

.drag-handle {
    font-size: 20px;
    color: #999;
    cursor: grab;
    user-select: none;
}
.drag-handle:active {
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
            if (!e.target.classList.contains('drag-handle')) {
                e.preventDefault(); // prevent drag unless it's on icon
                return;
            }
            dragged = e.target.closest('li.reply-item');
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

// EDIT REPLY (modified for variable insertion UI)
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
        <button type="button" id="insertVariableBtn" style="margin-top: 5px; padding: 8px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Insert Variable</button>
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

    <div id="variableModal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; overflow:auto; background-color: rgba(0,0,0,0.4);">
        <div style="background-color:#fefefe; margin: 10% auto; padding:20px; border:1px solid #888; width:80%; max-width:600px; border-radius: 8px; position: relative;">
            <span id="closeModalBtn" style="color:#aaa; float:right; font-size:28px; font-weight:bold; cursor:pointer;">&times;</span>
            <h3>Select Variable to Insert</h3>
            <input type="text" id="variableSearch" placeholder="Search variables..." style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ddd; border-radius:4px;">
            <div id="variableList" style="max-height:300px; overflow-y:auto; border:1px solid #eee; padding:5px; border-radius:4px;">
                </div>
            <button type="button" onclick="document.getElementById('variableModal').style.display='none'" style="margin-top:15px; padding:8px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
    </div>
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

        // --- NEW JAVASCRIPT FOR VARIABLE MODAL (Copied from Add Reply Form) ---
        const insertVariableBtn = document.getElementById('insertVariableBtn');
        const variableModal = document.getElementById('variableModal');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const variableList = document.getElementById('variableList');
        const variableSearch = document.getElementById('variableSearch');
        const repliesTextarea = document.getElementById('replies');

        let allVariables = [];

        const defaultVariables = [
            // Date/Time
            { name: '%DAYOFMONTH%', type: 'Date/Time' },
            { name: '%DAYOFMONTH_SHORT%', type: 'Date/Time' },
            { name: '%MONTH%', type: 'Date/Time' },
            { name: '%MONTH_SHORT%', type: 'Date/Time' },
            { name: '%YEAR%', type: 'Date/Time' },
            { name: '%YEAR_SHORT%', type: 'Date/Time' },
            { name: '%DAYNAME%', type: 'Date/Time' },
            { name: '%DAYNAME_SHORT%', type: 'Date/Time' },
            { name: '%HOUR%', type: 'Date/Time' }, // 24-hour format
            { name: '%MINUTE%', type: 'Date/Time' },
            { name: '%SECOND%', type: 'Date/Time' },
            { name: '%TIMESTAMP%', type: 'Date/Time' },
            { name: '%HOUR12%', type: 'Date/Time' },
            { name: '%HOUR12_WITH_AMPM%', type: 'Date/Time' },
            { name: '%HOUR24%', type: 'Date/Time' },
            { name: '%AMPM%', type: 'Date/Time' },
            { name: '%DAYOFYEAR%', type: 'Date/Time' },
            { name: '%WEEKOFYEAR%', type: 'Date/Time' },
            // Random Generators
            { name: '%RANDOM_ASCII_SYMBOL_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_A-Z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_A-Z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_A-Z_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_a-z_A-Z_0-9_<LENGTH>%', type: 'Random' },
            { name: '%RANDOM_CUSTOM_<LENGTH>_<OPT1,OPT2,...>%', type: 'Random' },
            { name: '%RANDOM_NUMBER_<MIN>-<MAX>%', type: 'Random' },
            // Placeholder for advanced variables (will need backend integration later)
            { name: '%RECEIVED_MESSAGE_<MAXLENGTH>%', type: 'Advanced (Placeholder)' },
            { name: '%PREVIOUS_MESSAGE_<RULEID1,RULEID2,...>_<OFFSET>%', type: 'Advanced (Placeholder)' },
            { name: '%REPLY_COUNT_OVERALL%', type: 'Advanced (Placeholder)' },
            { name: '%RULE_ID%', type: 'Advanced (Placeholder)' },
            { name: '%NAME%', type: 'Advanced (Placeholder)' }, // User's name
            { name: '%CAPTURING_GROUP_<ID>%', type: 'Advanced (Placeholder)' }, // For Regex captures
        ];

        async function loadVariables() {
            try {
                const response = await fetch('/api/custom-variables');
                const customVars = await response.json();
                allVariables = [
                    ...defaultVariables,
                    ...customVars.map(v => ({ name: `%${v.name}%`, type: 'Custom', value: v.value }))
                ];
                displayVariables(allVariables);
            } catch (error) {
                console.error('Error loading variables:', error);
                variableList.innerHTML = '<p>Error loading variables. Please try again.</p>';
            }
        }

        function displayVariables(variablesToDisplay) {
            variableList.innerHTML = '';
            if (variablesToDisplay.length === 0) {
                variableList.innerHTML = '<p>No variables found.</p>';
                return;
            }

            const groupedVariables = variablesToDisplay.reduce((acc, varObj) => {
                (acc[varObj.type] = acc[varObj.type] || []).push(varObj);
                return acc;
            }, {});

            const sortedTypes = ['Date/Time', 'Random', 'Custom', 'Advanced (Placeholder)'].filter(type => groupedVariables[type]);

            sortedTypes.forEach(type => {
                const typeHeader = document.createElement('h4');
                typeHeader.textContent = type;
                typeHeader.style.marginTop = '10px';
                typeHeader.style.marginBottom = '5px';
                typeHeader.style.color = '#333';
                variableList.appendChild(typeHeader);

                groupedVariables[type].forEach(varObj => {
                    const varItem = document.createElement('div');
                    varItem.className = 'variable-item';
                    varItem.style.padding = '8px';
                    varItem.style.borderBottom = '1px solid #eee';
                    varItem.style.cursor = 'pointer';
                    varItem.style.backgroundColor = '#f9f9f9';
                    varItem.style.marginBottom = '2px';
                    varItem.style.borderRadius = '3px';
                    varItem.style.transition = 'background-color 0.2s';
                    varItem.onmouseover = () => varItem.style.backgroundColor = '#e6e6e6';
                    varItem.onmouseout = () => varItem.style.backgroundColor = '#f9f9f9';

                    varItem.innerHTML = `<strong>${varObj.name}</strong> ${varObj.type === 'Custom' ? `<small>(Value: ${varObj.value.slice(0, 50)}${varObj.value.length > 50 ? '...' : ''})</small>` : ''}`;

                    varItem.onclick = () => {
                        const cursorPos = repliesTextarea.selectionStart;
                        const textBefore = repliesTextarea.value.substring(0, cursorPos);
                        const textAfter = repliesTextarea.value.substring(cursorPos, repliesTextarea.value.length);
                        repliesTextarea.value = textBefore + varObj.name + textAfter;
                        repliesTextarea.selectionStart = repliesTextarea.selectionEnd = cursorPos + varObj.name.length;
                        variableModal.style.display = 'none';
                        repliesTextarea.focus();
                    };
                    variableList.appendChild(varItem);
                });
            });
        }

        insertVariableBtn.addEventListener('click', () => {
            loadVariables();
            variableModal.style.display = 'block';
            variableSearch.value = '';
            variableSearch.focus();
        });

        closeModalBtn.addEventListener('click', () => {
            variableModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target == variableModal) {
                variableModal.style.display = 'none';
            }
        });

        variableSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredVariables = allVariables.filter(varObj =>
                varObj.name.toLowerCase().includes(searchTerm) ||
                (varObj.type === 'Custom' && varObj.value.toLowerCase().includes(searchTerm))
            );
            displayVariables(filteredVariables);
        });
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

// --- NEW CODE: Custom Variable Management Routes ---
// LIST CUSTOM VARIABLES
app.get('/admin/custom-variables', isAuthenticated, async (req, res) => {
    const customVariables = await CustomVariable.find().sort({ name: 1 });

    const listItems = customVariables.map(v => `
        <li>
            <strong>%${v.name}%</strong>: ${v.value.slice(0, 100)}${v.value.length > 100 ? '...' : ''}
            <a href="/admin/edit-custom-variable/${v._id}">✏️ Edit</a>
            <a href="/admin/delete-custom-variable/${v._id}" onclick="return confirm('Delete this custom variable?')">🗑️ Delete</a>
        </li>
    `).join('');

    const content = `
    <h2>Custom Variables</h2>
    <a href="/admin/add-custom-variable" class="button">Add New Custom Variable</a>
    <ul class="custom-var-list">${listItems}</ul>
    <a href="/admin/dashboard">← Back to Dashboard</a>

    <style>
        .custom-var-list {
            list-style: none;
            padding: 0;
            margin-top: 20px;
        }
        .custom-var-list li {
            background: #f9f9f9;
            border: 1px solid #ddd;
            padding: 10px 15px;
            margin-bottom: 10px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .custom-var-list li strong {
            color: #0056b3;
            margin-right: 10px;
        }
        .custom-var-list li a {
            margin-left: 10px;
        }
        .button {
            display: inline-block;
            background-color: #007bff;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            text-decoration: none;
            margin-bottom: 15px;
        }
        .button:hover {
            background-color: #0056b3;
        }
    </style>
    `;
    res.send(getHtmlTemplate('Custom Variables', content));
});

// ADD CUSTOM VARIABLE FORM
app.get('/admin/add-custom-variable', isAuthenticated, (req, res) => {
    const addCustomVarForm = `
    <form method="POST" action="/admin/add-custom-variable">
        <h2>Add Custom Variable</h2>
        <label for="name">Variable Name (e.g., random_custom_1_HEY):</label>
        <input name="name" id="name" placeholder="random_custom_1_BOTNAME" required pattern="random_custom_[0-9]+_[A-Z0-9_]+" title="Format: random_custom_ID_NAME (e.g., random_custom_1_HEY)" />
        <label for="value">Variable Value:</label>
        <textarea name="value" id="value" placeholder="e.g., Hello there! or Today is %dayname%" required></textarea>
        <button type="submit">Add Custom Variable</button>
    </form>
    <br>
    <a href="/admin/custom-variables">← Back to Custom Variables List</a>
    `;
    res.send(getHtmlTemplate('Add Custom Variable', addCustomVarForm));
});

app.post('/admin/add-custom-variable', isAuthenticated, async (req, res) => {
    const { name, value } = req.body;
    try {
        const newCustomVar = new CustomVariable({ name, value });
        await newCustomVar.save();
        res.redirect('/admin/custom-variables');
    } catch (e) {
        console.error("Error adding custom variable:", e);
        res.send(getHtmlTemplate('Error', `<p>Error adding variable. Name might be duplicated or format is wrong. <a href="/admin/add-custom-variable">Try again</a></p>`));
    }
});

// EDIT CUSTOM VARIABLE
app.get('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const customVar = await CustomVariable.findById(req.params.id);
    if (!customVar) {
        return res.send(getHtmlTemplate('Error', '<p>Custom variable not found.</p><br><a href="/admin/custom-variables">Back to Custom Variables List</a>'));
    }
    const editCustomVarForm = `
    <form method="POST" action="/admin/edit-custom-variable/${customVar._id}">
        <h2>Edit Custom Variable</h2>
        <label for="name">Variable Name (e.g., random_custom_1_HEY):</label>
        <input name="name" id="name" value="${customVar.name}" readonly />
        <label for="value">Variable Value:</label>
        <textarea name="value" id="value" required>${customVar.value}</textarea>
        <button type="submit">Update Custom Variable</button>
    </form>
    <br>
    <a href="/admin/custom-variables">← Back to Custom Variables List</a>
    `;
    res.send(getHtmlTemplate('Edit Custom Variable', editCustomVarForm));
});

app.post('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const { value } = req.body;
    try {
        await CustomVariable.findByIdAndUpdate(req.params.id, { value });
        res.redirect('/admin/custom-variables');
    } catch (e) {
        console.error("Error updating custom variable:", e);
        res.send(getHtmlTemplate('Error', `<p>Error updating variable. <a href="/admin/edit-custom-variable/${req.params.id}">Try again</a></p>`));
    }
});

// DELETE CUSTOM VARIABLE
app.get('/admin/delete-custom-variable/:id', isAuthenticated, async (req, res) => {
    await CustomVariable.findByIdAndDelete(req.params.id);
    res.redirect('/admin/custom-variables');
});
// --- END NEW CODE: Custom Variable Management Routes ---

// --- NEW API ENDPOINT TO FETCH CUSTOM VARIABLES FOR JS MODAL ---
app.get('/api/custom-variables', isAuthenticated, async (req, res) => {
    try {
        const customVariables = await CustomVariable.find({}, 'name value'); // Only fetch name and value
        res.json(customVariables);
    } catch (error) {
        console.error('Error fetching custom variables:', error);
        res.status(500).json({ message: 'Error fetching custom variables' });
    }
});
// --- END NEW API ENDPOINT ---


// --- NEW CODE: Variable Replacement Function ---
async function applyVariableReplacements(text) {
    const customVars = await CustomVariable.find({});
    const customVarMap = new Map();
    customVars.forEach(v => customVarMap.set(v.name.toUpperCase(), v.value));

    let replacedText = text;
    let maxIterations = 5; // Limit nested replacements
    let iterationCount = 0;

    while (iterationCount < maxIterations) {
        let changesMade = false;

        const now = new Date();
        const defaultReplacements = {
            '%DAYOFMONTH%': now.getDate().toString().padStart(2, '0'),
            '%MONTH%': now.toLocaleString('en-US', { month: 'long' }),
            '%YEAR%': now.getFullYear().toString(),
            '%HOUR%': now.getHours().toString().padStart(2, '0'), // 24-hour format
            '%MINUTE%': now.getMinutes().toString().padStart(2, '0'),
            '%SECOND%': now.getSeconds().toString().padStart(2, '0'),
            '%DAYNAME%': now.toLocaleString('en-US', { weekday: 'long' }),
            '%TIMESTAMP%': now.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                hour12: true
            }),
            // --- NEW DATE/TIME VARS ---
            '%DAYOFMONTH_SHORT%': now.getDate().toString(), // No leading zero
            '%MONTH_SHORT%': now.toLocaleString('en-US', { month: 'short' }),
            '%DAYNAME_SHORT%': now.toLocaleString('en-US', { weekday: 'short' }),
            '%YEAR_SHORT%': now.getFullYear().toString().slice(-2), // Last two digits of year
            '%HOUR12%': now.toLocaleString('en-US', { hour: 'numeric', hour12: true }).replace(/ AM| PM/, ''), // 12-hour without AM/PM
            '%HOUR12_WITH_AMPM%': now.toLocaleString('en-US', { hour: 'numeric', hour12: true }), // 12-hour with AM/PM
            '%HOUR24%': now.getHours().toString().padStart(2, '0'), // Same as %HOUR%
            '%AMPM%': now.toLocaleString('en-US', { hour: 'numeric', hour12: true }).slice(-2).trim(), // AM or PM
            '%DAYOFYEAR%': Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)).toString(),
            '%WEEKOFYEAR%': Math.ceil((now - new Date(now.getFullYear(), 0, 1) + new Date(now.getFullYear(), 0, 1).getDay() * 86400000) / (7 * 86400000)).toString(),
            // --- END NEW DATE/TIME VARS ---
        };

        for (const [key, value] of Object.entries(defaultReplacements)) {
            const regex = new RegExp(key.replace(/%/g, '\\%'), 'gi');
            if (replacedText.match(regex)) {
                replacedText = replacedText.replace(regex, value);
                changesMade = true;
            }
        }

        // --- NEW RANDOM VARS ---
        // %RANDOM_ASCII_SYMBOL_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_ASCII_SYMBOL_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_A-Z_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_A-Z_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_A-Z_0-9_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_A-Z_0-9_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_a-z_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_a-z_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'abcdefghijklmnopqrstuvwxyz';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_a-z_0-9_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_a-z_0-9_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_a-z_A-Z_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_a-z_A-Z_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_a-z_A-Z_0-9_<LENGTH>%
        replacedText = replacedText.replace(/%RANDOM_a-z_A-Z_0-9_(\d+)%/gi, (match, lengthStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;
            let result = '';
            const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            changesMade = true;
            return result;
        });


        // %RANDOM_CUSTOM_<LENGTH>_<OPT1,OPT2,OPT3>% (e.g., %RANDOM_CUSTOM_3_APPLE,BANANA,CHERRY%)
        replacedText = replacedText.replace(/%RANDOM_CUSTOM_(\d+)_([^%]+)%/gi, (match, lengthStr, optionsStr) => {
            const length = parseInt(lengthStr);
            if (isNaN(length) || length <= 0) return match;

            const options = optionsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (options.length === 0) return match;

            let result = '';
            for (let i = 0; i < length; i++) {
                result += options[Math.floor(Math.random() * options.length)];
            }
            changesMade = true;
            return result;
        });

        // %RANDOM_NUMBER_<A>-<B>% (e.g., %RANDOM_NUMBER_1-100%)
        replacedText = replacedText.replace(/%RANDOM_NUMBER_(\d+)-(\d+)%/gi, (match, minStr, maxStr) => {
            const min = parseInt(minStr);
            const max = parseInt(maxStr);
            if (isNaN(min) || isNaN(max) || min > max) return match;
            changesMade = true;
            return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
        });
        // --- END NEW RANDOM VARS ---


        // Custom Variable Replacements
        for (const [name, value] of customVarMap.entries()) {
            const varPlaceholder = `%${name}%`;
            if (replacedText.includes(varPlaceholder)) {
                replacedText = replacedText.replace(new RegExp(varPlaceholder.replace(/%/g, '\\%'), 'gi'), value);
                changesMade = true;
            }
        }

        if (!changesMade) {
            break;
        }
        iterationCount++;
    }

    return replacedText;
}
// --- END NEW CODE ---

// handleReplySend (modified to use applyVariableReplacements)
async function handleReplySend(replyObj) { // MODIFIED to be async
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";

    let finalReply = "";

    switch (replyObj.sendMethod) {
        case 'once':
            finalReply = replyObj.replies[0];
            break;
        case 'all':
            finalReply = replyObj.replies.join('\n');
            break;
        case 'random':
        default:
            finalReply = randomReply(replyObj.replies);
            break;
    }

    // Apply variable replacements to the final reply string
    finalReply = await applyVariableReplacements(finalReply); // NEW LINE: Apply replacements

    return finalReply;
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
