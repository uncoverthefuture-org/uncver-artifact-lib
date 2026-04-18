#!/usr/bin/env node
/**
 * uncver-whisper-transcribe
 * Receives audio from Redis, transcribes with Whisper, sends text to chat
 */

const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  audioStream: process.env.AUDIO_STREAM || 'uncver:stream:mic',
  outputStream: process.env.OUTPUT_STREAM || 'uncver:stream:input',
  tempDir: process.env.TEMP_DIR || '/tmp/whisper',
  whisperModel: process.env.WHISPER_MODEL || 'base', // tiny, base, small, medium, large
  useLocal: process.env.USE_LOCAL_WHISPER === 'true' || true, // Use local whisper.cpp
};

const instanceId = `whisper-${uuidv4().slice(0, 8)}`;

const redis = new Redis({
  host: config.redisAddr.split(':')[0],
  port: parseInt(config.redisAddr.split(':')[1] || '6379'),
});

const redisPub = redis.duplicate();

// Ensure temp directory exists
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

// Transcribe audio using local whisper.cpp
function transcribeAudio(audioBase64) {
  return new Promise((resolve, reject) => {
    const inputFile = path.join(config.tempDir, `input-${Date.now()}.wav`);
    const outputFile = path.join(config.tempDir, `output-${Date.now()}.txt`);
    
    // Write audio data
    fs.writeFileSync(inputFile, Buffer.from(audioBase64, 'base64'));
    
    // Run whisper.cpp
    // Note: whisper.cpp must be installed at /usr/local/bin/whisper-cli
    const cmd = `whisper-cli -f ${inputFile} -m /models/ggml-${config.whisperModel}.bin -oj -of ${outputFile.replace('.txt', '')}`;
    
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      // Clean up input file
      fs.unlink(inputFile, () => {});
      
      if (error && !fs.existsSync(outputFile)) {
        console.error('Whisper error:', stderr);
        // Return empty if transcription fails
        resolve('');
        return;
      }
      
      // Read transcription
      const jsonFile = outputFile.replace('.txt', '.json');
      if (fs.existsSync(jsonFile)) {
        try {
          const result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
          fs.unlink(jsonFile, () => {});
          resolve(result.text || '');
        } catch (e) {
          resolve('');
        }
      } else {
        resolve('');
      }
    });
  });
}

// Fallback: Simple mock transcription for testing
async function mockTranscribe() {
  // Simulate processing time
  await new Promise(r => setTimeout(r, 1000));
  return "[Voice transcription would appear here]";
}

// Process audio stream
async function processStream() {
  let lastId = '0';
  
  console.log('=========================================');
  console.log('  Whisper Transcribe');
  console.log('=========================================');
  console.log(`Instance: ${instanceId}`);
  console.log(`Input: ${config.audioStream}`);
  console.log(`Output: ${config.outputStream}`);
  console.log(`Model: ${config.whisperModel}`);
  console.log('=========================================');
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 5000, 'STREAMS', config.audioStream, lastId);
      
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
            
            if (data.type !== 'audio_chunk') {
              continue;
            }
            
            console.log(`Received audio chunk: ${data.audio?.duration}ms from ${data.instance}`);
            
            // Transcribe (or mock for now)
            let transcription = '';
            if (config.useLocal && fs.existsSync('/usr/local/bin/whisper-cli')) {
              transcription = await transcribeAudio(data.audio.data);
            } else {
              transcription = await mockTranscribe();
            }
            
            if (!transcription || transcription.trim() === '') {
              console.log('No transcription, skipping');
              continue;
            }
            
            console.log(`Transcribed: "${transcription.substring(0, 50)}..."`);
            
            // Send to chat stream
            const message = {
              type: 'stream_message',
              id: uuidv4(),
              content: transcription,
              from: `voice-${data.instance || 'user'}`,
              timestamp: new Date().toISOString(),
              metadata: {
                source: 'whisper',
                audioId: data.id,
                duration: data.audio?.duration,
                transcribedBy: instanceId,
              },
            };
            
            await redisPub.xadd(config.outputStream, '*', 'data', JSON.stringify(message));
            console.log('Sent transcription to chat stream');
            
          } catch (err) {
            console.error('Processing error:', err.message);
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
  await redisPub.ping();
  
  server.listen(8082, () => {
    console.log('Health: http://localhost:8082/health');
  });
  
  processStream();
}

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
