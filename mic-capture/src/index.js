#!/usr/bin/env node
/**
 * uncver-mic-capture
 * Captures microphone audio and publishes to Redis stream
 */

const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  audioStream: process.env.AUDIO_STREAM || 'uncver:stream:mic',
  chunkDuration: parseInt(process.env.CHUNK_DURATION || '5000'), // 5 second chunks
  sampleRate: parseInt(process.env.SAMPLE_RATE || '16000'),
  channels: parseInt(process.env.CHANNELS || '1'),
  tempDir: process.env.TEMP_DIR || '/tmp/mic-capture',
};

const instanceId = `mic-${uuidv4().slice(0, 8)}`;

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
});

// Ensure temp directory exists
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

// Capture audio using sox (cross-platform)
function captureAudioChunk() {
  return new Promise((resolve, reject) => {
    const filename = path.join(config.tempDir, `chunk-${Date.now()}.wav`);
    const cmd = `sox -d -r ${config.sampleRate} -c ${config.channels} -b 16 ${filename} trim 0 ${config.chunkDuration / 1000}`;
    
    exec(cmd, { timeout: config.chunkDuration + 2000 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      
      fs.readFile(filename, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Clean up file
        fs.unlink(filename, () => {});
        
        resolve({
          filename: path.basename(filename),
          data: data.toString('base64'),
          duration: config.chunkDuration,
          sampleRate: config.sampleRate,
          channels: config.channels,
        });
      });
    });
  });
}

// Process audio chunks
async function startCapture() {
  console.log('=========================================');
  console.log('  Mic Capture');
  console.log('=========================================');
  console.log(`Instance: ${instanceId}`);
  console.log(`Output Stream: ${config.audioStream}`);
  console.log(`Chunk Duration: ${config.chunkDuration}ms`);
  console.log(`Sample Rate: ${config.sampleRate}Hz`);
  console.log('=========================================');
  
  // Check if sox is available
  exec('which sox', (error) => {
    if (error) {
      console.error('sox not found! Install with: brew install sox (Mac) or apt-get install sox (Linux)');
      process.exit(1);
    }
  });
  
  console.log('Starting audio capture...');
  
  while (true) {
    try {
      const chunk = await captureAudioChunk();
      
      const message = {
        type: 'audio_chunk',
        id: uuidv4(),
        instance: instanceId,
        timestamp: new Date().toISOString(),
        audio: {
          data: chunk.data,
          format: 'wav',
          sampleRate: chunk.sampleRate,
          channels: chunk.channels,
          duration: chunk.duration,
        },
      };
      
      await redis.xadd(config.audioStream, '*', 'data', JSON.stringify(message));
      console.log(`Captured ${chunk.duration}ms audio chunk`);
      
    } catch (err) {
      console.error('Capture error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Health check
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', instance: instanceId }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start
async function start() {
  await redis.ping();
  
  server.listen(8081, () => {
    console.log('Health: http://localhost:8081/health');
  });
  
  startCapture();
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await redis.quit();
  server.close();
  process.exit(0);
});

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
