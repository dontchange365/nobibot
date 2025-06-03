const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- NEW IMPORTS FOR IMPORT/EXPORT ---
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Files will be stored in an 'uploads' directory
const csv = require('csv-parser');
// --- END NEW IMPORTS ---

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB URI (change only if needed, env recommended for prod) ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://dontchange365:DtUiOMFzQVM0tG9l@nobifeedback.9ntuipc.mongodb.net/?retryWrites=true&w=majority&appName=nobifeedback';

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

// Function to truncate text to a word limit (Defined once here)
function trimText(txt, wordLimit) {
    if (!txt) return '';
    const words = txt.trim().split(/\s+/); // Split by one or more spaces
    // Check if the original string or truncated version is shorter
    const truncatedText = words.slice(0, wordLimit).join(" ");
    return words.length > wordLimit ? truncatedText + "..." : txt;
}

// Helper for random reply (Defined once here)
const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper for reply list icons (Defined once here)
function getReplyIcon(r) {
    if (r.type && r.type.includes('react')) return "😂";
    if (r.type === 'exact_match') return "🎯";
    if (r.type === 'pattern_matching') return "🧩";
    if (r.type === 'expert_pattern_matching') return "🧠";
    if (r.type === 'welcome_message') return "👋";
    return "";
}

// Helper for formatting receive field in reply list (Defined once here)
function formatReceive(r) {
    const text = (r.type === 'exact_match' || r.type === 'pattern_matching') ? r.keyword : (r.type === 'expert_pattern_matching' ? r.pattern : (r.keyword || r.pattern || ''));
    // Ensure text is HTML-escaped before embedding in HTML
    const escapedText = text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
    return `<span class="receive-text">${trimText(escapedText, 5)}</span>`;
}

// Helper for formatting send field in reply list (Defined once here)
function formatSend(r) {
    const text = (r.replies || []).join('<#>');
    // Ensure text is HTML-escaped before embedding in HTML
    const escapedText = text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
    return escapedText;
}


// --- getHtmlTemplate (Defined once here) ---
function getHtmlTemplate(title, bodyContent, includeFormStyles = false, includeDashboardStyles = false, includeCustomVarStyles = false, includeImportExportStyles = false) {
    let styles = '';
    if (includeFormStyles) {
        styles += `
        <style>
            body {
                background: linear-gradient(120deg, #eceafd 70%, #e2d4f5 100%);
                font-family: 'Inter', sans-serif;
                margin: 0;
                padding: 0;
            }

            .form-card {
                max-width: 390px;
                width: 95vw;
                margin: 30px auto;
                background: #fff;
                border-radius: 22px;
                box-shadow: 0 8px 30px #a37be755;
                padding: 32px 20px 26px 20px;
                position: relative;
                animation: popin 0.7s cubic-bezier(.18,1.13,.4,1.06);
                box-sizing: border-box;
            }

            @keyframes popin {
                from { opacity: 0; transform: translateY(45px) scale(0.98);}
                to   { opacity: 1; transform: none;}
            }

            .form-card h2 {
                font-size: 2.1rem;
                color: #8227b3;
                font-weight: 800;
                letter-spacing: 1.5px;
                margin-bottom: 18px;
                text-shadow: 0 2px 14px #e3d2ff7c;
                text-align: center;
            }

            .form-card label {
                display: block;
                color: #6a3cc9;
                font-weight: 600;
                font-size: 1.06rem;
                margin-bottom: 4px;
                margin-top: 15px;
            }
            .form-card label:first-of-type { margin-top: 0; }


            .form-card input[type="text"],
            .form-card input[type="number"],
            .form-card select,
            .form-card textarea {
                width: 100%;
                border-radius: 10px;
                border: 1.7px solid #e5dbfa;
                background: #faf6ff;
                color: #271446;
                font-size: 1rem;
                padding: 11px 14px;
                transition: border 0.17s, box-shadow 0.18s, background 0.1s;
                box-sizing: border-box;
            }

            .form-card input[type="text"]:focus,
            .form-card input[type="number"]:focus,
            .form-card select:focus,
            .form-card textarea:focus {
                border: 1.7px solid #a671f3;
                box-shadow: 0 0 0 2.5px #e7dbffcc;
                background: #f5efff;
                outline: none;
            }

            .form-card select {
                appearance: none;
                -webkit-appearance: none;
                background: #f3eaff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%237d38a8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 12px center;
                background-size: 18px;
            }
            .form-card .select-wrapper {
                position: relative;
            }

            .form-card textarea {
                min-height: 60px;
                resize: vertical;
            }

            .reply-area {
                display: flex;
                flex-direction: column; /* Changed to column for button block */
                gap: 6px;
                position: relative;
                margin-bottom: 17px;
            }
            /* New button container style */
            .reply-area-buttons {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
                align-items: center;
            }
            .reply-area textarea {
                flex: 1;
                margin-bottom: 0;
                padding-right: 14px; /* Removed extra padding as icon btn is now separate */
                width: 100%; /* Ensure it takes full width within its flex context */
            }
            /* Old reply-icon-btn positioning when it was INSIDE textarea */
            /* New reply-icon-btn used as a general button, not positioned absolutely inside textarea */
            .reply-icon-btn {
                /* Removed absolute positioning */
                padding: 0;
                height: 38px; /* Made slightly larger for better click target */
                width: auto; /* Allow width to adjust to text */
                border-radius: 8px;
                border: none;
                background: rgba(155,105,255,0.09);
                color: #7d38a8; /* Text color for these buttons */
                font-weight: 600;
                font-size: 0.95rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px #a97cfa24;
                backdrop-filter: blur(3px);
                transition: background 0.17s, transform 0.12s, box-shadow 0.17s;
                padding: 0px 12px; /* Added horizontal padding for text */
            }
            .reply-icon-btn svg {
                stroke: #7d38a8;
                fill: none;
                margin-right: 5px; /* Spacing for icon next to text */
            }
            .reply-icon-btn:hover {
                background: linear-gradient(92deg, #e2d6ff 30%, #cba9f9 100%);
                transform: scale(1.03); /* Adjusted scale for button */
                box-shadow: 0 4px 12px #a97cfa33;
            }
            .reply-icon-btn:active {
                transform: scale(0.98); /* Adjusted scale for button */
                box-shadow: 0 1px 4px #a97cfa24;
            }


            .btn-main {
                width: 100%;
                background: linear-gradient(90deg, #7e4af5 40%, #bf51e8 100%);
                color: #fff;
                font-weight: 700;
                font-size: 1.15rem;
                border-radius: 13px;
                border: none;
                padding: 13px 0;
                margin-top: 15px;
                box-shadow: 0 5px 16px #c79fff44;
                transition: box-shadow 0.17s, background 0.19s, transform 0.12s;
                cursor: pointer;
            }
            .btn-main:hover {
                background: linear-gradient(90deg, #6124d4 40%, #8227b3 100%);
                box-shadow: 0 9px 28px #b48ffa55;
                transform: translateY(-2px);
            }
            .btn-main:active {
                transform: scale(0.98);
                box-shadow: 0 3px 7px #b48ffa55;
            }

            .back-btn {
                position: absolute;
                top: 19px;
                left: 19px;
                background: rgba(155,105,255,0.13);
                color: #7427bf;
                border: none;
                padding: 8px 16px;
                border-radius: 7px;
                font-weight: 700;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 7px;
                box-shadow: 0 1.5px 9px #cbb0ef35;
                transition: background .14s, color .14s, transform .12s, box-shadow .14s;
                text-decoration: none;
                cursor: pointer;
                z-index: 10;
            }
            .back-btn:hover {
                background: #e8dfff;
                color: #502283;
                box-shadow: 0 2px 12px #cbb0ef55;
            }
            .back-btn:active {
                background: #e0ccff;
                color: #412276;
                transform: scale(.98);
                box-shadow: 0 1px 5px #cbb0ef35;
            }
            .back-btn svg {
                stroke: #7427bf;
                transition: stroke .14s;
            }
            .back-btn:hover svg {
                stroke: #502283;
            }
            .back-btn:active svg {
                    stroke: #412276;
            }


            /* Variable Popup Styling */
            #varPopup {
                transition: opacity 0.2s ease-in-out;
            }
            #varPopup.fade-in {
                opacity: 1;
            }
            #varPopup.fade-out {
                opacity: 0;
            }
            #varPopup > div {
                box-shadow: 0 4px 28px #55318c44;
            }
            #varPopup .var-list li {
                transition: background 0.1s;
            }

            /* Responsive Adjustments */
            @media (max-width: 500px) {
                .form-card {
                    margin: 20px auto;
                    padding: 25px 15px 20px 15px;
                }
                .form-card h2 {
                    font-size: 1.8rem;
                }
                .form-card label {
                    font-size: 1rem;
                }
                .form-card input, .form-card select, .form-card textarea {
                    font-size: 0.95rem;
                    padding: 9px 12px;
                }
                .btn-main {
                    font-size: 1.05rem;
                    padding: 11px 0;
                }
                .back-btn {
                    font-size: 0.9rem;
                    padding: 7px 14px;
                    top: 15px;
                    left: 15px;
                }
                .reply-icon-btn {
                    height: 34px; /* Adjusted size for smaller screens */
                    padding: 0px 10px;
                    font-size: 0.85rem;
                }
                .reply-icon-btn svg {
                    width: 18px; height: 18px; /* Smaller icons on smaller screens */
                }
                #varPopup > div {
                    padding: 20px 18px;
                }
                #varPopup #varSearch {
                    font-size: 14px;
                    padding: 5px 10px;
                }
                #varPopup .var-list li {
                    font-size: 14px;
                    padding: 6px 10px;
                }
                #varPopup #varCloseBtn {
                    font-size: 14px;
                    padding: 6px 14px;
                }
            }
        </style>
        `;
    }
    if (includeDashboardStyles) {
        styles += `
        <style>
            body {
                background: linear-gradient(120deg, #F3E6FF 0%, #D3D1FF 100%);
                min-height: 100vh;
                font-family: 'Lexend', 'Roboto', sans-serif;
                margin: 0;
                padding: 0;
                background: #1a1a1a; /* Default background for reply list */
            }
            .admin-container {
                max-width: 700px;
                margin: 36px auto 0 auto;
                padding: 0 12px;
            }
            h1 {
                font-size: 2.1rem;
                color: #7023d8;
                letter-spacing: 0.7px;
                margin-bottom: 24px;
                text-align: left;
                font-weight: 800;
            }
            .card-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 22px;
                margin-bottom: 40px;
            }
            .admin-card {
                background: linear-gradient(120deg, #b99cff 0%, #e0c6fa 90%);
                border-radius: 22px;
                box-shadow: 0 3px 18px #ab7fee4a, 0 1.5px 4px #a68aff22;
                padding: 36px 18px 28px 18px;
                display: flex;
                flex-direction: column;
                align-items: center;
                cursor: pointer;
                transition: transform 0.16s, box-shadow 0.18s;
                position: relative;
                min-height: 125px;
                border: 2.5px solid #fff;
                font-size: 1.12rem;
                text-align: center;
                text-decoration: none;
                color: inherit;
            }
            .admin-card:active, .admin-card:focus, .admin-card:hover {
                transform: scale(1.045) translateY(-2px) rotate(-1.1deg);
                box-shadow: 0 7px 28px #7023d855, 0 2px 8px #ab7fee2a;
                z-index: 2;
            }
            .admin-card .lucide {
                font-size: 2.1rem;
                margin-bottom: 12px;
                color: #8338ec;
                filter: drop-shadow(0 1px 2px #f6f2ffb8);
            }
            /* Reply List specific styles - Stylish gangster theme */
            .nobita-reply-panel {
                max-width: 600px;
                margin: 32px auto 60px auto;
                padding: 0 6px;
                position: relative;
            }
            .nobita-title {
                color: #fff;
                font-family: 'Lexend', sans-serif;
                letter-spacing: 1px;
                margin-bottom: 0;
                text-align: left;
                font-weight: 700;
                font-size: 28px;
                text-shadow: none;
            }
            .reply-list-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 24px;
                padding: 0;
            }
            .add-reply-btn-top {
                background: linear-gradient(90deg, #4f46e5 40%, #6138ca 100%);
                color: #fff;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                text-decoration: none;
                font-size: 15px;
                transition: background 0.2s, transform 0.12s, box-shadow 0.17s;
                display: flex;
                align-items: center;
                gap: 5px;
                box-shadow: 0 2px 8px #0004;
            }
            .add-reply-btn-top:hover {
                background: linear-gradient(90deg, #4338ca 40%, #512f9b 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px #0006;
            }
             .add-reply-btn-top:active {
                transform: scale(0.98);
                box-shadow: 0 1px 4px #0005;
            }
            .add-reply-btn-top .lucide {
                font-size: 1.2rem;
            }

            .reply-list {
                padding: 20px 0;
                /* min-height property is generally better on the main body/container element */
            }
            .reply-card {
                background: linear-gradient(120deg, #24183b 70%, #23123a 100%);
                box-shadow: 0 6px 24px 0 rgba(0,0,0,0.6), 0 1.5px 3px rgba(113, 79, 255, 0.25);
                border-radius: 18px;
                margin-bottom: 24px;
                padding: 18px 22px 16px 22px;
                color: #f8e9ff;
                font-family: 'Lexend', 'Inter', 'Segoe UI', sans-serif;
                transition: box-shadow 0.25s;
                border: 1.5px solid #39355a;
                position: relative;
                overflow: hidden;
            }
            .reply-card:hover {
                box-shadow: 0 10px 32px 0 rgba(80, 38, 255, 0.4), 0 2px 6px rgba(162, 89, 255, 0.25);
            }
            .reply-name {
                font-weight: 800;
                font-size: 1.1rem;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .reply-priority {
                font-size: 1rem;
                background: #7c3aed;
                color: #fff;
                border-radius: 7px;
                padding: 2px 11px;
                margin-left: 8px;
                font-weight: 700;
                letter-spacing: 1px;
            }
            .reply-receive {
                font-size: 0.97rem;
                color: #aabbec;
                border-left: 3.5px solid #7c3aed;
                padding-left: 10px;
                margin-bottom: 7px;
                /* The actual truncation is handled by .receive-text class now */
            }
            .receive-text { /* C. Received/Keywords Truncate One Line Only - Defined here for overall styles */
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                max-width: 350px; /* Adjust as per design */
                display: block; /* Important for ellipsis to work */
            }
            .reply-send {
                font-size: 1rem;
                color: #ffe2f5;
                background: #281d39;
                border-radius: 7px;
                padding: 8px 12px;
                margin-top: 5px;
                word-break: break-all;
                box-shadow: 0 2px 6px rgba(153, 0, 119, 0.4);
            }
            .reply-actions {
                position: absolute;
                top: 15px; right: 17px;
                display: flex; gap: 7px;
            }
            .reply-actions a { /* Changed from button to a for links in previous step */
                background: none; border: none; color: #c7a7fc; font-size: 1.1rem; cursor: pointer;
                padding: 2px 7px;
                text-decoration: none;
            }
            .reply-actions a:hover {
                color: #ffe167;
            }

            /* Responsive Adjustments for Reply List */
            @media (max-width: 700px) {
                .add-reply-btn-top {
                    padding: 7px 10px;
                    font-size: 0;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    justify-content: center;
                    align-items: center;
                }
                .add-reply-btn-top .lucide {
                    margin: 0;
                    font-size: 1.5rem;
                }
                .add-reply-btn-top span {
                    display: none;
                }
                .nobita-title {
                    font-size: 1.8rem;
                    text-align: left;
                }
                 .reply-list-header {
                    align-items: flex-start;
                    padding: 0;
                }
            }
        </style>
        `;
    }
    if (includeImportExportStyles) {
        styles += `
        <style>
            .admin-container { max-width: 500px; margin: 40px auto; font-family: 'Lexend',sans-serif;}
            .rule-btn {
                background: linear-gradient(90deg,#7e4af5 40%,#bf51e8 100%);
                color: #fff; border: none; border-radius: 13px; padding: 13px 28px;
                font-size: 1.18rem; font-weight: 700; cursor: pointer; box-shadow: 0 2px 9px #ab7fee40;
                margin-bottom: 7px; transition: background 0.15s,transform 0.1s;
                display: inline-block;
                margin-right: 15px;
            }
            .rule-btn:hover { background: linear-gradient(90deg,#6124d4 40%,#8227b3 100%); transform: translateY(-2px);}
            .admin-container h1 { font-size: 2.1rem; color: #7023d8; letter-spacing: 0.7px; margin-bottom: 24px; text-align: left; font-weight: 800; }
            .admin-container h2 { font-size: 1.6rem; color: #8227b3; margin-top: 25px; margin-bottom: 15px; }
            input[type="file"] { margin-bottom: 13px; display: block; width: 100%; box-sizing: border-box; }
            input[type="text"] {
                width: 100%;
                padding: 10px 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 15px;
                box-sizing: border-box;
            }
            label { font-size: 1.1rem; margin-right: 16px; color: #6a3cc9;}
            form { margin:0; }
            input[type="radio"] { margin-right: 5px; }
            /* Responsive for smaller screens */
            @media (max-width: 550px) {
                .admin-container { margin: 20px auto; padding: 0 10px; }
                .admin-container h1 { font-size: 1.6rem; }
                .admin-container h2 { font-size: 1.3rem; }
                .rule-btn { padding: 10px 20px; font-size: 1rem; margin-right: 10px;}
                input[type="file"], input[type="text"] { font-size: 0.9rem; padding: 8px 12px; }
                label { font-size: 0.95rem; }
            }
        </style>
        `;
    }
    // Shared Variable Popup HTML and JS are added at the very end of the body
    const sharedPopupAndScript = `
    <div id="varPopup" style="display:none; position:fixed; left:0; top:0; width:100vw; height:100vh; background:#0005; z-index:99; align-items:center; justify-content:center; opacity:0; pointer-events: none;">
      <div style="background:#fff; border-radius:14px; padding:26px 24px; min-width:240px; max-width:95vw; max-height:90vh; box-shadow:0 4px 28px #55318c44; overflow:auto;">
        <div style="font-size:18px; font-weight:600; margin-bottom:10px; color:#7d38a8;">Variables</div>
        <input type="text" id="varSearch" placeholder="Search variable..." style="width:100%;padding:6px 10px;margin-bottom:12px;font-size:15px;border:1.2px solid #eee;border-radius:6px; box-sizing:border-box;">
        <ul id="varList" style="list-style:none; margin:0; padding:0; max-height:180px; overflow:auto;">
          </ul>
        <div style="margin-top:14px; text-align:right;">
          <button id="varCloseBtn" style="padding:7px 16px; background:#f7f3ff; border-radius:7px; border:none; color:#a654eb; font-weight:600; font-size:15px; cursor:pointer;">Cancel</button>
        </div>
      </div>
    </div>

    <script>
    document.addEventListener("DOMContentLoaded", function() {
      // Common variables for the popup logic
      const defaultVars = [
          "%message%", "%message_LENGTH%", "%capturing_group_ID%",
          "%name%", "%first_name%", "%last_name%", "%chat_name%", "%rule_id%",
          "%date%", "%time%", "%hour%", "%minute%", "%second%", "%am/pm%", "%day_of_month%", "%month%", "%year%",
          "%rndm_num_MIN_MAX%", "%rndm_custom_COUNT_ITEM1,ITEM2,ITEM3%", "%rndm_abc_lower_LEN%",
          "%rndm_abc_upper_LEN%", "%rndm_alnum_LEN%", "%rndm_ascii_LEN%", "%rndm_grawlix_LEN%"
      ];
      // window.customVars will be defined in the specific route's script block
      const allVars = [...defaultVars, ...(window.customVars || [])];

      // Variable popup elements and core functions (defined once)
      var varPopup = document.getElementById('varPopup');
      var varSearchInput = document.getElementById('varSearch');
      var varList = document.getElementById('varList');
      var varCloseBtn = document.getElementById('varCloseBtn');

      function showVarPopup() {
        renderVarList('');
        varSearchInput.value = '';
        varSearchInput.focus();
      }

      function renderVarList(filter) {
        varList.innerHTML = '';
        allVars
          .filter(v => v.toLowerCase().includes(filter.toLowerCase()))
          .forEach(v => {
            // Ye loop ke andar hona chahiye, example:
// allVars.forEach(function(v) {
  const li = document.createElement('li');
  li.textContent = v;
  li.style.cssText = "padding:8px 12px; cursor:pointer; border-radius:6px; font-size:16px; color:#7d38a8;";
  li.onmouseover = () => li.style.background = "#f3eaff";
  li.onmouseout = () => li.style.background = "";
  li.onclick = () => insertVarToReply(v);
  varList.appendChild(li);
// });

function insertVarToReply(variable) {
  // Find the currently focused textarea with id 'replyTextarea'
  const textarea = document.getElementById('replyTextarea');
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + variable + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    textarea.focus();
  }
  varPopup.style.opacity = '0';
  varPopup.style.pointerEvents = 'none';
}

      // Event Listeners for popup (defined once)
      varSearchInput.oninput = function() {
        renderVarList(this.value);
      };

      varCloseBtn.onclick = function() {
        varPopup.style.opacity = '0';
        varPopup.style.pointerEvents = 'none';
      };

      // Close popup if ESC key is pressed
      document.addEventListener('keydown', function(e){
        if(varPopup.style.pointerEvents === 'auto' && e.key === 'Escape'){
          varPopup.style.opacity = '0';
          varPopup.style.pointerEvents = 'none';
        }
      });

      // Close popup if clicked outside (on the overlay)
      document.addEventListener('click', function(e){
          if (e.target === varPopup) {
              varPopup.style.opacity = '0';
              varPopup.style.pointerEvents = 'none';
          }
      });

      // Event delegation for customVarBtn (now using its ID)
      document.body.addEventListener('click', function(e){
        const customVarBtn = e.target.closest('#customVarBtn');
        if(customVarBtn) {
          varPopup.style.opacity = '1';
          varPopup.style.pointerEvents = 'auto';
          showVarPopup();
        }
      });
    });
    </script>
    `;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Lexend:wght@600;800&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lucide-static@0.306.0/dist/lucide-static.min.css"/>
        ${styles}
    </head>
    <body>
        ${bodyContent}
        ${sharedPopupAndScript}
        <script src="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.js"></script>
        <script>lucide.createIcons();</script>
    </body>
    </html>
    `;
}

// --- handleReplySend (main reply engine with variables support - Defined once here) ---
async function handleReplySend(replyObj, userMessage, matchedRegexGroups = null, reqSession = {}) {
    if (!replyObj || !replyObj.replies || replyObj.replies.length === 0) return "No reply found";
    let replyText;
    switch (replyObj.sendMethod) {
        case 'once': replyText = replyObj.replies[0]; break;
        case 'all': replyText = replyObj.replies.join('\n'); break;
        case 'random':
        default: replyText = randomReply(replyObj.replies); break;
    }

    // --- 1. Nested Custom Variable Resolver (with random pick for custom variable values) ---
    try {
        const customVariables = await CustomVariable.find({}); // Consider caching this for performance
        function resolveNestedVars(text) {
            let prev, round = 0;
            do {
                prev = text;
                for (const variable of customVariables) {
                    let value = variable.value;
                    // RANDOM PICK LOGIC FOR VARIABLE VALUE (for custom variables like 'val1,val2,val3')
                    if (value.includes(',')) {
                        const parts = value.split(',').map(x => x.trim());
                        value = parts[Math.floor(Math.random() * parts.length)];
                    }
                    const regex = new RegExp(`%${variable.name}%`, 'g');
                    text = text.replace(regex, value);
                }
                round++;
            } while (/%[a-zA-Z0-9_]+%/.test(text) && text !== prev && round < 10);
            return text;
        }
        replyText = resolveNestedVars(replyText);
    } catch (error) { console.error("Custom variable error:", error); }

    // --- 2. Random Dynamic Variable Patterns ---
    // RANDOM NUMBER (e.g. %rndm_num_10_99%)
    replyText = replyText.replace(/%rndm_num_(-?\d+)_(-?\d+)%/g, (_, a, b) => {
        a = parseInt(a), b = parseInt(b);
        return String(Math.floor(Math.random() * (b - a + 1)) + a);
    });

    // RANDOM CUSTOM LIST (e.g. %rndm_custom_2_hi,hello,bye%)
    replyText = replyText.replace(/%rndm_custom_(\d+)_([^%]+)%/g, (_, count, set) => {
        let items = set.split(',').map(x => x.trim());
        let picked = [];
        for (let i = 0; i < Number(count); i++) {
            picked.push(items[Math.floor(Math.random() * items.length)]);
        }
        return picked.join('');
    });

    // RANDOM LOWERCASE ABC (e.g. %rndm_abc_lower_3%)
    replyText = replyText.replace(/%rndm_abc_lower_(\d+)%/g, (_, len) => {
        let chars = 'abcdefghijklmnopqrstuvwxyz';
        return Array.from({length: Number(len)}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    });

    // RANDOM UPPERCASE ABC (e.g. %rndm_abc_upper_5%)
    replyText = replyText.replace(/%rndm_abc_upper_(\d+)%/g, (_, len) => {
        let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return Array.from({length: Number(len)}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    });

    // RANDOM ALPHA-NUMERIC (e.g. %rndm_alnum_8%)
    replyText = replyText.replace(/%rndm_alnum_(\d+)%/g, (_, len) => {
        let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return Array.from({length: Number(len)}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    });

    // RANDOM ASCII (e.g. %rndm_ascii_10%)
    replyText = replyText.replace(/%rndm_ascii_(\d+)%/g, (_, len) => {
        let result = '';
        for (let i = 0; i < Number(len); i++) {
            result += String.fromCharCode(Math.floor(Math.random() * 94) + 33); // ASCII characters from ! to ~
        }
        return result;
    });

    // RANDOM GRAWLIX (e.g. %rndm_grawlix_4%)
    replyText = replyText.replace(/%rndm_grawlix_(\d+)%/g, (_, len) => {
        let chars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        return Array.from({length: Number(len)}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    });

    // --- 3. System Variables ---
    const now = new Date(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    replyText = replyText.replace(/%message%/g, userMessage || '');
    replyText = replyText.replace(/%message_(\d+)%/g, (match, len) => (userMessage || '').substring(0, parseInt(len)));
    if (matchedRegexGroups) {
        replyText = replyText.replace(/%capturing_group_(\d+)%/g, (match, groupId) => {
            return matchedRegexGroups[parseInt(groupId)] || '';
        });
    }
    const userName = reqSession.username || 'User'; // Get username from session
    replyText = replyText.replace(/%name%/g, userName);
    replyText = replyText.replace(/%first_name%/g, userName.split(' ')[0] || '');
    replyText = replyText.replace(/%last_name%/g, userName.split(' ').slice(1).join(' ') || '');
    replyText = replyText.replace(/%chat_name%/g, userName);
    replyText = replyText.replace(/%rule_id%/g, replyObj._id ? replyObj._id.toString() : ''); // Added rule_id

    // Date & time variables
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


// --- Public Home Page (index.html in /public - Defined once here) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- Chatbot Message API Route (Updated for Pattern > Regex > Exact Flow) ---
app.post('/api/chatbot/message', async (req, res) => {
    const { message } = req.body;
    let finalMatch = null;
    let matchedRegexGroups = null; // To store regex groups if an expert pattern matches

    // Check for welcome message first - still highest priority at start of chat
    if (!req.session.seenWelcome) {
        req.session.seenWelcome = true;
        try {
            const welcomeReply = await ChatReply.findOne({ type: 'welcome_message' });
            if (welcomeReply) {
                return res.json({ reply: await handleReplySend(welcomeReply, message, null, req.session) });
            }
        } catch (e) { console.error("Welcome message error:", e); }
    }

    // Get all rules sorted by priority for efficient lookup and master selection
    const allRules = await ChatReply.find({}).sort({ priority: 1 }); // Sorted by priority ascending

    // Find the catch-all rule if it exists, but don't consider it for primary matching yet
    const catchAllRule = allRules.find(rule => rule.type === "exact_match" && rule.keyword === '*');
    const nonCatchAllRules = allRules.filter(rule => !(rule.type === "exact_match" && rule.keyword === '*'));

    // Iterate through non-catch-all rules based on precedence and priority
    let foundPatternMatch = null;
    let foundExpertMatch = null;
    let foundExactMatch = null;

    // We need to find the BEST match for each type first (highest priority, i.e., lowest priority number)
    // Then apply the Pattern > Expert > Exact hierarchy.

    for (const rule of nonCatchAllRules) {
        if (rule.type === 'pattern_matching') {
            const keywords = rule.keyword?.split(',').map(k => k.trim().toLowerCase()) || [];
            if (keywords.some(k => message.toLowerCase().includes(k))) {
                if (!foundPatternMatch || rule.priority < foundPatternMatch.priority) {
                    foundPatternMatch = rule;
                }
            }
        } else if (rule.type === 'expert_pattern_matching') {
            try {
                if (rule.pattern) {
                    const regex = new RegExp(rule.pattern, 'i');
                    const match = regex.exec(message);
                    if (match) {
                        if (!foundExpertMatch || rule.priority < foundExpertMatch.priority) {
                            foundExpertMatch = rule;
                            matchedRegexGroups = match; // Capture groups from the best expert match
                        }
                    }
                }
            } catch (e) { console.error("Expert Regex pattern error for rule:", rule.ruleName, e); }
        } else if (rule.type === 'exact_match') { // Excluding '*' here already handled by nonCatchAllRules
            if (rule.keyword === message.trim().toLowerCase()) {
                if (!foundExactMatch || rule.priority < foundExactMatch.priority) {
                    foundExactMatch = rule;
                }
            }
        }
    }

    // Determine the final match based on the strict hierarchy: Expert > Pattern > Exact
    if (foundExpertMatch) { // Expert Pattern wins if found (Highest priority overall)
        finalMatch = foundExpertMatch;
    } else if (foundPatternMatch) { // Otherwise, Pattern Matching wins if found
        finalMatch = foundPatternMatch;
    } else if (foundExactMatch) { // Otherwise, Exact Match wins if found
        finalMatch = foundExactMatch;
    }

    // If a specific rule is matched, send its reply
    if (finalMatch) {
        return res.json({ reply: await handleReplySend(finalMatch, message, matchedRegexGroups, req.session) });
    }

    // If no specific rule matched (Pattern, Expert, Exact non-'*'), then consider the catch-all rule
    if (catchAllRule) {
        return res.json({ reply: await handleReplySend(catchAllRule, message, null, req.session) });
    }

    // If absolutely no match, send generic fallback
    return res.json({ reply: "Sorry, I didn't understand that." });
});

// ========== ADMIN ROUTES ==========

// -- Admin Login Page
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
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Login', loginForm, true));
});
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
        return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Login Failed', `
            <p>Login failed. <a href="/admin/login">Try again</a></p>
        `, true));
    }
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/admin/dashboard');
});

// -- Admin Dashboard
app.get('/admin/dashboard', isAuthenticated, (req, res) => {
    const dashboardContent = `
    <div class="admin-container">
        <h1>Welcome Admin: <span id="adminName">${req.session.username || 'Admin'}</span></h1>
        <div class="card-grid">
            <a href="/admin/add-chat-replies" class="admin-card">
                <i class="lucide lucide-plus-square"></i>
                <span>Add Chat Reply</span>
            </a>
            <a href="/admin/reply-list" class="admin-card">
                <i class="lucide lucide-list"></i>
                <span>View Replies</span>
            </a>
            <a href="/admin/custom-variables" class="admin-card">
                <i class="lucide lucide-wrench"></i>
                <span>Manage Custom Variables</span>
            </a>
            <a href="/admin/import-export-rules" class="admin-card">
                <i class="lucide lucide-database"></i>
                <span>Import/Export Rules</span>
            </a>
            <a href="/admin/logout" class="admin-card">
                <i class="lucide lucide-log-out"></i>
                <span>Logout</span>
            </a>
        </div>
    </div>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Dashboard', dashboardContent, false, true));
});

// -- Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// -- Add Chat Reply Form
// 1. GET TOTAL REPLIES COUNT (SERVER-SIDE)
app.get('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    // Get total number of replies
    const totalReplies = await ChatReply.countDocuments({});
    // Default priority is last+1
    const defaultPriority = totalReplies + 1;

    let customVarsJsArray = '[]';
    try {
        const customVariables = await CustomVariable.find({});
        customVarsJsArray = JSON.stringify(customVariables.map(v => `%${v.name}%`));
    } catch (e) {
        console.error("Error fetching custom variables for form:", e);
    }

    const addReplyForm = `
    <div class="form-card">
        <button type="button" onclick="window.history.back()" class="back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back
        </button>
        <h2>Add Chat Reply</h2>
        <form method="POST" action="/admin/add-chat-replies">
            <label for="ruleName">Rule Name:</label>
            <input name="ruleName" id="ruleName" placeholder="e.g. Greet User" required />

            <label for="sendMethod">Send Method:</label>
            <div class="select-wrapper">
              <select name="sendMethod" id="sendMethod">
                  <option value="random">Random</option>
                  <option value="all">All</option>
                  <option value="once">Once (first one)</option>
              </select>
            </div>

            <label for="type">Type:</label>
            <div class="select-wrapper">
              <select name="type" id="type" required onchange="handleTypeChange()">
                  <option value="exact_match" selected>Exact Match</option>
                  <option value="pattern_matching">Pattern Matching</option>
                  <option value="expert_pattern_matching">Expert Regex</option>
                  <option value="welcome_message">Welcome Message</option>
              </select>
            </div>

            <div id="keywordField" style="display:block;"> <label for="keyword">Keyword(s):</label>
                <input name="keyword" id="keyword" placeholder="e.g. hi, hello" />
            </div>
            <div id="patternField" style="display:none;">
                <label for="pattern">Regex Pattern:</label>
                <input name="pattern" id="pattern" placeholder="Only for Expert Regex. Use () for capturing groups." />
            </div>

            <label for="replies">Replies (use &lt;#&gt; between lines):</label>
            <div class="reply-area-buttons">
                <button type="button" id="customVarBtn" class="reply-icon-btn" title="Insert Variable">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
                        <polyline points="3 8 12 13 21 8"/>
                    </svg>
                    Custom Replacements
                </button>
                <input type="file" id="txtUpload" accept=".txt" style="display: none;">
                <button type="button" id="uploadTxtBtn" class="reply-icon-btn" title="Upload TXT File">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 14.899V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5.1"/>
                        <path d="M12 2v13.5"/>
                        <path d="m7 9 5-5 5 5"/>
                    </svg>
                    Upload TXT
                </button>
            </div>
            <textarea name="replies" id="replyTextarea" required></textarea>


            <label for="priority">Priority:</label>
            <input type="number" name="priority" id="priority" value="${defaultPriority}" min="1" required />
            <span style="font-size:12px; color:#aaa;">(Higher number = lower priority, default is last)</span>

            <button type="submit" class="btn-main">Add Reply</button>
        </form>
    </div>

    <script>
    function handleTypeChange() {
        const type = document.getElementById('type').value;
        const keywordField = document.getElementById('keywordField');
        const patternField = document.getElementById('patternField');

        keywordField.style.display = 'none';
        patternField.style.display = 'none';

        if (type === 'exact_match' || type === 'pattern_matching' || type === 'welcome_message') {
            keywordField.style.display = 'block';
        }
        if (type === 'expert_pattern_matching') {
            patternField.style.display = 'block';
        }
    }

    // Custom variables are injected from the server for this specific page
    window.customVars = ${customVarsJsArray};

    // Initial call to set correct visibility based on default selected option
    document.addEventListener('DOMContentLoaded', handleTypeChange);

    // 1. TXT File Upload Button For Textarea JS
    document.getElementById('uploadTxtBtn').onclick = function() {
        document.getElementById('txtUpload').click();
    };
    document.getElementById('txtUpload').onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('replyTextarea').value = e.target.result;
        };
        reader.readAsText(file);
    };
    </script>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Add Chat Reply', addReplyForm, true));
});

// 3. PRIORITY MANAGEMENT ON ADD (Backend Logic)
app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, sendMethod } = req.body;
    if (!replies) return res.status(400).send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>', true));

    // Calculate total rules for validation and default priority
    const totalRules = await ChatReply.countDocuments({});
    let newPriority = Number(priority);

    // 4. BACKEND VALIDATION SAME RAKH: + 5. DEFAULT PRIORITY ON NEW RULE
    if (isNaN(newPriority) || newPriority < 1 || newPriority > totalRules + 1) {
        newPriority = totalRules + 1; // default = last available priority
    }

    // If the rule is a catch-all (*), ensure it's always the last priority by overriding any user-set priority
    if (type === 'exact_match' && keyword === '*') {
        newPriority = totalRules + 1; // It must be after all existing rules
    }

    // Shift rules below this priority down
    await ChatReply.updateMany(
        { priority: { $gte: newPriority } },
        { $inc: { priority: 1 } }
    );

    const newReply = new ChatReply({
        ruleName,
        type,
        keyword: keyword || '',
        pattern: pattern || '',
        replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
        priority: newPriority, // Use the determined priority
        sendMethod: sendMethod || 'random'
    });
    await newReply.save();
    res.redirect('/admin/reply-list');
});


// ========== Stylish /admin/reply-list Route ==========
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    // 4. LISTING & LIVE SORTING: ALWAYS sort by priority ascending
    const replies = await ChatReply.find().sort({ priority: 1 }); // Sorted by priority ascending

    const listItems = replies.map((r, index) => `
        <div class="reply-card">
            <div class="reply-header">
                <span class="reply-name"><b>${(r.ruleName || 'Untitled').toUpperCase()}</b> <span class="reply-priority">${r.priority}</span> ${getReplyIcon(r)}
</div>
<div class="reply-body">
<div class="reply-receive">${formatReceive(r)}</div> <div class="reply-send">${formatSend(r)}</div>
</div>
<div class="reply-actions">
<a href="/admin/edit-reply/${r._id.toString()}" title="Edit"> <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4l-9.5 9.5-4 1 1-4L17 3Z"/><path d="M15 5l4 4"/></svg>
                </a>
                <a href="/admin/delete-reply/${r._id.toString()}" title="Delete" onclick="return confirm('Delete this rule?')"> <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>
                </a>
            </div>
        </div>
    `).join('');
    const content = `
        <div class="nobita-reply-panel">
            <div class="reply-list-header">
                <h2 class="nobita-title">REPLY LIST</h2>
                <a href="/admin/add-chat-replies" class="add-reply-btn-top">
                    <i class="lucide lucide-plus"></i>
                    <span>Add Reply</span>
                </a>
            </div>
            <div class="reply-list">
                ${listItems || '<em style="color:#f8e9ff; text-align:center; display:block;">No replies found.</em>'}
            </div>
            <a class="btn back" href="/admin/dashboard" style="margin-top:24px;">← Back to Dashboard</a>
        </div>
        `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Reply List', content, false, true));
});

// ========== EDIT REPLY ==========
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    try {
        const reply = await ChatReply.findById(req.params.id);
        if (!reply) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to List</a>', true));
        }
        let customVarsJsArray = '[]';
        try {
            const customVariables = await CustomVariable.find({});
            customVarsJsArray = JSON.stringify(customVariables.map(v => `%${v.name}%`));
        } catch (e) { console.error("Error fetching custom variables for form:", e); }

        const editReplyForm = `
        <div class="form-card">
            <button type="button" onclick="window.history.back()" class="back-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Back
            </button>
            <h2>Edit Chat Reply</h2>
            <form method="POST" action="/admin/edit-reply/${reply._id}">
                <label for="ruleName">Rule Name:</label>
                <input name="ruleName" id="ruleName" value="${reply.ruleName}" required />

                <label for="sendMethod">Send Method:</label>
                <div class="select-wrapper">
                  <select name="sendMethod" id="sendMethod">
                      <option value="random" ${reply.sendMethod === 'random' ? 'selected' : ''}>Random</option>
                      <option value="all" ${reply.sendMethod === 'all' ? 'selected' : ''}>All</option>
                      <option value="once" ${reply.sendMethod === 'once' ? 'selected' : ''}>Once (first one)</option>
                  </select>
                </div>

                <label for="type">Type:</label>
                <div class="select-wrapper">
                  <select name="type" id="type" required onchange="handleTypeChange()">
                      <option value="exact_match" ${reply.type === 'exact_match' ? 'selected' : ''}>Exact Match</option>
                      <option value="pattern_matching" ${reply.type === 'pattern_matching' ? 'selected' : ''}>Pattern Matching</option>
                      <option value="expert_pattern_matching" ${reply.type === 'expert_pattern_matching' ? 'selected' : ''}>Expert Regex</option>
                      <option value="welcome_message" ${reply.type === 'welcome_message' ? 'selected' : ''}>Welcome Message</option>
                  </select>
                </div>
                <div id="keywordField" style="${(reply.type === 'exact_match' || reply.type === 'pattern_matching' || reply.type === 'welcome_message') ? 'display:block;' : 'display:none;'}">
                    <label for="keyword">Keyword(s):</label>
                    <input name="keyword" id="keyword" value="${reply.keyword || ''}" placeholder="e.g. hi, hello" />
                </div>
                <div id="patternField" style="${reply.type === 'expert_pattern_matching' ? 'display:block;' : 'display:none;'}">
                    <label for="pattern">Regex Pattern:</label>
                    <input name="pattern" id="pattern" value="${reply.pattern || ''}" placeholder="Only for Expert Regex. Use () for capturing groups." />
                </div>
                <label for="replies">Replies (use &lt;#&gt; between lines):</label>
                <div class="reply-area-buttons">
                    <button type="button" id="customVarBtn" class="reply-icon-btn" title="Insert Variable">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
                            <polyline points="3 8 12 13 21 8"/>
                        </svg>
                        Custom Replacements
                    </button>
                    <input type="file" id="txtUpload" accept=".txt" style="display: none;">
                    <button type="button" id="uploadTxtBtn" class="reply-icon-btn" title="Upload TXT File">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 14.899V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5.1"/>
                            <path d="M12 2v13.5"/>
                            <path d="m7 9 5-5 5 5"/>
                        </svg>
                        Upload TXT
                    </button>
                </div>
                <textarea name="replies" id="replyTextarea" required>${reply.replies.join('<#>')}</textarea>

                <label for="priority">Priority:</label>
                <input type="number" name="priority" id="priority" value="${reply.priority}" min="1" required />
                <span style="font-size:12px; color:#aaa;">(Higher number = lower priority)</span>

                <button type="submit" class="btn-main">Update Reply</button>
            </form>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', handleTypeChange);
        function handleTypeChange() {
            const type = document.getElementById('type').value;
            const keywordField = document.getElementById('keywordField');
            const patternField = document.getElementById('patternField');

            keywordField.style.display = 'none';
            patternField.style.display = 'none';

            if (type === 'exact_match' || type === 'pattern_matching' || type === 'welcome_message') {
                keywordField.style.display = 'block';
            }
            if (type === 'expert_pattern_matching') {
                patternField.style.display = 'block';
            }
        }

        // Custom variables are injected from the server for this specific page
        window.customVars = ${customVarsJsArray};

        // 1. TXT File Upload Button For Textarea JS
        document.getElementById('uploadTxtBtn').onclick = function() {
            document.getElementById('txtUpload').click();
        };
        document.getElementById('txtUpload').onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('replyTextarea').value = e.target.result;
            };
            reader.readAsText(file);
        };
        </script>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Chat Reply', editReplyForm, true));
    } catch (error) {
        console.error('Error fetching reply for edit:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading reply for edit.</p><br><a href="/admin/reply-list">Back to List</a>', true));
    }
});

// 3. PRIORITY MANAGEMENT ON EDIT (Backend Logic)
app.post('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, sendMethod } = req.body;
    const replyId = req.params.id;
    if (!replies) return res.status(400).send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/edit-reply/' + replyId + '">Back to Edit Reply</a>', true));

    // Get current rule to find old priority and prevent self-update issues
    const currentReply = await ChatReply.findById(replyId);
    if (!currentReply) return res.status(404).send(getHtmlTemplate('Error', '<p>Rule not found for update.</p><br><a href="/admin/reply-list">Back to List</a>', true));

    const oldPriority = currentReply.priority;
    const totalRules = await ChatReply.countDocuments({}); // Get total rules for validation
    let newPriority = Number(priority);

    // 6. VALIDATION for Edit
    if (isNaN(newPriority) || newPriority < 1 || newPriority > totalRules) {
        return res.status(400).send(getHtmlTemplate('Invalid Priority', '<p>Invalid priority value. Priority must be between 1 and ' + totalRules + '.</p><br><a href="/admin/edit-reply/' + replyId + '">Try again</a>', true));
    }

    // If the rule is a catch-all (*), ensure it's always the last priority by overriding any user-set priority
    if (type === 'exact_match' && keyword === '*') {
        newPriority = totalRules; // It must be the last priority if it's the catch-all
    }

    try {
        // Shift others based on new priority
        if (newPriority < oldPriority) {
            // Shift rules between newPriority and oldPriority (exclusive of oldPriority) downwards
            await ChatReply.updateMany(
                { priority: { $gte: newPriority, $lt: oldPriority } },
                { $inc: { priority: 1 } }
            );
        } else if (newPriority > oldPriority) {
            // Shift rules between oldPriority (exclusive of oldPriority) and newPriority upwards
            await ChatReply.updateMany(
                { priority: { $lte: newPriority, $gt: oldPriority } },
                { $inc: { priority: -1 } }
            );
        }

        // Update the current rule
        await ChatReply.findByIdAndUpdate(replyId, {
            ruleName,
            type,
            keyword: keyword || '',
            pattern: pattern || '',
            replies: replies.split('<#>').map(r => r.trim()).filter(Boolean),
            priority: newPriority, // Update with the new validated priority
            sendMethod: sendMethod || 'random'
        });
        res.redirect('/admin/reply-list');
    } catch (error) {
        console.error('Error updating reply:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating reply.</p><br><a href="/admin/edit-reply/' + replyId + '">Try again</a>', true));
    }
});

// ========== DELETE REPLY ==========
app.get('/admin/delete-reply/:id', isAuthenticated, async (req, res) => {
    try {
        const deletedReply = await ChatReply.findByIdAndDelete(req.params.id); // Get the deleted reply to adjust priorities below it
        if (deletedReply) {
            // Shift rules below the deleted priority up
            await ChatReply.updateMany(
                { priority: { $gt: deletedReply.priority } },
                { $inc: { priority: -1 } }
            );
        }
        res.redirect('/admin/reply-list');
    } catch (error) {
        console.error('Error deleting reply:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting reply.</p><br><a href="/admin/reply-list">Back to List</a>', true));
    }
});

// ========== CUSTOM VARIABLE CRUD ==========
// List
app.get('/admin/custom-variables', isAuthenticated, async (req, res) => {
    try {
        const variables = await CustomVariable.find({});
        const listItems = variables.map(v => `
            <div class="custom-var-card fadein">
                <div class="var-header">
                    <div class="var-name"><code>%${v.name}%</code></div>
<div class="var-actions">
<button class="edit-var-btn" onclick="window.location='/admin/edit-custom-variable/${v._id}'" title="Edit"><i class="lucide lucide-pencil"></i></button>
                        <button class="delete-var-btn" onclick="deleteVariable('${v._id}','${v.name}')" title="Delete"><i class="lucide lucide-trash-2"></i></button>
                    </div>
                </div>
                <div class="var-value"><code>${v.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></div>
            </div>
        `).join('');
        const content = `
        <div class="custom-vars-panel">
            <div class="top-bar">
                <a href="/admin/dashboard" class="top-btn dash"><i class="lucide lucide-home"></i> Dashboard</a>
                <a href="/admin/add-custom-variable" class="top-btn add"><i class="lucide lucide-plus-circle"></i> Add New Variable</a>
            </div>
            <h2 class="big-head">Manage Custom Variables</h2>
            <div class="custom-var-list">${listItems || '<em style="color:#6a3cc9; text-align:center; display:block;">No variables found.</em>'}</div>
        </div>
        <script>
        function deleteVariable(id, name) {
            if(confirm("Delete variable %" + name + "%?")) {
                window.location = "/admin/delete-custom-variable/" + id;
            }
        }
        // Fade-in animation for cards
        document.addEventListener("DOMContentLoaded", ()=>{
            setTimeout(()=>{
                document.querySelectorAll('.custom-var-card').forEach((card, index) => {
                    setTimeout(() => card.classList.add('show'), index * 50);
                });
            },120);
        });
        </script>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Manage Custom Variables', content, false, false, true));
    } catch (error) {
        console.error('Error listing custom variables:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading custom variables.</p>', true));
    }
});
// Add Custom Variable
app.get('/admin/add-custom-variable', isAuthenticated, (req, res) => {
    const form = `
        <div class="edit-var-panel">
            <div class="top-bar">
                <a href="/admin/custom-variables" class="top-btn dash"><i class="lucide lucide-list"></i> All Variables</a>
                <a href="/admin/dashboard" class="top-btn add"><i class="lucide lucide-home"></i> Dashboard</a>
            </div>
            <form method="POST" action="/admin/add-custom-variable" class="edit-var-form fadein">
                <h2 class="edit-head"><i class="lucide lucide-plus-circle"></i> Add New Custom Variable</h2>
                <div class="field">
                    <label for="name">Variable Name (e.g., my_city, admin_email):</label>
                    <input name="name" id="name" placeholder="Should be unique, no spaces, e.g., welcome_greeting" required />
                </div>
                <div class="field">
                    <label for="value">Variable Value:</label>
                    <textarea name="value" id="value" placeholder="The actual text this variable will replace." required></textarea>
                </div>
                <button type="submit" class="btn-main"><i class="lucide lucide-save"></i> Add Variable</button>
            </form>
        </div>
        <script>
        document.addEventListener("DOMContentLoaded",()=>{
            setTimeout(()=>{document.querySelector('.fadein').classList.add('show');},80);
        });
        </script>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Add Custom Variable', form, false, false, true));
});
app.post('/admin/add-custom-variable', isAuthenticated, async (req, res) => {
    const { name, value } = req.body;
    try {
        const newVariable = new CustomVariable({ name: name.trim(), value });
        await newVariable.save();
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error adding custom variable:', error);
        let errorMessage = 'Error adding custom variable.';
        if (error.code === 11000) {
            errorMessage = `Variable name '%${name}%' already exists. Please choose a different name.`;
        }
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', `<p>${errorMessage}</p><br><a href="/admin/add-custom-variable">Try again</a>`, true));
    }
});
// Edit Custom Variable
app.get('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    try {
        const variable = await CustomVariable.findById(req.params.id);
        if (!variable) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Variable not found.</p><br><a href="/admin/custom-variables">Back to List</a>', true));
        }
        const form = `
            <div class="edit-var-panel">
            <div class="top-bar">
                <a href="/admin/custom-variables" class="top-btn dash"><i class="lucide lucide-list"></i> All Variables</a>
                <a href="/admin/dashboard" class="top-btn add"><i class="lucide lucide-home"></i> Dashboard</a>
            </div>
            <form method="POST" action="/admin/edit-custom-variable/${variable._id}" class="edit-var-form fadein">
                <h2 class="edit-head"><i class="lucide lucide-pencil"></i> Edit Custom Variable</h2>
                <div class="field">
                    <label for="name">Variable Name:</label>
                    <input name="name" id="name" value="${variable.name}" readonly />
                </div>
                <div class="field">
                    <label for="value">Variable Value:</label>
                    <textarea name="value" id="value" required>${variable.value}</textarea>
                </div>
                <button type="submit" class="btn-main"><i class="lucide lucide-save"></i> Update Variable</button>
            </form>
            </div>
            <script>
            document.addEventListener("DOMContentLoaded",()=>{
                setTimeout(()=>{document.querySelector('.fadein').classList.add('show');},80);
            });
            </script>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Custom Variable', form, false, false, true));
    } catch (error) {
        console.error('Error fetching custom variable for edit:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading variable for edit.</p><br><a href="/admin/custom-variables">Back to List</a>', true));
    }
});
app.post('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const { value } = req.body;
    try {
        await CustomVariable.findByIdAndUpdate(req.params.id, { value });
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error updating custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating custom variable.</p><br><a href="/admin/edit-custom-variable/' + req.params.id + '">Try again</a>', true));
    }
});
// Delete Custom Variable
app.get('/admin/delete-custom-variable/:id', isAuthenticated, async (req, res) => {
    try {
        await CustomVariable.findByIdAndDelete(req.params.id);
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error deleting custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting custom variable.</p><br><a href="/admin/custom-variables">Back to List</a>', true));
    }
});

// ========== Import/Export Routes ==========
app.get('/admin/import-export-rules', isAuthenticated, (req, res) => {
    const html = `
    <div class="admin-container">
        <a href="/admin/dashboard" class="back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back to Dashboard
        </a>
        <h1>Import / Export Rules</h1>
        <div style="display:flex;gap:22px;">
            <button class="rule-btn" onclick="showImport()">📥 Import</button>
            <button class="rule-btn" onclick="showExport()">📤 Export</button>
        </div>
        <div id="importSection" style="display:none;margin-top:30px;">
            <h2>Import Rules (.csv)</h2>
            <form id="importForm" action="/admin/import-rules" method="POST" enctype="multipart/form-data">
                <input type="file" name="csvfile" accept=".csv" required>
                <div style="margin:10px 0;">
                    <label><input type="radio" name="importMode" value="add" checked> Add</label>
                    <label><input type="radio" name="importMode" value="overwrite"> Overwrite</label>
                </div>
                <button class="rule-btn" type="submit">Upload & Import</button>
            </form>
        </div>
        <div id="exportSection" style="display:none;margin-top:30px;">
            <h2>Export Rules (.csv)</h2>
            <form id="exportForm" action="/admin/export-rules" method="POST">
                <input type="text" name="filename" placeholder="File Name" required value="nobita_rules">
                <button class="rule-btn" type="submit">Download</button>
            </form>
        </div>
    </div>
    <script>
        function showImport(){document.getElementById('importSection').style.display='block';document.getElementById('exportSection').style.display='none';}
        function showExport(){document.getElementById('importSection').style.display='none';document.getElementById('exportSection').style.display='block';}
    </script>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Import/Export Rules', html, false, true, false, true));
});

app.post('/admin/import-rules', isAuthenticated, upload.single('csvfile'), async (req, res) => {
    const mode = req.body.importMode;
    const filePath = req.file.path;
    const imported = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => imported.push(row))
        .on('end', async () => {
            try {
                if (mode === 'overwrite') {
                    // Delete all existing rules EXCEPT welcome messages
                    await ChatReply.deleteMany({ type: { $ne: 'welcome_message' } });
                }

                // Get current total rules for priority adjustment of new rules
                const currentTotalRules = await ChatReply.countDocuments({});
                let currentHighestPriority = 0; // Initialize to 0, will find max if rules exist
                if (currentTotalRules > 0) {
                    const highestPriorityRule = await ChatReply.findOne().sort({ priority: -1 });
                    if (highestPriorityRule) {
                        currentHighestPriority = highestPriorityRule.priority;
                    }
                }

                for (let r of imported) {
                    // Check if it's a welcome message AND if a welcome message already exists in DB (in 'overwrite' mode)
                    if (r.type === 'welcome_message' && mode === 'overwrite') {
                        const existingWelcome = await ChatReply.findOne({ type: 'welcome_message' });
                        if (existingWelcome) {
                            // If welcome exists, skip adding new one, or update existing one
                            // For simplicity as per instruction, we'll just skip adding duplicate welcome
                            console.log('Skipping duplicate welcome message import in overwrite mode.');
                            continue;
                        }
                    }

                    let rulePriority = Number(r.priority) || 0;

                    // If it's a catch-all rule, set its priority to be last after all existing rules
                    if (r.type === 'exact_match' && r.keyword === '*') {
                        rulePriority = currentHighestPriority + 1; // Put it one after the highest current priority
                    } else if (isNaN(rulePriority) || rulePriority < 1 || rulePriority > currentTotalRules + 1) {
                        // If priority is invalid or not set, place it at the end (before catch-all if it exists)
                        rulePriority = currentHighestPriority + 1;
                    }

                    // Shift existing rules if needed for this new rule's priority
                    await ChatReply.updateMany(
                        { priority: { $gte: rulePriority } },
                        { $inc: { priority: 1 } }
                    );

                    await ChatReply.create({
                        ruleName: r.name || r.ruleName || '',
                        type: r.type,
                        keyword: r.keyword,
                        pattern: r.pattern,
                        replies: (r.replies || '').split('<#>').map(s => s.trim()).filter(Boolean),
                        priority: rulePriority,
                        sendMethod: r.sendMethod || 'random'
                    });
                }
                fs.unlinkSync(filePath); // Clean up the uploaded file
                res.redirect('/admin/reply-list');
            } catch (e) {
                fs.unlinkSync(filePath); // Clean up even on error
                res.status(500).send(getHtmlTemplate('Import Failed', '<p>Import failed: ' + e.message + '</p><br><a href="/admin/import-export-rules">Back to Import/Export</a>', true));
            }
        })
        .on('error', (err) => { // Handle CSV parsing errors
            fs.unlinkSync(filePath);
            res.status(500).send(getHtmlTemplate('CSV Parsing Error', '<p>CSV Parsing Error: ' + err.message + '</p><br><a href="/admin/import-export-rules">Back to Import/Export</a>', true));
        });
});

app.post('/admin/export-rules', isAuthenticated, async (req, res) => {
    // 4. LISTING & LIVE SORTING: Export also sorted by priority
    const rules = await ChatReply.find({}).sort({ priority: 1 });
    let csvContent = 'ruleName,type,keyword,pattern,replies,priority,sendMethod\n'; // isDefault removed from header
    for (const r of rules) {
        // Escape double quotes within fields by doubling them
        const escapedRuleName = (r.ruleName || '').replace(/"/g,'""');
        const escapedKeyword = (r.keyword || '').replace(/"/g,'""');
        const escapedPattern = (r.pattern || '').replace(/"/g,'""');
        const escapedReplies = (r.replies || []).join('<#>').replace(/"/g,'""');

        csvContent += `"${escapedRuleName}","${r.type}","${escapedKeyword}","${escapedPattern}","${escapedReplies}",${r.priority},"${r.sendMethod||'random'}"\n`;
    }
    const fileName = (req.body.filename||'nobita_rules').replace(/[^a-z0-9_-]/gi,'_') + '.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvContent);
});


// ========== SERVER START ==========
app.listen(PORT, () => {
    console.log(`Nobita's Server running on port ${PORT}`);
});