#!/usr/bin/env node
/**
 * Mic Host Capture
 * Runs on Mac, captures audio from microphone, sends to Redis
 * Uses native Mac sox/rec command
 */

const { spawn } = require('child_process');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  audioStream: process.env.AUDIO_STREAM || 'uncver:stream:mic',
  tempDir: process.env.TEMP_DIR || '/tmp/mic-capture',
  chunkDuration: parseInt(process.env.CHUNK_DURATION || '5000'), // 5 seconds
  sampleRate: parseInt(process.env.SAMPLE_RATE || '16000'),
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
});

const instanceId = `mic-host-${uuidv4().slice(0, 8)}`;

// Ensure temp directory exists
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

console.log('🎤 Mic Host Capture Starting...');
console.log(`Instance: ${instanceId}`);
console.log(`Redis: ${config.redisAddr}`);
console.log(`Stream: ${config.audioStream}`);
console.log(`Chunk Duration: ${config.chunkDuration}ms`);
console.log('\nPress Enter to start recording a 5-second chunk...');
console.log('(Or keep pressing Enter for continuous recording)');

// Capture audio using sox rec command (Mac native)
function captureAudioChunk() {
  return new Promise((resolve, reject) => {
    const filename = path.join(config.tempDir, `chunk-${Date.now()}.wav`);
    
    // Mac audio capture command
    // -d = default audio device
    // -r = sample rate
    // -c 1 = mono
    // -b 16 = 16-bit
    const cmd = spawn('sox', [
      '-d', // Default audio device
      '-r', config.sampleRate.toString(),
      '-c', '1', // Mono
      '-b', '16', // 16-bit
      filename,
      'trim', '0', (config.chunkDuration / 1000).toString() // Duration in seconds
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    console.log('🔴 Recording... (speak now!)');
    
    cmd.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`rec failed with code ${code}`));
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
          format: 'wav',
          sampleRate: config.sampleRate,
          channels: 1,
          duration: config.chunkDuration,
        });
      });
    });
    
    cmd.on('error', (err) => {
      reject(err);
    });
  });
}

// Send audio to Redis
async function sendAudioToRedis(audio) {
  const message = {
    type: 'audio_chunk',
    id: uuidv4(),
    instance: instanceId,
    timestamp: new Date().toISOString(),
    audio: {
      data: audio.data,
      format: audio.format,
      sampleRate: audio.sampleRate,
      channels: audio.channels,
      duration: audio.duration,
    },
  };
  
  await redis.xadd(config.audioStream, '*', 'data', JSON.stringify(message));
  console.log(`📤 Sent ${audio.duration}ms audio chunk to stream`);
}

// Main recording loop - CONTINUOUS
async function startRecording() {
  // Check if sox is available
  const check = spawn('which', ['sox']);
  check.on('close', async (code) => {
    if (code !== 0) {
      console.error('❌ sox not found! Install with: brew install sox');
      process.exit(1);
    }
    
    await redis.ping();
    console.log('✅ Connected to Redis\n');
    console.log('🔴 Recording continuously... (Press Ctrl+C to stop)\n');
    
    // Start continuous recording
    while (true) {
      try {
        console.log('🎙️  Recording chunk...');
        const audio = await captureAudioChunk();
        await sendAudioToRedis(audio);
        console.log('✅ Chunk sent, recording next...\n');
      } catch (err) {
        console.error('❌ Error:', err.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  });
  
  // Ctrl+C handler
  process.on('SIGINT', async () => {
    console.log('\n👋 Stopping recording...');
    await redis.quit();
    process.exit(0);
  });
}

startRecording().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
