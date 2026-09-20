// Omnibar search suggestion popup dropdown and keyboard navigation handler
// Firefox-style Omnibar Popup Overlay (Downloads & History)

let currentPopupType = null;
let allHistoryItems = [];

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFaviconForUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=32`;
    }
  } catch (e) {}
  return '';
}

function triggerAction(action, data) {
  if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
    window.naptureAPI.omnibarPopupAction(action, data);
  }
}
window.triggerAction = triggerAction;

document.addEventListener('click', (e) => {
  const itemBtn = e.target.closest('[data-action]');
  if (!itemBtn) return;
  const action = itemBtn.getAttribute('data-action');
  let data = null;
  const rawData = itemBtn.getAttribute('data-payload');
  if (rawData) {
    try {
      data = JSON.parse(decodeURIComponent(rawData));
    } catch (err) {
      try {
        data = JSON.parse(rawData);
      } catch (err2) {
        console.error('Failed to parse item payload', err2);
      }
    }
  }
  if (action) {
    triggerAction(action, data);
  }
});

window.updateContent = function(html, bg, border, shadow, itemColor, itemHoverBg, itemHoverColor, isLight) {
  const container = document.getElementById('popup-container');
  if (!container) return;
  document.body.className = isLight ? 'light-theme' : 'dark-theme';
  if (bg) container.style.background = bg;
  if (border) container.style.borderColor = border;
  if (shadow) container.style.boxShadow = shadow;
  container.innerHTML = html;
  reportHeight();
};

function reportHeight() {
  requestAnimationFrame(() => {
    const container = document.getElementById('popup-container');
    if (!container) return;
    const height = Math.min(Math.max(container.scrollHeight || container.offsetHeight, 60), 460);
    if (window.naptureAPI && window.naptureAPI.setOmnibarPopupHeight) {
      window.naptureAPI.setOmnibarPopupHeight(height);
    }
  });
}

// Render Downloads View
async function renderDownloadsView() {
  const container = document.getElementById('popup-container');
  if (!container) return;

  container.innerHTML = `
    <div id="omnibar-downloads-list" style="display: flex; flex-direction: column; gap: 2px;">
      <button class="menu-item disabled"><span class="item-title">Loading downloads...</span></button>
    </div>
    <div class="menu-divider"></div>
    <button id="omnibar-downloads-show-all" class="menu-item" title="Show all downloads">
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span class="item-title">Show all downloads</span>
      <span class="menu-meta">Ctrl+J</span>
    </button>
  `;

  const showAllBtn = document.getElementById('omnibar-downloads-show-all');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
        window.naptureAPI.omnibarPopupAction('open-url', { url: 'napture://downloads', newTab: true });
      }
    });
  }

  await refreshDownloadsList();
}

async function refreshDownloadsList() {
  if (!window.naptureAPI || !window.naptureAPI.getRecentDownloads) return;
  const items = await window.naptureAPI.getRecentDownloads();
  const listEl = document.getElementById('omnibar-downloads-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || items.length === 0) {
    listEl.innerHTML = '<button class="menu-item disabled"><span class="item-title">No recent downloads</span></button>';
    reportHeight();
    return;
  }

  const fragment = document.createDocumentFragment();
  items.slice(0, 5).forEach(item => {
    const el = document.createElement('button');
    el.className = 'menu-item';

    const safeName = escapeHtml(item.name || 'Download');
    let metaText = 'Done';
    if (!item.completed && !item.cancelled) {
      metaText = item.timeStr || (item.progress !== undefined ? `${item.progress}%` : 'Downloading');
    } else if (item.cancelled) {
      metaText = 'Cancelled';
    } else if (item.sizeStr) {
      metaText = item.sizeStr;
    }

    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span class="item-title">${safeName}</span>
      <span class="menu-meta">${escapeHtml(metaText)}</span>
    `;

    el.addEventListener('click', () => {
      if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
        window.naptureAPI.omnibarPopupAction('open-download', { id: item.id || '', path: item.path || '', name: item.name || '' });
      }
    });

    fragment.appendChild(el);
  });

  listEl.appendChild(fragment);
  reportHeight();
}

// Render History View
async function renderHistoryView() {
  const container = document.getElementById('popup-container');
  if (!container) return;

  container.innerHTML = `
    <div id="omnibar-history-list" style="display: flex; flex-direction: column; gap: 2px;">
      <button class="menu-item disabled"><span class="item-title">Loading history...</span></button>
    </div>
    <div class="menu-divider"></div>
    <button id="omnibar-history-show-all" class="menu-item" title="Show all history">
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span class="item-title">Show all history</span>
      <span class="menu-meta">Ctrl+H</span>
    </button>
    <button id="omnibar-history-clear" class="menu-item" title="Clear recent history">
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span class="item-title">Clear recent history</span>
    </button>
  `;

  const showAllBtn = document.getElementById('omnibar-history-show-all');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
        window.naptureAPI.omnibarPopupAction('open-url', { url: 'napture://history', newTab: true });
      }
    });
  }

  const clearHistoryBtn = document.getElementById('omnibar-history-clear');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
        window.naptureAPI.omnibarPopupAction('clear-history');
      }
    });
  }

  if (window.naptureAPI && window.naptureAPI.getHistory) {
    allHistoryItems = await window.naptureAPI.getHistory();
  } else {
    allHistoryItems = [];
  }
  renderHistoryItems(allHistoryItems);
}

function renderHistoryItems(items) {
  const listEl = document.getElementById('omnibar-history-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const recents = (items || []).slice(0, 5);
  if (recents.length === 0) {
    listEl.innerHTML = '<button class="menu-item disabled"><span class="item-title">No recent history</span></button>';
    reportHeight();
    return;
  }

  const fragment = document.createDocumentFragment();
  recents.forEach(item => {
    const el = document.createElement('button');
    el.className = 'menu-item';

    const safeTitle = escapeHtml(item.title || item.url || 'History Item');
    let timeStr = '';
    if (item.timestamp) {
      try {
        timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }

    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span class="item-title">${safeTitle}</span>
      ${timeStr ? `<span class="menu-meta">${escapeHtml(timeStr)}</span>` : ''}
    `;

    el.addEventListener('click', () => {
      if (window.naptureAPI && window.naptureAPI.omnibarPopupAction) {
        window.naptureAPI.omnibarPopupAction('open-url', { url: item.url, newTab: false });
      }
    });

    fragment.appendChild(el);
  });

  listEl.appendChild(fragment);
  reportHeight();
}

// Window Controller Interface
window.showPopup = function(type, isLight) {
  currentPopupType = type;
  document.body.className = isLight ? 'light-theme' : 'dark-theme';

  if (type === 'downloads') {
    renderDownloadsView();
  } else if (type === 'history') {
    renderHistoryView();
  }
};

window.hidePopup = function() {
  currentPopupType = null;
  const container = document.getElementById('popup-container');
  if (container) {
    container.innerHTML = '';
  }
};

// Global escape key listener
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (window.naptureAPI && window.naptureAPI.hideOmnibarPopup) {
      window.naptureAPI.hideOmnibarPopup();
    }
  }
});

// Update downloads dynamically if open
if (window.naptureAPI && window.naptureAPI.onDownloadUpdated) {
  window.naptureAPI.onDownloadUpdated(() => {
    if (currentPopupType === 'downloads') {
      refreshDownloadsList();
    }
  });
}
