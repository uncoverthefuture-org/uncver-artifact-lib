// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 1000;
let sessionId = localStorage.getItem('gemma-session-id') || 'default';
let clientId = null;

// DOM elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const connectionStatus = document.getElementById('connectionStatus');
const settingsPanel = document.getElementById('settingsPanel');
const typingIndicator = document.getElementById('typingIndicator');
const charCount = document.getElementById('charCount');
const sessionIdInput = document.getElementById('sessionId');

// Initialize
sessionIdInput.value = sessionId;

// Auto-resize textarea
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  charCount.textContent = `${this.value.length}/2000`;
});

// Enter to send, Shift+Enter for new line
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Update connection status UI
function updateStatus(status, text) {
  const dot = connectionStatus.querySelector('.status-dot');
  const statusText = connectionStatus.querySelector('.status-text');
  
  dot.className = 'status-dot ' + status;
  statusText.textContent = text;
}

// Connect to WebSocket
function connect() {
  const wsUrl = document.getElementById('wsUrl').value || 'ws://localhost:3000';
  const url = `${wsUrl}?session=${encodeURIComponent(sessionId)}`;
  
  updateStatus('connecting', 'Connecting...');
  
  ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log('Connected to chat server');
    updateStatus('online', 'Connected');
    reconnectAttempts = 0;
    showToast('Connected to chat', 'success');
  };
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  };
  
  ws.onclose = () => {
    console.log('Disconnected from chat server');
    updateStatus('offline', 'Disconnected');
    attemptReconnect();
  };
  
  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    updateStatus('offline', 'Error');
  };
}

// Attempt reconnection
function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    updateStatus('connecting', `Reconnecting (${reconnectAttempts})...`);
    setTimeout(connect, reconnectDelay * reconnectAttempts);
  } else {
    updateStatus('offline', 'Failed to connect');
    showToast('Connection failed. Check settings.', 'error');
  }
}

// Handle incoming messages
function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      clientId = msg.clientId;
      sessionId = msg.sessionId;
      localStorage.setItem('gemma-session-id', sessionId);
      console.log(`Connected as ${clientId} in session ${sessionId}`);
      break;
      
    case 'history':
      // Clear welcome message
      chatContainer.innerHTML = '';
      // Load history
      msg.messages.forEach(m => addMessageToUI(m));
      scrollToBottom();
      break;
      
    case 'user_message':
      addMessageToUI({
        type: 'user',
        content: msg.content,
        timestamp: msg.timestamp,
        id: msg.id,
      });
      break;
      
    case 'ai_message':
      hideTypingIndicator();
      addMessageToUI({
        type: 'ai',
        content: msg.content,
        timestamp: msg.timestamp,
        id: msg.id,
        metadata: msg.metadata,
      });
      break;
      
    case 'message_sent':
      // Confirm message was sent
      console.log(`Message ${msg.id} sent successfully`);
      break;
      
    case 'error':
      showToast(msg.message, 'error');
      hideTypingIndicator();
      break;
      
    case 'pong':
      // Heartbeat response
      break;
  }
}

// Add message to UI
function addMessageToUI(msg) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${msg.type}`;
  messageDiv.id = `msg-${msg.id}`;
  
  const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  
  const header = msg.type === 'ai' ? 
    `<div class="message-header"><span>🤖 Gemma</span><span>${timestamp}</span></div>` : 
    `<div class="message-header"><span>You</span><span>${timestamp}</span></div>`;
  
  // Format content (simple markdown-like)
  let content = escapeHtml(msg.content);
  content = formatMessage(content);
  
  messageDiv.innerHTML = `
    <div class="message-bubble">
      ${header}
      <div class="message-content">${content}</div>
    </div>
  `;
  
  chatContainer.appendChild(messageDiv);
  scrollToBottom();
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format message (basic markdown)
function formatMessage(text) {
  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code: `text`
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  // Newlines to <br>
  text = text.replace(/\n/g, '<br>');
  return text;
}

// Send message
function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  // Send via WebSocket
  ws.send(JSON.stringify({
    type: 'chat_message',
    content: content,
    timestamp: new Date().toISOString(),
  }));
  
  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCount.textContent = '0/2000';
  
  // Show typing indicator for AI
  showTypingIndicator();
  
  // Clear welcome message if present
  const welcome = chatContainer.querySelector('.welcome-message');
  if (welcome) {
    welcome.remove();
  }
}

// Show typing indicator
function showTypingIndicator() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
  typingIndicator.style.display = 'none';
}

// Scroll to bottom
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Toggle settings panel
function toggleSettings() {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
}

// Reconnect with new settings
function reconnect() {
  sessionId = sessionIdInput.value || 'default';
  localStorage.setItem('gemma-session-id', sessionId);
  
  if (ws) {
    ws.close();
  }
  
  // Clear chat
  chatContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">👋</div>
      <h2>Welcome to Gemma Chat</h2>
      <p>Type a message below to start chatting with the AI through Redis streams.</p>
      <p class="hint">Session: <code>${sessionId}</code></p>
    </div>
  `;
  
  connect();
  toggleSettings();
}

// Show toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Heartbeat
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// Web Speech API for voice input and TTS
let recognition = null;
let isListening = false;

// Initialize speech recognition
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.log('Speech recognition not supported');
    return null;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'en-US';
  
  rec.onstart = () => {
    console.log('Listening...');
    isListening = true;
    document.getElementById('voiceBtn').classList.add('listening');
  };
  
  rec.onend = () => {
    console.log('Stopped listening');
    isListening = false;
    document.getElementById('voiceBtn').classList.remove('listening');
  };
  
  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('Heard:', transcript);
    messageInput.value = transcript;
    charCount.textContent = `${transcript.length}/2000`;
    // Auto send after voice input
    setTimeout(sendMessage, 500);
  };
  
  rec.onerror = (err) => {
    console.error('Speech error:', err);
    isListening = false;
    document.getElementById('voiceBtn').classList.remove('listening');
  };
  
  return rec;
}

// Toggle voice recognition
function toggleVoice() {
  if (!recognition) {
    recognition = initSpeechRecognition();
    if (!recognition) {
      showToast('Voice not supported in this browser', 'error');
      return;
    }
  }
  
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

// Text-to-speech for AI responses
function speakText(text) {
  if (!('speechSynthesis' in window)) {
    console.log('TTS not supported');
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  // Try to get a good voice
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.includes('en'));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }
  
  utterance.onstart = () => console.log('Speaking:', text.substring(0, 50) + '...');
  utterance.onerror = (err) => console.error('TTS error:', err);
  
  window.speechSynthesis.speak(utterance);
}

// Modify handleMessage to speak AI responses
const originalHandleMessage = handleMessage;
handleMessage = function(msg) {
  // Call original handler
  originalHandleMessage(msg);
  
  // Speak AI responses
  if (msg.type === 'ai_message' && msg.content) {
    // Only speak the first sentence to avoid too much audio
    const firstSentence = msg.content.split(/[.!?]+/)[0];
    if (firstSentence) {
      speakText(firstSentence + '.');
    }
  }
};

// Connect on load
connect();
