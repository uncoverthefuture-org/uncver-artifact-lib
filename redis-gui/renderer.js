const { ipcRenderer } = require('electron');

let currentStream = null;
let isMonitoring = false;

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const redisUrlInput = document.getElementById('redisUrl');
const streamList = document.getElementById('streamList');
const currentStreamTitle = document.getElementById('currentStream');
const messagesContainer = document.getElementById('messagesContainer');
const monitorBtn = document.getElementById('monitorBtn');
const loadBtn = document.getElementById('loadBtn');
const publishKey = document.getElementById('publishKey');
const publishValue = document.getElementById('publishValue');

// Connect to Redis
async function connectRedis() {
  const url = redisUrlInput.value || 'redis://localhost:6379';
  
  try {
    const result = await ipcRenderer.invoke('connect-redis', { url });
    
    if (result.success) {
      updateConnectionStatus(true);
      showNotification('Connected to Redis!', 'success');
      refreshStreams();
    } else {
      updateConnectionStatus(false);
      showNotification(`Connection failed: ${result.message}`, 'error');
    }
  } catch (error) {
    updateConnectionStatus(false);
    showNotification(`Error: ${error.message}`, 'error');
  }
}

// Update connection status UI
function updateConnectionStatus(connected) {
  const dot = connectionStatus.querySelector('.status-dot');
  const text = connectionStatus.querySelector('span:last-child');
  
  if (connected) {
    dot.classList.add('connected');
    text.textContent = 'Connected';
    monitorBtn.disabled = false;
    loadBtn.disabled = false;
  } else {
    dot.classList.remove('connected');
    text.textContent = 'Disconnected';
    monitorBtn.disabled = true;
    loadBtn.disabled = true;
  }
}

// Refresh streams list
async function refreshStreams() {
  try {
    const streams = await ipcRenderer.invoke('list-streams');
    
    streamList.innerHTML = '';
    
    if (streams.length === 0) {
      streamList.innerHTML = '<li style="text-align: center; color: #666;">No streams found</li>';
      return;
    }
    
    streams.forEach(stream => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="stream-info">
          <span class="stream-name">${stream.name}</span>
          <span class="stream-meta">${stream.length} messages</span>
        </div>
      `;
      li.onclick = () => selectStream(stream.name, li);
      streamList.appendChild(li);
    });
  } catch (error) {
    showNotification(`Error listing streams: ${error.message}`, 'error');
  }
}

// Select a stream
function selectStream(streamName, element) {
  // Remove active class from all
  document.querySelectorAll('.stream-list li').forEach(li => {
    li.classList.remove('active');
  });
  
  // Add active class to selected
  element.classList.add('active');
  
  currentStream = streamName;
  currentStreamTitle.textContent = `Stream: ${streamName}`;
  monitorBtn.disabled = false;
  loadBtn.disabled = false;
}

// Load messages from stream
async function loadMessages() {
  if (!currentStream) {
    showNotification('Please select a stream first', 'warning');
    return;
  }
  
  try {
    const messages = await ipcRenderer.invoke('read-stream', currentStream, 50);
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
      messagesContainer.innerHTML = '<div class="placeholder"><p>No messages in this stream</p></div>';
      return;
    }
    
    messages.reverse().forEach(message => {
      displayMessage(message);
    });
  } catch (error) {
    showNotification(`Error loading messages: ${error.message}`, 'error');
  }
}

// Start monitoring stream
async function startMonitoring() {
  if (!currentStream) {
    showNotification('Please select a stream first', 'warning');
    return;
  }
  
  if (isMonitoring) {
    showNotification('Already monitoring', 'warning');
    return;
  }
  
  try {
    const result = await ipcRenderer.invoke('monitor-stream', currentStream);
    
    if (result.success) {
      isMonitoring = true;
      monitorBtn.textContent = '⏸️ Stop Monitor';
      monitorBtn.style.background = '#e74c3c';
      showNotification(`Started monitoring ${currentStream}`, 'success');
      
      // Clear placeholder
      messagesContainer.innerHTML = '';
    } else {
      showNotification(`Failed to start monitoring: ${result.message}`, 'error');
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

// Display a message
function displayMessage(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  
  const timestamp = message.timestamp || new Date().toISOString();
  const date = new Date(timestamp).toLocaleString();
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <div>
        <span class="message-stream">${message.stream || currentStream}</span>
        <span class="message-id">${message.id}</span>
      </div>
      <span class="message-timestamp">${date}</span>
    </div>
    <div class="message-fields">
      <pre>${JSON.stringify(message.fields, null, 2)}</pre>
    </div>
  `;
  
  messagesContainer.insertBefore(messageDiv, messagesContainer.firstChild);
  
  // Keep only last 100 messages
  while (messagesContainer.children.length > 100) {
    messagesContainer.removeChild(messagesContainer.lastChild);
  }
}

// Clear messages
function clearMessages() {
  messagesContainer.innerHTML = '<div class="placeholder"><p>Messages cleared. Connect and select a stream to view messages.</p></div>';
}

// Publish message
async function publishMessage() {
  if (!currentStream) {
    showNotification('Please select a stream first', 'warning');
    return;
  }
  
  const key = publishKey.value.trim();
  const value = publishValue.value.trim();
  
  if (!key || !value) {
    showNotification('Please enter both key and value', 'warning');
    return;
  }
  
  try {
    const message = { [key]: value };
    const result = await ipcRenderer.invoke('publish-message', currentStream, message);
    
    if (result.success) {
      showNotification(`Message published with ID: ${result.id}`, 'success');
      publishKey.value = '';
      publishValue.value = '';
    } else {
      showNotification(`Failed to publish: ${result.message}`, 'error');
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  
  switch (type) {
    case 'success':
      notification.style.background = '#2ecc71';
      break;
    case 'error':
      notification.style.background = '#e74c3c';
      break;
    case 'warning':
      notification.style.background = '#f39c12';
      break;
    default:
      notification.style.background = '#3498db';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Listen for stream messages from main process
ipcRenderer.on('stream-message', (event, message) => {
  displayMessage(message);
});

ipcRenderer.on('redis-error', (event, error) => {
  showNotification(`Redis Error: ${error}`, 'error');
  updateConnectionStatus(false);
});

// Auto-connect on load
window.addEventListener('load', () => {
  setTimeout(connectRedis, 500);
});
