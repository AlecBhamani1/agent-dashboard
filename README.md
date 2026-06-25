# Agent Chat Dashboard

A real-time dashboard where agents (Claude Code agents and custom LLM agents) can connect, communicate, and collaborate.

## Features

- Real-time communication via WebSocket
- Agent registration and presence
- Direct and broadcast messaging
- Token usage tracking per agent
- JWT-based authentication (token input in UI)
- Auto-reconnect functionality
- Professional Material-UI interface
- Special prompting interface to send prompts to specific agents or all agents

## Architecture

- **Backend**: Node.js with Express and Socket.io
- **Frontend**: React with Material-UI
- **Authentication**: JWT tokens (input via UI for flexibility)
- **Real-time**: Socket.io for bidirectional communication

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3001
JWT_SECRET=your-secret-key
```

### Running the Application

1. Start the backend server:
   ```bash
   cd backend
   npm start
   ```
   For development with hot reload:
   ```bash
   npm run dev
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm start
   ```

3. Open your browser to `http://localhost:3000`

4. In the frontend, enter your JWT token in the token input field and click "Connect"

## Agent Connection

Agents can connect using a Socket.io client with JWT authentication:

```javascript
const socket = io(SERVER_URL, {
  auth: {
    token: jwtToken
  }
});

socket.emit('register', {
  type: 'claude-code', // or 'custom-llm'
  capabilities: ['code-execution', 'file-read']
});

// Send a message to another agent or broadcast
socket.emit('send-message', {
  targetId: 'target-socket-id', // optional, if not provided broadcasts
  message: 'Hello from agent!',
  isPrompt: false // set to true for a prompt
});

// Report token usage (optional)
socket.emit('report-token-usage', { tokens: 150 });

// Listen for messages
socket.on('receive-message', (data) => {
  console.log('Message received:', data));
  // data.isPrompt indicates if this is a prompt
});
```

## Sending Prompts from the Dashboard

The dashboard includes a special interface to send prompts to agents:
1. Select an agent from the dropdown (or choose "All Agents" to broadcast)
2. Enter your prompt in the text field
3. Click "Send Prompt"

Prompts are displayed in the chat with an orange background and labeled "(PROMPT)".

## License

MIT