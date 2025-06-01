const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin'); // Adjust path as per your project structure

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_secret_key_that_you_should_change_and_make_long_and_random',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24, secure: process.env.NODE_ENV === 'production' }
}));

app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

app.get('/', (req, res) => {
    res.redirect('/admin/login');
});

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
        res.redirect('/admin/dashboard');

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
                a { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; font-size: 1em; }
                a:hover { background-color: #c82333; }
            </style>
        </head>
        <body>
            <div class="admin-container">
                <h1>Welcome to the Admin Panel, ${req.session.username}!</h1>
                <p>This is a protected area. You can manage your content here.</p>
                <a href="/admin/logout">Logout</a>
            </div>
        </body>
        </html>
    `);
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
    console.log('Open your browser and go to http://localhost:3000/admin/login to access the login page.');
});
