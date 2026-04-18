#!/usr/bin/env node
/**
 * Simple Voice Bridge
 * Uses Mac's built-in say/speech commands
 */

const Redis = require('ioredis');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const config = {
  redisAddr: process.env.REDIS_ADDR || 'localhost:6379',
  inputStream: 'uncver:stream:input',
  audioStream: 'uncver:stream:audio',
  responseStream: 'uncver:stream:response',
};

const redis = new Redis({ host: config.redisAddr.split(':')[0], port: parseInt(config.redisAddr.split(':')[1] || '6379') });
const redisPub = redis.duplicate();

const instanceId = `voice-bridge-${uuidv4().slice(0, 8)}`;

// Listen for TTS requests
async function listenForTTS() {
  let lastId = '0';
  
  console.log('Listening for TTS on:', config.audioStream);
  
  while (true) {
    try {
      const results = await redis.xread('BLOCK', 1000, 'STREAMS', config.audioStream, lastId);
      
      if (!results) continue;
      
      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          lastId = id;
          
          try {
            const data = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }
            
            const msg = JSON.parse(data.data || '{}');
            const text = msg.text || msg.content || '';
            
            if (text) {
              console.log(`Speaking: ${text.substring(0, 50)}...`);
              exec(`say "${text.replace(/"/g, '\\"')}"`);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

// Simple command to send voice messages
echo(process.argv[2]);