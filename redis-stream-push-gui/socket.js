const redis = require('redis');

module.exports = function initSockets(io) {
  let redisClient;

  io.on('connection', (socket) => {
    console.log('Client connected to Web GUI');

    socket.on('connect-redis', async (config, callback) => {
      try {
        if (redisClient) {
          await redisClient.quit();
        }
        let url = config.url || 'redis://host.containers.internal:6379';
        if (!url.startsWith('redis://')) {
          url = 'redis://' + url;
        }
        
        redisClient = redis.createClient({ url });
        
        redisClient.on('error', (err) => {
          console.error('Redis error:', err);
          socket.emit('redis-error', err.message);
        });
        
        await redisClient.connect();
        callback({ success: true, message: 'Connected to Redis' });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    socket.on('list-streams', async (arg, callback) => {
      try {
        if (!redisClient) return callback([]);
        const keys = await redisClient.keys('*');
        const streams = [];
        for (const key of keys) {
          const type = await redisClient.type(key);
          if (type === 'stream') {
            const info = await redisClient.xInfoStream(key);
            streams.push({ name: key, length: info.length, lastId: info['last-generated-id'] });
          }
        }
        callback(streams);
      } catch (error) {
        console.error(error);
        callback([]);
      }
    });

    socket.on('read-stream', async ({streamName, count}, callback) => {
      try {
        if (!redisClient) return callback([]);
        count = count || 10;
        const messages = await redisClient.xRevRange(streamName, '+', '-', { count });
        callback(messages.map(([id, fields]) => ({ id, fields: Object.fromEntries(fields) })));
      } catch (error) {
        console.error(error);
        callback([]);
      }
    });

    let monitorActive = false;
    socket.on('monitor-stream', async (streamName, callback) => {
      try {
        if (!redisClient) return callback({success: false, message: 'Not connected'});
        monitorActive = false;
        await new Promise(r => setTimeout(r, 100)); // debounce
        
        monitorActive = true;
        const monitor = async () => {
          if(!monitorActive || !redisClient) return;
          try {
            const results = await redisClient.xRead(
              [{ key: streamName, id: '$' }],
              { block: 0 }
            );
            if (results && results.length > 0) {
              for (const result of results) {
                for (const [id, fields] of result.messages) {
                  socket.emit('stream-message', {
                    stream: streamName,
                    id,
                    fields: Object.fromEntries(fields),
                    timestamp: new Date().toISOString()
                  });
                }
              }
            }
            if(monitorActive) setImmediate(monitor);
          } catch (err) {
            if(monitorActive) setTimeout(monitor, 1000);
          }
        };
        
        monitor();
        callback({ success: true });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    socket.on('stop-monitor', () => { monitorActive = false; });

    socket.on('publish-message', async ({streamName, message}, callback) => {
      try {
        if (!redisClient) return callback({success:false});
        const id = await redisClient.xAdd(streamName, '*', message);
        callback({ success: true, id });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    socket.on('disconnect', () => {
      monitorActive = false;
    });
  });
};
