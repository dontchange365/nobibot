const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
// const cors = require('cors'); // Uncomment if you need CORS, then also app.use(cors());

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB connection error:', err));

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

// NEW: ChatReply Schema and Model
const ChatReplySchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['welcome_message', 'exact_match', 'pattern_matching', 'expert_pattern_matching', 'default_message'],
        required: true
    },
    keyword: {
        type: String,
        trim: true,
        sparse: true
    },
    replies: {
        type: [String],
        required: true
    },
    pattern: {
        type: String,
        trim: true
    },
    priority: {
        type: Number,
        default: 0
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

ChatReplySchema.index({ type: 1, keyword: 1 }); // Index for type and keyword lookup

const ChatReply = mongoose.model('ChatReply', ChatReplySchema); // Make sure this is required if ChatReply.js exists


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// app.use(cors()); // Uncomment if you need CORS (after 'const cors = require('cors');' above)

app.use(session({
    secret: process.env.SESSION_SECRET || 'MySuperStrongAndVeryRandomSessionSecretKey123!@#ABCxyz',
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
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// Route to serve Nobi Bot chat (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chatbot API Endpoint (Updated to use ChatReply model)
app.post('/api/chatbot/message', async (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that. Can you please rephrase?"; // Default fallback

    try {
        // 1. Exact Match Check (High Priority)
        const exactMatchReply = await ChatReply.findOne({
            type: 'exact_match',
            keyword: userMessage.toLowerCase()
        }).sort({ priority: -1 });

        if (exactMatchReply) {
            const chosenReply = exactMatchReply.replies[Math.floor(Math.random() * exactMatchReply.replies.length)];
            return res.json({ reply: chosenReply });
        }

        // 2. Pattern Matching Check (Medium Priority)
        const patternMatches = await ChatReply.find({
            type: 'pattern_matching',
            keyword: { $ne: null }
        }).sort({ priority: -1 });

        for (const reply of patternMatches) {
            const keywords = reply.keyword.toLowerCase().split(' ').map(k => k.trim()).filter(k => k.length > 0);
            const userWords = userMessage.toLowerCase().split(' ').map(w => w.trim()).filter(w => w.length > 0);

            const isMatch = keywords.some(keyword => userWords.includes(keyword));
            if (isMatch) {
                const chosenReply = reply.replies[Math.floor(Math.random() * reply.replies.length)];
                return res.json({ reply: chosenReply });
            }
        }

        // 3. Expert Pattern Matching (Regex - Lower Priority than exact/pattern matches)
        const expertPatternReplies = await ChatReply.find({
            type: 'expert_pattern_matching',
            pattern: { $ne: null }
        }).sort({ priority: -1 });

        for (const reply of expertPatternReplies) {
            try {
                const regex = new RegExp(reply.pattern, 'i');
                if (regex.test(userMessage)) {
                    const chosenReply = reply.replies[Math.floor(Math.random() * reply.replies.length)];
                    return res.json({ reply: chosenReply });
                }
            } catch (regexError) {
                console.error(`Invalid regex pattern from DB: ${reply.pattern}`, regexError);
            }
        }

        // 4. Default Message (If no match found)
        const defaultReply = await ChatReply.findOne({ type: 'default_message', isDefault: true });
        if (defaultReply) {
            const chosenReply = defaultReply.replies[Math.floor(Math.random() * defaultReply.replies.length)];
            return res.json({ reply: chosenReply });
        }

    } catch (dbError) {
        console.error('Error fetching chat replies from DB:', dbError);
        botReply = "Nobi Bot: I'm having trouble retrieving my responses right now. Please try again later.";
    }

    res.json({ reply: botReply });
});


// Admin Panel Routes
app.get('/admin/login', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/admin/dashboard');
    }
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Login</title>
            <style>
                body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-color: #f4f4f4; margin: 0; }
                .login-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px; }
                h2 { text-align: center; color: #333; margin-bottom: 20px; }
                label { display: block; margin-bottom: 5px; color: #555; }
                input[type="text"], input[type="password"] { width: calc(100% - 20px); padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                button { width: 100%; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
                button:hover { background-color: #0056b3; }
                .error { color: red; text-align: center; margin-bottom: 10px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2>Admin Login</h2>
                ${req.query.error ? '<p class="error">Invalid username or password.</p>' : ''}
                <form action="/admin/login" method="POST">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" required><br>
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" required><br>
                    <button type="submit">Login</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const adminUser = await Admin.findOne({ username });
        if (!adminUser) {
            return res.redirect('/admin/login?error=true');
        }

        const isMatch = await adminUser.comparePassword(password);
        if (!isMatch) {
            return res.redirect('/admin/login?error=true');
        }

        req.session.loggedIn = true;
        req.session.username = adminUser.username;

        req.session.save(() => {
            res.redirect('/admin/dashboard');
        });

    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/admin/login?error=true');
    }
});

app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Panel</title>
            <style>
                body { font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; background-color: #e9ecef; margin: 0; }
                .admin-container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 400px; }
                h1 { color: #28a745; margin-bottom: 20px; }
                p { color: #6c757d; font-size: 1.1em; margin-bottom: 25px; }
                .nav-links a { display: inline-block; margin: 0 10px; padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
                .nav-links a:hover { background-color: #0056b3; }
                .logout-link { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; }
                .logout-link:hover { background-color: #c82333; }
            </style>
        </head>
        <body>
            <div class="admin-container">
                <h1>Welcome to the Admin Panel, ${req.session.username}!</h1>
                <p>Here you can manage your website's content and users.</p>
                <div class="nav-links">
                    <a href="/admin/list-admins">Manage Admins</a>
                    <a href="/admin/add-chat-replies">Add Chat Replies</a>
                </div>
                <a href="/admin/logout" class="logout-link">Logout</a>
            </div>
        </body>
        </html>
    `);
});

app.get('/admin/list-admins', isAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.find({}, 'username');
        let adminListHtml = `
            <h2>Registered Admin Users</h2>
            <table style="width:100%; border-collapse: collapse; margin-top: 20px;">
                <tr style="background-color: #f2f2f2;">
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Username</th>
                    <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Actions</th>
                </tr>
        `;

        if (admins.length === 0) {
            adminListHtml += `<tr><td colspan="2" style="padding: 8px; border: 1px solid #ddd; text-align: center;">No admin users found.</td></tr>`;
        } else {
            admins.forEach(admin => {
                adminListHtml += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;">${admin.username}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">
                            <a href="/admin/edit-admin/${admin._id}" style="color: blue; text-decoration: none; margin-right: 10px;">Edit</a>
                            <a href="/admin/delete-admin/${admin._id}" style="color: red; text-decoration: none;">Delete</a>
                        </td>
                    </tr>
                `;
            });
        }
        adminListHtml += `</table><p><a href="/admin/dashboard" style="display: block; margin-top: 20px; text-align: center; text-decoration: none; color: #007bff;">Back to Dashboard</a></p>`;

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Admin List</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; background-color: #e9ecef; margin: 0; }
                    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 600px; max-width: 90%; }
                    h2 { color: #333; margin-bottom: 20px; }
                    table th, table td { text-align: left; padding: 8px; border: 1px solid #ddd; }
                    table th { background-color: #f2f2f2; }
                    a { text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    ${adminListHtml}
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error fetching admins:', error);
        res.status(500).send('Error loading admin list.');
    }
});

// Admin Add Chat Replies Form (GET)
app.get('/admin/add-chat-replies', isAuthenticated, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Add Chat Replies</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: 20px auto; }
                h2 { text-align: center; color: #333; margin-bottom: 20px; }
                label { display: block; margin-bottom: 5px; color: #555; font-weight: bold; }
                select, input[type="text"], input[type="number"], textarea {
                    width: calc(100% - 22px);
                    padding: 10px;
                    margin-bottom: 15px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    box-sizing: border-box;
                    font-size: 1em;
                }
                textarea { resize: vertical; min-height: 100px; }
                button {
                    padding: 10px 20px;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 1em;
                    width: 100%;
                    box-sizing: border-box;
                }
                button:hover { background-color: #0056b3; }
                .success { color: green; text-align: center; margin-bottom: 10px; }
                .error { color: red; text-align: center; margin-bottom: 10px; }
                .info { color: #555; font-size: 0.9em; margin-top: -10px; margin-bottom: 15px; }
                .keyword-section, .pattern-section { display: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Add New Chat Reply Line</h2>
                ${req.query.success ? '<p class="success">Reply added successfully!</p>' : ''}
                ${req.query.error ? `<p class="error">Error: ${req.query.error_msg || 'Something went wrong.'}</p>` : ''}
                <form action="/admin/add-chat-replies" method="POST">
                    <label for="replyType">Reply Type:</label>
                    <select id="replyType" name="type" required onchange="toggleFields()">
                        <option value="">Select Type</option>
                        <option value="welcome_message">Welcome Message</option>
                        <option value="exact_match">Exact Match</option>
                        <option value="pattern_matching">Pattern Matching</option>
                        <option value="expert_pattern_matching">Expert Pattern Matching</option>
                        <option value="default_message">Default Message</option>
                    </select>

                    <div id="keywordSection" class="keyword-section">
                        <label for="keyword">Keyword (for Exact/Pattern Matching):</label>
                        <input type="text" id="keyword" name="keyword" placeholder="Enter keyword or phrase">
                        <p class="info">For 'Exact Match', type the exact phrase. For 'Pattern Matching', type words that will be looked for (e.g., 'hello', 'hi').</p>
                    </div>

                    <div id="patternSection" class="pattern-section">
                        <label for="pattern">Pattern (for Expert Pattern Matching - Regex):</label>
                        <input type="text" id="pattern" name="pattern" placeholder="Enter Regex pattern (e.g., ^hello|hi$)">
                        <p class="info">Use regular expressions (Regex) here. E.g., `^hello|hi$` matches messages starting with 'hello' or 'hi'.</p>
                    </div>

                    <label for="replies">Reply Lines:</label>
                    <textarea id="replies" name="replies" placeholder="Enter multiple reply lines, separated by <#> (e.g., Hello! How can I help? <#> Hi there! Ask me anything.)" required></textarea>
                    <p class="info">Separate multiple reply lines using '&lt;#&gt;'. One random line will be chosen.</p>

                    <label for="priority">Priority (Higher number = higher priority):</label>
                    <input type="number" id="priority" name="priority" value="0">
                    <p class="info">For exact/pattern matches, replies with higher priority will be checked first.</p>

                    <button type="submit">Add Reply</button>
                </form>
                <p style="text-align: center; margin-top: 20px;"><a href="/admin/dashboard" style="color: #007bff; text-decoration: none;">← Back to Dashboard</a></p>
            </div>

            <script>
                function toggleFields() {
                    const replyType = document.getElementById('replyType').value;
                    const keywordSection = document.getElementById('keywordSection');
                    const patternSection = document.getElementById('patternSection');
                    const keywordInput = document.getElementById('keyword');
                    const patternInput = document.getElementById('pattern');
                    const priorityInput = document.getElementById('priority');

                    keywordSection.style.display = 'none';
                    patternSection.style.display = 'none';
                    keywordInput.required = false;
                    patternInput.required = false;
                    priorityInput.value = 0;

                    if (replyType === 'exact_match' || replyType === 'pattern_matching') {
                        keywordSection.style.display = 'block';
                        keywordInput.required = true;
                    } else if (replyType === 'expert_pattern_matching') {
                        patternSection.style.display = 'block';
                        patternInput.required = true;
                    }
                }
                toggleFields();
            </script>
        </body>
        </html>
    `);
});

// Admin Add Chat Replies (POST)
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { type, keyword, replies, pattern, priority } = req.body;

    try {
        if (!replies || replies.trim() === '') {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Reply lines cannot be empty.');
        }

        const replyLines = replies.split('<#>').map(line => line.trim()).filter(line => line.length > 0);
        if (replyLines.length === 0) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=No valid reply lines found after splitting.');
        }

        if ((type === 'exact_match' || type === 'pattern_matching') && (!keyword || keyword.trim() === '')) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Keyword is required for this reply type.');
        }
        if (type === 'expert_pattern_matching' && (!pattern || pattern.trim() === '')) {
            return res.redirect('/admin/add-chat-replies?error=true&error_msg=Pattern is required for expert pattern matching.');
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

    } catch (error) {
        console.error('Error adding chat reply:', error);
        let error_msg = error.message;
        if (error.code === 11000 && error.keyPattern && error.keyValue) {
            error_msg = `Duplicate entry for type ${error.keyValue.type} and keyword/pattern ${error.keyValue.keyword || error.keyValue.pattern}.`;
        }
        res.redirect(`/admin/add-chat-replies?error=true&error_msg=${encodeURIComponent(error_msg)}`);
    }
});


app.get('/admin/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/admin/dashboard');
        }
        res.redirect('/admin/login');
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open your browser and go to http://localhost:3000/ to access Nobi Bot.');
    console.log('Admin panel: http://localhost:3000/admin/login');
});
