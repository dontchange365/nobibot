// server.js

// --- 1. Import necessary modules ---
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session'); // For managing user sessions
const path = require('path'); // For serving static files

// --- 2. Initialize the Express application ---
const app = express();
const PORT = process.env.PORT || 3000; // Define the port for the server

// --- 3. Middleware Setup ---

// Parse URL-encoded bodies (for form data submitted via POST)
// This is needed to access form data like username and password from req.body
app.use(bodyParser.urlencoded({ extended: true }));

// Parse JSON bodies (if you were sending JSON data to your server)
app.use(bodyParser.json());

// Setup sessions:
// This middleware manages user sessions, allowing the server to remember logged-in users.
app.use(session({
    // 'secret' is used to sign the session ID cookie.
    // **IMPORTANT**: Change this to a long, random, and unguessable string in a real application!
    secret: 'your_super_secret_key_1234567890abcdef', // <<< --- **CHANGE THIS!**
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something is stored
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Session cookie will expire after 24 hours (in milliseconds)
}));

// Serve static files:
// This tells Express to serve files from the 'public' directory.
// For example, if you have 'public/style.css', it can be accessed at '/style.css'.
// (Though in this example, the HTML is embedded, this is good practice for future expansion).
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. Hardcoded Admin Credentials (FOR DEMONSTRATION ONLY!) ---
// **SECURITY WARNING**:
// In a real-world application, NEVER store passwords in plain text like this.
// You MUST use a strong password hashing library like 'bcrypt' to hash and store passwords securely
// in a database. Then, when a user logs in, you compare the entered password with the stored hash.
const ADMIN_USERNAME = 'samshaad365';
const ADMIN_PASSWORD = 'shizuka123'; // <<< --- **NEVER DO THIS IN PRODUCTION!**

// --- 5. Custom Middleware for Authentication ---
// This function checks if the user is logged in (i.e., if req.session.loggedIn is true).
// If not logged in, it redirects them to the login page.
function isAuthenticated(req, res, next) {
    if (req.session.loggedIn) {
        next(); // User is authenticated, proceed to the next route handler
    } else {
        res.redirect('/login'); // Not logged in, redirect to login page
    }
}

// --- 6. Routes ---

// Default Route: Redirects to the login page
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Login Page Route (GET request): Displays the login form
app.get('/login', (req, res) => {
    // If the user is already logged in, redirect them directly to the admin panel
    if (req.session.loggedIn) {
        return res.redirect('/admin');
    }

    // Send the HTML for the login form
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
                <form action="/login" method="POST">
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

// Login POST Route: Handles login form submission
app.post('/login', (req, res) => {
    const { username, password } = req.body; // Extract username and password from the form submission

    // Check if the provided credentials match the hardcoded admin credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.loggedIn = true; // Set a session variable to mark the user as logged in
        req.session.username = username; // Store the username in the session
        res.redirect('/admin'); // Redirect to the protected admin panel
    } else {
        // If credentials are incorrect, redirect back to the login page with an error flag
        res.redirect('/login?error=true');
    }
});

// Admin Panel Route (Protected): Only accessible after successful login
app.get('/admin', isAuthenticated, (req, res) => {
    // This route uses the 'isAuthenticated' middleware. If the user isn't logged in,
    // they'll be redirected to /login before this code even runs.
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
                <a href="/logout">Logout</a>
            </div>
        </body>
        </html>
    `);
});

// Logout Route: Destroys the user's session
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            // If there's an error destroying the session, redirect back to admin or show error
            return res.redirect('/admin');
        }
        res.redirect('/login'); // Redirect to login page after successful logout
    });
});

// --- 7. Start the Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open your browser and go to http://localhost:3000 to access the login page.');
});
