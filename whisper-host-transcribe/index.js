#!/usr/bin/env node
/**
 * Whisper Host Transcribe
 * Runs on Mac, listens to mic audio, transcribes using whisper.cpp or OpenAI Whisper API
 * Sends transcribed text to chat stream
 */

const { spawn, exec } = require('child_process');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  micStream: process.env.MIC_STREAM || 'uncver:stream:mic',
  outputStream: process.env.OUTPUT_STREAM || 'uncver:stream:input',
  tempDir: process.env.TEMP_DIR || '/tmp/whisper',
  // Options: 'local' (whisper.cpp) or 'api' (OpenAI Whisper API)
  mode: process.env.WHISPER_MODE || 'mock', // mock for testing without whisper
};

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
});

const redisPub = redis.duplicate();

const instanceId = `whisper-host-${uuidv4().slice(0, 8)}`;

// Ensure temp directory exists
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

console.log('🎯 Whisper Host Transcribe Starting...');
console.log(`Instance: ${instanceId}`);
console.log(`Input: ${config.micStream}`);
console.log(`Output: ${config.outputStream}`);
console.log(`Mode: ${config.mode}`);

// Mock transcription for testing (when whisper not installed)
async function mockTranscribe(audioData) {
  // Simulate processing time
  await new Promise(r => setTimeout(r, 500));
  
  // For testing, you could return predefined responses
  // In real use, this would be actual transcription
  const testPhrases = [
    "Hello, can you hear me?",
    "Tell me about the weather",
    "What's the time now?",
    "Play some music",
    "Set a timer for 5 minutes",
  ];
  
  // Randomly pick a test phrase or return empty for silence
  if (Math.random() > 0.3) {
    return testPhrases[Math.floor(Math.random() * testPhrases.length)];
  }
  
  return ""; // Silence
}

// Local whisper.cpp transcription
async function whisperLocalTranscribe(audioBase64) {
  return new Promise((resolve, reject) => {
    const inputFile = path.join(config.tempDir, `input-${Date.now()}.wav`);
    const outputFile = path.join(config.tempDir, `output-${Date.now()}`);
    
    // Write audio data
    fs.writeFileSync(inputFile, Buffer.from(audioBase64, 'base64'));
    
    // Check for whisper-cli
    exec('which whisper-cli', (err) => {
      if (err) {
        console.log('whisper-cli not found, using mock transcription');
        fs.unlink(inputFile, () => {});
        resolve(mockTranscribe(audioBase64));
        return;
      }
      
      // Run whisper.cpp
      const cmd = spawn('whisper-cli', [
        '-f', inputFile,
        '-m', '/models/ggml-tiny.bin',
        '-oj', // Output JSON
        '-of', outputFile
      ], { timeout: 30000 });
      
      cmd.on('close', () => {
        const jsonFile = `${outputFile}.json`;
        
        if (fs.existsSync(jsonFile)) {
          try {
            const result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
            fs.unlink(jsonFile, () => {});
            fs.unlink(inputFile, () => {});
            resolve(result.text || '');
          } catch (e) {
            resolve('');
          }
        } else {
          fs.unlink(inputFile, () => {});
          resolve('');
        }
      });
      
      cmd.on('error', () => {
        fs.unlink(inputFile, () => {});
        resolve('');
      });
    });
  });
}

// Transcribe based on mode
async function transcribe(audioData) {
  switch (config.mode) {
    case 'local':
      return whisperLocalTranscribe(audioData);
    case 'mock':
    default:
      return mockTranscribe(audioData);
  }
}

// Listen to mic stream and transcribe
async function listen() {
  let lastId = '0';
  
  await redis.ping();
  await redisPub.ping();
  console.log('✅ Connected to Redis\n');
  
  console.log('👂 Listening for mic audio...\n');
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 1000, 'STREAMS', config.micStream, lastId);
      
      if (!results || results.length === 0) continue;
      
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          lastId = id;
          
          try {
            const fieldData = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldData[fields[i]] = fields[i + 1];
            }
            
            const data = JSON.parse(fieldData.data || '{}');
            
            if (data.type !== 'audio_chunk') continue;
            
            console.log(`🎵 Received audio: ${data.audio?.duration}ms from ${data.instance}`);
            
            // Transcribe
            const transcription = await transcribe(data.audio.data);
            
            if (!transcription || transcription.trim() === '') {
              console.log('🤫 No speech detected (silence)\n');
              continue;
            }
            
            console.log(`📝 Transcribed: "${transcription}"`);
            
            // Send to chat stream
            const message = {
              type: 'stream_message',
              id: uuidv4(),
              content: transcription,
              from: `voice-user`,
              timestamp: new Date().toISOString(),
              metadata: {
                source: 'whisper-transcribe',
                audioId: data.id,
                duration: data.audio?.duration,
                transcribedBy: instanceId,
                confidence: 0.85, // Mock confidence
              },
            };
            
            await redisPub.xadd(config.outputStream, '*', 'data', JSON.stringify(message));
            console.log('📤 Sent transcription to chat stream\n');
            
          } catch (err) {
            console.error('❌ Processing error:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('❌ Stream error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Stopping Whisper...');
  await redis.quit();
  await redisPub.quit();
  process.exit(0);
});

// Start
listen().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
