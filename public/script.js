'use strict';

// ════════════════════════════════════════════════════════════
//  FormAI — script.js
//  Every DOM operation is guarded. Every fetch is handled.
//  Nothing can crash this file.
// ════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────
let isLoading   = false;
let formCounter = 0;

// ── Safe DOM getter — never throws ───────────────────────────
function $(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`[FormAI] Element #${id} not found`);
  return el;
}

// ── DOM refs ──────────────────────────────────────────────────
const promptInput   = $('promptInput');
const sendBtn       = $('sendBtn');
const messagesEl    = $('messages');
const welcomeEl     = $('welcome');
const chatArea      = $('chatArea');
const historyList   = $('historyList');
const sidebar       = $('sidebar');
const overlay       = $('overlay');
const modal         = $('modal');
const modalBackdrop = $('modalBackdrop');
const modalEdit     = $('modalEdit');
const modalView     = $('modalView');
const modalTitle    = $('modalTitle');
const modalDesc     = $('modalDesc');

// ── HTML escape — prevents XSS in any dynamic content ────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Textarea auto-resize ─────────────────────────────────────
function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// ── Enter = send, Shift+Enter = new line ─────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── Sidebar toggle (mobile) ───────────────────────────────────
function toggleSidebar() {
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
}
function closeSidebar() {
  sidebar?.classList.remove('open');
  overlay?.classList.remove('open');
}

// ── New chat ──────────────────────────────────────────────────
function newChat() {
  if (messagesEl) messagesEl.innerHTML = '';
  if (welcomeEl)  welcomeEl.style.display = '';
  if (promptInput) { promptInput.value = ''; autoResize(promptInput); }
  closeSidebar();
  promptInput?.focus();
}

// ── Use suggestion card ───────────────────────────────────────
function useSuggestion(card) {
  if (!card || !promptInput) return;
  const titleEl = card.querySelector('.suggestion-title');
  const descEl  = card.querySelector('.suggestion-desc');
  if (!titleEl || !descEl) return;
  promptInput.value = `Create a ${titleEl.textContent.toLowerCase()} form: ${descEl.textContent}`;
  autoResize(promptInput);
  promptInput.focus();
}

// ── Toast notification ────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(data) {
  if (!modal || !modalBackdrop) return;
  if (modalTitle) modalTitle.textContent = data.title || 'Form Created';
  if (modalDesc)  modalDesc.textContent  = `"${data.title}" is live. Open the edit link to customise and share it.`;
  if (modalEdit)  modalEdit.href  = data.editUrl  || '#';
  if (modalView)  modalView.href  = data.viewUrl  || '#';
  modal.classList.add('open');
  modalBackdrop.classList.add('open');
}
function closeModal() {
  modal?.classList.remove('open');
  modalBackdrop?.classList.remove('open');
}

// ── Scroll chat to bottom ─────────────────────────────────────
function scrollBottom() {
  if (chatArea) chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// ── Append a message row ──────────────────────────────────────
function appendMsg(role, content) {
  if (welcomeEl) welcomeEl.style.display = 'none';
  if (!messagesEl) return;

  const row    = document.createElement('div');
  row.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === 'user' ? 'You' : '✦';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (typeof content === 'string') {
    bubble.textContent = content;
  } else if (content instanceof Node) {
    bubble.appendChild(content);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollBottom();
}

// ── Typing indicator ──────────────────────────────────────────
function showTyping() {
  if (welcomeEl) welcomeEl.style.display = 'none';
  if (!messagesEl) return;

  // Remove existing if somehow there's already one
  document.getElementById('typingRow')?.remove();

  const row = document.createElement('div');
  row.className = 'msg bot';
  row.id = 'typingRow';

  const avatar = document.createElement('div');
  avatar.className = 'avatar bot';
  avatar.textContent = '✦';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollBottom();
}
function removeTyping() {
  document.getElementById('typingRow')?.remove();
}

// ── Success card ──────────────────────────────────────────────
function buildResultCard(data) {
  const id   = `form_${++formCounter}`;
  const wrap = document.createElement('div');

  const intro      = document.createElement('p');
  intro.style.cssText = 'margin-bottom:12px;font-size:14px;line-height:1.6;';
  intro.textContent   = `✦ "${data.title || 'Your form'}" is ready on Google Forms.`;

  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="result-card-header">
      <div class="result-status"></div>
      <div class="result-title-text">${esc(data.title || 'Form')}</div>
      <div class="result-badge">LIVE</div>
    </div>
    <div class="result-card-body">
      <a class="rc-btn primary"
         href="${esc(data.editUrl || '#')}"
         target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Form
      </a>
      <a class="rc-btn secondary"
         href="${esc(data.viewUrl || '#')}"
         target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Preview
      </a>
      <button class="rc-btn copy" data-copy-id="${esc(id)}" title="Copy edit link">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
    </div>
  `;

  // Copy button — uses data attribute instead of dynamic ID to avoid collisions
  const copyBtn = card.querySelector('[data-copy-id]');
  if (copyBtn && data.editUrl) {
    copyBtn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.editUrl)
          .then(() => showToast('Edit link copied!'))
          .catch(() => fallbackCopy(data.editUrl));
      } else {
        fallbackCopy(data.editUrl);
      }
    });
  }

  wrap.appendChild(intro);
  wrap.appendChild(card);
  return wrap;
}

// Copy fallback for browsers without clipboard API
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Edit link copied!');
  } catch {
    showToast('Could not copy. Select the link manually.');
  }
}

// ── Error bubble ──────────────────────────────────────────────
function buildErrorEl(msg) {
  const d = document.createElement('div');
  d.className = 'error-bubble';
  d.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8"  x2="12"    y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>${esc(msg)}</span>
  `;
  return d;
}

// ── Sidebar history ───────────────────────────────────────────
function addToHistory(data) {
  if (!historyList) return;
  historyList.querySelector('.history-empty')?.remove();

  const item   = document.createElement('a');
  item.className  = 'history-item';
  item.href       = data.editUrl || '#';
  item.target     = '_blank';
  item.rel        = 'noopener noreferrer';
  item.title      = data.title || 'Form';
  item.innerHTML  = `<div class="hi-dot"></div><span class="hi-label">${esc(data.title || 'Form')}</span>`;
  historyList.prepend(item);
}

// ── Lock / unlock UI ─────────────────────────────────────────
function lockUI() {
  isLoading = true;
  if (sendBtn)    sendBtn.disabled    = true;
  if (promptInput) promptInput.disabled = true;
}
function unlockUI() {
  isLoading = false;
  if (sendBtn)     sendBtn.disabled    = false;
  if (promptInput) promptInput.disabled = false;
  promptInput?.focus();
}

// ════════════════════════════════════════════════════════════
//  MAIN: sendMessage
// ════════════════════════════════════════════════════════════
async function sendMessage() {
  if (isLoading) return;
  if (!promptInput) return;

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  lockUI();
  promptInput.value = '';
  autoResize(promptInput);

  // Show user bubble
  appendMsg('user', prompt);

  // Show AI typing
  showTyping();

  try {
    // ── Fetch with timeout (30 s) ─────────────────────────
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30000);

    let res;
    try {
      res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt }),
        signal:  controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Parse response safely ─────────────────────────────
    let data;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        throw new Error('Server returned invalid JSON. Please try again.');
      }
    } else {
      // Non-JSON response (e.g. Vercel timeout HTML page)
      const txt = await res.text().catch(() => '');
      if (res.status === 504 || res.status === 408) {
        throw new Error('Request timed out. The AI is busy — please try again in a moment.');
      }
      throw new Error(`Server error ${res.status}. Please try again.`);
    }

    removeTyping();

    // ── Handle API-level errors ───────────────────────────
    if (!res.ok) {
      const msg = data?.error || data?.message || `Server error ${res.status}`;
      const dbg = data?.debug ? ` (${data.debug})` : '';
      throw new Error(msg + dbg);
    }

    // ── Validate returned data ────────────────────────────
    if (!data.formId || !data.editUrl) {
      throw new Error('Form was created but returned incomplete data. Check your Google Cloud API settings.');
    }

    // ── Show result ───────────────────────────────────────
    appendMsg('bot', buildResultCard(data));
    addToHistory(data);
    openModal(data);

  } catch (err) {
    removeTyping();

    // User-friendly error message
    let message = err.message || 'Something went wrong. Please try again.';
    if (err.name === 'AbortError') {
      message = 'Request timed out after 30 seconds. Please try again.';
    }

    const errWrap = document.createElement('div');
    errWrap.appendChild(buildErrorEl(message));
    appendMsg('bot', errWrap);

  } finally {
    unlockUI();
  }
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  promptInput?.focus();
});
// Also focus immediately in case DOMContentLoaded already fired
if (document.readyState !== 'loading') {
  promptInput?.focus();
}
