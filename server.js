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
    sendMethod: { type: String, enum: ['random', 'all', 'once'], default: 'random' }
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
app.use(express.static(path.join(__dirname, 'public')));

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
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        ${bodyContent}
    </body>
    </html>
    `;
}

// --- Custom Replacements Logic ---
function handleReplySend(replyObj, userMessage, matchedRegexGroups = null, reqSession = {}) {
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";

    let replyText;

    switch (replyObj.sendMethod) {
        case 'once':
            replyText = replyObj.replies[0];
            break;
        case 'all':
            replyText = replyObj.replies.join('\n');
            break;
        case 'random':
        default:
            replyText = randomReply(replyObj.replies);
            break;
    }

    const now = new Date();
    // Using 'en-IN' locale for date and time formatting relevant to India
    const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }; // 2-digit for consistent hh:mm:ss
    const optionsHourShort = { hour: 'numeric', hour12: true };
    const optionsHour24 = { hour: '2-digit', hourCycle: 'h23' };
    const optionsHour24Short = { hour: 'numeric', hourCycle: 'h23' };
    const optionsMonthName = { month: 'long' };
    const optionsMonthNameShort = { month: 'short' };
    const optionsDayOfWeek = { weekday: 'long' };
    const optionsDayOfWeekShort = { weekday: 'short' };


    // 1. Message variables
    replyText = replyText.replace(/%message%/g, userMessage || '');
    replyText = replyText.replace(/%message_(\d+)%/g, (match, len) => (userMessage || '').substring(0, parseInt(len)));

    // Capturing groups (only applicable if used with Expert Pattern Matching and regex matched)
    if (matchedRegexGroups) {
        replyText = replyText.replace(/%capturing_group_(\d+)%/g, (match, groupId) => {
            return matchedRegexGroups[parseInt(groupId)] || '';
        });
    }

    // 2. Name variables
    // For now, assuming a default 'User' or a session username for demonstration
    // In a real app, you'd get this from authenticated user data or a chat platform API
    const userName = reqSession.username || 'User'; // If admin is logged in, use admin username
    replyText = replyText.replace(/%name%/g, userName);
    replyText = replyText.replace(/%first_name%/g, userName.split(' ')[0] || '');
    replyText = replyText.replace(/%last_name%/g, userName.split(' ').slice(1).join(' ') || ''); // Gets everything after the first word
    replyText = replyText.replace(/%chat_name%/g, userName); // Assuming chat name is same as user name for 1-1 chats

    // 3. Date & Time variables
    replyText = replyText.replace(/%date%/g, now.toLocaleDateString('en-IN', optionsDate));
    replyText = replyText.replace(/%time%/g, now.toLocaleTimeString('en-IN', optionsTime));

    replyText = replyText.replace(/%hour%/g, now.toLocaleTimeString('en-IN', optionsHourShort).split(' ')[0]);
    replyText = replyText.replace(/%hour_short%/g, now.toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true }).split(' ')[0]);
    replyText = replyText.replace(/%hour_of_day%/g, now.toLocaleTimeString('en-IN', optionsHour24).split(' ')[0]);
    replyText = replyText.replace(/%hour_of_day_short%/g, now.toLocaleTimeString('en-IN', optionsHour24Short).split(' ')[0]);
    replyText = replyText.replace(/%minute%/g, String(now.getMinutes()).padStart(2, '0'));
    replyText = replyText.replace(/%second%/g, String(now.getSeconds()).padStart(2, '0'));
    replyText = replyText.replace(/%millisecond%/g, String(now.getMilliseconds()).padStart(3, '0'));
    replyText = replyText.replace(/%am\/pm%/g, now.getHours() >= 12 ? 'pm' : 'am');

    replyText = replyText.replace(/%day_of_month%/g, String(now.getDate()).padStart(2, '0'));
    replyText = replyText.replace(/%day_of_month_short%/g, String(now.getDate()));
    replyText = replyText.replace(/%month%/g, String(now.getMonth() + 1).padStart(2, '0'));
    replyText = replyText.replace(/%month_short%/g, String(now.getMonth() + 1));
    replyText = replyText.replace(/%month_name%/g, now.toLocaleDateString('en-IN', optionsMonthName));
    replyText = replyText.replace(/%month_name_short%/g, now.toLocaleDateString('en-IN', optionsMonthNameShort));
    replyText = replyText.replace(/%year%/g, String(now.getFullYear()));
    replyText = replyText.replace(/%year_short%/g, String(now.getFullYear()).slice(-2));
    replyText = replyText.replace(/%day_of_week%/g, now.toLocaleDateString('en-IN', optionsDayOfWeek));
    replyText = replyText.replace(/%day_of_week_short%/g, now.toLocaleDateString('en-IN', optionsDayOfWeekShort));

    // Day of year and Week of year (more complex, require external lib or careful calculation)
    // For simplicity, I'll add placeholders or basic implementation.
    // If you need exact Day of Year and Week of Year, consider a library like 'date-fns'.
    // Placeholder for now:
    replyText = replyText.replace(/%day_of_year%/g, 'N/A_DayOfYear');
    replyText = replyText.replace(/%week_of_year%/g, 'N/A_WeekOfYear');

    // Countdown variables are complex due to Unix timestamp conversion and live updating.
    // Skipping for now as they typically need frontend JS or more backend state management.

    // 4. AutoResponder variables
    replyText = replyText.replace(/%rule_id%/g, replyObj._id ? replyObj._id.toString() : 'N/A');

    // Skipping app_name, app_version, app_url as they are mobile app specific.
    // Skipping received_count, reply_count etc. as they require chat-specific state tracking for each user,
    // which is more complex than simple session-based tracking.

    // 5. Random variables
    replyText = replyText.replace(/%rndm_num_(\d+)_(\d+)%/g, (match, min, max) => {
        return String(Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min));
    });

    replyText = replyText.replace(/%rndm_custom_(\d+)_(.*?)%/g, (match, len, charSet) => {
        len = parseInt(len);
        const chars = charSet.split(/,(?![^[]*\])/).map(s => s.trim()); // Splits by comma, but not inside [] (if any)
        let result = '';
        for (let i = 0; i < len; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    });

    // Helper to generate random string from a character set
    const generateRandomString = (length, charSet) => {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charSet.charAt(Math.floor(Math.random() * charSet.length));
        }
        return result;
    };

    replyText = replyText.replace(/%rndm_abc_lower_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'abcdefghijklmnopqrstuvwxyz'));
    replyText = replyText.replace(/%rndm_abc_upper_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    replyText = replyText.replace(/%rndm_abc_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    replyText = replyText.replace(/%rndm_abcnum_lower_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'abcdefghijklmnopqrstuvwxyz0123456789'));
    replyText = replyText.replace(/%rndm_abcnum_upper_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'));
    replyText = replyText.replace(/%rndm_abcnum_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'));
    replyText = replyText.replace(/%rndm_ascii_(\d+)%/g, (match, len) => {
        let result = '';
        for (let i = 0; i < parseInt(len); i++) {
            result += String.fromCharCode(Math.floor(Math.random() * 95) + 32); // Printable ASCII (32-126)
        }
        return result;
    });
    replyText = replyText.replace(/%rndm_symbol_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'));
    replyText = replyText.replace(/%rndm_grawlix_(\d+)%/g, (match, len) => generateRandomString(parseInt(len), '#$%&@*!'));


    // Skipping URL encoded and previous message/reply variables for now due to complexity in current setup.
    // Skipping message processing time as it requires measuring execution time.

    return replyText;
}


// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// CHATBOT API
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";
    let matchedRegexGroups = null; // To store capturing groups if regex matches

    // 🆕 First-time welcome
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: handleReplySend(welcomeReply, userMessage, null, req.session) });
            }
        } catch (e) {
            console.error("Welcome message error:", e);
        }
    }

    try {
        // 1. Exact Match
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) {
            return res.json({ reply: handleReplySend(exact, userMessage, null, req.session) });
        }

        // 2. Pattern Matching
        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: handleReplySend(reply, userMessage, null, req.session) });
            }
        }

        // 3. Regex Matching (Expert Pattern Matching)
        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching', pattern: { $ne: null } }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                const regex = new RegExp(reply.pattern, 'i');
                const match = regex.exec(userMessage);
                if (match) {
                    matchedRegexGroups = match; // Store groups for replacement
                    return res.json({ reply: handleReplySend(reply, userMessage, matchedRegexGroups, req.session) });
                }
            } catch (e) {
                console.error("Regex pattern error:", e);
            }
        }

        // 4. Default Fallback
        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: handleReplySend(fallback, userMessage, null, req.session) });

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
    req.session.username = username; // Store username in session
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
        <small>
            **Available replacements:**<br>
            **Message:** %message%, %message_LENGTH%, %capturing_group_ID%<br>
            **Name:** %name%, %first_name%, %last_name%, %chat_name%<br>
            **Date & Time:** %date%, %time%, %hour%, %hour_short%, %hour_of_day%, %hour_of_day_short%, %minute%, %second%, %millisecond%, %am/pm%, %day_of_month%, %day_of_month_short%, %month%, %month_short%, %month_name%, %month_name_short%, %year%, %year_short%, %day_of_week%, %day_of_week_short%<br>
            **AutoResponder:** %rule_id%<br>
            **Random:** %rndm_num_A_B%, %rndm_custom_LENGTH_A,B,C%, %rndm_abc_lower_LENGTH%, %rndm_abc_upper_LENGTH%, %rndm_abc_LENGTH%, %rndm_abcnum_lower_LENGTH%, %rndm_abcnum_upper_LENGTH%, %rndm_abcnum_LENGTH%, %rndm_ascii_LENGTH%, %rndm_symbol_LENGTH%, %rndm_grawlix_LENGTH%
        </small>

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
        console.error('Error updating priorities:', err);
        res.status(500).json({ message: 'Server error: Could not update priorities.' });
    }
});

// START
app.listen(PORT, () => {
    console.log(`NOBITA Bot Server Running @ http://localhost:${PORT}`);
});
