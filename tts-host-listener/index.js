#!/usr/bin/env node
/**
 * TTS Host Listener
 * Runs on your Mac, listens to Redis stream, speaks using native 'say' command
 * No Docker needed - runs directly on host
 */

const { spawn } = require('child_process');
const Redis = require('ioredis');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  audioStream: process.env.AUDIO_STREAM || 'uncver:stream:audio',
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
});

let lastId = '0';
let isSpeaking = false;

console.log('🔊 TTS Host Listener Starting...');
console.log(`Redis: ${config.redisAddr}`);
console.log(`Stream: ${config.audioStream}`);
console.log('Press Ctrl+C to stop\n');

// Speak text using Mac's say command
function speak(text) {
  return new Promise((resolve) => {
    if (!text || text.trim() === '') {
      resolve();
      return;
    }

    console.log(`🗣️  Speaking: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
    
    // Use Mac's native say command
    // -r rate (words per minute, default 175)
    // -v voice (optional)
    const cmd = spawn('say', ['-r', '180', text], {
      stdio: 'ignore',
    });

    cmd.on('close', () => {
      resolve();
    });

    cmd.on('error', (err) => {
      console.error('say error:', err.message);
      resolve();
    });
  });
}

// Queue for sequential speaking
const speakQueue = [];

async function processQueue() {
  if (isSpeaking || speakQueue.length === 0) return;
  
  isSpeaking = true;
  const text = speakQueue.shift();
  
  try {
    await speak(text);
  } catch (err) {
    console.error('Speak error:', err.message);
  }
  
  isSpeaking = false;
  processQueue();
}

function queueSpeak(text) {
  speakQueue.push(text);
  processQueue();
}

// Listen to Redis stream
async function listen() {
  try {
    await redis.ping();
    console.log('✅ Connected to Redis\n');

    while (true) {
      try {
        const results = await redis.xread('BLOCK', 1000, 'STREAMS', config.audioStream, lastId);
        
        if (!results || results.length === 0) continue;
        
        for (const [, messages] of results) {
          for (const [id, fields] of messages) {
            lastId = id;
            
            try {
              // Parse fields
              const fieldData = {};
              for (let i = 0; i < fields.length; i += 2) {
                fieldData[fields[i]] = fields[i + 1];
              }
              
              const data = JSON.parse(fieldData.data || '{}');
              const text = data.text || data.content || '';
              
              if (text) {
                queueSpeak(text);
              }
            } catch (err) {
              console.error('Parse error:', err.message);
            }
          }
        }
      } catch (err) {
        console.error('Stream error:', err.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Stopping TTS listener...');
  await redis.quit();
  process.exit(0);
});

// Start listening
listen();
