let ws = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 1000;
let sessionId = localStorage.getItem('artifacts-session-id') || 'default';
let clientId = null;
let currentTab = 'chat';
let streamCount = 0;
const MAX_STREAM_ENTRIES = 500;

const colorKey = 'artifacts-stream-source-colors';

function getSourceColor(source) {
  const stored = JSON.parse(localStorage.getItem(colorKey) || '{}');
  if (stored[source]) return stored[source];
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 30);
  const lit = 45 + Math.floor(Math.random() * 20);
  const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
  stored[source] = color;
  localStorage.setItem(colorKey, JSON.stringify(stored));
  return color;
}

function parseTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') {
    if (ts > 1e12) return new Date(ts);
    return new Date(ts * 1000);
  }
  if (typeof ts === 'string') {
    const n = Number(ts);
    if (!isNaN(n)) {
      if (n > 1e12) return new Date(n);
      return new Date(n * 1000);
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatTimestamp(ts) {
  const d = parseTimestamp(ts);
  return d ? d.toLocaleTimeString() : '';
}

const chatContainer = document.getElementById('chatContainer');
const streamContainer = document.getElementById('streamContainer');
const streamLog = document.getElementById('streamLog');
const streamCountEl = document.getElementById('streamCount');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const connectionStatus = document.getElementById('connectionStatus');
const settingsPanel = document.getElementById('settingsPanel');
const typingIndicator = document.getElementById('typingIndicator');
const charCount = document.getElementById('charCount');
const sessionIdInput = document.getElementById('sessionId');
const chatInput = document.getElementById('chatInput');

sessionIdInput.value = sessionId;

messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  charCount.textContent = `${this.value.length}/2000`;
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function updateStatus(status, text) {
  const dot = connectionStatus.querySelector('.status-dot');
  const statusText = connectionStatus.querySelector('.status-text');
  dot.className = 'status-dot ' + status;
  statusText.textContent = text;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'chat') {
    chatContainer.style.display = '';
    streamContainer.style.display = 'none';
    chatInput.style.display = '';
  } else {
    chatContainer.style.display = 'none';
    streamContainer.style.display = '';
    chatInput.style.display = 'none';
  }
}

function connect() {
  const wsUrl = document.getElementById('wsUrl').value || 'ws://localhost:3000';
  const url = `${wsUrl}?session=${encodeURIComponent(sessionId)}`;
  updateStatus('connecting', 'Connecting...');
  ws = new WebSocket(url);
  ws.onopen = () => {
    updateStatus('online', 'Connected');
    reconnectAttempts = 0;
    showToast('Connected', 'success');
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
    updateStatus('offline', 'Disconnected');
    attemptReconnect();
  };
  ws.onerror = () => {
    updateStatus('offline', 'Error');
  };
}

function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    updateStatus('connecting', `Reconnecting (${reconnectAttempts})...`);
    setTimeout(connect, reconnectDelay * reconnectAttempts);
  } else {
    updateStatus('offline', 'Failed to connect');
    showToast('Connection failed.', 'error');
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      clientId = msg.clientId;
      sessionId = msg.sessionId;
      localStorage.setItem('artifacts-session-id', sessionId);
      break;
    case 'history':
      chatContainer.innerHTML = '';
      msg.messages.forEach(m => addMessageToUI(m));
      scrollToBottom();
      break;
    case 'user_message':
      addMessageToUI({ type: 'user', content: msg.content, timestamp: msg.timestamp, id: msg.id });
      break;
    case 'ai_message':
      hideTypingIndicator();
      addMessageToUI({ type: 'ai', content: msg.content, timestamp: msg.timestamp, id: msg.id });
      break;
    case 'stream_message':
      addStreamEntry(msg.id, msg.fields);
      break;
    case 'error':
      showToast(msg.message, 'error');
      hideTypingIndicator();
      break;
    case 'pong':
      break;
  }
}

function addMessageToUI(msg) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${msg.type}`;
  messageDiv.id = `msg-${msg.id}`;
  const timestamp = formatTimestamp(msg.timestamp) || new Date().toLocaleTimeString();
  const label = msg.type === 'ai' ? 'AI' : 'You';
  const icon = msg.type === 'ai' ? '🤖' : '';
  const header = `<div class="message-header"><span>${icon} ${label}</span><span>${timestamp}</span></div>`;
  let content = escapeHtml(msg.content);
  content = formatMessage(content);
  messageDiv.innerHTML = `<div class="message-bubble">${header}<div class="message-content">${content}</div></div>`;
  chatContainer.appendChild(messageDiv);
  scrollToBottom();
}

function addStreamEntry(id, fields) {
  streamCount++;
  streamCountEl.textContent = `${streamCount} messages`;
  const entry = document.createElement('div');
  entry.className = 'stream-entry';
  const source = fields.source || 'unknown';
  const type = fields.type || '-';
  const ts = fields.timestamp || '';
  const color = getSourceColor(source);

  const filtered = Object.fromEntries(
    Object.entries(fields).filter(([k]) => !['source', 'type', 'timestamp'].includes(k))
  );
  let jsonPreview = '';
  let jsonFull = '';
  if (Object.keys(filtered).length > 0) {
    jsonFull = JSON.stringify(filtered, null, 2);
    const preview = JSON.stringify(filtered);
    jsonPreview = preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
  }

  entry.innerHTML = `
    <div class="stream-entry-head">
      <span class="stream-entry-id">${escapeHtml(id)}</span>
      <span class="stream-entry-source" style="color:${color};background:${color}18">${escapeHtml(source)}</span>
      <span class="stream-entry-type">${escapeHtml(type)}</span>
      <span class="stream-entry-ts">${formatTimestamp(ts)}</span>
      <span class="stream-entry-toggle" onclick="toggleStreamEntry(this)">${jsonFull ? '▶' : ''}</span>
    </div>
    ${jsonFull ? `<pre class="stream-entry-json" style="display:none">${escapeHtml(jsonFull)}</pre>` : ''}
  `;
  streamLog.appendChild(entry);
  const entries = streamLog.querySelectorAll('.stream-entry');
  if (entries.length > MAX_STREAM_ENTRIES) entries[0].remove();
  if (currentTab === 'stream') streamLog.scrollTop = streamLog.scrollHeight;
}

function toggleStreamEntry(el) {
  const pre = el.parentElement.nextElementSibling;
  if (pre && pre.classList.contains('stream-entry-json')) {
    const isHidden = pre.style.display === 'none';
    pre.style.display = isHidden ? 'block' : 'none';
    el.textContent = isHidden ? '▼' : '▶';
    el.closest('.stream-entry').classList.toggle('expanded', isHidden);
  }
}

function clearStream() {
  streamLog.innerHTML = '';
  streamCount = 0;
  streamCountEl.textContent = '0 messages';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'chat_message', content, timestamp: new Date().toISOString() }));
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCount.textContent = '0/2000';
  showTypingIndicator();
  const welcome = chatContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();
}

function showTypingIndicator() { typingIndicator.style.display = 'flex'; scrollToBottom(); }
function hideTypingIndicator() { typingIndicator.style.display = 'none'; }
function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }
function toggleSettings() { settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'; }

function reconnect() {
  sessionId = sessionIdInput.value || 'default';
  localStorage.setItem('artifacts-session-id', sessionId);
  if (ws) ws.close();
  chatContainer.innerHTML = `<div class="welcome-message"><div class="welcome-icon">📡</div><h2>Artifacts Stream</h2><p>Redis stream interface — chat or watch messages flow in real time.</p></div>`;
  clearStream();
  connect();
  toggleSettings();
}

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

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);

let recognition = null;
let isListening = false;

function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'en-US';
  rec.onstart = () => { isListening = true; document.getElementById('voiceBtn').classList.add('listening'); };
  rec.onend = () => { isListening = false; document.getElementById('voiceBtn').classList.remove('listening'); };
  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    messageInput.value = transcript;
    charCount.textContent = `${transcript.length}/2000`;
    setTimeout(sendMessage, 500);
  };
  rec.onerror = () => { isListening = false; document.getElementById('voiceBtn').classList.remove('listening'); };
  return rec;
}

function toggleVoice() {
  if (!recognition) {
    recognition = initSpeechRecognition();
    if (!recognition) { showToast('Voice not supported', 'error'); return; }
  }
  isListening ? recognition.stop() : recognition.start();
}

connect();
