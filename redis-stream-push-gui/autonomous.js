const fs = require('fs');
const path = require('path');
const redis = require('redis');

module.exports = async function initAutonomous(artifactName) {
  const commandsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'commands.json'), 'utf8'));
  const SYSTEM_STREAM = 'uncver:system';
  const DEFAULT_URL = 'redis://uncver-redis-stream:6379';

  const autoClient = redis.createClient({ url: process.env.REDIS_URL || DEFAULT_URL });
  const autoSubscriber = redis.createClient({ url: process.env.REDIS_URL || DEFAULT_URL });

  try {
    await autoClient.connect();
    await autoSubscriber.connect();
    
    // Push Boot Status
    await autoClient.xAdd(SYSTEM_STREAM, '*', {
      event: 'artifact_started',
      artifact: artifactName,
      status: 'online',
      description: commandsData.description
    });
    console.log(`${artifactName} published boot status to ${SYSTEM_STREAM}`);

    let lastId = '$';
    while (true) {
      try {
        const results = await autoSubscriber.xRead(
          [{ key: SYSTEM_STREAM, id: lastId }],
          { block: 0 }
        );
        if (results && results.length > 0) {
          for (const msg of results[0].messages) {
            lastId = msg.id;
            
            const fields = msg.message;
            if (!fields) continue;

            const target = fields.target || fields.artifact;
            if (target === 'all' || target === artifactName) {
              const cmd = fields.command || fields.event;
              
              if (cmd === 'ping') {
                await autoClient.xAdd(SYSTEM_STREAM, '*', {
                  event: 'pong',
                  artifact: artifactName,
                  status: 'alive'
                });
              } else if (cmd === 'info' || cmd === 'get_commands') {
                await autoClient.xAdd(SYSTEM_STREAM, '*', {
                  event: 'info_response',
                  artifact: artifactName,
                  status: 'online',
                  commands: JSON.stringify(commandsData.commands)
                });
              }
            }
          }
        }
      } catch (err) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('Autonomous Redis initialization failed:', err);
  }
};
