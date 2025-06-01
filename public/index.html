<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Chatbot</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f4f4f4; }
        .chat-container { background-color: #fff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 400px; display: flex; flex-direction: column; height: 500px; overflow: hidden; }
        .chat-messages { flex-grow: 1; padding: 20px; overflow-y: auto; border-bottom: 1px solid #eee; }
        .message { margin-bottom: 10px; padding: 8px 12px; border-radius: 5px; max-width: 80%; }
        .message.user { background-color: #007bff; color: white; align-self: flex-end; margin-left: auto; }
        .message.bot { background-color: #e2e6ea; color: #333; align-self: flex-start; margin-right: auto; }
        .chat-input { display: flex; padding: 15px; border-top: 1px solid #eee; }
        .chat-input input { flex-grow: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin-right: 10px; }
        .chat-input button { padding: 10px 15px; background-color: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .chat-input button:hover { background-color: #218838; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
            </div>
        <div class="chat-input">
            <input type="text" id="message-input" placeholder="Type your message...">
            <button id="send-button">Send</button>
        </div>
    </div>

    <script>
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const chatMessages = document.getElementById('chat-messages');

        // Function to display a message in the chat
        function displayMessage(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', sender);
            messageDiv.textContent = text;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom
        }

        // Function to send a message to the server
        async function sendMessage() {
            const text = messageInput.value.trim();
            if (text === '') return;

            displayMessage(text, 'user'); // Display user's message immediately
            messageInput.value = ''; // Clear input

            try {
                const response = await fetch('/api/message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text })
                });

                const data = await response.json();
                if (response.ok) {
                    displayMessage(data.botMessage.text, 'bot'); // Display bot's reply
                } else {
                    console.error('Error from server:', data.error);
                    displayMessage('Error: Could not get a reply from the bot.', 'bot');
                }
            } catch (error) {
                console.error('Network error:', error);
                displayMessage('Error: Could not connect to the server.', 'bot');
            }
        }

        // Event listeners
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Optional: Load chat history when the page loads
        async function loadChatHistory() {
            try {
                const response = await fetch('/api/messages');
                const messages = await response.json();
                if (response.ok) {
                    messages.forEach(msg => displayMessage(msg.text, msg.sender));
                } else {
                    console.error('Error loading history:', messages.error);
                }
            } catch (error) {
                console.error('Network error loading history:', error);
            }
        }

        loadChatHistory(); // Call this on page load
    </script>
</body>
</html>
