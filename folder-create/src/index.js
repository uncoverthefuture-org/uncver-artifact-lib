#!/usr/bin/env node
/**
 * uncver-folder-create
 * Creates folders via Redis streams
 */

const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  inputStream: process.env.INPUT_STREAM || 'uncver:folder:create',
  outputStream: process.env.OUTPUT_STREAM || 'uncver:folder:created',
  errorStream: process.env.ERROR_STREAM || 'uncver:folder:errors',
  baseDir: process.env.BASE_DIR || '/data',
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

const redisPub = redis.duplicate();

// Create folder
async function createFolder(folderPath, options = {}) {
  const fullPath = path.resolve(config.baseDir, folderPath);
  
  // Check if already exists
  try {
    const existing = await fs.stat(fullPath);
    if (existing.isDirectory()) {
      return {
        path: folderPath,
        fullPath: fullPath,
        created: false,
        exists: true,
        modified: existing.mtime.toISOString(),
      };
    }
  } catch (e) {
    // Path doesn't exist, continue to create
  }
  
  // Create directory (recursive by default)
  await fs.mkdir(fullPath, { 
    recursive: options.recursive !== false,
    mode: options.mode || 0o755 
  });
  
  const stats = await fs.stat(fullPath);
  
  return {
    path: folderPath,
    fullPath: fullPath,
    created: true,
    exists: true,
    modified: stats.mtime.toISOString(),
  };
}

// Check if exists
async function folderExists(folderPath) {
  const fullPath = path.resolve(config.baseDir, folderPath);
  
  try {
    const stats = await fs.stat(fullPath);
    return {
      path: folderPath,
      fullPath: fullPath,
      exists: stats.isDirectory(),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime.toISOString(),
    };
  } catch (err) {
    return {
      path: folderPath,
      fullPath: fullPath,
      exists: false,
      isDirectory: false,
      isFile: false,
    };
  }
}

// Process stream
async function processStream() {
  let lastId = '0';
  
  console.log('=========================================');
  console.log('  uncver-folder-create');
  console.log('=========================================');
  console.log(`Listening on: ${config.inputStream}`);
  console.log(`Base directory: ${config.baseDir}`);
  console.log('=========================================');
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 5000, 'STREAMS', config.inputStream, lastId);
      
      if (!results || results.length === 0) continue;
      
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          lastId = id;
          
          try {
            // Parse fields as key-value pairs
            const data = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }
            
            const request = JSON.parse(data.data || data.json || '{}');
            
            if (!request.path) {
              throw new Error('Missing required field: path');
            }
            
            console.log(`Processing: ${request.path} (action: ${request.action || 'create'})`);
            
            let result;
            
            switch (request.action) {
              case 'exists':
                result = await folderExists(request.path);
                result.action = 'checked';
                break;
                
              case 'create':
              default:
                result = await createFolder(request.path, request.options || {});
                result.action = 'created';
                break;
            }
            
            // Send response
            const response = {
              ...result,
              requestId: id,
              timestamp: new Date().toISOString(),
            };
            
            await redisPub.xadd(config.outputStream, '*', 'data', JSON.stringify(response));
            console.log(`✓ ${result.action}: ${request.path}`);
            
          } catch (err) {
            console.error('Error:', err.message);
            
            const error = {
              type: 'error',
              requestId: id,
              error: err.message,
              timestamp: new Date().toISOString(),
            };
            
            await redisPub.xadd(config.errorStream, '*', 'data', JSON.stringify(error));
          }
        }
      }
    } catch (err) {
      console.error('Stream error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Health check
async function healthCheck() {
  try {
    await fs.access(config.baseDir);
    return { status: 'ok', writable: true };
  } catch (err) {
    return { status: 'error', writable: false, error: err.message };
  }
}

// HTTP server
const http = require('http');
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/health') {
    const health = await healthCheck();
    res.writeHead(health.status === 'ok' ? 200 : 500);
    res.end(JSON.stringify(health));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start
async function start() {
  await redis.ping();
  await redisPub.ping();
  
  await fs.mkdir(config.baseDir, { recursive: true });
  
  server.listen(8080, () => {
    console.log('Health check: http://localhost:8080/health');
  });
  
  processStream();
}

// Shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await redis.quit();
  await redisPub.quit();
  server.close();
  process.exit(0);
});

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
