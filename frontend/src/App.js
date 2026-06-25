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

function App() {
  const [socket, setSocket] = useState(null);
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [tokenUsage, setTokenUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, connecting, connected, failed, retrying
  const [retryCount, setRetryCount] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState(null); // For prompting
  const [promptValue, setPromptValue] = useState('');
  const [token, setToken] = useState(''); // JWT token for authentication

  const socketRef = useRef(null);
  const timeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    if (!token) {
      // No token, do not connect
      setConnectionStatus('idle');
      return;
    }

    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Reset retry count when token changes
    setRetryCount(0);
    setConnectionStatus('connecting');

    const socketInstance = io(SOCKET_URL, {
      auth: {
        token: token
      },
      // Socket.io client options to reduce reconnect aggressiveness
      reconnectionAttempts: 0, // We'll handle retries ourselves
      timeout: 5000 // 5 second connection timeout
    });

    socketRef.current = socketInstance;

    const connectionTimeout = setTimeout(() => {
      if (socketInstance && !socketInstance.connected) {
        socketInstance.disconnect();
        handleConnectionFailure('Connection timeout');
      }
    }, 10000); // 10 second overall timeout

    timeoutRef.current = connectionTimeout;

    socketInstance.on('connect', () => {
      // Clear timeout on successful connection
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      console.log('Connected to server');
      setLoading(false);
      setError(null);
      setConnectionStatus('connected');
      setRetryCount(0);
    });

    socketInstance.on('connect_error', (err) => {
      // Clear timeout on connection error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      console.error('Connection error:', err);
      handleConnectionFailure(err.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      // Only set error if we were connected and didn't initiate disconnect
      if (socketInstance.connected === false && reason !== 'io client disconnect') {
        handleConnectionFailure('Server disconnected');
      }
    });

    socketInstance.on('agents-list', (agentList) => {
      setAgents(agentList);
    });

    socketInstance.on('agent-joined', (agent) => {
      setAgents(prev => [...prev, agent]);
    });

    socketInstance.on('agent-left', ({ userId, username }) => {
      setAgents(prev => prev.filter(agent => agent.userId !== userId));
    });

    socketInstance.on('receive-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socketInstance.on('agent-token-update', ({ agentId, tokenUsage: usage }) => {
      setTokenUsage(prev => ({
        ...prev,
        [agentId]: usage
      }));
    });

    return () => {
      // Cleanup timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [token]);

  const handleConnectionFailure = (message) => {
    console.log('Handling connection failure:', message);
    setError(message);
    setConnectionStatus('failed');

    // If we're still loading (never connected), set loading to false after timeout
    if (loading) {
      setLoading(false);
    }

    // Schedule retry with exponential backoff
    // Max 5 retries, then stop retrying automatically
    if (retryCount < 5) {
      setConnectionStatus('retrying');
      const retryDelay = Math.min(1000 * 2 ** retryCount, 10000); // Exponential backoff, max 10 seconds
      setTimeout(() => {
        // Try to reconnect by triggering the useEffect again
        // We do this by setting the token again (which triggers the effect)
        setToken(token);
      }, retryDelay);
    }
  };

  const sendChatMessage = () => {
    if (!inputValue.trim()) return;
    const socketInst = socketRef.current;
    if (socketInst && socketInst.connected) {
      socketInst.emit('send-message', {
        message: inputValue
      });
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
        isPrompt: true
      });
      setPromptValue('');
    } else {
      setError('Not connected to server. Please wait for connection or check your network.');
    }
  };

  // Render loading state with connection status
  if (loading) {
    let statusText = 'Connecting...';
    if (connectionStatus === 'failed') {
      statusText = 'Connection failed. Retrying...';
    } else if (connectionStatus === 'retrying') {
      statusText = `Retrying connection (attempt ${retryCount + 1}/5)...`;
    }

    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" align="center">
          Agent Dashboard
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress />
          <Typography variant="caption" sx={{ mt: 2 }}>
            {statusText}
          </Typography>
          {connectionStatus === 'failed' && (
            <Button variant="outlined" size="small" onClick={() => setToken(token)}>
              Retry Now
            </Button>
          )}
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography color="error" align="center">
          Connection error: {error}
        </Typography>
        {connectionStatus === 'failed' && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Button variant="contained" onClick={() => setToken(token)}>
              Try Reconnecting
            </Button>
          </Box>
        )}
      </Container>
    );
  }

  // If no token, show token input
  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Typography variant="h4" align="center">
          Agent Dashboard
        </Typography>
        <TextField
          label="JWT Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          fullWidth
          sx={{ mt: 2 }}
          InputLabelProps={{
            shrink: true,
          }}
          helperText="Enter your JWT token to connect to the server"
        />
        <Button variant="contained" onClick={() => setToken(token.trim())} disabled={!token.trim()}>
          Connect
        </Button>
        <Typography variant="caption" align="center" sx={{ mt: 2 }}>
          For testing, you can use a token generated by your authentication system.
        </Typography>
      </Container>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Agents Sidebar */}
        <Box sx={{ width: 250, borderRight: 1, p: 2, backgroundColor: '#fff' }}>
          <Typography variant="h6" gutterBottom>
            Connected Agents
          </Typography>
          <List>
            {agents.map(agent => (
              <ListItem key={agent.userId} sx={{ mb: 1 }}>
                <ListItemAvatar>
                  <Avatar>{agent.username.charAt(0).toUpperCase()}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={agent.username}
                  secondary={agent.type}
                />
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
                    <Box key={index} sx={{ mb: 1, p: 1, borderRadius: 1, backgroundColor: isPrompt ? '#fff3e0' : '#e3f2fd', maxWidth: '80%' }}>
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
                  emptyValue={undefined}
                >
                  <MenuItem value={undefined}>
                    <em>All Agents (Broadcast)</em>
                  </MenuItem>
                  {agents.map(agent => (
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