const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Set your MongoDB URI. It's recommended to use environment variables for this in production.
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Schemas ---

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

// Custom Variable Schema (This was present in your initial code, but not fully integrated into handleReplySend initially)
const CustomVariableSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true }
});
const CustomVariable = mongoose.model('CustomVariable', CustomVariableSchema);


// --- Express Middleware ---
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'MySuperStrongSecretKey!', // Use environment variable for secret
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' directory

// --- Helper Functions ---

// Middleware to check if user is authenticated (admin)
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

// Function to get a random reply from an array
const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Original handleReplySend Logic (Before Nested Variables) ---
async function handleReplySend(replyObj, userMessage, matchedRegexGroups = null, reqSession = {}) {
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

    // Custom Variables (as was in your original code, without iterative replacement)
    try {
        const customVariables = await CustomVariable.find({});
        for (const variable of customVariables) {
            const regex = new RegExp(`%${variable.name}%`, 'g');
            replyText = replyText.replace(regex, variable.value);
        }
    } catch (error) {
        console.error("Error fetching custom variables for replacement:", error);
    }

    // Using 'en-IN' locale for date and time formatting relevant to India (Patna, Bihar)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
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

    if (matchedRegexGroups) {
        replyText = replyText.replace(/%capturing_group_(\d+)%/g, (match, groupId) => {
            return matchedRegexGroups[parseInt(groupId)] || '';
        });
    }

    // 2. Name variables
    const userName = reqSession.username || 'User';
    replyText = replyText.replace(/%name%/g, userName);
    replyText = replyText.replace(/%first_name%/g, userName.split(' ')[0] || '');
    replyText = replyText.replace(/%last_name%/g, userName.split(' ').slice(1).join(' ') || '');
    replyText = replyText.replace(/%chat_name%/g, userName);

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

    replyText = replyText.replace(/%day_of_year%/g, 'N/A_DayOfYear');
    replyText = replyText.replace(/%week_of_year%/g, 'N/A_WeekOfYear');

    // 4. AutoResponder variables
    replyText = replyText.replace(/%rule_id%/g, replyObj._id ? replyObj._id.toString() : 'N/A');

    // 5. Random variables
    replyText = replyText.replace(/%rndm_num_(\d+)_(\d+)%/g, (match, min, max) => {
        return String(Math.floor(Math.random() * (parseInt(min)) - parseInt(max) + 1) + parseInt(min));
    });

    replyText = replyText.replace(/%rndm_custom_(\d+)_(.*?)%/g, (match, len, charSet) => {
        len = parseInt(len);
        const chars = charSet.split(',').map(s => s.trim());
        let result = '';
        for (let i = 0; i < len; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    });

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


    return replyText;
}


// --- Public Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- Chatbot API Route ---
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that.";
    let matchedRegexGroups = null; // To store capturing groups if regex matches

    // First-time welcome
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: await handleReplySend(welcomeReply, userMessage, null, req.session) }); // Await here
            }
        } catch (e) {
            console.error("Welcome message error:", e);
        }
    }

    try {
        // 1. Exact Match
        const exact = await ChatReply.findOne({ type: 'exact_match', keyword: userMessage.toLowerCase() }).sort({ priority: -1 });
        if (exact) {
            return res.json({ reply: await handleReplySend(exact, userMessage, null, req.session) }); // Await here
        }

        // 2. Pattern Matching
        const patterns = await ChatReply.find({ type: 'pattern_matching' }).sort({ priority: -1 });
        for (const reply of patterns) {
            const keywords = reply.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => userMessage.toLowerCase().includes(k))) {
                return res.json({ reply: await handleReplySend(reply, userMessage, null, req.session) }); // Await here
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
                    return res.json({ reply: await handleReplySend(reply, userMessage, matchedRegexGroups, req.session) }); // Await here
                }
            } catch (e) {
                console.error("Regex pattern error:", e);
            }
        }

        // 4. Default Fallback
        const fallback = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (fallback) return res.json({ reply: await handleReplySend(fallback, userMessage, null, req.session) }); // Await here

    } catch (e) {
        console.error(e);
        botReply = "Nobi Bot error: try again later.";
    }

    res.json({ reply: botReply });
});


// --- Admin Routes ---

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
    req.session.username = username; // Store username in session
    res.redirect('/admin/dashboard');
});

// ADMIN DASHBOARD
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

// LOGOUT
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// ADD REPLY FORM
app.get('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
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
     res.set({
      'Content-Type': 'text/html',
      'Content-Disposition': 'inline'
    }).send(getHtmlTemplate('Add Chat Reply', addReplyForm));
});
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    if (!replies) return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>'));

    // If setting a new default message, unset existing ones
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
    <li class="reply-item">
        <strong>${r.ruleName}</strong> (${r.type})
        ${r.keyword ? ` - Keywords: ${r.keyword}` : ''}
        ${r.pattern ? ` - Pattern: <code>${r.pattern}</code>` : ''}
        - Replies: ${r.replies.length} message(s)
        - Send Method: ${r.sendMethod}
        - Priority: ${r.priority}
        <a href="/admin/edit-reply/${r._id}">Edit</a>
        <a href="/admin/delete-reply/${r._id}" onclick="return confirm('Delete this rule?')">Delete</a>
    </li>
`).join('');

    const content = `
    <h2>Chat Reply List</h2>
    <ul class="reply-list">${listItems}</ul>
    <a href="/admin/dashboard">← Back to Dashboard</a>
    <style>
        .reply-list {
            list-style: none;
            padding: 0;
            margin: 20px 0;
        }
        .reply-list li {
            background: #f9f9f9;
            border: 1px solid #ddd;
            padding: 10px 15px;
            margin-bottom: 8px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
        }
        .reply-list li strong {
            margin-right: 10px;
            color: #333;
        }
        .reply-list li a {
            margin-left: 15px;
            text-decoration: none;
            color: #2563eb;
        }
        .reply-list li a:hover {
            text-decoration: underline;
        }
    </style>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Chat Reply List', content));
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
app.get('/admin/custom-variables', isAuthenticated, async (req, res) => {
    try {
        const variables = await CustomVariable.find({});
        const listItems = variables.map(v => `
            <li>
                <strong>%${v.name}%</strong>: ${v.value}
                <a href="/admin/edit-custom-variable/${v._id}">Edit</a>
                <a href="/admin/delete-custom-variable/${v._id}" onclick="return confirm('Delete this variable?')">Delete</a>
            </li>
        `).join('');

        const content = `
            <h2>Manage Custom Variables</h2>
            <ul class="custom-var-list">${listItems}</ul>
            <a href="/admin/add-custom-variable">Add New Variable</a>
            <a href="/admin/dashboard">← Back to Dashboard</a>
            <style>
                .custom-var-list {
                    list-style: none;
                    padding: 0;
                    margin: 20px 0;
                }
                .custom-var-list li {
                    background: #f9f9f9;
                    border: 1px solid #ddd;
                    padding: 10px 15px;
                    margin-bottom: 8px;
                    border-radius: 5px;
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .custom-var-list li strong {
                    margin-right: 10px;
                    color: #333;
                }
                .custom-var-list li a {
                    margin-left: 15px;
                    text-decoration: none;
                    color: #2563eb;
                }
                .custom-var-list li a:hover {
                    text-decoration: underline;
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
        if (error.code === 11000) { // Duplicate key error
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
