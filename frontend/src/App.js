import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Box,
  Button,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  CircularProgress,
  Container,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
const MAX_RETRIES = 5;

function App() {
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [tokenUsage, setTokenUsage] = useState({});
  // loading is only true while a connection attempt is actually in flight.
  // It starts false so the login screen is reachable on startup.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, connecting, connected, retrying, failed
  const [retryCount, setRetryCount] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState(''); // '' means broadcast to all
  const [promptValue, setPromptValue] = useState('');
  const [token, setToken] = useState(''); // JWT token, obtained via login

  // Login form state
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const socketRef = useRef(null);
  const timeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  // Bumping this re-runs the connection effect to trigger a reconnect attempt.
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    if (!token) {
      setConnectionStatus('idle');
      setLoading(false);
      return;
    }

    // Clear any pending timeouts from a previous attempt.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setLoading(true);
    setError(null);
    setConnectionStatus(retryCount > 0 ? 'retrying' : 'connecting');

    const socketInstance = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 0, // we handle retries ourselves
      timeout: 5000,
    });

    socketRef.current = socketInstance;

    // Safety net: if neither 'connect' nor 'connect_error' fires, don't hang forever.
    timeoutRef.current = setTimeout(() => {
      if (!socketInstance.connected) {
        socketInstance.disconnect();
        handleConnectionFailure('Connection timeout');
      }
    }, 10000);

    socketInstance.on('connect', () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      console.log('Connected to server');
      setLoading(false);
      setError(null);
      setConnectionStatus('connected');
      setRetryCount(0);
      // Register this dashboard as an agent so it appears in the roster.
      socketInstance.emit('register', {
        type: 'dashboard',
        capabilities: ['view', 'prompt'],
      });
    });

    socketInstance.on('connect_error', (err) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      console.error('Connection error:', err);
      handleConnectionFailure(err.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      // Don't treat an intentional client-side disconnect (cleanup/retry) as an error.
      if (reason !== 'io client disconnect') {
        handleConnectionFailure('Server disconnected');
      }
    });

    socketInstance.on('agents-list', (agentList) => setAgents(agentList));
    socketInstance.on('agent-joined', (agent) => setAgents((prev) => [...prev, agent]));
    socketInstance.on('agent-left', ({ userId }) =>
      setAgents((prev) => prev.filter((agent) => agent.userId !== userId))
    );
    socketInstance.on('receive-message', (msg) => setMessages((prev) => [...prev, msg]));
    socketInstance.on('agent-token-update', ({ agentId, tokenUsage: usage }) =>
      setTokenUsage((prev) => ({ ...prev, [agentId]: usage }))
    );

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      socketInstance.disconnect();
    };
  }, [token, reconnectNonce]);

  const handleConnectionFailure = (message) => {
    console.log('Handling connection failure:', message);
    setError(message);

    if (retryCount < MAX_RETRIES) {
      // Schedule an automatic retry with exponential backoff.
      const delay = Math.min(1000 * 2 ** retryCount, 10000);
      setConnectionStatus('retrying');
      setLoading(true);
      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount((c) => c + 1);
        setReconnectNonce((n) => n + 1);
      }, delay);
    } else {
      // Give up automatic retries; show a failure screen with a manual retry.
      setConnectionStatus('failed');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const name = username.trim();
    if (!name) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${SOCKET_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Login failed (${res.status})`);
      }
      const data = await res.json();
      setRetryCount(0);
      setToken(data.token);
    } catch (err) {
      setAuthError(
        `Could not reach the server at ${SOCKET_URL}. Is the backend running? (${err.message})`
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const manualRetry = () => {
    setRetryCount(0);
    setError(null);
    setReconnectNonce((n) => n + 1);
  };

  const logout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setToken('');
    setAgents([]);
    setMessages([]);
    setError(null);
    setConnectionStatus('idle');
  };

  const sendChatMessage = () => {
    if (!inputValue.trim()) return;
    const socketInst = socketRef.current;
    if (socketInst && socketInst.connected) {
      socketInst.emit('send-message', { message: inputValue });
      setInputValue('');
    } else {
      setError('Not connected to server. Please wait for connection or check your network.');
    }
  };

  const sendPrompt = () => {
    if (!promptValue.trim()) return;
    const socketInst = socketRef.current;
    if (socketInst && socketInst.connected) {
      const targetId = selectedAgentId || undefined; // undefined means broadcast
      socketInst.emit('send-message', {
        targetId,
        message: promptValue,
        isPrompt: true,
      });
      setPromptValue('');
    } else {
      setError('Not connected to server. Please wait for connection or check your network.');
    }
  };

  // 1. No token yet -> show the login screen (reachable on startup now).
  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Agent Dashboard
        </Typography>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          fullWidth
          sx={{ mt: 2 }}
          helperText="Enter a username to connect to the dashboard"
        />
        <Button
          variant="contained"
          onClick={handleLogin}
          disabled={!username.trim() || authLoading}
          sx={{ mt: 2 }}
          fullWidth
        >
          {authLoading ? 'Connecting...' : 'Connect'}
        </Button>
        {authError && (
          <Typography color="error" sx={{ mt: 2 }} align="center">
            {authError}
          </Typography>
        )}
      </Container>
    );
  }

  // 2. Connection attempt in flight (or auto-retrying) -> show the spinner.
  if (loading) {
    let statusText = 'Connecting...';
    if (connectionStatus === 'retrying') {
      statusText = `Connection lost. Retrying (attempt ${retryCount + 1}/${MAX_RETRIES})...`;
    }
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Agent Dashboard
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress />
          <Typography variant="caption" sx={{ mt: 2 }}>
            {statusText}
          </Typography>
          <Button variant="text" size="small" sx={{ mt: 2 }} onClick={logout}>
            Cancel
          </Button>
        </Box>
      </Container>
    );
  }

  // 3. Retries exhausted -> failure screen with a manual retry.
  if (connectionStatus === 'failed') {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography color="error" align="center">
          Connection failed: {error || 'Unable to reach the server.'}
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button variant="contained" onClick={manualRetry}>
            Try Reconnecting
          </Button>
          <Button variant="outlined" onClick={logout}>
            Log Out
          </Button>
        </Box>
      </Container>
    );
  }

  // 4. Connected -> the dashboard.
  return (
    <>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Agents Sidebar */}
        <Box sx={{ width: 250, borderRight: 1, p: 2, backgroundColor: '#fff' }}>
          <Typography variant="h6" gutterBottom>
            Connected Agents
          </Typography>
          <List>
            {agents.map((agent) => (
              <ListItem key={agent.userId} sx={{ mb: 1 }}>
                <ListItemAvatar>
                  <Avatar>{(agent.username || '?').charAt(0).toUpperCase()}</Avatar>
                </ListItemAvatar>
                <ListItemText primary={agent.username} secondary={agent.type} />
                <Chip
                  label={`Tokens: ${tokenUsage[agent.userId] || 0}`}
                  size="small"
                  sx={{ ml: 1 }}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Chat and Prompt Main */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Chat Area */}
            <Box sx={{ flex: 1, overflow: 'auto', mb: 2, p: 2, backgroundColor: '#fff', borderRadius: 1 }}>
              <Typography variant="h5" gutterBottom>
                Chat
              </Typography>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column-reverse' }}>
                {messages.map((msg, index) => {
                  const isPrompt = msg.isPrompt;
                  return (
                    <Box
                      key={index}
                      sx={{ mb: 1, p: 1, borderRadius: 1, backgroundColor: isPrompt ? '#fff3e0' : '#e3f2fd', maxWidth: '80%' }}
                    >
                      <Typography variant="body1">
                        <strong>{msg.fromUsername || 'Agent'}:</strong> {msg.message}
                        {isPrompt && ' (PROMPT)'}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
            <Box sx={{ display: 'flex' }}>
              <TextField
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a chat message..."
                fullWidth
                sx={{ mr: 2 }}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              />
              <Button variant="contained" onClick={sendChatMessage}>
                Send Chat
              </Button>
            </Box>
          </Box>

          {/* Prompt Area */}
          <Box sx={{ mt: 2, p: 2, backgroundColor: '#fff', borderRadius: 1 }}>
            <Typography variant="h5" gutterBottom>
              Send Prompt to Agent
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}>
              <FormControl fullWidth sx={{ mb: 1 }}>
                <InputLabel id="agent-label">Select Agent</InputLabel>
                <Select
                  labelId="agent-label"
                  value={selectedAgentId}
                  label="Select Agent"
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  sx={{ width: '100%' }}
                >
                  <MenuItem value="">
                    <em>All Agents (Broadcast)</em>
                  </MenuItem>
                  {agents.map((agent) => (
                    <MenuItem key={agent.userId} value={agent.userId}>
                      {agent.username} ({agent.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder="Enter prompt..."
                fullWidth
                sx={{ mb: 1 }}
                onKeyPress={(e) => e.key === 'Enter' && sendPrompt()}
              />
              <Button variant="contained" color="secondary" onClick={sendPrompt}>
                Send Prompt
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default App;
