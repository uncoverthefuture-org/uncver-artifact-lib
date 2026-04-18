#!/usr/bin/env node
/**
 * uncver-file-read
 * Reads file content via Redis streams
 */

const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  inputStream: process.env.INPUT_STREAM || 'uncver:file:read',
  outputStream: process.env.OUTPUT_STREAM || 'uncver:file:content',
  errorStream: process.env.ERROR_STREAM || 'uncver:file:errors',
  baseDir: process.env.BASE_DIR || '/data',
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

const redisPub = redis.duplicate();

// Read file
async function readFile(filePath, options = {}) {
  const fullPath = path.resolve(config.baseDir, filePath);
  
  // Check if file exists
  const stats = await fs.stat(fullPath);
  
  if (!stats.isFile()) {
    throw new Error('Path is not a file');
  }
  
  // Read file
  const encoding = options.encoding || 'utf8';
  const content = await fs.readFile(fullPath, { encoding });
  
  return {
    path: filePath,
    fullPath: fullPath,
    content: content,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    created: stats.birthtime.toISOString(),
  };
}

// List directory
async function listDirectory(dirPath, options = {}) {
  const fullPath = path.resolve(config.baseDir, dirPath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  
  const items = await Promise.all(
    entries.map(async (entry) => {
      const itemPath = path.join(fullPath, entry.name);
      const stats = await fs.stat(itemPath);
      
      return {
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isDirectory() ? null : stats.size,
        modified: stats.mtime.toISOString(),
      };
    })
  );
  
  return {
    path: dirPath,
    fullPath: fullPath,
    items: options.filter ? items.filter(options.filter) : items,
  };
}

// Process stream
async function processStream() {
  let lastId = '0';
  
  console.log('=========================================');
  console.log('  uncver-file-read');
  console.log('=========================================');
  console.log(`Listening on: ${config.inputStream}`);
  console.log(`Reading from: ${config.baseDir}`);
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
            
            console.log(`Reading: ${request.path}`);
            
            let result;
            
            if (request.list) {
              // List directory
              result = await listDirectory(request.path, request.options || {});
              result.type = 'directory_listing';
            } else {
              // Read file
              result = await readFile(request.path, request.options || {});
              result.type = 'file_content';
            }
            
            // Send response
            const response = {
              ...result,
              requestId: id,
              timestamp: new Date().toISOString(),
            };
            
            await redisPub.xadd(config.outputStream, '*', 'data', JSON.stringify(response));
            console.log(`✓ Read: ${request.path}`);
            
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
    return { status: 'ok', readable: true };
  } catch (err) {
    return { status: 'error', readable: false, error: err.message };
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
