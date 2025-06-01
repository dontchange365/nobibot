// server.js

const express = require('express');
const http = require('http'); // Node.js built-in HTTP module
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path'); // Node.js built-in path module

const app = express();
const server = http.createServer(app); // Create HTTP server using Express app
const io = new socketIo.Server(server); // Initialize Socket.IO with the HTTP server

const PORT = process.env.PORT || 3000;
const MONGODB_URI = 'mongodb://localhost:27017/instagram_chat'; // Your MongoDB connection string

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Message Schema and Model ---
const messageSchema = new mongoose.Schema({
    username: String, // To differentiate sender (e.g., 'You' or 'Other')
    text: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// --- Serve Static Files ---
// This tells Express to serve your HTML, CSS, JS from the current directory.
app.use(express.static(__dirname));

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send existing messages to the new user
    Message.find().sort({ timestamp: 1 }).limit(50) // Fetch last 50 messages
        .then(messages => {
            socket.emit('load_messages', messages);
        })
        .catch(err => console.error('Error loading messages:', err));

    // Handle incoming messages
    socket.on('chat_message', (msg) => {
        console.log('message: ' + msg.text + ' from ' + msg.username);

        // Create a new message document
        const newMessage = new Message({
            username: msg.username, // This will be 'You' from client for now
            text: msg.text
        });

        // Save message to database
        newMessage.save()
            .then(() => {
                // Emit the message to all connected clients
                io.emit('chat_message', newMessage); // Emit the saved message (with ID and timestamp)
            })
            .catch(err => console.error('Error saving message:', err));
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open your browser at http://localhost:${PORT}`);
});
