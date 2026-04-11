const socket = io();

let currentStream = null;

// Connect to Redis
async function connectRedis() {
  const url = document.getElementById('redisUrl').value;
  const statusEl = document.getElementById('connectionStatus');
  const statusDot = statusEl.querySelector('.status-dot');
  const statusText = statusEl.querySelector('.status-text');

  statusText.textContent = 'Linking...';
  
  socket.emit('connect-redis', { url }, (response) => {
    if (response.success) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Systems Online';
      refreshStreams();
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Link Failed';
      console.error('Connection failed:', response.message);
    }
  });
}

// Refresh Streams
async function refreshStreams() {
  const list = document.getElementById('streamList');
  list.innerHTML = '<div class="status-text" style="padding:10px">Scanning nodes...</div>';

  socket.emit('list-streams', null, (streams) => {
    list.innerHTML = '';
    
    if (streams.length === 0) {
      list.innerHTML = '<div class="status-text" style="padding:10px">No streams detected</div>';
      return;
    }

    streams.forEach(stream => {
      const div = document.createElement('div');
      div.className = 'stream-item' + (currentStream === stream.name ? ' active' : '');
      div.innerHTML = `
        <span class="stream-name">${stream.name}</span>
        <span class="stream-count">${stream.length}</span>
      `;
      div.onclick = () => selectStream(stream.name);
      list.appendChild(div);
    });
  });
}

// Select Stream
function selectStream(name) {
  currentStream = name;
  document.getElementById('currentStream').textContent = name;
  document.getElementById('monitorBtn').disabled = false;
  document.getElementById('loadBtn').disabled = false;
  
  socket.emit('stop-monitor');

  // Update UI selection
  document.querySelectorAll('.stream-item').forEach(el => {
    el.classList.remove('active');
    if (el.querySelector('.stream-name').textContent === name) {
      el.classList.add('active');
    }
  });

  loadMessages();
}

// Load Messages
async function loadMessages() {
  if (!currentStream) return;
  
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '<div class="log-placeholder"><div class="placeholder-content"><h3>Loading Buffer...</h3></div></div>';

  socket.emit('read-stream', { streamName: currentStream, count: 50 }, (messages) => {
    container.innerHTML = '';
    
    if (messages.length === 0) {
      container.innerHTML = '<div class="log-placeholder"><div class="placeholder-content"><h3>Buffer Empty</h3><p>No telemetry data found for this stream.</p></div></div>';
      return;
    }

    messages.forEach(msg => appendMessage(msg, false));
    scrollToBottom();
  });
}

// Start/Stop Monitoring
async function startMonitoring() {
  if (!currentStream) return;
  
  const btn = document.getElementById('monitorBtn');
  if (btn.textContent.includes('Start')) {
    btn.innerHTML = '⏹️ Stop Stream';
    btn.style.borderColor = 'var(--accent-primary)';
    
    socket.emit('monitor-stream', currentStream, (response) => {
      if (!response.success) {
        stopMonitoringUI();
      }
    });
  } else {
    socket.emit('stop-monitor');
    stopMonitoringUI();
  }
}

function stopMonitoringUI() {
  const btn = document.getElementById('monitorBtn');
  btn.innerHTML = '▶️ Start Stream';
  btn.style.borderColor = 'var(--border-color)';
}

// Publish Message
async function publishMessage() {
  if (!currentStream) {
    return;
  }

  const keyInput = document.getElementById('publishKey');
  const valueInput = document.getElementById('publishValue');
  
  if (!keyInput.value || !valueInput.value) return;

  const message = {};
  message[keyInput.value] = valueInput.value;

  socket.emit('publish-message', { streamName: currentStream, message }, (response) => {
    if (response.success) {
      keyInput.value = '';
      valueInput.value = '';
      refreshStreams();
    }
  });
}

// Clear Messages UI
function clearMessages() {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '';
}

// Socket event for incoming monitored messages
socket.on('stream-message', (data) => {
  if (data.stream === currentStream) {
    appendMessage(data, false); // Append to bottom for continuous flow
    scrollToBottom();
  }
});

socket.on('redis-error', (msg) => {
  const statusEl = document.getElementById('connectionStatus');
  const statusDot = statusEl.querySelector('.status-dot');
  const statusText = statusEl.querySelector('.status-text');
  statusDot.className = 'status-dot disconnected';
  statusText.textContent = 'System Error';
  console.error("Redis Error:", msg);
});

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;
}

// Helper for UI appending
function appendMessage(msg, prepend = false) {
  const container = document.getElementById('messagesContainer');
  
  // Remove placeholder
  const placeholder = container.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = 'message';
  
  // Format fields
  let fieldsHtml = '';
  for (const [key, value] of Object.entries(msg.fields)) {
    fieldsHtml += `
      <div class="kv-pair">
        <span class="kv-key">${key}:</span>
        <span class="kv-val">${value}</span>
      </div>
    `;
  }
  
  div.innerHTML = `
    <div class="message-header">
      <span class="message-id">${msg.id}</span>
      <span class="message-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</span>
    </div>
    <div class="message-fields">
      ${fieldsHtml}
    </div>
  `;

  if (prepend && container.firstChild) {
    container.insertBefore(div, container.firstChild);
  } else {
    container.appendChild(div);
  }
}
