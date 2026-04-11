const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const initAutonomous = require('./autonomous');
const initSockets = require('./socket');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

// Initialize background autonomous agent logic
initAutonomous('redis-stream-push-gui');

// Initialize Web UI socket communication wrapper
initSockets(io);

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`Web GUI running on http://localhost:${PORT}`);
});
