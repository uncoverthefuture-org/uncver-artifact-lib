const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const config = {
  port: process.env.PORT || 3000,
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  inputStream: process.env.INPUT_STREAM || 'uncver:stream:input',
  responseStream: process.env.RESPONSE_STREAM || 'uncver:stream:response',
};

// Generate instance ID
const instanceId = `chat-web-${uuidv4().slice(0, 8)}`;

// Connected WebSocket clients
const clients = new Map();

// Redis clients
const redisSub = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

const redisPub = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

// Express app
const app = express();
app.use(express.static(path.join(__dirname, '../public')));

// HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Message history (in-memory, per session)
const messageHistory = new Map();
const MAX_HISTORY = 100;

// Store message in history
function storeMessage(sessionId, message) {
  if (!messageHistory.has(sessionId)) {
    messageHistory.set(sessionId, []);
  }
  const history = messageHistory.get(sessionId);
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

// Get message history
function getHistory(sessionId) {
  return messageHistory.get(sessionId) || [];
}

// Broadcast to all clients in a session
function broadcastToSession(sessionId, data) {
  const message = JSON.stringify(data);
  for (const [ws, clientInfo] of clients) {
    if (clientInfo.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// Subscribe to Redis response stream
async function subscribeToResponses() {
  console.log(`Subscribing to response stream: ${config.responseStream}`);
  
  let lastId = '$'; // Only new messages
  
  while (true) {
    try {
      const results = await redisSub.xread('BLOCK', 1000, 'STREAMS', config.responseStream, lastId);
      
      if (!results || results.length === 0) continue;
      
      for (const [, messages] of results) {
      for (const [id, fields] of messages) {
        lastId = id;
        
        try {
          // Parse fields array as key-value pairs
          const fieldData = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldData[fields[i]] = fields[i + 1];
          }
          
          const data = fieldData.data;
          if (!data) {
            console.log('Message without data field, skipping');
            continue;
          }
          
          const message = JSON.parse(data);
            
            // Only process AI responses, not our own messages
            if (message.type === 'ai_response' && message.from !== instanceId) {
              console.log(`Received AI response: ${message.id}`);
              
              // Extract session from metadata or broadcast to all
              const sessionId = message.metadata?.originalFrom || 'default';
              
              const chatMessage = {
                type: 'ai_message',
                id: message.id,
                content: message.content,
                timestamp: message.timestamp || new Date().toISOString(),
                metadata: message.metadata,
              };
              
              // Store in history
              storeMessage(sessionId, chatMessage);
              
              // Broadcast to session
              broadcastToSession(sessionId, chatMessage);
            }
          } catch (err) {
            console.error('Failed to parse message:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('Redis subscription error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('session') || 'default';
  
  console.log(`Client connected: ${clientId} (session: ${sessionId})`);
  
  clients.set(ws, { clientId, sessionId, connectedAt: Date.now() });
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    sessionId,
    instanceId,
  }));
  
  // Send message history for this session
  const history = getHistory(sessionId);
  if (history.length > 0) {
    ws.send(JSON.stringify({
      type: 'history',
      messages: history,
    }));
  }
  
  // Handle messages from client
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      const clientInfo = clients.get(ws);
      
      if (!clientInfo) return;
      
      if (msg.type === 'chat_message') {
        const messageId = `${Date.now()}-${uuidv4().slice(0, 8)}`;
        
        // Create the message to send to Redis
        const streamMessage = {
          type: 'stream_message',
          id: messageId,
          content: msg.content,
          from: clientInfo.sessionId, // Use session as sender ID
          timestamp: new Date().toISOString(),
          metadata: {
            clientId: clientInfo.clientId,
            sessionId: clientInfo.sessionId,
          },
        };
        
        // Publish to input stream
        await redisPub.xadd(config.inputStream, '*', 'data', JSON.stringify(streamMessage));
        
        // Store in local history
        const chatMessage = {
          type: 'user_message',
          id: messageId,
          content: msg.content,
          timestamp: streamMessage.timestamp,
          clientId: clientInfo.clientId,
        };
        storeMessage(clientInfo.sessionId, chatMessage);
        
        // Confirm to sender
        ws.send(JSON.stringify({
          type: 'message_sent',
          id: messageId,
        }));
        
        // Broadcast to other clients in same session
        broadcastToSession(clientInfo.sessionId, chatMessage);
        
        console.log(`Message sent: ${messageId} (session: ${clientInfo.sessionId})`);
      }
      
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      
    } catch (err) {
      console.error('Message handling error:', err.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process message',
      }));
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket error (${clientId}):`, err.message);
    clients.delete(ws);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    instance: instanceId,
    connectedClients: clients.size,
    sessions: messageHistory.size,
    redis: redisSub.status,
  });
});

// Start server
async function start() {
  console.log('=========================================');
  console.log('  Redis Stream Chat Web');
  console.log('=========================================');
  console.log(`Instance ID: ${instanceId}`);
  console.log(`Redis: ${config.redisAddr}`);
  console.log(`Input Stream: ${config.inputStream}`);
  console.log(`Response Stream: ${config.responseStream}`);
  console.log('=========================================');
  
  // Wait for Redis connection
  await redisSub.ping();
  await redisPub.ping();
  console.log('Connected to Redis');
  
  // Start Redis subscription
  subscribeToResponses();
  
  // Start HTTP server
  server.listen(config.port, () => {
    console.log(`Chat web interface: http://localhost:${config.port}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  wss.close();
  await redisSub.quit();
  await redisPub.quit();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  wss.close();
  await redisSub.quit();
  await redisPub.quit();
  server.close();
  process.exit(0);
});

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
