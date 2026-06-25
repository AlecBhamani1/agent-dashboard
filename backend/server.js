const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Allow the React dev server (and other clients) to call the REST endpoints.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());

// Simple health check so you can confirm the backend is up.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Issue a JWT for a username. The dashboard needs a token to connect, and
// without this endpoint there was no way to obtain one. This is a dev-friendly
// login (no password store) — replace with real credential checks for production.
app.post('/api/login', (req, res) => {
  const { username } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'username is required' });
  }
  const name = username.trim();
  const token = jwt.sign(
    { userId: name, username: name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, username: name });
});

// Middleware to authenticate socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token required'));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  });
});

// Store connected agents
const agents = new Map(); // socketId => { userId, username, type, capabilities, tokenUsage }

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId, socket.username);

  // Register agent
  socket.on('register', (data) => {
    const { type, capabilities } = data;
    agents.set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      type,
      capabilities,
      tokenUsage: 0,
      lastSeen: Date.now()
    });
    // Notify others about new agent
    socket.broadcast.emit('agent-joined', {
      userId: socket.userId,
      username: socket.username,
      type,
      capabilities
    });
    // Send current agents to the newly connected agent
    const agentsList = [];
    agents.forEach((agent, id) => {
      if (id !== socket.id) {
        agentsList.push({
          id,
          userId: agent.userId,
          username: agent.username,
          type: agent.type,
          capabilities: agent.capabilities,
          tokenUsage: agent.tokenUsage
        });
      }
    });
    socket.emit('agents-list', agentsList);
  });

  // Handle heartbeat
  socket.on('heartbeat', () => {
    const agent = agents.get(socket.id);
    if (agent) {
      agent.lastSeen = Date.now();
    }
  });

  // Handle messages between agents
  socket.on('send-message', (data) => {
    const { targetId, message } = data;
    // Prepare payload with sender info and original data
    const payload = {
      from: socket.id,
      fromUsername: socket.username,
      message,
      ...data // Includes targetId, isPrompt, etc.
    };
    if (targetId) {
      // Direct message
      io.to(targetId).emit('receive-message', payload);
    } else {
      // Broadcast to all except sender
      socket.broadcast.emit('receive-message', payload);
    }
  });

  // Handle token usage reporting
  socket.on('report-token-usage', (usage) => {
    const agent = agents.get(socket.id);
    if (agent) {
      agent.tokenUsage += usage;
      // Emit updated token usage to all clients (for dashboard)
      io.emit('agent-token-update', {
        agentId: socket.id,
        tokenUsage: agent.tokenUsage
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.userId, socket.username, reason);
    const agent = agents.get(socket.id);
    if (agent) {
      agents.delete(socket.id);
      io.emit('agent-left', { userId: socket.userId, username: socket.username });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});