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

// Chatbot API Endpoint
app.post('/api/chatbot/message', (req, res) => {
    const userMessage = req.body.message;
    let botReply = "Sorry, I didn't understand that. Can you please rephrase?";

    if (userMessage.toLowerCase().includes('hi') || userMessage.toLowerCase().includes('hello')) {
        botReply = "Hi there! How can I assist you?";
    } else if (userMessage.toLowerCase().includes('how are you')) {
        botReply = "I'm a bot, so I don't have feelings, but I'm ready to help!";
    } else if (userMessage.toLowerCase().includes('your name')) {
        botReply = "I am Nobi Bot, at your service!";
    } else if (userMessage.toLowerCase().includes('thank you') || userMessage.toLowerCase().includes('thanks')) {
        botReply = "You're welcome!";
    } else if (userMessage.toLowerCase().includes('date') || userMessage.toLowerCase().includes('time')) {
        const now = new Date();
        botReply = `Current time is ${now.toLocaleTimeString()} and date is ${now.toLocaleDateString()}.`;
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
