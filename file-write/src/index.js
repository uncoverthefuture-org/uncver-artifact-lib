#!/usr/bin/env node
/**
 * uncver-file-write
 * Writes content to files via Redis streams
 */

const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD || '',
  inputStream: process.env.INPUT_STREAM || 'uncver:file:write',
  outputStream: process.env.OUTPUT_STREAM || 'uncver:file:written',
  errorStream: process.env.ERROR_STREAM || 'uncver:file:errors',
  baseDir: process.env.BASE_DIR || '/data',
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
  password: config.redisPassword || undefined,
});

const redisPub = redis.duplicate();

// Write file
async function writeFile(filePath, content, options = {}) {
  const fullPath = path.resolve(config.baseDir, filePath);
  
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Write file
  const flags = options.append ? 'a' : 'w';
  await fs.writeFile(fullPath, content, { flag: flags, encoding: options.encoding || 'utf8' });
  
  const stats = await fs.stat(fullPath);
  
  return {
    path: filePath,
    fullPath: fullPath,
    size: stats.size,
    modified: stats.mtime.toISOString(),
  };
}

// Process stream
async function processStream() {
  let lastId = '0';
  
  console.log('=========================================');
  console.log('  uncver-file-write');
  console.log('=========================================');
  console.log(`Listening on: ${config.inputStream}`);
  console.log(`Writing to: ${config.baseDir}`);
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
            
            console.log(`Writing: ${request.path}`);
            
            const result = await writeFile(
              request.path,
              request.content || '',
              request.options || {}
            );
            
            // Send success response
            const response = {
              type: 'file_written',
              requestId: id,
              path: result.path,
              fullPath: result.fullPath,
              size: result.size,
              modified: result.modified,
              timestamp: new Date().toISOString(),
            };
            
            await redisPub.xadd(config.outputStream, '*', 'data', JSON.stringify(response));
            console.log(`✓ Written: ${result.path} (${result.size} bytes)`);
            
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

// HTTP server for health checks
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
  
  // Ensure base directory exists
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
