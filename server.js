const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
function getHtmlTemplate(title, bodyContent, includeFormStyles = false, includeDashboardStyles = false) {
    let styles = '';
    if (includeFormStyles) {
        styles += `
        <style>
            body {
                background: linear-gradient(120deg, #eceafd 70%, #e2d4f5 100%);
                font-family: 'Inter', sans-serif; /* You might need to link this font */
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
                box-sizing: border-box; /* Important for responsive padding */
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
                margin-top: 15px; /* Spacing between fields */
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
                box-sizing: border-box; /* Include padding in width */
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
                align-items: flex-start; /* Align button to top of textarea */
                gap: 6px;
                position: relative;
                margin-bottom: 17px;
            }
            .reply-area textarea {
                flex: 1;
                margin-bottom: 0; /* Remove default margin from textarea */
                padding-right: 44px; /* Make space for the button inside textarea */
            }
            .reply-icon-btn {
                position: absolute;
                top: 5px; /* Adjust as needed */
                right: 5px; /* Adjust as needed */
                padding: 0;
                height: 28px; width: 28px;
                border-radius: 8px;
                border: none;
                background: rgba(155,105,255,0.09);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px #a97cfa24;
                backdrop-filter: blur(3px);
                transition: background 0.17s, transform 0.12s, box-shadow 0.17s;
            }
            .reply-icon-btn:hover {
                background: linear-gradient(92deg, #e2d6ff 30%, #cba9f9 100%);
                transform: scale(1.07);
                box-shadow: 0 4px 12px #a97cfa33;
            }
            .reply-icon-btn:active {
                transform: scale(0.95);
                box-shadow: 0 1px 4px #a97cfa24;
            }
            .reply-icon-btn svg {
                stroke: #7d38a8;
                fill: none;
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
                text-decoration: none; /* Remove underline for anchor tag */
                cursor: pointer;
                z-index: 10; /* Ensure it's above other elements */
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
                stroke: #7427bf; /* Default color for arrow */
                transition: stroke .14s;
            }
            .back-btn:hover svg {
                stroke: #502283; /* Hover color for arrow */
            }
            .back-btn:active svg {
                 stroke: #412276; /* Active color for arrow */
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
            #varPopup > div { /* Inner popup card */
                box-shadow: 0 4px 28px #55318c44;
            }
            #varPopup .var-list li {
                transition: background 0.1s;
            }

            /* Responsive Adjustments */
            @media (max-width: 500px) {
                .form-card {
                    margin: 20px auto;
                    padding: 25px 15px 20px 15px; /* Smaller padding on small screens */
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
                    height: 26px; width: 26px;
                    top: 4px; right: 4px;
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
                text-decoration: none; /* For anchor tags */
                color: inherit; /* For anchor tags */
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
            /* Reply List specific styles from previous versions, adjusted */
            .nobita-reply-panel {
                max-width: 600px;
                margin: 32px auto 60px auto;
                padding: 0 6px;
                position: relative; /* Needed for positioning the add button */
            }
            .nobita-title {
                color: #8227b3; /* Changed to match form heading color */
                font-family: 'Lexend', sans-serif;
                letter-spacing: 1.5px;
                margin-bottom: 0; /* Adjusted for flex container */
                text-align: left;
                font-weight: 800;
                font-size: 2.1rem;
                text-shadow: 0 2px 14px #e3d2ff7c;
            }
            .reply-list-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 24px;
                padding: 0; /* Reset padding for consistency */
            }
            .add-reply-btn-top {
                background: linear-gradient(90deg, #7e4af5 40%, #bf51e8 100%); /* Same as main button */
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
                box-shadow: 0 2px 8px #c79fff44;
            }
            .add-reply-btn-top:hover {
                background: linear-gradient(90deg, #6124d4 40%, #8227b3 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px #b48ffa55;
            }
             .add-reply-btn-top:active {
                transform: scale(0.98);
                box-shadow: 0 1px 4px #b48ffa55;
            }
            .add-reply-btn-top .lucide {
                font-size: 1.2rem;
            }

            .reply-card {
                background: linear-gradient(98deg, #272733 80%, #3d1153 100%);
                border: 1.5px solid #d074f9cc;
                border-radius: 16px;
                box-shadow: 0 3px 18px #0006;
                padding: 16px 16px 12px 16px;
                margin-bottom: 30px;
                position: relative;
            }
            .reply-header {
                font-size: 19px;
                font-weight: 700;
                color: #fff;
                letter-spacing: 1px;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .reply-title {
                text-transform: uppercase;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .reply-inner {
                background: rgba(34,34,40,0.75);
                border-radius: 10px;
                padding: 12px 14px 8px 14px;
            }
            .reply-row {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                margin-bottom: 7px;
                flex-wrap: wrap;
            }
            .reply-label {
                min-width: 70px;
                color: #ffc952;
                font-family: 'Lexend', 'Inter', sans-serif;
                font-weight: 600;
                font-size: 15px;
                letter-spacing: 0.3px;
            }
            .reply-label.send { color: #ff6f61; }
            .reply-label.receive { color: #46e579; }
            .reply-receive, .reply-send {
                color: #fff;
                font-family: 'Roboto Mono', monospace;
                font-size: 15px;
                white-space: pre-line;
                word-break: break-all;
            }
            hr {
                border: 0;
                border-top: 1.5px dashed #b197d6;
                margin: 8px 0 8px 0;
            }
            .reply-actions {
                position: absolute;
                top: 14px;
                right: 20px;
                display: flex;
                gap: 10px;
            }
            .reply-actions a svg {
                stroke: #ffc952;
                background: #232337;
                border-radius: 6px;
                padding: 2px;
                transition: background 0.15s, stroke 0.15s;
            }
            .reply-actions a:hover svg {
                background: #ffc952;
                stroke: #232337;
            }
            .btn.back {
                background: #282836;
                color: #ffc952;
                padding: 10px 22px;
                border-radius: 7px;
                text-decoration: none;
                font-weight: 700;
                font-size: 16px;
                margin-left: 0;
                display: block;
                width: fit-content;
            }
            .btn.back:hover { background: #ffc952; color: #282836; }

            /* Responsive Adjustments for Reply List */
            @media (max-width: 700px) {
                .add-reply-btn-top {
                    padding: 7px 10px;
                    font-size: 0; /* Hide text */
                    width: 40px; /* Fixed width for icon only */
                    height: 40px; /* Fixed height for icon only */
                    border-radius: 50%; /* Make it round */
                    justify-content: center;
                    align-items: center;
                }
                .add-reply-btn-top .lucide {
                    margin: 0; /* Remove margin */
                    font-size: 1.5rem; /* Bigger icon */
                }
                .add-reply-btn-top span {
                    display: none; /* Hide text */
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
            const li = document.createElement('li');
            li.textContent = v;
            li.style.cssText = "padding:8px 12px; cursor:pointer; border-radius:6px; font-size:16px; color:#7d38a8;";
            li.onmouseover = () => li.style.background = "#f3eaff";
            li.onmouseout = () => li.style.background = "";
            li.onclick = () => insertVarToReply(v);
            varList.appendChild(li);
          });
      }

      function insertVarToReply(variable) {
        // Find the currently focused textarea with id 'replies'
        // This is important for delegation, to know which textarea to insert into
        const textarea = document.getElementById('replies');
        if (textarea) { // Ensure textarea exists
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
      varPopup.addEventListener('click', function(e){
          if (e.target === varPopup) {
              varPopup.style.opacity = '0';
              varPopup.style.pointerEvents = 'none';
          }
      });


      // -------- FIXED PART: USE EVENT DELEGATION FOR BUTTON --------
      // Listen for clicks on the document body
      document.body.addEventListener('click', function(e){
        // Check if the clicked element (or its parent) has the 'reply-icon-btn' class
        // This allows the click to work even if the SVG icon itself is clicked
        if(e.target.closest('.reply-icon-btn')) {
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Lexend:wght@600;800&display=swap" rel="stylesheet">
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
const randomReply = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper function to truncate text
function trimText(txt, wordLimit) {
    if (!txt) return '';
    const words = txt.trim().split(/\s+/); // Split by one or more spaces
    return words.length > wordLimit ? words.slice(0, wordLimit).join(" ") + "..." : txt;
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

    // --- 1. Nested Custom Variable Resolver (with random pick for custom variable values) ---
    try {
        const customVariables = await CustomVariable.find({});
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
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
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

        const regexMatches = await ChatReply.find({ type: 'expert_pattern_matching' }).sort({ priority: -1 });
        for (const reply of regexMatches) {
            try {
                // Ensure pattern exists and is not null/empty for regex type
                if (reply.pattern) {
                    const regex = new RegExp(reply.pattern, 'i');
                    const match = regex.exec(userMessage);
                    if (match) {
                        matchedRegexGroups = match;
                        return res.json({ reply: await handleReplySend(reply, userMessage, matchedRegexGroups, req.session) });
                    }
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
            <a href="/admin/logout" class="admin-card">
                <i class="lucide lucide-log-out"></i>
                <span>Logout</span>
            </a>
        </div>
    </div>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Admin Dashboard', dashboardContent, false, true)); // Pass true for dashboard styles
});

// -- Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
});

// -- Add Chat Reply Form
app.get('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    let customVarsJsArray = '[]';
    try {
        const customVariables = await CustomVariable.find({});
        customVarsJsArray = JSON.stringify(customVariables.map(v => `%${v.name}%`));
    } catch (e) {
        console.error("Error fetching custom variables for form:", e);
    }

    const addReplyForm = `
    <div class="form-card">
        <a href="/admin/dashboard" class="back-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back
        </a>
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
                  <option value="">--Select Type--</option>
                  <option value="exact_match">Exact Match</option>
                  <option value="pattern_matching">Pattern Matching</option>
                  <option value="expert_pattern_matching">Expert Regex</option>
                  <option value="welcome_message">Welcome Message</p>
                  <option value="default_message">Default Message</option>
              </select>
            </div>

            <div id="keywordField" style="display:none;">
                <label for="keyword">Keyword(s):</label>
                <input name="keyword" id="keyword" placeholder="e.g. hi, hello" />
            </div>
            <div id="patternField" style="display:none;">
                <label for="pattern">Regex Pattern:</label>
                <input name="pattern" id="pattern" placeholder="Only for Expert Regex. Use () for capturing groups." />
            </div>

            <label for="replies">Replies (use &lt;#&gt; between lines):</label>
            <div class="reply-area">
              <textarea name="replies" id="replies" required></textarea>
              <button type="button" class="reply-icon-btn" title="Insert Variable">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
                  <polyline points="3 8 12 13 21 8"/>
                </svg>
              </button>
            </div>

            <label for="priority">Priority:</label>
            <input type="number" name="priority" id="priority" value="0" />

            <div id="isDefaultField" style="display:none;">
                <label for="isDefault">Is Default?</label>
                <div class="select-wrapper">
                    <select name="isDefault" id="isDefault">
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                    </select>
                </div>
            </div>

            <button type="submit" class="btn-main">Add Reply</button>
        </form>
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
        if (type === 'exact_match' || type === 'pattern_matching') keywordField.style.display = 'block';
        if (type === 'expert_pattern_matching') patternField.style.display = 'block';
        if (type === 'default_message') isDefaultField.style.display = 'block';
    }

    // Custom variables are injected from the server for this specific page
    window.customVars = ${customVarsJsArray};
    </script>
    `;
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Add Chat Reply', addReplyForm, true));
});

app.post('/admin/add-chat-replies', isAuthenticated, async (req, res) => {
    const { ruleName, type, keyword, pattern, replies, priority, isDefault, sendMethod } = req.body;
    if (!replies) return res.set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Replies required</p><br><a href="/admin/add-chat-replies">Back to Add Reply</a>'));
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

// ======= Helper Functions =======
function getReplyIcon(r) {
    if (r.type && r.type.includes('react')) return "😂";
    if (r.type === 'exact_match') return "🎯";
    if (r.type === 'pattern_matching') return "🧩";
    if (r.type === 'expert_pattern_matching') return "🧠";
    if (r.type === 'welcome_message') return "👋";
    if (r.type === 'default_message') return "💬";
    return "";
}

// Function to truncate text to a word limit
function truncateWords(txt, wordLimit) {
    if (!txt) return '';
    const words = txt.trim().split(/\s+/); // Split by one or more spaces
    // Check if the original string or truncated version is shorter
    const truncatedText = words.slice(0, wordLimit).join(" ");
    return words.length > wordLimit ? truncatedText + "..." : txt;
}
function formatReceive(r) {
    const text = (r.type === 'exact_match' || r.type === 'pattern_matching') ? r.keyword : (r.type === 'expert_pattern_matching' ? r.pattern : (r.keyword || r.pattern || ''));
    return truncateWords(text, 4); // Limit to 4 words for receive
}
function formatSend(r) {
    const text = (r.replies || []).join('<#>');
    return truncateWords(text, 20); // Limit to 20 words for send
}


// ========== Stylish /admin/reply-list Route ==========
app.get('/admin/reply-list', isAuthenticated, async (req, res) => {
    const replies = await ChatReply.find().sort({ priority: -1 });
    const listItems = replies.map((r, index) => `
        <div class="reply-card">
            <div class="reply-header">
                <span class="reply-title">${(r.ruleName || 'Untitled').toUpperCase()} ${getReplyIcon(r)}</span>
            </div>
            <div class="reply-inner">
                <div class="reply-row">
                    <span class="reply-label receive">Receive:</span>
                    <span class="reply-receive">${formatReceive(r)}</span>
                </div>
                <hr>
                <div class="reply-row">
                    <span class="reply-label send">Send:</span>
                    <span class="reply-send">${formatSend(r)}</span>
                </div>
            </div>
            <div class="reply-actions">
                <a href="/admin/edit-reply/${r._id}" title="Edit">
                  <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4l-9.5 9.5-4 1 1-4L17 3Z"/><path d="M15 5l4 4"/></svg>
                </a>
                <a href="/admin/delete-reply/${r._id}" title="Delete" onclick="return confirm('Delete this rule?')">
                  <svg height="20" width="20" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg>
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
            ${listItems || '<em>No replies found.</em>'}
            <a class="btn back" href="/admin/dashboard" style="margin-top:24px;">← Back to Dashboard</a>
        </div>
        <style>
            body { background: #1a1a1a; } /* Default background for reply list */
            .nobita-reply-panel {
                max-width: 600px;
                margin: 32px auto 60px auto;
                padding: 0 6px;
                position: relative;
            }
            .nobita-title {
                color: #fff; /* Revert to white for this dark background */
                font-family: 'Lexend', sans-serif;
                letter-spacing: 1px;
                margin-bottom: 0; /* Adjusted for flex container */
                text-align: left;
                font-weight: 700;
                font-size: 28px;
                text-shadow: none; /* Removed for dark background */
            }
            .reply-list-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 24px;
                padding: 0; /* Reset padding for consistency */
            }
            .add-reply-btn-top {
                background: linear-gradient(90deg, #4f46e5 40%, #6138ca 100%); /* Adjusted for dark background */
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


            .reply-card {
                background: linear-gradient(98deg, #272733 80%, #3d1153 100%);
                border: 1.5px solid #d074f9cc;
                border-radius: 16px;
                box-shadow: 0 3px 18px #0006;
                padding: 16px 16px 12px 16px;
                margin-bottom: 30px;
                position: relative;
            }
            .reply-header {
                font-size: 19px;
                font-weight: 700;
                color: #fff;
                letter-spacing: 1px;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .reply-title {
                text-transform: uppercase;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .reply-inner {
                background: rgba(34,34,40,0.75);
                border-radius: 10px;
                padding: 12px 14px 8px 14px;
            }
            .reply-row {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                margin-bottom: 7px;
                flex-wrap: wrap;
            }
            .reply-label {
                min-width: 70px;
                color: #ffc952;
                font-family: 'Lexend', 'Inter', sans-serif;
                font-weight: 600;
                font-size: 15px;
                letter-spacing: 0.3px;
            }
            .reply-label.send { color: #ff6f61; }
            .reply-label.receive { color: #46e579; }
            .reply-receive, .reply-send {
                color: #fff;
                font-family: 'Roboto Mono', monospace;
                font-size: 15px;
                white-space: pre-line;
                word-break: break-all;
            }
            hr {
                border: 0;
                border-top: 1.5px dashed #b197d6;
                margin: 8px 0 8px 0;
            }
            .reply-actions {
                position: absolute;
                top: 14px;
                right: 20px;
                display: flex;
                gap: 10px;
            }
            .reply-actions a svg {
                stroke: #ffc952;
                background: #232337;
                border-radius: 6px;
                padding: 2px;
                transition: background 0.15s, stroke 0.15s;
            }
            .reply-actions a:hover svg {
                background: #ffc952;
                stroke: #232337;
            }
            .btn.back {
                background: #282836;
                color: #ffc952;
                padding: 10px 22px;
                border-radius: 7px;
                text-decoration: none;
                font-weight: 700;
                font-size: 16px;
                margin-left: 0;
                display: block;
                width: fit-content;
            }
            .btn.back:hover { background: #ffc952; color: #282836; }

            /* Responsive Adjustments for Reply List */
            @media (max-width: 700px) {
                .add-reply-btn-top {
                    padding: 7px 10px;
                    font-size: 0; /* Hide text */
                    width: 40px; /* Fixed width for icon only */
                    height: 40px; /* Fixed height for icon only */
                    border-radius: 50%; /* Make it round */
                    justify-content: center;
                    align-items: center;
                }
                .add-reply-btn-top .lucide {
                    margin: 0; /* Remove margin */
                    font-size: 1.5rem; /* Bigger icon */
                }
                .add-reply-btn-top span {
                    display: none; /* Hide text */
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
    res.set('Content-Type', 'text/html').send(getHtmlTemplate('Reply List', content, false, true)); // Pass true for dashboard styles
});
// ========== EDIT REPLY ==========
app.get('/admin/edit-reply/:id', isAuthenticated, async (req, res) => {
    try {
        const reply = await ChatReply.findById(req.params.id);
        if (!reply) {
            return res.status(404).set('Content-Type', 'text/html').send(getHtmlTemplate('Not Found', '<p>Reply not found.</p><br><a href="/admin/reply-list">Back to List</a>'));
        }
        let customVarsJsArray = '[]';
        try {
            const customVariables = await CustomVariable.find({});
            customVarsJsArray = JSON.stringify(customVariables.map(v => `%${v.name}%`));
        } catch (e) { console.error("Error fetching custom variables for form:", e); }

        const editReplyForm = `
        <div class="form-card">
            <a href="/admin/reply-list" class="back-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Back
            </a>
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
                      <option value="default_message" ${reply.type === 'default_message' ? 'selected' : ''}>Default Message</option>
                  </select>
                </div>

                <div id="keywordField" style="${(reply.type === 'exact_match' || reply.type === 'pattern_matching') ? 'display:block;' : 'display:none;'}">
                    <label for="keyword">Keyword(s):</label>
                    <input name="keyword" id="keyword" value="${reply.keyword || ''}" placeholder="e.g. hi, hello" />
                </div>
                <div id="patternField" style="${reply.type === 'expert_pattern_matching' ? 'display:block;' : 'display:none;'}">
                    <label for="pattern">Regex Pattern:</label>
                    <input name="pattern" id="pattern" value="${reply.pattern || ''}" placeholder="Only for Expert Regex. Use () for capturing groups." />
                </div>

                <label for="replies">Replies (use &lt;#&gt; between lines):</label>
                <div class="reply-area">
                  <textarea name="replies" id="replies" required>${reply.replies.join('<#>')}</textarea>
                  <button type="button" class="reply-icon-btn" title="Insert Variable">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>
                      <polyline points="3 8 12 13 21 8"/>
                    </svg>
                  </button>
                </div>

                <label for="priority">Priority:</label>
                <input type="number" name="priority" id="priority" value="${reply.priority}" />

                <div id="isDefaultField" style="${reply.type === 'default_message' ? 'display:block;' : 'display:none;'}">
                    <label for="isDefault">Is Default?</label>
                    <div class="select-wrapper">
                        <select name="isDefault" id="isDefault">
                            <option value="false" ${!reply.isDefault ? 'selected' : ''}>No</option>
                            <option value="true" ${reply.isDefault ? 'selected' : ''}>Yes</option>
                        </select>
                    </div>
                </div>

                <button type="submit" class="btn-main">Update Reply</button>
            </form>
        </div>

        <script>
        document.addEventListener('DOMContentLoaded', handleTypeChange); // Call on DOM ready
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

        // Custom variables are injected from the server for this specific page
        window.customVars = ${customVarsJsArray};
        </script>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Edit Chat Reply', editReplyForm, true));
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
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating reply.</p><br><a href="/admin/edit-reply/' + replyId + '">Try again</a>'));
    }
});

// ========== DELETE REPLY ==========
app.get('/admin/delete-reply/:id', isAuthenticated, async (req, res) => {
    try {
        await ChatReply.findByIdAndDelete(req.params.id);
        res.redirect('/admin/reply-list');
    } catch (error) {
        console.error('Error deleting reply:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error deleting reply.</p><br><a href="/admin/reply-list">Back to List</a>'));
    }
});

// ========== CUSTOM VARIABLE CRUD ==========
// List
app.get('/admin/custom-variables', isAuthenticated, async (req, res) => {
    try {
        const variables = await CustomVariable.find({});
        const listItems = variables.map(v => `
            <div class="custom-var-box">
                <div class="var-header">
                    <div class="var-name">%${v.name}%</div>
                    <div class="var-actions">
                        <a title="Edit" href="/admin/edit-custom-variable/${v._id}"><svg height="22" width="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4l-9.5 9.5-4 1 1-4L17 3Z"/><path d="M15 5l4 4"/></svg></a>
                        <a title="Delete" href="/admin/delete-custom-variable/${v._id}" onclick="return confirm('Delete this variable?')"><svg height="22" width="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></svg></a>
                    </div>
                </div>
                <div class="var-value">${v.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            </div>
        `).join('');
        const content = `
            <h2 style="margin-top:0;">Manage Custom Variables</h2>
            <div class="custom-var-list">${listItems || '<em>No variables found.</em>'}</div>
            <a class="btn" href="/admin/add-custom-variable">➕ Add New Variable</a>
            <a class="btn back" href="/admin/dashboard">← Back to Dashboard</a>
            <style>
            .custom-var-list { display: flex; flex-direction: column; gap: 18px; margin: 18px 0 30px 0; width: 100%; max-width: 600px; margin-left: auto; margin-right: auto; }
            .custom-var-box { background: linear-gradient(95deg, #fff, #f2e6ff 60%); border: 1.5px solid #c7b0fa; border-radius: 14px; box-shadow: 0 2px 12px #b785fa22; padding: 14px 22px 10px 22px; position: relative; transition: box-shadow 0.18s; width: 100%; min-height: 85px; display: flex; flex-direction: column; justify-content: flex-start; box-sizing: border-box; }
            .custom-var-box:hover { box-shadow: 0 4px 18px #bb6ffa33; }
            .var-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 18px; }
            .var-name { font-family: 'Lexend', 'Inter', sans-serif; font-size: 18px; font-weight: 700; color: #7339b3; word-break: break-all; }
            .var-actions a { display: inline-flex; align-items: center; color: #656565; margin-left: 10px; opacity: 0.82; transition: color 0.18s, opacity 0.12s; }
            .var-actions a:hover { color: #9e2cff; opacity: 1; }
            .var-actions svg { vertical-align: middle; margin-bottom: 1.5px; }
            .var-value { font-family: 'Roboto Mono', monospace; font-size: 15px; color: #272b34; max-height: 52px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; background: #f8f6fa; border-radius: 8px; padding: 9px 14px; margin-bottom: 2px; word-break: break-all; width: 100%; min-height: 34px; box-sizing: border-box; display: block; }
            </style>
        `;
        res.set('Content-Type', 'text/html').send(getHtmlTemplate('Manage Custom Variables', content));
    } catch (error) {
        console.error('Error listing custom variables:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error loading custom variables.</p>'));
    }
});
// Add
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
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', `<p>${errorMessage}</p><br><a href="/admin/add-custom-variable">Try again</a>`));
    }
});
// Edit
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
app.post('/admin/edit-custom-variable/:id', isAuthenticated, async (req, res) => {
    const { value } = req.body;
    try {
        await CustomVariable.findByIdAndUpdate(req.params.id, { value });
        res.redirect('/admin/custom-variables');
    } catch (error) {
        console.error('Error updating custom variable:', error);
        res.status(500).set('Content-Type', 'text/html').send(getHtmlTemplate('Error', '<p>Error updating custom variable.</p><br><a href="/admin/edit-custom-variable/' + req.params.id + '">Try again</a>'));
    }
});
// Delete
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
    console.log(`Nobita's Server running on port ${PORT}`);
});