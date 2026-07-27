const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Redis = require('ioredis');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = {
  port: process.env.PORT || 3000,
  redisAddr: process.env.REDIS_ADDR || 'uncver-redis-stream:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  stream: process.env.STREAM || 'uncver:ai:router',
};

const instanceId = `stream-${uuidv4().slice(0, 8)}`;
const clients = new Map();

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

const app = express();
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const messageHistory = new Map();
const MAX_HISTORY = 100;

function storeMessage(sessionId, message) {
  if (!messageHistory.has(sessionId)) messageHistory.set(sessionId, []);
  const history = messageHistory.get(sessionId);
  history.push(message);
  if (history.length > MAX_HISTORY) history.shift();
}

function getHistory(sessionId) {
  return messageHistory.get(sessionId) || [];
}

function broadcastToSession(sessionId, data) {
  const message = JSON.stringify(data);
  for (const [ws, info] of clients) {
    if (info.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function broadcastAll(data) {
  const message = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

async function subscribeToStream() {
  console.log(`Listening on stream: ${config.stream}`);
  let isFirstRead = true;
  let lastId = '$';
  while (true) {
    try {
      if (isFirstRead) {
        const old = await redis.xrevrange(config.stream, '+', '-', 'COUNT', 100);
        if (old.length > 0) {
          for (const [id, fields] of old) {
            const msg = {};
            for (let i = 0; i < fields.length; i += 2) msg[fields[i]] = fields[i + 1];
            broadcastAll({ type: 'stream_message', id, fields: msg });
          }
          lastId = old[0][0];
        }
        isFirstRead = false;
      }
      const results = await redis.xread('BLOCK', 1000, 'STREAMS', config.stream, lastId);
      if (!results || results.length === 0) continue;
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          lastId = id;
          const msg = {};
          for (let i = 0; i < fields.length; i += 2) msg[fields[i]] = fields[i + 1];
          broadcastAll({ type: 'stream_message', id, fields: msg });
          const source = msg.source || '';
          if (source === 'user' || source === 'tester') continue;
          if (source === instanceId) continue;
          const replyText = msg.data || msg.message || '';
          if (!replyText) continue;
          const chatMessage = {
            type: 'ai_message',
            id,
            content: replyText,
            source,
            timestamp: msg.timestamp || new Date().toISOString(),
          };
          const sessionId = 'default';
          storeMessage(sessionId, chatMessage);
          broadcastToSession(sessionId, chatMessage);
        }
      }
    } catch (err) {
      console.error('Stream read error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('session') || 'default';
  console.log(`Client connected: ${clientId}`);
  clients.set(ws, { clientId, sessionId, connectedAt: Date.now() });
  ws.send(JSON.stringify({ type: 'connected', clientId, sessionId, instanceId }));
  const history = getHistory(sessionId);
  if (history.length > 0) ws.send(JSON.stringify({ type: 'history', messages: history }));
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      const info = clients.get(ws);
      if (!info) return;
      if (msg.type === 'chat_message') {
        const messageId = `${Date.now()}-${uuidv4().slice(0, 8)}`;
        await redis.xadd(config.stream, '*',
          'source', instanceId,
          'data', msg.content,
          'timestamp', new Date().toISOString()
        );
        const chatMessage = { type: 'user_message', id: messageId, content: msg.content, timestamp: new Date().toISOString(), clientId: info.clientId };
        storeMessage(info.sessionId, chatMessage);
        ws.send(JSON.stringify({ type: 'message_sent', id: messageId }));
        broadcastToSession(info.sessionId, chatMessage);
      }
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    } catch (err) {
      console.error('Message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process' }));
    }
  });
  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', () => { clients.delete(ws); });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', instance: instanceId, clients: clients.size });
});

app.get('/stream', async (req, res) => {
  try {
    const data = await redis.xrange(config.stream, '-', '+', 'COUNT', 50);
    const messages = [];
    for (const [id, fields] of data) {
      const msg = {};
      for (let i = 0; i < fields.length; i += 2) msg[fields[i]] = fields[i + 1];
      messages.push({ id, ...msg });
    }
    res.json({ stream: config.stream, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function start() {
  console.log('=========================================');
  console.log('  Artifacts Stream');
  console.log('=========================================');
  console.log(`Instance: ${instanceId}`);
  console.log(`Redis: ${config.redisAddr}`);
  console.log(`Stream: ${config.stream}`);
  await redis.ping();
  console.log('Connected to Redis');
  subscribeToStream();
  server.listen(config.port, () => {
    console.log(`UI: http://0.0.0.0:${config.port}`);
  });
}

process.on('SIGINT', async () => {
  wss.close();
  await redis.quit();
  server.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  wss.close();
  await redis.quit();
  server.close();
  process.exit(0);
});

start().catch(err => { console.error('Failed:', err); process.exit(1); });
