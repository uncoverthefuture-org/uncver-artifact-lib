const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const redis = require('redis');

let mainWindow;
let redisClient;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Redis Stream Monitor'
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (redisClient) {
    redisClient.quit();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('connect-redis', async (event, config) => {
  try {
    if (redisClient) {
      await redisClient.quit();
    }
    
    redisClient = redis.createClient({
      url: config.url || 'redis://localhost:6379'
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
      mainWindow.webContents.send('redis-error', err.message);
    });
    
    await redisClient.connect();
    return { success: true, message: 'Connected to Redis' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('list-streams', async () => {
  try {
    // Get all keys that look like streams (this is a simplified approach)
    const keys = await redisClient.keys('*');
    const streams = [];
    
    for (const key of keys) {
      const type = await redisClient.type(key);
      if (type === 'stream') {
        const info = await redisClient.xInfoStream(key);
        streams.push({
          name: key,
          length: info.length,
          lastId: info['last-generated-id']
        });
      }
    }
    
    return streams;
  } catch (error) {
    console.error('Error listing streams:', error);
    return [];
  }
});

ipcMain.handle('read-stream', async (event, streamName, count = 10) => {
  try {
    const messages = await redisClient.xRevRange(streamName, '+', '-', { count });
    return messages.map(([id, fields]) => ({
      id,
      fields: Object.fromEntries(fields)
    }));
  } catch (error) {
    console.error('Error reading stream:', error);
    return [];
  }
});

ipcMain.handle('monitor-stream', async (event, streamName) => {
  try {
    // Start monitoring with XREAD (blocking)
    const monitor = async () => {
      try {
        const results = await redisClient.xRead(
          [{ key: streamName, id: '$' }],
          { block: 5000 }
        );
        
        if (results && results.length > 0) {
          for (const result of results) {
            for (const [id, fields] of result.messages) {
              mainWindow.webContents.send('stream-message', {
                stream: streamName,
                id,
                fields: Object.fromEntries(fields),
                timestamp: new Date().toISOString()
              });
            }
          }
        }
        
        // Continue monitoring
        monitor();
      } catch (error) {
        console.error('Monitor error:', error);
        setTimeout(monitor, 1000);
      }
    };
    
    monitor();
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('publish-message', async (event, streamName, message) => {
  try {
    const id = await redisClient.xAdd(streamName, '*', message);
    return { success: true, id };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
