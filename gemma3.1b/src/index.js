const Redis = require('ioredis');
const http = require('http');
const crypto = require('crypto');

// Configuration from environment
const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:1b',
  port: parseInt(process.env.CONFIG_PORT || '8080'),
  
  // Listen to ALL streams
  inputStream: process.env.INPUT_STREAM || 'uncver:stream:input',
  fileWrittenStream: process.env.FILE_WRITTEN_STREAM || 'uncver:file:written',
  fileContentStream: process.env.FILE_CONTENT_STREAM || 'uncver:file:content',
  folderCreatedStream: process.env.FOLDER_CREATED_STREAM || 'uncver:folder:created',
  audioStream: process.env.AUDIO_STREAM || 'uncver:stream:audio',
  knowledgeStream: process.env.KNOWLEDGE_STREAM || 'uncver:stream:knowledge',
  queryStream: process.env.QUERY_STREAM || 'uncver:stream:queries',
  discoveryStream: process.env.DISCOVERY_STREAM || 'uncver:artifacts:discovery',
  
  responseStream: process.env.RESPONSE_STREAM || 'uncver:stream:response',
  chunkSize: parseInt(process.env.CHUNK_SIZE || '500'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
  maxChunks: parseInt(process.env.MAX_CHUNKS || '10'),
};

// Generate instance ID
const instanceId = crypto.randomBytes(8).toString('base64url');

// Session management - stores conversation context
const sessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Redis clients
const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const redisPub = redis.duplicate(); // Publisher client

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis error:', err.message));

// Session management functions
function getSessionKey(from) {
  return `session:${from}`;
}

function getOrCreateSession(from) {
  const key = getSessionKey(from);
  if (!sessions.has(key)) {
    sessions.set(key, {
      messages: [],
      lastActivity: Date.now(),
      context: [], // Ollama context for maintaining conversation
    });
  }
  const session = sessions.get(key);
  session.lastActivity = Date.now();
  return session;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      sessions.delete(key);
      console.log(`Cleaned up expired session: ${key}`);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// Text chunking
function chunkText(text, size, overlap) {
  if (text.length <= size) return [text];
  
  const chunks = [];
  const step = size - overlap;
  
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  
  return chunks.slice(0, config.maxChunks);
}

// Query Ollama with context
async function queryOllama(prompt, session) {
  const url = `${config.ollamaUrl}/api/generate`;
  
  const requestBody = {
    model: config.ollamaModel,
    prompt: prompt,
    stream: false,
    context: session.context.length > 0 ? session.context : undefined,
    options: {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
    },
  };

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            // Update session context for next turn
            if (response.context) {
              session.context = response.context;
            }
            resolve(response.response || 'No response');
          } catch (e) {
            reject(new Error('Failed to parse Ollama response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Ollama request timeout')));
      req.write(JSON.stringify(requestBody));
      req.end();
    });
  } catch (error) {
    console.error('Ollama query error:', error.message);
    throw error;
  }
}

// Process message with chunking and context
async function processMessage(message) {
  const session = getOrCreateSession(message.from);
  
  // Add user message to history
  session.messages.push({ role: 'user', content: message.content });
  
  // Keep only last 10 messages for context
  if (session.messages.length > 10) {
    session.messages = session.messages.slice(-10);
  }

  // Chunk the message
  const chunks = chunkText(message.content, config.chunkSize, config.chunkOverlap);
  console.log(`Processing message from ${message.from}: ${chunks.length} chunks`);

  let fullResponse = '';
  const chunkResults = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
// Build prompt with context
const contextMsg = session.messages.length > 1
  ? `Previous context: ${session.messages.slice(0, -1).map(m => m.content).join('\n')}\n\nCurrent message: ${chunks[i]}`
  : chunks[i];
      
      const response = await queryOllama(contextMsg, session);
      
      chunkResults.push({
        chunkIndex: i,
        content: chunks[i].substring(0, 50) + '...',
        response: response.substring(0, 100) + (response.length > 100 ? '...' : ''),
      });
      
      fullResponse += response + ' ';
      console.log(`Chunk ${i + 1}/${chunks.length} processed`);
    } catch (err) {
      console.error(`Chunk ${i} error:`, err.message);
    }
  }

  fullResponse = fullResponse.trim();
  
  // Add assistant response to history
  session.messages.push({ role: 'assistant', content: fullResponse });

  return {
    content: fullResponse || 'I apologize, I could not process that.',
    chunksCount: chunks.length,
    chunkResults,
    contextLength: session.context.length,
  };
}

// Publish response to Redis stream and execute any commands
async function publishResponse(originalMsg, response) {
  const responseMsg = {
    type: 'ai_response',
    id: `${originalMsg.id}-response`,
    content: response.content,
    from: instanceId,
    timestamp: new Date().toISOString(),
    metadata: {
      originalId: originalMsg.id,
      originalFrom: originalMsg.from,
      model: config.ollamaModel,
      chunksCount: response.chunksCount,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      hasContext: response.contextLength > 0,
      chunkResults: response.chunkResults,
    },
  };

  await redisPub.xadd(config.responseStream, '*', 'data', JSON.stringify(responseMsg));
  console.log(`Published response for ${originalMsg.id} (${response.chunksCount} chunks)`);
}

// Process Redis stream
async function processStream() {
  let lastId = '0';
  
  console.log(`Listening on stream: ${config.inputStream}`);
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 5000, 'STREAMS', config.inputStream, lastId);
      
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
            
            // Skip our own messages
            if (message.from === instanceId) {
              console.log('Skipping own message');
              continue;
            }
            
            if (!message.content) {
              console.log('Skipping message without content');
              continue;
            }
            
            console.log(`Received message from ${message.from}: ${message.content.substring(0, 50)}...`);
            
            // Process asynchronously
            processMessage(message)
              .then(response => publishResponse(message, response))
              .catch(err => console.error('Processing error:', err));
              
          } catch (err) {
            console.error('Failed to parse message:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Process a specific stream by name - ALL streams are treated equally
async function processStreamByName(streamName, type) {
  let lastId = '0';
  
  console.log(`Listening on ${type} stream: ${streamName}`);
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 5000, 'STREAMS', streamName, lastId);
      
      if (!results || results.length === 0) continue;
      
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          lastId = id;
          
          try {
            // Parse fields as key-value pairs
            const fieldData = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldData[fields[i]] = fields[i + 1];
            }
            
            const data = fieldData.data;
            if (!data) continue;
            
            const message = JSON.parse(data);
            
            // Skip our own messages
            if (message.from === instanceId) {
              continue;
            }
            
            // Extract content from any message type
            let content = '';
            if (message.content) {
              content = message.content;
            } else if (message.text) {
              content = message.text;
            } else if (message.path) {
              content = `${type}: ${message.path}`;
            } else if (message.subject && message.predicate) {
              content = `Knowledge: ${message.subject} ${message.predicate} ${message.object || ''}`;
            } else {
              content = JSON.stringify(message).slice(0, 200);
            }
            
            if (!content) {
              console.log(`[${type}] No content to process`);
              continue;
            }
            
            console.log(`[${type}] Processing: ${content.substring(0, 50)}...`);
            
            // Create synthetic message for processing
            const syntheticMsg = {
              type: message.type || type,
              id: message.id || id,
              content: content,
              from: message.from || 'system',
              timestamp: message.timestamp || new Date().toISOString(),
              sourceStream: streamName,
              sourceType: type,
            };
            
            // Process through AI (chunked)
            processMessage(syntheticMsg)
              .then(response => publishResponse(syntheticMsg, response))
              .catch(err => console.error('Processing error:', err));
            
          } catch (err) {
            console.error(`[${type}] Failed to parse:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error(`[${type}] Stream error:`, err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Simple HTTP server for health checks
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      instance: instanceId,
      model: config.ollamaModel,
      sessions: sessions.size,
      uptime: process.uptime(),
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start everything
async function start() {
  console.log('=========================================');
  console.log(' Gemma 3.1B Redis Stream Listener');
  console.log('=========================================');
  console.log(`Instance ID: ${instanceId}`);
  console.log(`Model: ${config.ollamaModel}`);
  console.log(`Ollama URL: ${config.ollamaUrl}`);
  console.log('Listening to streams:');
  console.log(`  - ${config.inputStream} (chat input)`);
  console.log(`  - ${config.fileWrittenStream} (file operations)`);
  console.log(`  - ${config.fileContentStream} (file reads)`);
  console.log(`  - ${config.folderCreatedStream} (folder operations)`);
  console.log(`  - ${config.audioStream} (audio)`);
  console.log(`  - ${config.knowledgeStream} (knowledge writes)`);
  console.log(`  - ${config.queryStream} (knowledge queries)`);
  console.log(`Response Stream: ${config.responseStream}`);
  console.log(`Chunk Size: ${config.chunkSize}, Overlap: ${config.chunkOverlap}`);
  console.log('=========================================');

  // Start HTTP server
  server.listen(config.port, () => {
    console.log(`Health check: http://localhost:${config.port}/health`);
  });

  // Wait for Redis connection
  await redis.ping();
  await redisPub.ping();
  
  // Announce discovery
  await redisPub.xadd('uncver:artifacts:discovery', '*', 'data', JSON.stringify({
    type: 'artifact_started',
    name: 'uncver-gemma3-1b-listener',
    instance: instanceId,
    capabilities: ['ai_response', 'text_processing', 'chunking'],
    streams: {
      input: config.inputStream,
      output: config.responseStream,
    },
    timestamp: new Date().toISOString(),
  }));
  console.log('Announced discovery to uncver:artifacts:discovery');

  // Start processing ALL streams
  processStream(); // Main chat input
  processStreamByName(config.fileWrittenStream, 'file_written');
  processStreamByName(config.fileContentStream, 'file_read');
  processStreamByName(config.folderCreatedStream, 'folder_created');
  processStreamByName(config.audioStream, 'audio');
  processStreamByName(config.knowledgeStream, 'knowledge');
  processStreamByName(config.queryStream, 'query');
  
  console.log('All stream listeners started');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await redis.quit();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await redis.quit();
  server.close();
  process.exit(0);
});

// Run
start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
