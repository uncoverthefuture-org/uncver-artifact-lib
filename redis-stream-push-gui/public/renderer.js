const socket = io();

// UI Elements
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('#connectionStatus span');
const redisUrl = document.getElementById('redisUrl');
const streamName = document.getElementById('streamName');
const payloadData = document.getElementById('payloadData');
const toast = document.getElementById('toast');

// Auto-connect on load
window.onload = () => {
  connectRedis();
};

let isConnected = false;

function connectRedis() {
  const url = redisUrl.value.trim();
  if (!url) return alert('Please enter Redis URL');

  statusText.textContent = 'Connecting...';
  
  socket.emit('connect-redis', { url }, (response) => {
    if (response.success) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
      isConnected = true;
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Error';
      showToast('Connection failed: ' + response.message, false);
      isConnected = false;
    }
  });
}

function pushToStream() {
  if (!isConnected) return showToast('Please connect to Redis first', false);
  
  const stream = streamName.value.trim();
  if (!stream) return showToast('Enter a valid stream name', false);

  let payload;
  try {
    const raw = JSON.parse(payloadData.value);
    
    // Convert object to flat Key/Value array for Redis
    payload = [];
    for (const [k, v] of Object.entries(raw)) {
        payload.push(k);
        payload.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  } catch (e) {
    return showToast('Invalid JSON payload!', false);
  }

  socket.emit('publish-message', { streamName: stream, message: payload }, (res) => {
    if (res.success) {
      showToast(`Success! ID: ${res.id}`, true);
    } else {
      showToast('Error: ' + res.message, false);
    }
  });
}

function showToast(msg, isSuccess) {
  toast.textContent = msg;
  toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

socket.on('redis-error', (err) => {
  statusDot.className = 'status-dot disconnected';
  statusText.textContent = 'Disconnected';
  isConnected = false;
  showToast('Redis Error: ' + err, false);
});
