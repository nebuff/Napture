// Omnibar search suggestion popup dropdown and keyboard navigation handler
// Firefox-style Omnibar Popup Overlay (Downloads & History)
//
// Markup is built from the design system's .nb-menu components defined in
// napture/styles/design-system.css. Only content and theme are supplied here.

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

/**
 * The design system owns the menu skin. This only swaps the content and tells
 * the document which theme to resolve its tokens against.
 */
window.updateContent = function(html, isLight) {
  const container = document.getElementById('popup-container');
  if (!container) return;
  const theme = isLight ? 'light-theme' : 'dark-theme';
  document.body.className = theme;
  document.documentElement.setAttribute('data-nb-theme', isLight ? 'light' : 'dark');
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

const DOWNLOAD_ICON = `
  <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
`;

const HISTORY_ICON = `
  <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
`;

const TRASH_ICON = `
  <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
`;

function menuItem({ id, action, payload, title, icon, label, meta }) {
  const attrs = [
    'class="nb-menu__item"',
    'role="menuitem"',
    id ? `id="${id}"` : '',
    title ? `title="${escapeHtml(title)}"` : '',
    action ? `data-action="${action}"` : '',
    payload ? `data-payload="${payload}"` : ''
  ].filter(Boolean).join(' ');

  return `
    <button ${attrs}>
      <span class="nb-menu__icon">${icon}</span>
      <span class="nb-menu__label">${label}</span>
      ${meta ? `<span class="nb-menu__meta">${meta}</span>` : ''}
    </button>
  `;
}

function emptyItem(label) {
  return `<button class="nb-menu__item is-disabled" role="menuitem" aria-disabled="true"><span class="nb-menu__label">${label}</span></button>`;
}

// Render Downloads View
async function renderDownloadsView() {
  const container = document.getElementById('popup-container');
  if (!container) return;

  container.innerHTML = `
    <div id="omnibar-downloads-list" class="nb-list">
      ${emptyItem('Loading downloads...')}
    </div>
    <div class="nb-menu__divider" role="separator"></div>
    ${menuItem({
      id: 'omnibar-downloads-show-all',
      title: 'Show all downloads',
      icon: DOWNLOAD_ICON,
      label: 'Show all downloads',
      meta: 'Ctrl+J'
    })}
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
    listEl.innerHTML = emptyItem('No recent downloads');
    reportHeight();
    return;
  }

  const fragment = document.createDocumentFragment();
  items.slice(0, 5).forEach(item => {
    const el = document.createElement('button');
    el.className = 'nb-menu__item';
    el.setAttribute('role', 'menuitem');

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
      <span class="nb-menu__icon">${DOWNLOAD_ICON}</span>
      <span class="nb-menu__label">${safeName}</span>
      <span class="nb-menu__meta">${escapeHtml(metaText)}</span>
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
    <div id="omnibar-history-list" class="nb-list">
      ${emptyItem('Loading history...')}
    </div>
    <div class="nb-menu__divider" role="separator"></div>
    ${menuItem({
      id: 'omnibar-history-show-all',
      title: 'Show all history',
      icon: HISTORY_ICON,
      label: 'Show all history',
      meta: 'Ctrl+H'
    })}
    ${menuItem({
      id: 'omnibar-history-clear',
      title: 'Clear recent history',
      icon: TRASH_ICON,
      label: 'Clear recent history'
    })}
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
    listEl.innerHTML = emptyItem('No recent history');
    reportHeight();
    return;
  }

  const fragment = document.createDocumentFragment();
  recents.forEach(item => {
    const el = document.createElement('button');
    el.className = 'nb-menu__item';
    el.setAttribute('role', 'menuitem');

    const safeTitle = escapeHtml(item.title || item.url || 'History Item');
    const faviconUrl = getFaviconForUrl(item.url);
    const icon = faviconUrl
      ? `<img src="${faviconUrl}" width="15" height="15" alt="" onerror="this.style.display='none'" />`
      : HISTORY_ICON;

    let timeStr = '';
    if (item.timestamp) {
      try {
        timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }

    el.innerHTML = `
      <span class="nb-menu__icon">${icon}</span>
      <span class="nb-menu__label">${safeTitle}</span>
      ${timeStr ? `<span class="nb-menu__meta">${escapeHtml(timeStr)}</span>` : ''}
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
  const theme = isLight ? 'light-theme' : 'dark-theme';
  document.body.className = theme;
  document.documentElement.setAttribute('data-nb-theme', isLight ? 'light' : 'dark');

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
