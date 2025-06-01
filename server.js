// server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const path = require('path'); // For serving static files

const app = express();
const port = process.env.PORT || 3000; // Use port from environment or default to 3000

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files (your index.html, CSS, client-side JS)
app.use(express.static(path.join(__dirname, 'public'))); // Assuming index.html is in a 'public' folder

// MongoDB Connection
// It's best practice to store your MONGODB_URI in a .env file
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI is not defined in environment variables.");
    process.exit(1); // Exit the process if URI is missing
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if connection fails
    });

// Define a simple Mongoose Schema and Model for chat messages
const messageSchema = new mongoose.Schema({
    text: { type: String, required: true },
    sender: { type: String, required: true }, // 'user' or 'bot'
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// API endpoint for sending messages
app.post('/api/message', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Message text is required.' });
    }

    try {
        // Save user message to DB
        const userMessage = new Message({ text, sender: 'user' });
        await userMessage.save();

        // Simulate a bot reply (you'll replace this with actual bot logic)
        let botReplyText = "Hello! How can I help you today?";
        if (text.toLowerCase().includes('hi') || text.toLowerCase().includes('hello')) {
            botReplyText = "Hi there! What's on your mind?";
        } else if (text.toLowerCase().includes('weather')) {
            botReplyText = "I don't have real-time weather information, but it's always sunny in the world of code!";
        } else {
            botReplyText = "I received your message: '" + text + "'. I'm a simple bot right now.";
        }

        // Save bot reply to DB
        const botMessage = new Message({ text: botReplyText, sender: 'bot' });
        await botMessage.save();

        res.status(200).json({ userMessage, botMessage }); // Send back both messages
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Optional: API endpoint to get all messages (for chat history)
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
