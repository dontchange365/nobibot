const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

// MongoDB Connect
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Admin Schema
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

AdminSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

AdminSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', AdminSchema);

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_for_local_testing_ONLY_do_not_use_in_prod',
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
    secure: false, // Set to true only when using HTTPS in production
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Debug: Log session
app.use((req, res, next) => {
  console.log('SESSION DEBUG:', req.session);
  next();
});

// Auth Middleware
function isAuthenticated(req, res, next) {
  if (req.session.loggedIn) next();
  else res.redirect('/admin/login');
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/admin/dashboard');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Login</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f4; margin: 0; }
        .login-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px; }
        h2 { text-align: center; margin-bottom: 20px; }
        label, input { display: block; width: 100%; margin-bottom: 10px; }
        input { padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; }
        button:hover { background: #0056b3; }
        .error { color: red; text-align: center; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>Admin Login</h2>
        ${req.query.error ? '<p class="error">Invalid username or password</p>' : ''}
        <form action="/admin/login" method="POST">
          <label>Username:</label>
          <input type="text" name="username" required />
          <label>Password:</label>
          <input type="password" name="password" required />
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
    if (!adminUser) return res.redirect('/admin/login?error=true');

    const isMatch = await adminUser.comparePassword(password);
    if (!isMatch) return res.redirect('/admin/login?error=true');

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
    <html>
    <head>
      <title>Admin Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #e9ecef; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 8px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h1 { color: green; }
        .link { display: inline-block; margin: 10px; padding: 10px 20px; background: #007bff; color: white; border-radius: 5px; text-decoration: none; }
        .logout { background: #dc3545; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome, ${req.session.username}!</h1>
        <a class="link" href="/admin/list-admins">Manage Admins</a>
        <a class="link logout" href="/admin/logout">Logout</a>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin/list-admins', isAuthenticated, async (req, res) => {
  try {
    const admins = await Admin.find({}, 'username');
    let rows = admins.map(a => `
      <tr>
        <td>${a.username}</td>
        <td>
          <a href="/admin/edit-admin/${a._id}" style="color:blue;">Edit</a> |
          <a href="/admin/delete-admin/${a._id}" style="color:red;">Delete</a>
        </td>
      </tr>`).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admins</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial; padding: 20px; background: #e9ecef; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background: #f4f4f4; }
          a { text-decoration: none; }
        </style>
      </head>
      <body>
        <h2>Admin Users</h2>
        <table>
          <tr><th>Username</th><th>Actions</th></tr>
          ${rows || '<tr><td colspan="2">No admins found.</td></tr>'}
        </table>
        <p><a href="/admin/dashboard">← Back to Dashboard</a></p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('List admin error:', err);
    res.status(500).send('Error loading admin list');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.redirect('/admin/dashboard');
    }
    res.redirect('/admin/login');
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/admin/login`);
});