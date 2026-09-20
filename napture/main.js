// Napture Browser - Main Process & Window Management Engine
// Controls multi-window lifecycle, WebContentsView tabs, IPC message channels, and native menus.

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const { app, BrowserWindow, WebContentsView, webContents, ipcMain, session, shell, Menu, clipboard, dialog, screen, nativeTheme, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { unwrapRedirectUrl, isAuthOrSensitiveUrl, isBlurBackgroundEnabled } = require('./shared-utils');
const { initTelemetry } = require('./src/telemetry/telemetryClient');

// Isolate user data and single-instance locks in development to prevent clobbering or killing regular running Napture instances
if (app && !app.isPackaged) {
  try {
    app.setName('napture-dev');
    const devUserData = path.join(app.getPath('appData'), 'napture-dev');
    app.setPath('userData', devUserData);
  } catch (e) {}
}

// Initialize telemetry (DAU and unhandled error/crash interceptors)
try {
  initTelemetry();
} catch (e) {
  console.warn('[Telemetry] Failed to initialize telemetry:', e);
}

function isWindows11() {
  if (process.platform !== 'win32') return false;
  const release = os.release();
  const parts = release.split('.').map(n => parseInt(n, 10));
  const major = parts[0] || 0;
  const buildNumber = parts[2] || 0;
  return major > 10 || (major === 10 && buildNumber >= 22000);
}

let db = null;
const { initDB, searchHistory, addHistory, getSetting, setSetting, getAllSettings, saveAllSettings, clearAllHistory, deleteHistoryItem, deleteHistoryItems, resetAllSettings, resetAllData, clearAllBookmarks, clearAllSessions, optimizeDatabase, setHistoryChangeListener } = require('./db/history');

let downloadHistory = [];
const activeDownloadItems = new Map();
const downloadHistoryPath = () => path.join(app.getPath('userData'), 'downloads.json');

const browserWindows = new Set();
const windowStates = new WeakMap();

let contextMenuActions = new Map();
let currentContextMenuTarget = null;

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function hideSuggestionsView(win) {
  if (!win) return;
  const state = getWindowState(win);
  if (state && state.suggestionsView) {
    state.suggestionsView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    if (win.contentView && win.contentView.children.includes(state.suggestionsView)) {
      win.contentView.removeChildView(state.suggestionsView);
    }
  }
}

function hideContextMenu(win) {
  if (!win) win = getMainWindow();
  if (!win) return;
  const state = getWindowState(win);
  if (state && state.contextMenuView) {
    try {
      state.contextMenuView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      if (typeof state.contextMenuView.setIgnoreMouseEvents === 'function') {
        state.contextMenuView.setIgnoreMouseEvents(true, { forward: true });
      }
      if (state.contextMenuView.webContents && !state.contextMenuView.webContents.isDestroyed()) {
        state.contextMenuView.webContents.executeJavaScript("if (window.hideContent) window.hideContent();").catch(() => {});
      }
    } catch (e) {
      console.error('[ContextMenu] hideContextMenu error:', e);
    }
  }
  currentContextMenuTarget = null;
}

function hideOmnibarPopup(win) {
  if (!win) win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  const state = getWindowState(win);
  if (state && state.omnibarPopupView) {
    state.isOmnibarPopupVisible = false;
    state.activeOmnibarPopupType = null;
    state.pendingOmnibarPopup = null;
    try {
      state.omnibarPopupView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      if (typeof state.omnibarPopupView.setIgnoreMouseEvents === 'function') {
        state.omnibarPopupView.setIgnoreMouseEvents(true, { forward: true });
      }
      if (state.omnibarPopupView.webContents && !state.omnibarPopupView.webContents.isDestroyed()) {
        state.omnibarPopupView.webContents.executeJavaScript("if (window.hidePopup) window.hidePopup();").catch(() => {});
      }
    } catch (e) {
      console.error('[OmnibarPopup] hideOmnibarPopup error:', e);
    }
  }
}

function initOmnibarPopupOverlay(win, state) {
  if (state.omnibarPopupView && state.omnibarPopupView.webContents && !state.omnibarPopupView.webContents.isDestroyed()) return;

  state.omnibarPopupView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  state.omnibarPopupView.setBackgroundColor('#00000000');
  if (typeof state.omnibarPopupView.setIgnoreMouseEvents === 'function') {
    state.omnibarPopupView.setIgnoreMouseEvents(true, { forward: true });
  }
  state.isOmnibarPopupVisible = false;
  state.activeOmnibarPopupType = null;
  state.isOmnibarPopupViewLoaded = false;
  state.pendingOmnibarPopup = null;
  state.lastOmnibarPopupRect = null;

  state.omnibarPopupView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  if (win && win.contentView && win.contentView.children && !win.contentView.children.includes(state.omnibarPopupView)) {
    win.contentView.addChildView(state.omnibarPopupView);
  }
  state.omnibarPopupView.webContents.loadFile(path.join(__dirname, 'renderer', 'omnibar-popup.html'))
    .then(() => {
      state.isOmnibarPopupViewLoaded = true;
      if (state.pendingOmnibarPopup) {
        const { type, rect, isLight } = state.pendingOmnibarPopup;
        state.pendingOmnibarPopup = null;
        showOmnibarPopup(win, type, rect, isLight);
      }
    })
    .catch((err) => {
      console.error('[OmnibarPopup] Failed to load omnibar popup:', err);
    });
}

function showOmnibarPopup(win, type, rect, isLight) {
  if (!win || win.isDestroyed()) return;
  const state = getWindowState(win);
  if (!state) return;

  if (!state.omnibarPopupView || !state.omnibarPopupView.webContents || state.omnibarPopupView.webContents.isDestroyed()) {
    state.omnibarPopupView = null;
    initOmnibarPopupOverlay(win, state);
  }

  state.lastOmnibarPopupRect = rect;
  const omnibarPopupView = state.omnibarPopupView;
  if (!omnibarPopupView || !omnibarPopupView.webContents || omnibarPopupView.webContents.isDestroyed()) return;

  if (!state.isOmnibarPopupViewLoaded) {
    state.pendingOmnibarPopup = { type, rect, isLight };
    return;
  }

  const winContentBounds = win.getContentBounds ? win.getContentBounds() : win.getBounds();

  let htmlItems = '';
  let calculatedHeight = 10;

  if (type === 'downloads') {
    const recent = (downloadHistory || []).slice(0, 5);
    if (recent.length === 0) {
      htmlItems += '<button class="menu-item disabled"><span class="item-title">No recent downloads</span></button>';
      calculatedHeight += 30;
    } else {
      recent.forEach((item) => {
        const safeName = escapeHtml(item.name || 'Download');
        let metaText = 'Done';
        if (!item.completed && !item.cancelled) {
          metaText = item.timeStr || (item.progress !== undefined ? `${item.progress}%` : 'Downloading');
        } else if (item.cancelled) {
          metaText = 'Cancelled';
        } else if (item.sizeStr) {
          metaText = item.sizeStr;
        }
        const payloadStr = encodeURIComponent(JSON.stringify({ id: item.id || '', path: item.path || '', name: item.name || '' }));
        const iconMarkup = item.iconUrl
          ? `<img src="${item.iconUrl}" width="16" height="16" style="flex-shrink: 0; object-fit: contain; border-radius: 3px;" />`
          : `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>`;
        htmlItems += `
          <button class="menu-item" data-action="open-download" data-payload="${payloadStr}">
            ${iconMarkup}
            <span class="item-title">${safeName}</span>
            <span class="menu-meta">${escapeHtml(metaText)}</span>
          </button>
        `;
        calculatedHeight += 30;
      });
    }

    htmlItems += '<div class="menu-divider"></div>';
    calculatedHeight += 9;

    const showAllDownloadsPayload = encodeURIComponent(JSON.stringify({ url: 'napture://downloads', newTab: true }));
    htmlItems += `
      <button class="menu-item" data-action="open-url" data-payload="${showAllDownloadsPayload}">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span class="item-title">Show all downloads</span>
        <span class="menu-meta">Ctrl+J</span>
      </button>
    `;
    calculatedHeight += 30;
  } else if (type === 'history') {
    const historyList = (typeof searchHistory === 'function' ? searchHistory('') : []) || [];
    const recent = historyList.slice(0, 5);
    if (recent.length === 0) {
      htmlItems += '<button class="menu-item disabled"><span class="item-title">No recent history</span></button>';
      calculatedHeight += 30;
    } else {
      recent.forEach((item) => {
        const safeTitle = escapeHtml(item.title || item.url || 'History Item');
        let domain = '';
        try {
          if (item.url) domain = new URL(item.url).hostname;
        } catch(e) {}
        const faviconUrl = item.favicon_url || (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '');
        const iconMarkup = faviconUrl
          ? `<img src="${faviconUrl}" width="15" height="15" style="flex-shrink: 0; object-fit: contain; border-radius: 2px;" onerror="this.style.display='none'" />`
          : `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>`;
        let timeStr = '';
        const timestamp = item.last_visited_timestamp || item.timestamp;
        if (timestamp) {
          try {
            timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch(e) {}
        }
        const itemPayloadStr = encodeURIComponent(JSON.stringify({ url: item.url, newTab: false }));
        htmlItems += `
          <button class="menu-item" data-action="open-url" data-payload="${itemPayloadStr}">
            ${iconMarkup}
            <span class="item-title">${safeTitle}</span>
            ${timeStr ? `<span class="menu-meta">${escapeHtml(timeStr)}</span>` : ''}
          </button>
        `;
        calculatedHeight += 30;
      });
    }

    htmlItems += '<div class="menu-divider"></div>';
    calculatedHeight += 9;

    const showAllHistoryPayload = encodeURIComponent(JSON.stringify({ url: 'napture://history', newTab: true }));
    htmlItems += `
      <button class="menu-item" data-action="open-url" data-payload="${showAllHistoryPayload}">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span class="item-title">Show all history</span>
        <span class="menu-meta">Ctrl+H</span>
      </button>
      <button class="menu-item" data-action="clear-history">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span class="item-title">Clear recent history</span>
      </button>
    `;
    calculatedHeight += 60;
  }

  const menuWidth = 300;
  const menuHeight = calculatedHeight;

  let x = winContentBounds.width - menuWidth - 10;
  let y = 54;

  if (rect) {
    if (typeof rect.left === 'number' && rect.left < 150) {
      // Sidebar button: position popup as a flyout to the right of the sidebar button
      x = Math.round(rect.right + 6);
      y = Math.round(rect.top);
    } else if (typeof rect.right === 'number') {
      // Toolbar button: right-align popup with button
      x = Math.round(rect.right - menuWidth);
      y = Math.round(rect.bottom + 4);
    }
  }

  if (y + menuHeight > winContentBounds.height - 8) {
    if (rect && typeof rect.top === 'number' && rect.left >= 150) {
      y = Math.max(8, Math.round(rect.top - menuHeight - 4));
    } else {
      y = Math.max(8, winContentBounds.height - menuHeight - 8);
    }
  }
  if (x + menuWidth > winContentBounds.width - 8) {
    x = Math.max(8, winContentBounds.width - menuWidth - 8);
  }
  if (x < 8) x = 8;

  if (win.contentView && win.contentView.children) {
    if (!win.contentView.children.includes(omnibarPopupView)) {
      win.contentView.addChildView(omnibarPopupView);
    } else {
      const idx = win.contentView.children.indexOf(omnibarPopupView);
      if (idx !== win.contentView.children.length - 1) {
        win.contentView.addChildView(omnibarPopupView);
      }
    }
  }

  if (typeof omnibarPopupView.setIgnoreMouseEvents === 'function') {
    omnibarPopupView.setIgnoreMouseEvents(false);
  }

  omnibarPopupView.setBounds({ x, y, width: menuWidth, height: menuHeight });
  state.isOmnibarPopupVisible = true;
  state.activeOmnibarPopupType = type;

  const cardBg = isLight
    ? 'rgba(255, 255, 255, 0.94)'
    : 'rgba(23, 23, 32, 0.88)';
  const cardBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
  const cardShadow = isLight
    ? 'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
    : 'inset 0 1px 0 rgba(255, 255, 255, 0.1)';
  const itemColor = isLight ? '#2e3440' : '#c0caf5';
  const itemHoverBg = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.09)';
  const itemHoverColor = isLight ? '#0f141c' : '#ffffff';

  const argsArray = [htmlItems, cardBg, cardBorder, cardShadow, itemColor, itemHoverBg, itemHoverColor, isLight];

  const updateScript = `(function() {
    const args = ${JSON.stringify(argsArray)};
    if (window.updateContent) {
      window.updateContent.apply(null, args);
    } else {
      window.pendingUpdate = args;
      let attempts = 0;
      const interval = setInterval(function() {
        attempts++;
        if (window.updateContent) {
          clearInterval(interval);
          window.updateContent.apply(null, window.pendingUpdate || args);
        } else if (attempts >= 20) {
          clearInterval(interval);
        }
      }, 10);
    }
  })();`;

  omnibarPopupView.webContents.executeJavaScript(updateScript).catch((err) => {
    console.error('[OmnibarPopup] executeJavaScript failed:', err);
    state.omnibarPopupView = null;
    hideOmnibarPopup(win);
  });
}

function initContextMenuOverlay(win, state) {
  if (state.contextMenuView && state.contextMenuView.webContents && !state.contextMenuView.webContents.isDestroyed()) return;
  state.contextMenuView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  state.contextMenuView.setBackgroundColor('#00000000');
  if (typeof state.contextMenuView.setIgnoreMouseEvents === 'function') {
    state.contextMenuView.setIgnoreMouseEvents(true, { forward: true });
  }
  state.isContextMenuViewLoaded = false;

  const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:;">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent !important;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
    }
    .napture-dropdown-menu {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 14px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-sizing: border-box;
      background: rgba(23, 23, 32, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      transform-origin: top left;
      animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .napture-dropdown-menu.animate {
      animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes menuFadeIn {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    .menu-item {
      width: 100%;
      height: 28px;
      min-height: 28px;
      background: transparent;
      border: none;
      border-radius: 7px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      gap: 10px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease, color 0.12s ease;
      box-sizing: border-box;
    }
    .menu-item > span:first-child {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .menu-item.disabled {
      opacity: 0.4;
      cursor: default;
      pointer-events: none;
    }
    .menu-divider {
      height: 1px;
      margin: 3px 6px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="napture-dropdown-menu" id="menuContainer"></div>
  <script>
    function triggerAction(index) {
      if (window.naptureAPI && window.naptureAPI.contextMenuAction) {
        window.naptureAPI.contextMenuAction(index);
      }
    }
    window.hideContent = function() {
      const container = document.getElementById('menuContainer');
      if (container) {
        container.style.display = 'none';
        container.classList.remove('animate');
      }
    };
    window.pendingUpdate = null;
    window.updateContent = function(html, bg, border, shadow, itemColor, itemHoverBg, itemHoverColor, isLight) {
       window.pendingUpdate = null;
       const container = document.getElementById('menuContainer');
       if (!container) return;
       container.style.display = 'none';
       container.classList.remove('animate');

       container.innerHTML = html;
       container.style.background = bg;
       container.style.border = '1px solid ' + border;
       container.style.boxShadow = shadow;
       
       let styleTag = document.getElementById('dynamic-styles');
       if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'dynamic-styles';
          document.head.appendChild(styleTag);
       }
       styleTag.innerHTML = '.menu-item { color: ' + itemColor + ' !important; } ' +
                            '.menu-item:hover:not(.disabled) { background: ' + itemHoverBg + ' !important; color: ' + itemHoverColor + ' !important; } ' +
                            '.menu-divider { background: ' + border + ' !important; }';

       container.style.display = 'flex';
       void container.offsetWidth;
       container.classList.add('animate');
    };
    if (window.pendingUpdate) {
      window.updateContent.apply(null, window.pendingUpdate);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') triggerAction(-1);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.menu-item')) {
        triggerAction(-1);
      }
    });
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!e.target.closest('.menu-item')) {
        triggerAction(-1);
      }
    });
  </script>
</body>
</html>`;

  state.contextMenuView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  if (win && win.contentView && win.contentView.children && !win.contentView.children.includes(state.contextMenuView)) {
    win.contentView.addChildView(state.contextMenuView);
  }
  state.contextMenuView.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(popupHtml));
  state.isContextMenuViewLoaded = true;
}

function showCustomContextMenu(template, x, y, webContentsTarget) {
  try {
    const win = getWindowFromWebContents(webContentsTarget) || getMainWindow();
    if (!win || win.isDestroyed() || !Array.isArray(template) || template.length === 0) return;
    const state = getWindowState(win);
    if (!state) return;

    if (!state.contextMenuView || !state.contextMenuView.webContents || state.contextMenuView.webContents.isDestroyed()) {
      state.contextMenuView = null;
      initContextMenuOverlay(win, state);
    }
    const contextMenuView = state.contextMenuView;
    if (!contextMenuView || !contextMenuView.webContents || contextMenuView.webContents.isDestroyed()) return;

    currentContextMenuTarget = webContentsTarget;
    contextMenuActions.clear();

    let calculatedHeight = 10;
    let htmlItems = '';
    template.forEach((item, index) => {
      if (!item) return;
      if (item.type === 'separator') {
        calculatedHeight += 9;
        htmlItems += '<div class="menu-divider"></div>';
      } else {
        calculatedHeight += 30;
        contextMenuActions.set(index, item);
        let accelHtml = '';
        if (item.accelerator) {
          accelHtml = `<span style="margin-left:auto; opacity:0.45; font-size:11px; font-weight:400; flex-shrink: 0; padding-left: 8px;">${escapeHtml(item.accelerator)}</span>`;
        }
        let label = item.label;
        if (!label && item.role) {
          if (item.role === 'selectAll') label = 'Select All';
          else label = item.role.charAt(0).toUpperCase() + item.role.slice(1);
        }
        if (!label) label = 'Item';
        let disabledClass = item.enabled === false ? 'disabled' : '';

        htmlItems += `
          <button class="menu-item ${disabledClass}" onclick="if(!this.classList.contains('disabled')) { triggerAction(${index}); }">
            <span>${escapeHtml(label)}</span>
            ${accelHtml}
          </button>
        `;
      }
    });

    const isLight = !nativeTheme.shouldUseDarkColors;
    const cardBg = isLight
      ? 'rgba(255, 255, 255, 0.94)'
      : 'rgba(23, 23, 32, 0.88)';
    const cardBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
    const cardShadow = isLight
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.1)';
    const itemColor = isLight ? '#2e3440' : '#c0caf5';
    const itemHoverBg = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.09)';
    const itemHoverColor = isLight ? '#0f141c' : '#ffffff';

    const menuWidth = 215;
    const menuHeight = calculatedHeight + 10;

    const winContentBounds = win.getContentBounds ? win.getContentBounds() : win.getBounds();
    let finalX = typeof x === 'number' ? Math.round(x) : 100;
    let finalY = typeof y === 'number' ? Math.round(y) : 100;

    if (finalX + menuWidth > winContentBounds.width) {
      finalX = Math.max(8, winContentBounds.width - menuWidth - 8);
    }
    if (finalY + menuHeight > winContentBounds.height) {
      finalY = Math.max(8, winContentBounds.height - menuHeight - 8);
    }

    if (win.contentView && win.contentView.children) {
      if (!win.contentView.children.includes(contextMenuView)) {
        win.contentView.addChildView(contextMenuView);
      } else {
        const idx = win.contentView.children.indexOf(contextMenuView);
        if (idx !== win.contentView.children.length - 1) {
          win.contentView.addChildView(contextMenuView);
        }
      }
    }
    if (typeof contextMenuView.setIgnoreMouseEvents === 'function') {
      contextMenuView.setIgnoreMouseEvents(false);
    }
    contextMenuView.setBounds({ x: finalX, y: finalY, width: menuWidth, height: menuHeight });
    if (typeof contextMenuView.webContents.invalidate === 'function') {
      try { contextMenuView.webContents.invalidate(); } catch(e) {}
    }

    const argsArray = [htmlItems, cardBg, cardBorder, cardShadow, itemColor, itemHoverBg, itemHoverColor, isLight];

    const updateScript = `(function() {
      const args = ${JSON.stringify(argsArray)};
      if (window.updateContent) {
        window.updateContent.apply(null, args);
      } else {
        window.pendingUpdate = args;
        let attempts = 0;
        const interval = setInterval(function() {
          attempts++;
          if (window.updateContent) {
            clearInterval(interval);
            window.updateContent.apply(null, window.pendingUpdate || args);
          } else if (attempts >= 20) {
            clearInterval(interval);
            if (window.naptureAPI && window.naptureAPI.contextMenuAction) {
              window.naptureAPI.contextMenuAction(-1);
            }
          }
        }, 10);
      }
    })();`;

    contextMenuView.webContents.executeJavaScript(updateScript).catch((err) => {
      console.error('[ContextMenu] executeJavaScript failed:', err);
      state.contextMenuView = null;
      hideContextMenu(win);
    });
  } catch (err) {
    console.error('[ContextMenu] showCustomContextMenu error:', err);
    hideContextMenu(win);
  }
}

ipcMain.on('show-tab-context-menu', (event, items, coords) => {
  try {
    const win = getWindowFromWebContents(event.sender) || getMainWindow();
    if (!win || win.isDestroyed() || !Array.isArray(items)) return;

    const template = items.map(item => {
      if (!item) return null;
      if (item.type === 'separator') return { type: 'separator' };
      return {
        label: item.label,
        enabled: item.enabled !== false,
        click: () => {
          try {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
              win.webContents.send('tab-context-menu-action', item.action, item.payload);
            }
          } catch (err) {
            console.error('[ContextMenu] tab-context-menu-action click error:', err);
          }
        }
      };
    }).filter(Boolean);

    showCustomContextMenu(template, coords ? coords.x : null, coords ? coords.y : null, event.sender);
  } catch (err) {
    console.error('[ContextMenu] show-tab-context-menu error:', err);
  }
});

ipcMain.on('show-toolbar-folder-menu', (event, data) => {
  try {
    const win = getWindowFromWebContents(event.sender) || getMainWindow();
    if (!win || win.isDestroyed() || !data || !Array.isArray(data.items)) return;

    const template = data.items.map((child) => {
      if (!child) return null;
      if (child.type === 'separator') return { type: 'separator' };
      return {
        label: child.name || child.id || 'Item',
        click: () => {
          try {
            if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
              win.webContents.send('toolbar-folder-item-clicked', child);
            }
          } catch (err) {
            console.error('[ContextMenu] toolbar-folder-item-clicked error:', err);
          }
        }
      };
    }).filter(Boolean);

    showCustomContextMenu(template, data.x, data.y, event.sender);
  } catch (err) {
    console.error('[ContextMenu] show-toolbar-folder-menu error:', err);
  }
});

ipcMain.on('context-menu-action', (event, index) => {
  try {
    const targetWin = getWindowFromWebContents(event.sender) || getMainWindow();
    if (targetWin && !targetWin.isDestroyed()) {
      hideContextMenu(targetWin);
    }
    if (index === -1 || typeof index !== 'number') return;
    const item = contextMenuActions.get(index);
    if (item && item.click) {
      try {
        item.click();
      } catch (err) {
        console.error('[ContextMenu] Action click error:', err);
      }
    }
    if (item && item.role) {
      if (currentContextMenuTarget && !currentContextMenuTarget.isDestroyed() && !(typeof currentContextMenuTarget.isCrashed === 'function' && currentContextMenuTarget.isCrashed())) {
        try {
          if (typeof currentContextMenuTarget.focus === 'function') {
            currentContextMenuTarget.focus();
          }
          switch(item.role.toLowerCase()) {
            case 'cut': if (typeof currentContextMenuTarget.cut === 'function') currentContextMenuTarget.cut(); break;
            case 'copy': if (typeof currentContextMenuTarget.copy === 'function') currentContextMenuTarget.copy(); break;
            case 'paste': if (typeof currentContextMenuTarget.paste === 'function') currentContextMenuTarget.paste(); break;
            case 'selectall': if (typeof currentContextMenuTarget.selectAll === 'function') currentContextMenuTarget.selectAll(); break;
            case 'undo': if (typeof currentContextMenuTarget.undo === 'function') currentContextMenuTarget.undo(); break;
            case 'redo': if (typeof currentContextMenuTarget.redo === 'function') currentContextMenuTarget.redo(); break;
          }
        } catch (err) {
          console.error('[ContextMenu] Role action error:', err);
        }
      }
    }
  } catch (err) {
    console.error('[ContextMenu] context-menu-action error:', err);
  }
});

const handleContextMenu = (e, params, targetWebContents) => {
  try {
    if (!targetWebContents || targetWebContents.isDestroyed() || (typeof targetWebContents.isCrashed === 'function' && targetWebContents.isCrashed())) return;

    const template = [];

    if (params && params.selectionText && params.selectionText.trim().length > 0) {
      if (params.isEditable) {
        template.push(
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' }
        );
      } else {
        template.push(
          { role: 'copy' },
          { type: 'separator' }
        );
      }
      const selectedText = params.selectionText.trim();
      const shortText = selectedText.length > 25 ? selectedText.substring(0, 25) + '...' : selectedText;
      template.push({
        label: `Search Google for "${shortText}"`,
        click: () => {
          try {
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed() && mw.webContents && !mw.webContents.isDestroyed()) {
              const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
              mw.webContents.send('open-url-in-new-tab', { url: searchUrl });
            }
          } catch (err) {
            console.error('[ContextMenu] Search click error:', err);
          }
        }
      });
      template.push({ type: 'separator' });
    } else if (params && params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' }
      );
    }

    if (params && params.linkURL) {
      template.push(
        {
          label: 'Open link in new tab',
          click: () => {
            try {
              const mw = getMainWindow();
              if (mw && !mw.isDestroyed() && mw.webContents && !mw.webContents.isDestroyed()) {
                mw.webContents.send('open-url-in-new-tab', { url: params.linkURL });
              }
            } catch (err) {
              console.error('[ContextMenu] Open link click error:', err);
            }
          }
        },
        {
          label: 'Copy link address',
          click: () => {
            try {
              clipboard.writeText(params.linkURL);
            } catch (err) {
              console.error('[ContextMenu] Copy link click error:', err);
            }
          }
        },
        { type: 'separator' }
      );
    }

    if (params && params.mediaType === 'image') {
      template.push(
        {
          label: 'Open image in new tab',
          click: () => {
            try {
              const mw = getMainWindow();
              if (mw && !mw.isDestroyed() && mw.webContents && !mw.webContents.isDestroyed()) {
                mw.webContents.send('open-url-in-new-tab', { url: params.srcURL });
              }
            } catch (err) {
              console.error('[ContextMenu] Open image click error:', err);
            }
          }
        },
        {
          label: 'Save image as...',
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try {
                targetWebContents.downloadURL(params.srcURL);
              } catch (err) {
                console.error('[ContextMenu] Save image error:', err);
              }
            }
          }
        },
        {
          label: 'Copy image address',
          click: () => {
            try {
              clipboard.writeText(params.srcURL);
            } catch (err) {
              console.error('[ContextMenu] Copy image address error:', err);
            }
          }
        },
        { type: 'separator' }
      );
    }

    if (params && !params.linkURL && params.mediaType === 'none' && (!params.selectionText || params.selectionText.trim().length === 0)) {
      template.push(
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          enabled: (targetWebContents && !targetWebContents.isDestroyed() && targetWebContents.navigationHistory) ? targetWebContents.navigationHistory.canGoBack() : false,
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try { targetWebContents.goBack(); } catch (err) {}
            }
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          enabled: (targetWebContents && !targetWebContents.isDestroyed() && targetWebContents.navigationHistory) ? targetWebContents.navigationHistory.canGoForward() : false,
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try { targetWebContents.goForward(); } catch (err) {}
            }
          }
        },
        {
          label: 'Reload',
          accelerator: 'Ctrl+R',
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try { targetWebContents.reload(); } catch (err) {}
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save as...',
          accelerator: 'Ctrl+S',
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try {
                const currentUrl = targetWebContents.getURL();
                if (currentUrl) targetWebContents.downloadURL(currentUrl);
              } catch (err) {}
            }
          }
        },
        {
          label: 'Print...',
          accelerator: 'Ctrl+P',
          click: () => {
            if (targetWebContents && !targetWebContents.isDestroyed()) {
              try { targetWebContents.print(); } catch (err) {}
            }
          }
        },
        { type: 'separator' }
      );
    }

    template.push(
      {
        label: 'View page source',
        accelerator: 'Ctrl+U',
        click: () => {
          try {
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed() && targetWebContents && !targetWebContents.isDestroyed()) {
              const currentUrl = targetWebContents.getURL() || '';
              const sourceUrl = currentUrl.startsWith('http') || currentUrl.startsWith('file') ? `view-source:${currentUrl}` : currentUrl;
              if (sourceUrl) mw.webContents.send('open-url-in-new-tab', { url: sourceUrl });
            }
          } catch (err) {}
        }
      },
      {
        label: 'Inspect',
        accelerator: 'Ctrl+Shift+I',
        click: () => {
          if (targetWebContents && !targetWebContents.isDestroyed()) {
            try {
              if (typeof targetWebContents.inspectElement === 'function') {
                targetWebContents.inspectElement(params.x, params.y);
              }
              if (typeof targetWebContents.isDevToolsOpened === 'function' && !targetWebContents.isDevToolsOpened()) {
                if (typeof targetWebContents.openDevTools === 'function') {
                  targetWebContents.openDevTools();
                }
              }
            } catch (err) {
              console.error('[ContextMenu] Inspect failed:', err);
            }
          }
        }
      }
    );

    let posX = (params && typeof params.x === 'number') ? params.x : 100;
    let posY = (params && typeof params.y === 'number') ? params.y : 100;
    const win = getWindowFromWebContents(targetWebContents) || getMainWindow();
    if (win && !win.isDestroyed() && targetWebContents && !targetWebContents.isDestroyed()) {
      const state = getWindowState(win);
      if (state && state.activeTabId) {
        const activeView = tabViews.get(state.activeTabId);
        if (activeView && activeView.webContents && !activeView.webContents.isDestroyed() && activeView.webContents === targetWebContents) {
          try {
            const viewBounds = activeView.getBounds();
            if (viewBounds) {
              posX += viewBounds.x || 0;
              posY += viewBounds.y || 0;
            }
          } catch (err) {}
        }
      }
    }

    showCustomContextMenu(template, posX, posY, targetWebContents);
  } catch (err) {
    console.error('[ContextMenu] handleContextMenu error:', err);
  }
};

function getMainWindow() {
  return BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0] || null;
}

function getWindowByTabId(tabId) {
  for (const win of browserWindows) {
    const state = getWindowState(win);
    if (state && state.tabs.has(tabId)) {
      return win;
    }
  }
  return null;
}

function getWindowFromWebContents(webContents) {
  if (!webContents) return null;
  let win = BrowserWindow.fromWebContents(webContents);
  if (win && !win.isDestroyed()) return win;
  for (const w of browserWindows) {
    if (w.isDestroyed()) continue;
    if (w.webContents === webContents) return w;
    const state = getWindowState(w);
    if (state) {
      if (state.suggestionsView && !state.suggestionsView.webContents.isDestroyed() && state.suggestionsView.webContents === webContents) return w;
      if (state.contextMenuView && !state.contextMenuView.webContents.isDestroyed() && state.contextMenuView.webContents === webContents) return w;
      if (state.omnibarPopupView && !state.omnibarPopupView.webContents.isDestroyed() && state.omnibarPopupView.webContents === webContents) return w;
      if (state.tabs) {
        for (const tabId of state.tabs) {
          const view = tabViews.get(tabId);
          if (view && !view.webContents.isDestroyed() && view.webContents === webContents) return w;
        }
      }
    }
  }
  return getMainWindow();
}

function getWindowState(win) {
  if (!win) return null;
  return windowStates.get(win) || null;
}

function getActiveView(win) {
  const state = getWindowState(win);
  if (!state || !state.activeTabId) return null;
  const view = tabViews.get(state.activeTabId);
  if (!view || !view.webContents || view.webContents.isDestroyed()) return null;
  if (typeof view.webContents.isCrashed === 'function' && view.webContents.isCrashed()) return null;
  return view;
}

// Ensure we eat up the original pendingOpenUrl
let pendingOpenUrl = null;

app.on('open-url', (event, url) => {
  event.preventDefault();
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-url-in-new-tab', { url });
  } else {
    pendingOpenUrl = url;
  }
});

app.on('open-file', (event, filepath) => {
  event.preventDefault();
  const url = 'file://' + filepath;
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-url-in-new-tab', { url });
  } else {
    pendingOpenUrl = url;
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    isUpdating = false;
    let win = getMainWindow();
    if (!win || win.isDestroyed()) {
      win = createBrowserWindow();
      win.once('ready-to-show', () => {
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        }
      });
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    if (win && !win.isDestroyed()) {
      const targetUrl = commandLine.find(arg => arg !== '.' && !arg.startsWith('-') && (arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('napture://') || arg.startsWith('ne://') || arg.endsWith('.html') || arg.endsWith('.htm')));
      if (targetUrl) {
        let url = targetUrl;
        if ((url.endsWith('.html') || url.endsWith('.htm')) && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
          url = 'file://' + path.resolve(workingDirectory, url);
        }
        win.webContents.send('open-url-in-new-tab', { url: url });
      }
    }
  });
}

const { registerCustomProtocols, setupProtocolHandlers } = require('./protocol-handler');
const { buildSettingsPage } = require('./settings-ui');
const syncEngine = require('./db/sync-engine');

// Enforce hardware acceleration toggle before app ready
try {
  if (getSetting('hardwareAcceleration', true) === false) {
    app.disableHardwareAcceleration();
  }
} catch (e) {}

// Configure high-performance web compatibility and GPU rendering flags
// Fixes rendering of YouTube sidebars, Shadow DOM web components, and Discord canvas/WebGL profile decorations
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebGL,WebAssembly');
} else {
  app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,WebGL,WebAssembly,VaapiVideoDecoder');
}
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Apply configured language before app is ready
initDB();
const appLang = getSetting('language', 'en-US');
app.commandLine.appendSwitch('lang', appLang);
if (process.platform !== 'linux') {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
}

// Optimize base performance and minimize lightweight operation
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('disable-features', 'ProactiveTabDiscarding,Vulkan');
if (process.platform === 'linux') {
  // Detect whether we're on Wayland or X11 and set the correct platform.
  // Forcing x11 on a Wayland session causes blank/unpainted windows.
  const isWayland = !!process.env.WAYLAND_DISPLAY;
  if (isWayland) {
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
  } else {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
  }
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  // Only force software rendering if explicitly requested (e.g. headless CI)
  if (process.env.ELECTRON_DISABLE_HW_ACCEL) {
    try { app.disableHardwareAcceleration(); } catch (e) {}
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('use-gl', 'swiftshader');
    app.commandLine.appendSwitch('disable-vulkan');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}
// Suppress non-fatal Chromium internal LOG_ERROR outputs (e.g. XGetWindowAttributes failed for window)
app.commandLine.appendSwitch('log-level', '3');

// Optimize base performance
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-metrics-repo');
app.commandLine.appendSwitch('disable-telemetry');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-crash-reporter');

// Use a standard Chrome User-Agent instead of Firefox to prevent Cloudflare/WAF bot detection.
// Cloudflare blocks requests with a 406 Not Acceptable and fails captchas if the User-Agent claims to be Firefox but the underlying engine behaves like Chromium.
const getPlatformUA = () => {
  if (process.platform === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7';
  if (process.platform === 'linux') return 'X11; Linux x86_64';
  return 'Windows NT 10.0; Win64; x64';
};
const getActiveChromiumVersion = () => {
  try {
    const vPath = fs.existsSync(path.join(__dirname, 'versions.json'))
      ? path.join(__dirname, 'versions.json')
      : path.join(__dirname, '..', 'versions.json');
    if (fs.existsSync(vPath)) {
      const vData = JSON.parse(fs.readFileSync(vPath, 'utf8'));
      if (vData.chromiumVersion) return vData.chromiumVersion;
    }
  } catch (e) {}
  return process.versions.chrome || '134.0.6998.35';
};
const activeChromiumVersion = getActiveChromiumVersion();
const cleanUserAgent = `Mozilla/5.0 (${getPlatformUA()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${activeChromiumVersion} Safari/537.36`;
app.userAgentFallback = cleanUserAgent;

// Register protocol privileges before app is ready
registerCustomProtocols();

const allowedCertificateOrigins = new Set();

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  try {
    const origin = new URL(url).origin;
    const host = new URL(url).hostname;
    if (allowedCertificateOrigins.has(origin) || allowedCertificateOrigins.has(host) || allowedCertificateOrigins.has(url)) {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch (e) {}
  event.preventDefault();
  callback(false);
});

ipcMain.handle('allow-certificate-error', (event, targetUrl) => {
  if (!targetUrl) return false;
  try {
    const parsed = new URL(targetUrl);
    allowedCertificateOrigins.add(parsed.origin);
    allowedCertificateOrigins.add(parsed.hostname);
    allowedCertificateOrigins.add(targetUrl);
    return true;
  } catch (e) {
    allowedCertificateOrigins.add(targetUrl);
    return true;
  }
});

function injectRoundingElements(webContents) {
  // WebContentsView now natively clips corners via setBorderRadius(12)
}

const tabViews = new Map(); // tabId -> WebContentsView

function initSuggestionsView(win, state) {
  if (state.suggestionsView) return;

  state.suggestionsView = new WebContentsView({
    webPreferences: {
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  state.suggestionsView.setBackgroundColor('#00000000');
  state.isSuggestionsViewLoaded = false;

  const cardBg = 'rgba(23, 23, 32, 0.88)';
  const cardBorder = 'rgba(255, 255, 255, 0.12)';
  const cardShadow = '0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)';

  const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:;">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    html, body {
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: transparent !important;
      overflow: hidden;
      margin: 0;
      padding: 16px;
      width: 100vw;
      height: 100vh;
    }
    .suggestions-card {
      background: ${cardBg};
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      border: 1px solid ${cardBorder};
      border-radius: 14px;
      box-shadow: ${cardShadow};
      overflow: hidden;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .sug-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      height: 36px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 500;
      color: #a9b1d6;
      cursor: pointer;
      position: relative;
      transition: background 0.12s ease, color 0.12s ease, transform 0.1s ease;
    }
    .sug-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
    .sug-item:active {
      transform: scale(0.99);
    }
    .sug-item.selected {
      background: rgba(127, 140, 255, 0.18) !important;
      color: #ffffff !important;
    }
    .sug-item.selected::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: #7f8cff;
    }
    .sug-icon {
      width: 14px;
      height: 14px;
      stroke: #8f90a6;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: stroke 0.12s ease;
    }
    .sug-item:hover .sug-icon,
    .sug-item.selected .sug-icon {
      stroke: #7f8cff;
    }
    .sug-text {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
    }
  </style>
</head>
<body>
  <div id="card" class="suggestions-card"></div>
  <script>
    function selectSug(sug) {
      if (window.naptureAPI && window.naptureAPI.selectSuggestion) {
        window.naptureAPI.selectSuggestion(sug);
      }
    }
    window.updateContent = function(html, bg, border, shadow, itemColor, itemHoverBg, itemHoverColor, iconColor, isLight) {
      const card = document.getElementById('card');
      if (card) {
        card.style.background = bg;
        card.style.borderColor = border;
        card.style.boxShadow = shadow;
        card.innerHTML = html;
      }
      let styleTag = document.getElementById('dynamic-styles');
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-styles';
        document.head.appendChild(styleTag);
      }
      if (isLight) {
        styleTag.innerHTML = '.sug-item { color: ' + itemColor + ' !important; } ' +
                             '.sug-item:hover { background: ' + itemHoverBg + ' !important; color: ' + itemHoverColor + ' !important; } ' +
                             '.sug-item.selected { background: rgba(127, 140, 255, 0.22) !important; color: #111827 !important; } ' +
                             '.sug-icon svg { stroke: ' + iconColor + ' !important; } ' +
                             '.sug-item:hover .sug-icon svg, .sug-item.selected .sug-icon svg { stroke: #6366f1 !important; }';
      } else {
        styleTag.innerHTML = '.sug-item { color: ' + itemColor + ' !important; } ' +
                             '.sug-item:hover { background: ' + itemHoverBg + ' !important; color: ' + itemHoverColor + ' !important; } ' +
                             '.sug-item.selected { background: rgba(127, 140, 255, 0.18) !important; color: #ffffff !important; } ' +
                             '.sug-icon svg { stroke: ' + iconColor + ' !important; } ' +
                             '.sug-item:hover .sug-icon svg, .sug-item.selected .sug-icon svg { stroke: #7f8cff !important; }';
      }
    };
  </script>
</body>
</html>`;

  win.contentView.addChildView(state.suggestionsView);
  state.suggestionsView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  state.suggestionsView.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(popupHtml));
  state.isSuggestionsViewLoaded = true;
}

// ---- Warm Window Pool for instant tab detachment ----
// Pre-creates a hidden BrowserWindow with index.html fully loaded so
// dragging a tab out doesn't have to wait for cold window creation.
let warmWindow = null;
let warmWindowReady = false;

function setupKdePlasmaBlur() {
  if (process.platform !== 'linux') return;
  const isKde = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase().includes('KDE');
  if (!isKde) return;

  try {
    const homeDir = os.homedir();
    const kwinRulesPath = path.join(homeDir, '.config', 'kwinrulesrc');
    let content = '';
    if (fs.existsSync(kwinRulesPath)) {
      content = fs.readFileSync(kwinRulesPath, 'utf8');
    }

    if (!content.includes('Description=Napture Blur')) {
      const { exec } = require('child_process');
      const kwrite = fs.existsSync('/usr/bin/kwriteconfig6') ? 'kwriteconfig6' : (fs.existsSync('/usr/bin/kwriteconfig5') ? 'kwriteconfig5' : null);
      if (kwrite) {
        const match = content.match(/rules=([^\r\n]*)/);
        const existingRules = match && match[1] ? match[1].split(',').filter(Boolean) : [];
        let nextId = 1;
        while (existingRules.includes(String(nextId))) {
          nextId++;
        }
        existingRules.push(String(nextId));

        exec(`${kwrite} --file kwinrulesrc --group General --key rules "${existingRules.join(',')}" && ` +
             `${kwrite} --file kwinrulesrc --group General --key count "${existingRules.length}" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key Description "Napture Blur" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key wmclass "napture" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key wmclassmatch "2" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key wmclasscomplete "false" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key blur "true" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key blurrule "2" && ` +
             `${kwrite} --file kwinrulesrc --group "${nextId}" --key types "1" && ` +
             `(qdbus-qt6 org.kde.KWin /KWin reconfigure || qdbus org.kde.KWin /KWin reconfigure || true)`, () => {});
      }
    }
  } catch (e) {}
}

function applyLinuxWindowBlur(win) {
  if (process.platform !== 'linux' || !win || win.isDestroyed()) return;
  setupKdePlasmaBlur();
  try {
    const handle = win.getNativeWindowHandle();
    if (!handle || handle.length < 4) return;
    const xid = handle.readUInt32LE(0);
    if (xid) {
      const { exec } = require('child_process');
      exec(`xprop -id ${xid} -f _KDE_NET_WM_BLUR_BEHIND_REGION 32c -set _KDE_NET_WM_BLUR_BEHIND_REGION 0`, () => {});
    }
  } catch (e) {}
}

function createWarmWindow() {
  if (warmWindow && !warmWindow.isDestroyed()) return; // already have one
  warmWindowReady = false;

  const isBlurEnabled = isBlurBackgroundEnabled();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 450,
    show: false,
    title: 'Napture',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: isBlurEnabled ? '#00000000' : '#171720',
    transparent: isBlurEnabled && process.platform !== 'win32',
    ...(isBlurEnabled && process.platform === 'win32' ? { backgroundMaterial: isWindows11() ? 'mica' : 'acrylic' } : {}),
    ...(isBlurEnabled && process.platform === 'darwin' ? { vibrancy: 'under-window', visualEffectState: 'active' } : {})
  });

  const state = {
    isDetached: true,
    mruTabs: [],
    activeTabId: null,
    lastViewportBounds: null,
    isHtmlFullscreen: false,
    tabs: new Set(),
    isSuggestionsViewLoaded: false
  };
  windowStates.set(win, state);
  initContextMenuOverlay(win, state);
  initOmnibarPopupOverlay(win, state);
  // Note: do NOT add to browserWindows yet – it's not a real window until claimed

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  setupKeyboardShortcuts(win.webContents);
  win.webContents.on('context-menu', (e, params) => handleContextMenu(e, params, win.webContents));

  win.once('ready-to-show', () => {
    warmWindowReady = true;
    if (isBlurEnabled) applyLinuxWindowBlur(win);
  });

  // If it gets closed before we use it, clear references
  win.on('closed', () => {
    if (warmWindow === win) {
      warmWindow = null;
      warmWindowReady = false;
    }
  });

  warmWindow = win;
}

function claimWarmWindow(x, y, width, height) {
  const win = warmWindow;
  warmWindow = null;
  warmWindowReady = false;

  if (!win || win.isDestroyed()) {
    // fallback: create a cold window
    return null;
  }

  const isBlurEnabled = isBlurBackgroundEnabled();

  // Promote to a real browser window
  browserWindows.add(win);
  win.setBounds({
    x,
    y,
    width: width ? Math.max(640, width) : 1200,
    height: height ? Math.max(450, height) : 800
  });
  win.setBackgroundColor(isBlurEnabled ? '#00000000' : '#171720');
  win.setOpacity(1);
  win.show();
  if (isBlurEnabled) applyLinuxWindowBlur(win);

  // Wire up standard window events
  win.on('resize', () => {
    resizeActiveView(win);
    if (win) win.webContents.send('trigger-resize');
  });
  win.on('maximize', () => {
    if (win) win.webContents.send('window-maximize-state', true);
  });
  win.on('unmaximize', () => {
    if (win) win.webContents.send('window-maximize-state', false);
  });
  win.on('focus', () => {
    applyPerformanceModeToWindow(win, true);
  });
  win.on('blur', () => {
    applyPerformanceModeToWindow(win, false);
  });
  win.on('close', () => {
    saveCurrentSessionFromMain();
  });
  win.on('closed', () => {
    browserWindows.delete(win);
    const state = getWindowState(win);
    if (state) {
      for (const tabId of state.tabs) {
        const view = tabViews.get(tabId);
        if (view) {
          try { view.webContents.destroy(); } catch(e) {}
          tabViews.delete(tabId);
        }
      }
      if (state.suggestionsView) {
        try { state.suggestionsView.webContents.destroy(); } catch(e) {}
        state.suggestionsView = null;
      }
      if (state.omnibarPopupView) {
        try { state.omnibarPopupView.webContents.destroy(); } catch(e) {}
        state.omnibarPopupView = null;
      }
      if (state.contextMenuWin && !state.contextMenuWin.isDestroyed()) {
        state.contextMenuWin.destroy();
        state.contextMenuWin = null;
      }
    }
    if (browserWindows.size === 0 && !isUpdating && !isImporting) {
      tabViews.clear();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    }
  });

  return win;
}

function createBrowserWindow(options = {}) {
  const minWidth = options.minWidth || 640;
  const minHeight = options.minHeight || 450;
  const isBlurEnabled = isBlurBackgroundEnabled();

  const win = new BrowserWindow({
    width: options.width ? Math.max(minWidth, options.width) : 1200,
    height: options.height ? Math.max(minHeight, options.height) : 800,
    minWidth: minWidth,
    minHeight: minHeight,
    x: options.x,
    y: options.y,
    title: 'Napture',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    frame: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: isBlurEnabled ? '#00000000' : '#171720',
    transparent: isBlurEnabled && process.platform !== 'win32',
    ...(isBlurEnabled && process.platform === 'win32' ? { backgroundMaterial: isWindows11() ? 'mica' : 'acrylic' } : {}),
    ...(isBlurEnabled && process.platform === 'darwin' ? { vibrancy: 'under-window', visualEffectState: 'active' } : {})
  });

  const state = {
    isDetached: !!options.isDetached,
    mruTabs: [],
    activeTabId: null,
    lastViewportBounds: null,
    isHtmlFullscreen: false,
    tabs: new Set(),
    isSuggestionsViewLoaded: false
  };
  windowStates.set(win, state);
  browserWindows.add(win);
  initContextMenuOverlay(win, state);
  initOmnibarPopupOverlay(win, state);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  setupKeyboardShortcuts(win.webContents);

  win.webContents.on('console-message', (event, ...args) => {
    let msg, lvl, line, src;
    if (event && typeof event === 'object' && event.message !== undefined) {
      msg = event.message;
      lvl = event.level;
      line = event.lineNumber || event.line;
      src = event.sourceId;
    } else {
      lvl = args[0];
      msg = args[1];
      line = args[2];
      src = args[3];
    }
    console.log(`[Renderer Console] ${msg}`);
  });
  win.webContents.on('render-process-gone', (e, d) => console.error('[Renderer Process Gone]', d));
  win.webContents.on('unresponsive', () => console.error('[Renderer Unresponsive]'));

  win.on('show', () => {
    if (isBlurEnabled) applyLinuxWindowBlur(win);
  });

  win.once('ready-to-show', () => {
    win.setBackgroundColor(isBlurEnabled ? '#00000000' : '#171720');
    win.show();
    if (isBlurEnabled) applyLinuxWindowBlur(win);

    // Handle cold start URLs from process.argv or macOS open-url
    if (pendingOpenUrl) {
      win.webContents.send('open-url-in-new-tab', { url: pendingOpenUrl });
      pendingOpenUrl = null;
    } else {
      const targetUrl = process.argv.find(arg => arg !== '.' && !arg.startsWith('-') && (arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('napture://') || arg.startsWith('ne://') || arg.endsWith('.html') || arg.endsWith('.htm')));
      if (targetUrl) {
        let url = targetUrl;
        if ((url.endsWith('.html') || url.endsWith('.htm')) && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
          url = 'file://' + path.resolve(process.cwd(), url);
        }
        win.webContents.send('open-url-in-new-tab', { url: url });
      }
    }
  });

  win.on('resize', () => {
    resizeActiveView(win, true);
    if (win) {
      win.webContents.send('trigger-resize');
    }
  });

  win.on('maximize', () => {
    if (win) {
      win.webContents.send('window-maximize-state', true);
    }
  });

  win.on('unmaximize', () => {
    if (win) {
      win.webContents.send('window-maximize-state', false);
    }
  });

  win.on('focus', () => {
    applyPerformanceModeToWindow(win, true);
  });

  win.on('blur', () => {
    applyPerformanceModeToWindow(win, false);
  });

  win.on('close', () => {
    saveCurrentSessionFromMain();
  });

  win.on('closed', () => {
      browserWindows.delete(win);
      const state = getWindowState(win);
      if (state) {
        for (const tabId of state.tabs) {
          const view = tabViews.get(tabId);
          if (view) {
            try { view.webContents.destroy(); } catch(e) {}
            tabViews.delete(tabId);
          }
        }
        if (state.suggestionsView) {
          try { state.suggestionsView.webContents.destroy(); } catch(e) {}
          state.suggestionsView = null;
        }
        if (state.omnibarPopupView) {
          try { state.omnibarPopupView.webContents.destroy(); } catch(e) {}
          state.omnibarPopupView = null;
        }
      }
      if (browserWindows.size === 0 && !isUpdating && !isImporting) {
        tabViews.clear();
        if (warmWindow && !warmWindow.isDestroyed()) {
          try { warmWindow.destroy(); } catch(e) {}
          warmWindow = null;
          warmWindowReady = false;
        }
        if (process.platform !== 'darwin') {
          app.quit();
        }
      }
    });

  return win;
}

function resizeActiveView(win, useLiveBounds = false, forceNudge = false) {
  const activeView = getActiveView(win);
  const state = getWindowState(win);
  if (!activeView || !win || !state) return;

  const { width: winW, height: winH } = win.getContentBounds();

  if (state.isHtmlFullscreen) {
    if (typeof activeView.setBorderRadius === 'function') {
      try { activeView.setBorderRadius(0); } catch (e) {}
    }
    activeView.setBounds({ x: 0, y: 0, width: winW, height: winH });
    return;
  }

  if (state.isToolbarCustomizing) {
    activeView.setBounds({ x: -10000, y: -10000, width: Math.max(1, winW), height: Math.max(1, winH) });
    return;
  }

  // Ensure uniform 12px rounded corner cutout on the native WebContentsView
  if (typeof activeView.setBorderRadius === 'function') {
    try { activeView.setBorderRadius(12); } catch (e) {}
  }

  // Compute exact bounds matching #viewport-placeholder (240px sidebar + 12px uniform border spacing)
  let x, y, w, h;

  if (!useLiveBounds && state.lastViewportBounds && state.lastViewportBounds.width > 0 && state.lastViewportBounds.height > 0) {
    x = Math.max(0, Math.round(state.lastViewportBounds.x));
    y = Math.max(0, Math.round(state.lastViewportBounds.y));
    w = Math.max(0, Math.min(Math.round(state.lastViewportBounds.width), winW - x));
    h = Math.max(0, Math.min(Math.round(state.lastViewportBounds.height), winH - y));
  } else {
    // Exact layout constants: Sidebar width 240px, right/bottom padding 12px, header height 48px, top padding 4px
    x = 240;
    y = 52;
    w = Math.max(0, winW - 240 - 12);
    h = Math.max(0, winH - 48 - 4 - 12);
  }

  if (forceNudge && w > 1) {
    try { activeView.setBounds({ x, y, width: w - 1, height: h }); } catch (e) {}
  }
  activeView.setBounds({ x, y, width: w, height: h });
  if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
    try {
      if (typeof activeView.webContents.invalidate === 'function') {
        activeView.webContents.invalidate();
      }
    } catch (e) {}
  }
}

// IPC Handlers: Controlling Viewports from UI

let viewPool = [];
let _archivePath = null;

function getArchivePath() {
  if (!_archivePath) {
    _archivePath = path.join(app.getPath('userData'), 'SwapArchive');
    if (!fs.existsSync(_archivePath)) {
      fs.mkdirSync(_archivePath, { recursive: true });
    }
  }
  return _archivePath;
}

// Helper to rehydrate an archived tab
const rehydrateArchivedTab = (view, tabId, url) => {
  const p = getArchivePath();
  const file = path.join(p, `${tabId}.json`);
  const targetUrl = (url && url !== 'about:blank') ? url : 'napture://welcome';
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      view.webContents.once('did-finish-load', () => {
        view.webContents.executeJavaScript(`
          window.scrollTo(${data.scrollX}, ${data.scrollY});
        `).catch(() => {});
        try { fs.unlinkSync(file); } catch (e) {}
      });
      view.webContents.loadURL(targetUrl);
    } catch (e) {
      try { fs.unlinkSync(file); } catch (err) {}
      view.webContents.loadURL(targetUrl);
    }
  } else {
    view.webContents.loadURL(targetUrl);
  }
};

function createViewForPool() {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'tab-preload.js'),
      userAgent: cleanUserAgent,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: true,
      webSecurity: true,
      safeDialogs: true
    }
  });

  // Attach a temporary listener to self-prune if the process dies while in the pool.
  const crashHandler = () => {
    const idx = viewPool.indexOf(view);
    if (idx !== -1) {
      viewPool.splice(idx, 1);
    }
  };
  // Store the handler on the view to easily remove it later when taken out of pool
  view._poolCrashHandler = crashHandler;
  view.webContents.once('render-process-gone', crashHandler);

  if (typeof view.setBorderRadius === 'function') {
    try { view.setBorderRadius(12); } catch (e) {}
  }

  return view;
}

function getPooledView() {
  let viewToReturn = null;
  while (viewPool.length > 0) {
    const view = viewPool.pop();
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      const isCrashed = typeof view.webContents.isCrashed === 'function' ? view.webContents.isCrashed() : false;
      if (!isCrashed) {
        if (view._poolCrashHandler) {
          view.webContents.removeListener('render-process-gone', view._poolCrashHandler);
          delete view._poolCrashHandler;
        }
        viewToReturn = view;
        break;
      }
    }
    // If it was destroyed or crashed, we just pop another one.
  }
  if (!viewToReturn) {
    viewToReturn = createViewForPool();
  }
  viewToReturn._createdAt = Date.now();
  return viewToReturn;
}

function replenishViewPool() {
  // Clean up any naturally destroyed views before counting
  viewPool = viewPool.filter(v => v && v.webContents && !v.webContents.isDestroyed() && !(typeof v.webContents.isCrashed === 'function' && v.webContents.isCrashed()));

  if (viewPool.length < 2) {
    viewPool.push(createViewForPool());
  }
}

function getActivePerformanceMode() {
  const perfMode = getSetting('performanceMode', null);
  if (perfMode) return perfMode;
  const battSaver = getSetting('batterySaver', false);
  return battSaver ? 'battery_saver' : 'balanced';
}

function getFrameRateForState(isWindowFocused = true, isActiveTab = true) {
  const mode = getActivePerformanceMode();
  if (mode === 'battery_saver') {
    if (!isWindowFocused) return 15;
    if (!isActiveTab) return 15;
    return 30;
  } else if (mode === 'performance') {
    if (!isWindowFocused) return 60;
    if (!isActiveTab) return 30;
    return 144;
  } else {
    // 'balanced' (default)
    if (!isWindowFocused) return 30;
    if (!isActiveTab) return 30;
    return 60;
  }
}

function applyPerformanceMode(mode = null) {
  const activeMode = mode || getActivePerformanceMode();
  for (const win of browserWindows) {
    if (!win || win.isDestroyed()) continue;
    applyPerformanceModeToWindow(win, win.isFocused(), activeMode);
  }
}

function applyPerformanceModeToWindow(win, isFocused = true, mode = null) {
  if (!win || win.isDestroyed()) return;
  const activeMode = mode || getActivePerformanceMode();
  const state = getWindowState(win);
  if (!state) return;

  const isBatterySaver = (activeMode === 'battery_saver');

  state.tabs.forEach(tabId => {
    const view = tabViews.get(tabId);
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      const isActive = (tabId === state.activeTabId);
      const isAudible = typeof view.webContents.isCurrentlyAudible === 'function' && view.webContents.isCurrentlyAudible();

      if (isActive || isAudible) {
        try {
          view.webContents.setBackgroundThrottling(false);
        } catch (e) {}
      } else {
        try {
          view.webContents.setBackgroundThrottling(true);
        } catch (e) {}
      }
    }
  });
}

function setupTabView(view, tabId, win) {
  const webContents = view.webContents;
  if (!webContents || webContents.isDestroyed()) return;
  if (webContents._naptureSetup) return;
  webContents._naptureSetup = true;

  try {
    webContents.setUserAgent(cleanUserAgent);
  } catch (e) {}

  setupKeyboardShortcuts(webContents);

  const getTargetWin = () => getWindowByTabId(tabId) || win;
  const state = getWindowState(win);

  // Configure initial non-zero bounds so view is never zero-sized when created/warmed
  if (win && !win.isDestroyed()) {
    try {
      const { width: winW, height: winH } = win.getContentBounds();
      const initialW = Math.max(100, winW - 240 - 12);
      const initialH = Math.max(100, winH - 48 - 4 - 12);
      if (typeof view.setBorderRadius === 'function') {
        try { view.setBorderRadius(12); } catch (e) {}
      }
      const isTabActive = state ? (state.activeTabId === tabId) : false;
      if (isTabActive) {
        view.setBounds({ x: 240, y: 52, width: initialW, height: initialH });
      } else {
        view.setBounds({ x: -10000, y: -10000, width: initialW, height: initialH });
      }
    } catch (e) {}
  }

  // Apply background throttling based on active performance mode
  try {
    const isTabActive = state ? (state.activeTabId === tabId) : false;
    const isAudible = typeof webContents.isCurrentlyAudible === 'function' && webContents.isCurrentlyAudible();
    webContents.setBackgroundThrottling(!isTabActive && !isAudible);
  } catch (e) {}

  const setWebContentsMaskColor = (colorHex) => {
    if (!webContents || webContents.isDestroyed()) return;
    const targetColor = colorHex || 'transparent';
    
    // Fix: Only make the tab view transparent if it's an internal page to avoid massive lag
    if (targetColor === 'transparent') {
      const url = (webContents.getURL() || '').toLowerCase();
      if (!url || isWelcomeUrl(url) || url.startsWith('napture://') || url.startsWith('ne://') || url.startsWith('about:')) {
        view.setBackgroundColor('#00000000');
      } else {
        view.setBackgroundColor('#171720');
      }
    } else {
      view.setBackgroundColor(targetColor);
    }

    webContents.executeJavaScript(`
      (function() {
        if (document.documentElement) {
          document.documentElement.style.setProperty('--napture-mask-color', '${targetColor}', 'important');
        }
      })()
    `).catch(() => {});
  };

  // Handle navigation failures gracefully with dedicated internal error page
  const handleNavFailure = (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (errorCode === -3) return; // Ignore ERR_ABORTED (user cancellation / redirects)
    if (view._isWarmingUp) return;
    if (isMainFrame === false) return;
    if (!validatedURL || validatedURL.startsWith('napture://error') || validatedURL.startsWith('ne://error') || validatedURL.startsWith('about:blank')) return;

    const errorUrl = `napture://error/network?url=${encodeURIComponent(validatedURL)}&code=${errorCode}&desc=${encodeURIComponent(errorDescription || '')}`;
    setImmediate(() => {
      if (!webContents.isDestroyed()) {
        webContents.loadURL(errorUrl).catch(() => {});
      }
    });
  };

  webContents.on('did-fail-load', handleNavFailure);
  webContents.on('did-fail-provisional-load', handleNavFailure);

  // Handle render process crashes (e.g. from OOM or shared process being destroyed)
  webContents.on('render-process-gone', (event, details) => {
    const targetWin = getTargetWin();
    const state = targetWin ? getWindowState(targetWin) : null;
    if (details && (details.reason === 'oom' || details.reason === 'memory-eviction')) {
      try { const { session } = require('electron'); session.defaultSession.clearCache(); session.defaultSession.clearHostResolverCache(); } catch(e) {}
    }
    if (state && state.activeTabId === tabId) {
      // Reload active tab to recover from blank screen
      webContents.reload();
    } else {
      // Background tab: delete view so it gets cleanly recreated from the pool on switch
      try { webContents.destroy(); } catch(e) {}
      tabViews.delete(tabId);
    }
  });

  // Track page lifecycle and sync back to renderer

  webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      const activeWin = getTargetWin();
      const lowerUrl = (url || '').toLowerCase();
      const isInternal = lowerUrl.startsWith('napture://') || lowerUrl.startsWith('ne://') || lowerUrl.startsWith('about:');

      if (isInternal) {
        setWebContentsMaskColor('transparent');
        if (activeWin && !activeWin.isDestroyed()) {
          activeWin.webContents.send('theme-color-updated', { tabId, color: null });
        }
      } else {
        const cachedColor = themeColorCache.get(url);
        if (cachedColor) {
          setWebContentsMaskColor(cachedColor);
          if (activeWin && !activeWin.isDestroyed()) {
            activeWin.webContents.send('theme-color-updated', { tabId, color: cachedColor === 'transparent' ? null : cachedColor });
          }
        }
      }
      if (activeWin && !activeWin.isDestroyed()) {
        hideContextMenu(activeWin);
      }
    }
  });

  webContents.on('did-start-loading', () => {
    if (view._isWarmingUp) return;
    const targetWin = getTargetWin();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('tab-loading-state', { tabId, isLoading: true });
    }
  });

  webContents.on('did-stop-loading', () => {
    if (view._isWarmingUp) return;
    const targetWin = getTargetWin();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('tab-loading-state', { tabId, isLoading: false });
    }
    try {
      const zoomSetting = require('./db/history').getSetting('defaultZoom', '100');
      const zoomFactor = parseInt(zoomSetting, 10) / 100;
      if (!isNaN(zoomFactor)) {
        webContents.setZoomFactor(zoomFactor);
      }
    } catch(e) {}
  });

  webContents.on('media-started-playing', async () => {
    await updateCachedMediaInfo(webContents, tabId, true);
    try {
      webContents.setBackgroundThrottling(false);
    } catch(e) {}
    const targetWin = getTargetWin();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('media-state-changed', { tabId, state: 'playing' });
    }
  });

  webContents.on('media-paused', async () => {
    await updateCachedMediaInfo(webContents, tabId, false);
    const targetWin = getTargetWin();
    const targetState = targetWin ? getWindowState(targetWin) : null;
    const isActive = targetState ? (targetState.activeTabId === tabId) : false;
    if (!isActive) {
      try {
        webContents.setBackgroundThrottling(true);
      } catch(e) {}
    }
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('media-state-changed', { tabId, state: 'paused' });
    }
  });

  const injectRoundingCSS = () => {
    webContents.insertCSS(`
      /* Custom styled scrollbars inside pages */
      ::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background-color: rgba(127, 140, 255, 0.4) !important;
        border: 2px solid transparent !important;
        background-clip: padding-box !important;
        border-radius: 10px !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background-color: rgba(127, 140, 255, 0.8) !important;
      }
    `, { cssOrigin: 'user' }).catch(() => {});
  };

  const extractThemeColor = () => {
    const targetWin = getTargetWin();
    if (!targetWin || !getActiveView(targetWin) || webContents.isDestroyed()) return;

    webContents.executeJavaScript(`
      (function() {
        // Safe color parser
        function parseColor(colorStr) {
          if (!colorStr) return null;
          const container = document.documentElement || document.body;
          if (!container) return null;
          const temp = document.createElement('div');
          temp.style.color = colorStr;
          container.appendChild(temp);
          const style = window.getComputedStyle(temp).color;
          container.removeChild(temp);

          const clean = style.replace('rgba(', '').replace('rgb(', '').replace(')', '');
          const parts = clean.split(',');
          if (parts.length >= 3) {
            const a = parts.length >= 4 ? parseFloat(parts[3].trim()) : 1;
            if (a < 0.1) return null; // Transparent
            return { r: parseInt(parts[0].trim()), g: parseInt(parts[1].trim()), b: parseInt(parts[2].trim()), a };
          }
          return null;
        }

        function rgbToHex(c) {
          if (!c) return null;
          const r = c.r.toString(16).padStart(2, '0');
          const g = c.g.toString(16).padStart(2, '0');
          const b = c.b.toString(16).padStart(2, '0');
          return '#' + r + g + b;
        }

        // 1. Explicit Meta Theme Color (<meta name="theme-color">)
        const darkMeta = document.querySelector('meta[name="theme-color"][media*="dark"]');
        const defaultMeta = document.querySelector('meta[name="theme-color"]:not([media])') || document.querySelector('meta[name="theme-color"]');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        let explicitMetaColor = null;
        if (prefersDark && darkMeta && darkMeta.content) {
          explicitMetaColor = darkMeta.content;
        } else if (defaultMeta && defaultMeta.content) {
          explicitMetaColor = defaultMeta.content;
        }

        if (explicitMetaColor) {
          const parsedMeta = parseColor(explicitMetaColor);
          if (parsedMeta) {
            return { status: 'blended', color: rgbToHex(parsedMeta) };
          }
        }

        // 2. Computed Body or Document Background
        let primaryBgStr = null;
        const selectors = [
          'body',
          'html',
          '#app',
          '#root',
          '#main',
          'main',
          '#canvas',
          '[role="main"]',
          '.app',
          'body > div'
        ];

        for (let sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const bg = window.getComputedStyle(el).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
              const parsed = parseColor(bg);
              if (parsed && parsed.a >= 0.5) {
                primaryBgStr = bg;
                break;
              }
            }
          }
        }

        // If page is still loading stylesheets and body is plain unstyled default white, wait for full load
        const isUnstyledDefaultWhite = primaryBgStr && (primaryBgStr === 'rgb(255, 255, 255)' || primaryBgStr === '#ffffff') && document.styleSheets.length === 0;
        if (isUnstyledDefaultWhite && document.readyState !== 'complete') {
          return { status: 'pending' };
        }

        if (!primaryBgStr) {
          const loc = window.location.href.toLowerCase();
          if (loc.startsWith('napture://') || loc.startsWith('ne://') || loc.startsWith('about:')) {
            return { status: 'blended', color: null };
          }
          return { status: 'blended', color: '#ffffff' };
        }

        const primaryRGB = parseColor(primaryBgStr);
        if (!primaryRGB) {
          const loc = window.location.href.toLowerCase();
          if (loc.startsWith('napture://') || loc.startsWith('ne://') || loc.startsWith('about:')) {
            return { status: 'blended', color: null };
          }
          return { status: 'blended', color: '#ffffff' };
        }

        return { status: 'blended', color: rgbToHex(primaryRGB) };
      })()
    `).then(result => {
      const activeWin = getTargetWin();
      if (result && result.status === 'pending') return;
      const isBlended = result.status === 'blended';
      if (isBlended && result.color) {
        themeColorCache.set(webContents.getURL(), result.color);
      }
      if (isBlended && result.color === null) {
        themeColorCache.set(webContents.getURL(), 'transparent');
      }
      const themeColor = isBlended ? result.color : 'transparent';
      setWebContentsMaskColor(themeColor);

      if (isBlended && activeWin && !activeWin.isDestroyed()) {
        activeWin.webContents.send('theme-color-updated', { tabId, color: result.color });
      } else if (activeWin && !activeWin.isDestroyed()) {
        activeWin.webContents.send('theme-color-updated', { tabId, color: null });
      }
    }).catch(() => {
      const activeWin = getTargetWin();
      const url = webContents.getURL().toLowerCase();
      if (url.startsWith('napture://') || url.startsWith('ne://') || url.startsWith('about:')) {
        setWebContentsMaskColor('transparent');
        if (activeWin && !activeWin.isDestroyed()) {
          activeWin.webContents.send('theme-color-updated', { tabId, color: null });
        }
      } else {
        setWebContentsMaskColor('#ffffff');
        if (activeWin && !activeWin.isDestroyed()) {
          activeWin.webContents.send('theme-color-updated', { tabId, color: '#ffffff' });
        }
      }
    });
  };

  webContents.on('dom-ready', () => {
    injectRoundingCSS();
    injectRoundingElements(webContents);
  });
  webContents.on('did-frame-finish-load', (event) => {
    if (!event.isMainFrame) return;
    injectRoundingCSS();
    injectRoundingElements(webContents);
  });
  webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      if (cachedMediaInfo && cachedMediaInfo.tabId === tabId) {
        cachedMediaInfo = null;
      }
      if (lastActiveMediaTabId === tabId) {
        lastActiveMediaTabId = null;
      }
      if (activeStreamingTabId === tabId) {
        stopMediaVideoStream();
      }
      const targetWin = getTargetWin();
      if (targetWin && !targetWin.isDestroyed()) {
        targetWin.webContents.send('media-state-changed', { tabId, state: 'stopped', mediaInfo: null });
      }
    }
  });
  webContents.on('did-navigate', () => {
    // Removed redundant injection
  });
  webContents.on('did-navigate-in-page', () => {
    // Removed redundant injection
  });
  webContents.on('did-finish-load', () => {
    injectRoundingCSS();
    injectRoundingElements(webContents);
    extractThemeColor();

    // Add history tracking
    const url = webContents.getURL();
    const title = webContents.getTitle();
    addHistory(url, title, null);
  });

  const sendNavUpdate = () => {
    const win = getWindowByTabId(tabId);
    if (win && !win.isDestroyed() && webContents && !webContents.isDestroyed()) {
      win.webContents.send('tab-navigated', {
        tabId,
        url: webContents.getURL(),
        title: webContents.getTitle(),
        canGoBack: webContents.navigationHistory ? webContents.navigationHistory.canGoBack() : false,
        canGoForward: webContents.navigationHistory ? webContents.navigationHistory.canGoForward() : false
      });
    }
  };

  webContents.on('did-navigate', sendNavUpdate);
  webContents.on('did-navigate-in-page', sendNavUpdate);

  webContents.on('page-title-updated', (event, title) => {
    const targetWin = getTargetWin();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('tab-title-updated', { tabId, title });
    }
    const url = webContents.getURL();
    addHistory(url, title, null);
  });

  webContents.on('page-favicon-updated', (event, favicons) => {
    const targetWin = getTargetWin();
    if (favicons && favicons.length > 0 && targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('tab-favicon-updated', { tabId, favicon: favicons[0] });
      const url = webContents.getURL();
      const title = webContents.getTitle();
      addHistory(url, title, favicons[0]);
    }
  });

  // Custom NewebX Context Menu handler
  webContents.on('context-menu', (e, params) => handleContextMenu(e, params, webContents));

  // Capture link clicks configured with target="_blank" and open them in a tab, while allowing popup/OAuth auth windows
  webContents.setWindowOpenHandler((details) => {
    const targetUrl = unwrapRedirectUrl(details.url);

    // Determine if this is a genuine programmatic popup window (e.g. OAuth dialog or custom popup with explicit geometry/features)
    const hasPopupFeatures = typeof details.features === 'string' && details.features.length > 0 && (
      details.features.includes('width=') ||
      details.features.includes('height=') ||
      details.features.includes('popup') ||
      details.features.includes('menubar=no') ||
      details.features.includes('toolbar=no') ||
      details.features.includes('location=no') ||
      details.features.includes('status=no') ||
      details.features.includes('resizable=no')
    );

    const isAuthEndpoint = isAuthOrSensitiveUrl(targetUrl) || isAuthOrSensitiveUrl(details.url);
    const isPopup = hasPopupFeatures || (isAuthEndpoint && details.disposition === 'new-window');

    if (isPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: win && !win.isDestroyed() ? win : undefined,
          modal: false,
          autoHideMenuBar: true,
          width: 600,
          height: 700,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'tab-preload.js')
          }
        }
      };
    }

    const targetWin = getTargetWin() || getMainWindow();
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('open-url-in-new-tab', { url: targetUrl });
    }
    return { action: 'deny' };
  });

  webContents.on('did-create-window', (childWindow) => {
    if (childWindow && !childWindow.isDestroyed()) {
      try {
        childWindow.webContents.setUserAgent(cleanUserAgent);
        childWindow.setMenuBarVisibility(false);
        childWindow.setAutoHideMenuBar(true);
      } catch (e) {}
    }
  });

  // HTML Fullscreen support (YouTube, Vimeo, etc.)
  // When a page requests fullscreen, expand the view to cover the entire screen
  webContents.on('enter-html-full-screen', () => {
    state.isHtmlFullscreen = true;
    // Hide the rounded corner masks so fullscreen is truly edge-to-edge
    webContents.executeJavaScript(`
      (function() {
        const el = document.getElementById('napture-viewport-rounding');
        if (el) el.style.display = 'none';
      })()
    `).catch(() => {});
    if (win && !win.isDestroyed()) {
      win.setFullScreen(true);
      win.webContents.send('html-fullscreen-state', true);
      resizeActiveView(win);
    }
  });

  webContents.on('leave-html-full-screen', () => {
    state.isHtmlFullscreen = false;
    // Restore the rounded corner masks
    webContents.executeJavaScript(`
      (function() {
        const el = document.getElementById('napture-viewport-rounding');
        if (el) el.style.display = '';
      })()
    `).catch(() => {});
    if (win && !win.isDestroyed()) {
      win.setFullScreen(false);
      win.webContents.send('html-fullscreen-state', false);
      resizeActiveView(win);
    }
  });

}

ipcMain.on('create-tab', (event, { tabId, url }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (!win || !state) return;
  if (!getMainWindow()) return;

  state.tabs.add(tabId);
  const mruIndex = state.mruTabs.indexOf(tabId);
  if (mruIndex > -1) state.mruTabs.splice(mruIndex, 1);
  state.mruTabs.unshift(tabId);

  const view = getPooledView();
  setTimeout(replenishViewPool, 500);

  const isInternalUrl = !url || isWelcomeUrl(url) || url.startsWith('napture://') || url.startsWith('ne://') || url.startsWith('about:');
  if (isInternalUrl) {
    view.setBackgroundColor('#00000000');
  } else {
    view.setBackgroundColor('#ffffff');
  }
  tabViews.set(tabId, view);

  setupTabView(view, tabId, win);

  // Load the initial page
  view.webContents.loadURL(url);
});

ipcMain.on('warmup-tab', (event, { tabId, url }) => {
  let view = tabViews.get(tabId);
  if (view && (!view.webContents || view.webContents.isDestroyed() || (typeof view.webContents.isCrashed === 'function' && view.webContents.isCrashed()))) {
    tabViews.delete(tabId);
    view = null;
  }
  if (!view) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    view = getPooledView();
    setTimeout(replenishViewPool, 500);
    const isInternalUrl = !url || isWelcomeUrl(url) || url.startsWith('napture://') || url.startsWith('ne://') || url.startsWith('about:');
    if (isInternalUrl) {
      view.setBackgroundColor('#00000000');
    } else {
      view.setBackgroundColor('#ffffff');
    }
    view._isWarmingUp = true;
    tabViews.set(tabId, view);
    setupTabView(view, tabId, win);

    view.webContents.once('did-finish-load', () => {
      view._isWarmingUp = false;
    });

    if (fs.existsSync(path.join(getArchivePath(), `${tabId}.json`))) {
      rehydrateArchivedTab(view, tabId, url);
    } else {
      view.webContents.loadURL(url);
    }
  }

  // Preemptively wake up frozen view
  if (view && view.webContents) {
    try {
      view.webContents.setBackgroundThrottling(false);
      view.webContents.setAudioMuted(false);
      view.webContents.executeJavaScript('if (typeof window.__naptureResume === "function") window.__naptureResume();').catch(()=>{});
    } catch(e) {}
  }
});

ipcMain.on('set-toolbar-customizing', (event, isCustomizing) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (state) {
    state.isToolbarCustomizing = isCustomizing;
    resizeActiveView(win);
  }
});

ipcMain.on('sync-pinned-tabs', (event, pinnedTabIds) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (state) {
    state.pinnedTabs = new Set(pinnedTabIds);
  }
});

ipcMain.on('toggle-mute-tab', (event, tabId) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) return;
  const view = tabViews.get(tabId);
  if (view && view.webContents) {
    const isMuted = view.webContents.isAudioMuted();
    view.webContents.setAudioMuted(!isMuted);
    browserWindow.webContents.send('tab-navigated', {
      tabId,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
      isMuted: !isMuted
    });
  }
});

let lastActiveMediaTabId = null;

function getMediaView(win) {
  const state = getWindowState(win);
  if (!state) return null;

  // 1. Check if active tab is currently audible or playing
  if (state.activeTabId) {
    const activeView = tabViews.get(state.activeTabId);
    if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
      if (activeView.webContents.isCurrentlyAudible()) {
        lastActiveMediaTabId = state.activeTabId;
        return { view: activeView, tabId: state.activeTabId };
      }
    }
  }

  // 2. Check last known media tab if still open
  if (lastActiveMediaTabId && state.tabs.has(lastActiveMediaTabId)) {
    const lastView = tabViews.get(lastActiveMediaTabId);
    if (lastView && lastView.webContents && !lastView.webContents.isDestroyed()) {
      return { view: lastView, tabId: lastActiveMediaTabId };
    } else {
      lastActiveMediaTabId = null;
    }
  } else if (lastActiveMediaTabId) {
    lastActiveMediaTabId = null;
  }

  // 3. Search all open tabs for any currently audible tab
  for (const tabId of state.tabs) {
    const view = tabViews.get(tabId);
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      if (view.webContents.isCurrentlyAudible()) {
        lastActiveMediaTabId = tabId;
        return { view, tabId };
      }
    }
  }

  // 4. Default to active tab view
  if (state.activeTabId) {
    const activeView = tabViews.get(state.activeTabId);
    if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
      return { view: activeView, tabId: state.activeTabId };
    }
  }

  return null;
}

ipcMain.on('control-media', async (event, { action, value }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const mediaTarget = getMediaView(win);
  if (!mediaTarget || !mediaTarget.view.webContents || mediaTarget.view.webContents.isDestroyed()) return;
  const wc = mediaTarget.view.webContents;
  const tabId = mediaTarget.tabId;

  if (action === 'play-pause') {
    wc.executeJavaScript(`
      (function() {
        function findMedia() {
          const elements = Array.from(document.querySelectorAll('video, audio'));
          if (elements.length === 0) return null;
          return elements.find(el => !el.paused && el.currentTime > 0) ||
                 document.querySelector('.html5-main-video, video.video-stream') ||
                 elements.find(el => el.duration > 0) ||
                 elements[0];
        }
        const v = findMedia();
        if (v) {
          if (v.paused) { v.play(); } else { v.pause(); }
          return !v.paused;
        }
        return null;
      })()
    `).then(async (isPlaying) => {
      if (isPlaying !== null) {
        if (cachedMediaInfo) {
          cachedMediaInfo.playing = isPlaying;
        }
        await updateCachedMediaInfo(wc, tabId, isPlaying);
        event.sender.send('media-state-changed', { tabId, state: isPlaying ? 'playing' : 'paused' });
      }
    }).catch(() => {});
  } else if (action === 'next') {
    wc.executeJavaScript(`
      (function() {
        const nextBtn = document.querySelector('.ytp-next-button, [aria-label*="Next"], [title*="Next"]');
        if (nextBtn) nextBtn.click();
      })()
    `).catch(() => {});
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'MediaNextTrack' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'MediaNextTrack' });
  } else if (action === 'previous') {
    wc.executeJavaScript(`
      (function() {
        const prevBtn = document.querySelector('.ytp-prev-button, [aria-label*="Previous"], [title*="Previous"]');
        if (prevBtn) prevBtn.click();
      })()
    `).catch(() => {});
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'MediaPreviousTrack' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'MediaPreviousTrack' });
  } else if (action === 'volume' || action === 'set-volume') {
    const isAbsolute = (action === 'set-volume');
    const change = typeof value === 'number' ? value : 0.05;
    wc.executeJavaScript(`
      (function() {
        function findMedia() {
          const elements = Array.from(document.querySelectorAll('video, audio'));
          if (elements.length === 0) return null;
          return elements.find(el => !el.paused && el.currentTime > 0) ||
                 document.querySelector('.html5-main-video, video.video-stream') ||
                 elements.find(el => el.duration > 0) ||
                 elements[0];
        }
        const v = findMedia();
        if (v) {
          let targetVol;
          if (${isAbsolute}) {
            targetVol = Math.max(0, Math.min(1, Math.round((${change}) * 100) / 100));
          } else {
            targetVol = Math.max(0, Math.min(1, Math.round((v.volume + (${change})) * 100) / 100));
          }
          v.volume = targetVol;
          if (v.volume > 0 && v.muted) {
            v.muted = false;
          }
          return { volume: v.volume, muted: v.muted };
        }
        return null;
      })()
    `).then(res => {
      if (res) {
        if (cachedMediaInfo) {
          cachedMediaInfo.volume = res.volume;
          cachedMediaInfo.muted = res.muted;
        }
        if (res.muted === false && wc.isAudioMuted()) {
          wc.setAudioMuted(false);
        }
        event.sender.send('media-volume-updated', res);
      }
    }).catch(() => {});
  } else if (action === 'toggle-mute') {
    wc.executeJavaScript(`
      (function() {
        function findMedia() {
          const elements = Array.from(document.querySelectorAll('video, audio'));
          if (elements.length === 0) return null;
          return elements.find(el => !el.paused && el.currentTime > 0) ||
                 document.querySelector('.html5-main-video, video.video-stream') ||
                 elements.find(el => el.duration > 0) ||
                 elements[0];
        }
        const v = findMedia();
        if (v) {
          v.muted = !v.muted;
          return { muted: v.muted, volume: v.volume };
        }
        return null;
      })()
    `).then(res => {
      let isMuted;
      if (res && typeof res.muted === 'boolean') {
        isMuted = res.muted;
        wc.setAudioMuted(isMuted);
      } else {
        isMuted = !wc.isAudioMuted();
        wc.setAudioMuted(isMuted);
      }
      if (cachedMediaInfo) {
        cachedMediaInfo.muted = isMuted;
        if (res && typeof res.volume === 'number') {
          cachedMediaInfo.volume = res.volume;
        }
      }
      event.sender.send('media-volume-updated', {
        muted: isMuted,
        volume: res ? res.volume : (cachedMediaInfo ? cachedMediaInfo.volume : 1)
      });
    }).catch(() => {
      const isMuted = !wc.isAudioMuted();
      wc.setAudioMuted(isMuted);
      if (cachedMediaInfo) cachedMediaInfo.muted = isMuted;
      event.sender.send('media-volume-updated', { muted: isMuted });
    });
  }
});

let cachedMediaInfo = null;
const themeColorCache = new Map();

ipcMain.handle('get-active-media-info', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const mediaTarget = getMediaView(win);
    if (mediaTarget && mediaTarget.view && mediaTarget.view.webContents && !mediaTarget.view.webContents.isDestroyed()) {
      await updateCachedMediaInfo(mediaTarget.view.webContents, mediaTarget.tabId);
    } else {
      cachedMediaInfo = null;
    }
  }
  if (cachedMediaInfo && cachedMediaInfo.tabId) {
    const state = win ? getWindowState(win) : null;
    if (!state || !state.tabs.has(cachedMediaInfo.tabId)) {
      cachedMediaInfo = null;
    }
  }
  return cachedMediaInfo;
});

async function updateCachedMediaInfo(wc, tabId, isPlaying) {
  if (!wc || wc.isDestroyed()) return;
  try {
    const info = await wc.executeJavaScript(`
      (function() {
        function findMedia() {
          const elements = Array.from(document.querySelectorAll('video, audio'));
          if (elements.length === 0) {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            for (const f of iframes) {
              try {
                const doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
                if (doc) {
                  const el = doc.querySelector('video, audio');
                  if (el && (!el.paused || el.currentTime > 0)) return el;
                }
              } catch(e) {}
            }
            return null;
          }

          // 1. Actively playing element
          const playing = elements.find(el => !el.paused && el.currentTime > 0 && !el.ended);
          if (playing) return playing;

          // 2. Main video player (e.g. YouTube, Twitch) if actively playing or with watch progress
          const mainVideo = document.querySelector('.html5-main-video, video.video-stream');
          if (mainVideo && (!mainVideo.paused || mainVideo.currentTime > 0) && !mainVideo.ended) return mainVideo;

          // 3. Paused media with progress (user watched or interacted with it)
          const pausedWithProgress = elements.find(el => el.currentTime > 0 && !el.ended);
          if (pausedWithProgress) return pausedWithProgress;

          // 4. Check if MediaSession has active metadata indicating media interaction with playing/interacted element
          if (navigator.mediaSession && navigator.mediaSession.metadata && (navigator.mediaSession.metadata.title || navigator.mediaSession.metadata.artist)) {
            const activeEl = elements.find(el => !el.paused || el.currentTime > 0);
            if (activeEl) return activeEl;
          }

          // Do NOT return stagnant/unplayed video/audio elements (e.g. ad snippets, hover previews, tracking elements on eBay)
          return null;
        }

        const v = findMedia();
        if (!v) return null;

        let artwork = null;
        if (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.artwork) {
          const arts = navigator.mediaSession.metadata.artwork;
          if (arts && arts.length > 0) artwork = arts[arts.length - 1].src;
        }
        if (!artwork && v.poster) artwork = v.poster;
        // Only search DOM for cover/artwork if mediaSession/poster isn't present AND it's a dedicated media player element
        if (!artwork && (document.querySelector('.html5-main-video, video.video-stream') || (v.tagName && v.tagName.toUpperCase() === 'AUDIO'))) {
          const img = document.querySelector('.ytd-thumbnail img, meta[property="og:image"]');
          if (img) artwork = img.src || (img.content ? img.content : null);
        }
        let title = '';
        let artist = '';
        if (navigator.mediaSession && navigator.mediaSession.metadata) {
          title = navigator.mediaSession.metadata.title || '';
          artist = navigator.mediaSession.metadata.artist || '';
        }
        if (!title) {
          const titleEl = document.querySelector('h1.ytd-watch-metadata, .ytp-title-link, [class*="video-title"]');
          if (titleEl) title = titleEl.textContent || titleEl.innerText || '';
        }

        const isVideo = (v.tagName && v.tagName.toUpperCase() === 'VIDEO');
        const hasVideo = isVideo && (v.videoWidth > 0 && v.videoHeight > 0) && (!v.paused || v.currentTime > 0);

        return {
          playing: !v.paused,
          title: (title || '').trim(),
          artist: (artist || '').trim(),
          artwork: artwork,
          volume: typeof v.volume === 'number' ? v.volume : 1,
          muted: !!(v.muted),
          hasVideo: !!hasVideo
        };
      })()
    `);
    if (info) {
      info.tabId = tabId;
      info.playing = (typeof isPlaying === 'boolean') ? isPlaying : info.playing;
      if (wc.isAudioMuted()) {
        info.muted = true;
      }
      cachedMediaInfo = info;
    } else {
      if (cachedMediaInfo && cachedMediaInfo.tabId === tabId) {
        cachedMediaInfo = null;
      }
    }
  } catch (e) {}
}

let activeStreamingTabId = null;
let videoStreamInterval = null;

function restoreTabVideoDisplay(targetTabId) {
  if (!targetTabId) return;
  const view = tabViews.get(targetTabId);
  if (!view || !view.webContents || view.webContents.isDestroyed()) return;

  try {
    view.webContents.setBackgroundThrottling(false);
    if (typeof view.webContents.invalidate === 'function') {
      view.webContents.invalidate();
    }
    view.webContents.executeJavaScript(`
      (function() {
        try {
          if (window.__naptureCanvas) {
            try {
              window.__naptureCanvas.width = 1;
              window.__naptureCanvas.height = 1;
            } catch(e) {}
            window.__naptureCanvas = null;
            window.__naptureCtx = null;
          }
          const vids = Array.from(document.querySelectorAll('video'));
          for (const v of vids) {
            if (v) {
              const prevTransform = v.style.transform;
              v.style.transform = (prevTransform ? prevTransform + ' ' : '') + 'translateZ(0)';
              requestAnimationFrame(() => {
                try {
                  v.style.transform = prevTransform;
                } catch(e) {}
              });
              if (!v.paused) {
                try {
                  v.dispatchEvent(new Event('timeupdate'));
                  v.dispatchEvent(new Event('playing'));
                } catch(e) {}
              }
            }
          }
          const ytp = document.querySelector('#movie_player, .html5-video-player');
          if (ytp) {
            if (typeof ytp.wakeUpControls === 'function') {
              try { ytp.wakeUpControls(); } catch(e) {}
            }
            if (typeof ytp.setInternalSize === 'function') {
              try { ytp.setInternalSize(); } catch(e) {}
            }
          }
          window.dispatchEvent(new Event('resize'));
        } catch(e) {}
      })()
    `).catch(() => {});
  } catch(e) {}
}

function stopMediaVideoStream(tabId) {
  const targetTabId = tabId || activeStreamingTabId;
  if (videoStreamInterval) {
    clearInterval(videoStreamInterval);
    videoStreamInterval = null;
  }
  activeStreamingTabId = null;

  if (targetTabId) {
    restoreTabVideoDisplay(targetTabId);
  }
}

function startMediaVideoStream(win, tabId) {
  if (!tabId || !win || win.isDestroyed()) return;
  const state = getWindowState(win);
  if (state && state.activeTabId === tabId) {
    stopMediaVideoStream(tabId);
    return;
  }
  if (activeStreamingTabId === tabId && videoStreamInterval) return;

  stopMediaVideoStream();
  activeStreamingTabId = tabId;

  const view = tabViews.get(tabId);
  if (view && view.webContents && !view.webContents.isDestroyed()) {
    try {
      view.webContents.setBackgroundThrottling(false);
    } catch(e) {}
  }

  let isCapturing = false;
  videoStreamInterval = setInterval(async () => {
    const currentState = win && !win.isDestroyed() ? getWindowState(win) : null;
    if (activeStreamingTabId !== tabId || win.isDestroyed() || (currentState && currentState.activeTabId === tabId)) {
      stopMediaVideoStream(tabId);
      return;
    }

    if (isCapturing) return;
    isCapturing = true;

    try {
      const vView = tabViews.get(tabId);
      if (!vView || !vView.webContents || vView.webContents.isDestroyed()) {
        stopMediaVideoStream(tabId);
        return;
      }

      const wc = vView.webContents;
      const res = await wc.executeJavaScript(`
        (function() {
          function findVideo() {
            const vids = Array.from(document.querySelectorAll('video'));
            if (vids.length === 0) {
              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (const f of iframes) {
                try {
                  const doc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
                  if (doc) {
                    const iv = doc.querySelector('video');
                    if (iv) return iv;
                  }
                } catch(e) {}
              }
              return null;
            }
            // Prefer actively playing video
            const playing = vids.find(v => !v.paused && v.currentTime > 0 && !v.ended);
            if (playing) return playing;
            // Main video classes if playing or with progress
            const main = document.querySelector('.html5-main-video, video.video-stream');
            if (main && (!main.paused || main.currentTime > 0) && !main.ended) return main;
            // Largest video with progress or actively playing
            const withProgress = vids.filter(v => (v.videoWidth || v.clientWidth) > 0 && (!v.paused || v.currentTime > 0) && !v.ended);
            if (withProgress.length > 0) {
              withProgress.sort((a, b) => ((b.videoWidth || b.clientWidth) * (b.videoHeight || b.clientHeight)) - ((a.videoWidth || a.clientWidth) * (a.videoHeight || a.clientHeight)));
              return withProgress[0];
            }
            return null;
          }

          const v = findVideo();
          if (!v) return null;

          if (!window.__naptureCanvas) {
            window.__naptureCanvas = document.createElement('canvas');
            window.__naptureCtx = window.__naptureCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
          }

          const canvas = window.__naptureCanvas;
          const ctx = window.__naptureCtx;
          const vw = v.videoWidth || v.clientWidth || 320;
          const vh = v.videoHeight || v.clientHeight || 180;
          const targetW = 320;
          const targetH = Math.max(100, Math.min(240, Math.round(targetW * (vh / vw)))) || 180;

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          try {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            return { frame: canvas.toDataURL('image/jpeg', 0.65) };
          } catch(err) {
            const rect = v.getBoundingClientRect();
            return {
              useCapturePage: true,
              rect: {
                x: Math.max(0, Math.round(rect.left)),
                y: Math.max(0, Math.round(rect.top)),
                width: Math.max(1, Math.round(rect.width)),
                height: Math.max(1, Math.round(rect.height))
              }
            };
          }
        })()
      `);

      if (res && activeStreamingTabId === tabId && !win.isDestroyed()) {
        if (res.frame) {
          win.webContents.send('media-video-frame', { tabId, frame: res.frame });
        } else if (res.useCapturePage && res.rect) {
          const image = await wc.capturePage(res.rect);
          if (image && !image.isEmpty() && activeStreamingTabId === tabId && !win.isDestroyed()) {
            const resized = image.resize({ width: 320, height: 180, quality: 'good' });
            win.webContents.send('media-video-frame', { tabId, frame: resized.toDataURL() });
          }
        }
      }
    } catch(err) {
      // Ignore individual frame errors
    } finally {
      isCapturing = false;
    }
  }, 40);
}

ipcMain.on('start-media-video-stream', (event, { tabId }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && tabId) {
    startMediaVideoStream(win, tabId);
  }
});

ipcMain.on('stop-media-video-stream', (event, { tabId }) => {
  stopMediaVideoStream(tabId);
});

ipcMain.on('switch-tab', (event, { tabId, url }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    hideContextMenu(win);
    hideOmnibarPopup(win);
  }
  const state = getWindowState(win);
  if (!win || !state) return;
  if (!getMainWindow()) return;

  // Stop video stream immediately when switching to the streaming tab to return video to the page
  stopMediaVideoStream(tabId);

  // Track MRU
  const mruIndex = state.mruTabs.indexOf(tabId);
  if (mruIndex > -1) state.mruTabs.splice(mruIndex, 1);
  state.mruTabs.unshift(tabId);

  // Move inactive background tabs offscreen and manage JS clocks
  state.tabs.forEach(tId => {
    if (tId !== tabId) {
      const otherView = tabViews.get(tId);
      if (otherView && otherView.webContents && !otherView.webContents.isDestroyed()) {
        try {
          const isAudible = typeof otherView.webContents.isCurrentlyAudible === 'function' && otherView.webContents.isCurrentlyAudible();
          const isStreaming = (activeStreamingTabId === tId);

          // Position inactive tab offscreen so Chromium retains its compositor frame sink while preventing visual overlap
          try {
            const b = typeof otherView.getBounds === 'function' ? otherView.getBounds() : null;
            const w = (b && b.width > 0) ? b.width : 800;
            const h = (b && b.height > 0) ? b.height : 600;
            otherView.setBounds({ x: -10000, y: -10000, width: w, height: h });
          } catch (e) {}

          if (!isAudible && !isStreaming) {
            // Freeze JavaScript clock execution loops for inactive non-playing tabs
            otherView.webContents.setBackgroundThrottling(true);
          } else {
            // Keep background throttling disabled for audible or streaming tabs
            otherView.webContents.setBackgroundThrottling(false);
          }
        } catch (e) {}
      }
    }
  });

  state.activeTabId = tabId;
  state.lastViewportBounds = null;
  let newActiveView = getActiveView(win);

  // Recreate discarded or destroyed view
  if (!newActiveView) {
    newActiveView = getPooledView();
    setTimeout(replenishViewPool, 500);
    const isInternalUrl = !url || isWelcomeUrl(url) || url.startsWith('napture://') || url.startsWith('ne://') || url.startsWith('about:');
    if (isInternalUrl) {
      newActiveView.setBackgroundColor('#00000000');
    } else {
      newActiveView.setBackgroundColor('#ffffff');
    }
    tabViews.set(tabId, newActiveView);
    setupTabView(newActiveView, tabId, win);

    const targetUrl = (url && url !== 'about:blank') ? url : 'napture://welcome';
    if (fs.existsSync(path.join(getArchivePath(), `${tabId}.json`))) {
      rehydrateArchivedTab(newActiveView, tabId, targetUrl);
    } else {
      newActiveView.webContents.once('did-finish-load', () => {
          newActiveView.webContents.executeJavaScript(`if (typeof window.__naptureResume === "function") window.__naptureResume("${tabId}");`).catch(()=>{});
      });
      newActiveView.webContents.loadURL(targetUrl);
    }
  } else if (newActiveView && newActiveView.webContents) {
    // Resume frozen view
    try {
      newActiveView.webContents.setBackgroundThrottling(false);
      newActiveView.webContents.setAudioMuted(false);
      const isCrashed = typeof newActiveView.webContents.isCrashed === 'function' ? newActiveView.webContents.isCrashed() : false;
      const currentUrl = newActiveView.webContents.getURL();
      if (isCrashed || !currentUrl || currentUrl === 'about:blank') {
        const targetUrl = (url && url !== 'about:blank') ? url : 'napture://welcome';
        newActiveView.webContents.loadURL(targetUrl).catch(() => {});
      }
    } catch(e) {}
  }

  if (newActiveView && newActiveView.webContents && !newActiveView.webContents.isDestroyed()) {
    newActiveView._isWarmingUp = false;
    if (typeof newActiveView.setVisible === 'function') {
      newActiveView.setVisible(true);
    }
    newActiveView.webContents.setBackgroundThrottling(false);
    hideSuggestionsView(win);

    // Apply valid viewport bounds BEFORE mounting to contentView so Chromium initializes with correct dimensions
    resizeActiveView(win, true, true);
    restoreTabVideoDisplay(tabId);

    if (win.contentView) {
      if (!win.contentView.children.includes(newActiveView)) {
        // Keep page content below the renderer-owned browser chrome and its HTML popups.
        win.contentView.addChildView(newActiveView, 0);
      } else {
        // Re-add at the bottom of the z-order without detaching the frame sink.
        win.contentView.addChildView(newActiveView, 0);
      }
      // Re-append active popups to ensure they render on top of tab view
      if (state.suggestionsView && win.contentView.children.includes(state.suggestionsView)) {
        win.contentView.removeChildView(state.suggestionsView);
        win.contentView.addChildView(state.suggestionsView);
      }
      if (state.contextMenuView && win.contentView.children.includes(state.contextMenuView)) {
        win.contentView.addChildView(state.contextMenuView);
      }
      if (state.omnibarPopupView && win.contentView.children.includes(state.omnibarPopupView)) {
        win.contentView.addChildView(state.omnibarPopupView);
      }
    }
    if (typeof newActiveView.setVisible === 'function') {
      newActiveView.setVisible(true);
    }
    newActiveView.webContents.setBackgroundThrottling(false);
    hideSuggestionsView(win);
    resizeActiveView(win, true, true);
    // If live bounds yielded empty width/height (e.g. window minimized or race condition), enforce fallback minimum layout
    try {
      const currentBounds = typeof newActiveView.getBounds === 'function' ? newActiveView.getBounds() : null;
      if (currentBounds && (currentBounds.width <= 0 || currentBounds.height <= 0)) {
        const { width: winW, height: winH } = win.getContentBounds();
        const fallbackW = Math.max(100, winW - 240 - 12);
        const fallbackH = Math.max(100, winH - 48 - 4 - 12);
        if (typeof newActiveView.setBorderRadius === 'function') {
          try { newActiveView.setBorderRadius(state.isHtmlFullscreen ? 0 : 12); } catch (e) {}
        }
        newActiveView.setBounds({ x: 240, y: 52, width: fallbackW - 1, height: fallbackH });
        newActiveView.setBounds({ x: 240, y: 52, width: fallbackW, height: fallbackH });
      }
    } catch (e) {}
    newActiveView.webContents.focus();

    // Trigger resume script and repaint nudge after remounting and un-throttling
    try {
      newActiveView.webContents.executeJavaScript(`
        if (typeof window.__naptureResume === "function") window.__naptureResume("${tabId}");
        if (document.body) {
          const oldOp = document.body.style.opacity;
          document.body.style.opacity = '0.9999';
          requestAnimationFrame(() => {
            document.body.style.opacity = oldOp;
          });
        }
        document.querySelectorAll("video").forEach(v => {
          if (!v.paused) {
            v.dispatchEvent(new Event("timeupdate"));
          }
        });
      `).catch(()=>{});
    } catch(e) {}

    if (typeof newActiveView.webContents.invalidate === 'function') {
      try { newActiveView.webContents.invalidate(); } catch(e) {}
    }

    // Schedule secondary delayed resize tick and invalidate call to force Chromium compositor surface repaints
    setTimeout(() => {
      if (!win.isDestroyed() && state.activeTabId === tabId) {
        resizeActiveView(win, true);
        if (newActiveView && newActiveView.webContents && !newActiveView.webContents.isDestroyed()) {
          if (typeof newActiveView.webContents.invalidate === 'function') {
            try { newActiveView.webContents.invalidate(); } catch(e) {}
          }
        }
      }
    }, 50);

    // Force inject rounding CSS and elements on tab switch / focus to ensure it's always rounded
    newActiveView.webContents.insertCSS(`
      /* Custom styled scrollbars inside pages */
      ::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background-color: rgba(127, 140, 255, 0.4) !important;
        border: 2px solid transparent !important;
        background-clip: padding-box !important;
        border-radius: 10px !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background-color: rgba(127, 140, 255, 0.8) !important;
      }
    `, { cssOrigin: 'user' }).catch(() => {});

    injectRoundingElements(newActiveView.webContents);

    // Sync the switched view's URL/history state to the address bar
    const viewUrl = newActiveView.webContents.getURL();
    const effectiveNavUrl = (viewUrl && viewUrl !== 'about:blank') ? viewUrl : ((url && url !== 'about:blank') ? url : '');
    if (effectiveNavUrl) {
      win.webContents.send('tab-navigated', {
        tabId,
        url: effectiveNavUrl,
        title: newActiveView.webContents.getTitle() || 'New Tab',
        canGoBack: newActiveView.webContents.navigationHistory ? newActiveView.webContents.navigationHistory.canGoBack() : false,
        canGoForward: newActiveView.webContents.navigationHistory ? newActiveView.webContents.navigationHistory.canGoForward() : false
      });
    }
  }
});

// Frameless Window Control Handlers
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.on('resize-view-contents', (event, bounds) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (!win || !state) return;
  if (!bounds || typeof bounds !== 'object') return;
  if (bounds.width <= 0 || bounds.height <= 0) return;
  state.lastViewportBounds = bounds;
  resizeActiveView(win);
});

ipcMain.on('address-bar-focused', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const state = getWindowState(win);
  if (!state) return;

  if (!state.suggestionsView) {
    initSuggestionsView(win, state);
  }
});

ipcMain.on('set-suggestions-height', () => {});

ipcMain.on('set-dragging-state', (event, isDragging) => {
  // No-op: Views are positioned securely at x=240 and no longer collapsed during drag
});

ipcMain.on('close-tab', (event, tabId) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (!win || !state) return;
  if (!state.tabs.has(tabId)) return; // Security check to prevent race conditions across windows
  
  const mruIndex = state.mruTabs.indexOf(tabId);
  if (mruIndex > -1) state.mruTabs.splice(mruIndex, 1);
  state.tabs.delete(tabId);

  // Clear any active media tracking if it belongs to the closing tab
  if (cachedMediaInfo && cachedMediaInfo.tabId === tabId) {
    cachedMediaInfo = null;
  }
  if (lastActiveMediaTabId === tabId) {
    lastActiveMediaTabId = null;
  }
  if (activeStreamingTabId === tabId) {
    stopMediaVideoStream();
  }
  try {
    win.webContents.send('media-state-changed', { tabId, state: 'stopped', mediaInfo: null });
  } catch (e) {}

  const view = tabViews.get(tabId);
  if (!view) return;

  if (state.activeTabId === tabId) {
    state.activeTabId = null;
  }

  if (win && !win.isDestroyed() && win.contentView && win.contentView.children.includes(view)) {
    try {
      win.contentView.removeChildView(view);
    } catch (e) {}
  }

  try {
    view.webContents.destroy();
  } catch (e) {}

  tabViews.delete(tabId);
});

ipcMain.on('navigate', (event, url) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    hideContextMenu(win);
    hideOmnibarPopup(win);
  }
  const state = getWindowState(win);
  if (!win || !state) return;
  let activeView = getActiveView(win);
  if (!activeView && state.activeTabId) {
    activeView = getPooledView();
    setTimeout(replenishViewPool, 500);
    tabViews.set(state.activeTabId, activeView);
    setupTabView(activeView, state.activeTabId, win);
    if (typeof activeView.setVisible === 'function') {
      activeView.setVisible(true);
    }
    resizeActiveView(win);
    if (win.contentView) {
      // Keep the loaded page below the renderer-owned browser chrome and its HTML popups.
      win.contentView.addChildView(activeView, 0);
      if (state.suggestionsView && win.contentView.children.includes(state.suggestionsView)) {
        win.contentView.removeChildView(state.suggestionsView);
        win.contentView.addChildView(state.suggestionsView);
      }
      if (state.contextMenuView && win.contentView.children.includes(state.contextMenuView)) {
        win.contentView.addChildView(state.contextMenuView);
      }
      if (state.omnibarPopupView && win.contentView.children.includes(state.omnibarPopupView)) {
        win.contentView.addChildView(state.omnibarPopupView);
      }
    }
    resizeActiveView(win);
  }
  if (activeView && !activeView.webContents.isDestroyed()) {
    activeView.webContents.loadURL(url).catch(err => {
      console.error(`Failed to load URL: ${url}`, err);
    });
  }
});

ipcMain.on('go-back', (event) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && !activeView.webContents.isDestroyed() && activeView.webContents.navigationHistory.canGoBack()) {
    activeView.webContents.navigationHistory.goBack();
  }
});

ipcMain.on('go-forward', (event) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && !activeView.webContents.isDestroyed() && activeView.webContents.navigationHistory.canGoForward()) {
    activeView.webContents.navigationHistory.goForward();
  }
});

ipcMain.on('reload', (event) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && !activeView.webContents.isDestroyed()) {
    activeView.webContents.reload();
  }
});

ipcMain.handle('get-suggestions', async (event, query) => {
  if (!query) return ['', []];

  // 1. Primary: Napture Search Suggestions API
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`https://search.nebuff.xyz/api/suggestions?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/x-suggestions+json, application/json' }
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}

  // 2. Direct Fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {}

  return [query, []];
});

ipcMain.on('select-suggestion', (event, sug) => {
  const win = getWindowFromWebContents(event.sender);
  const state = getWindowState(win);
  if (!win || !state) return;
  if (state.suggestionsView) {
    state.suggestionsView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  if (!win.isDestroyed()) {
    win.webContents.send('suggestion-selected', sug);
  }
});

ipcMain.on('adopt-tab-to-window', (event, { tabId }) => {
  const targetWin = BrowserWindow.fromWebContents(event.sender);
  let sourceWin = null;
  for (const win of browserWindows) {
    const state = getWindowState(win);
    if (state && state.tabs.has(tabId)) {
      sourceWin = win;
      break;
    }
  }

  if (sourceWin && sourceWin !== targetWin) {
    const sourceState = getWindowState(sourceWin);
    if (sourceState) {
      sourceState.tabs.delete(tabId);
      const mruIndex = sourceState.mruTabs.indexOf(tabId);
      if (mruIndex > -1) sourceState.mruTabs.splice(mruIndex, 1);
      if (sourceState.activeTabId === tabId) {
        sourceState.activeTabId = null;
      }
    }
    const view = tabViews.get(tabId);
    if (view && sourceWin.contentView) {
      try { sourceWin.contentView.removeChildView(view); } catch(e) {}
    }
    
    if (!sourceWin.isDestroyed()) {
      sourceWin.webContents.send('tab-adopted-by-another-window', tabId);
    }
  }

  const targetState = getWindowState(targetWin);
  if (targetState) {
    targetState.tabs.add(tabId);
  }
});

ipcMain.on('detach-tab', (event, { tabId, url, title, x, y, width, height }) => {
  const sourceWin = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(sourceWin);
  if (state) {
    state.tabs.delete(tabId);
    const mruIndex = state.mruTabs.indexOf(tabId);
    if (mruIndex > -1) state.mruTabs.splice(mruIndex, 1);
    if (state.activeTabId === tabId) {
      state.activeTabId = null;
    }
    const view = tabViews.get(tabId);
    if (view && sourceWin) {
      try { sourceWin.contentView.removeChildView(view); } catch(e) {}
    }
  }

  // Try to use a pre-warmed window for instant detachment
  let newWin = (warmWindowReady) ? claimWarmWindow(x, y, width, height) : null;

  if (newWin) {
    // Warm window is already loaded — send adopt immediately
    const newState = getWindowState(newWin);
    if (newState) newState.tabs.add(tabId);
    newWin.webContents.send('adopt-tab', { tabId, url, title });
  } else {
    // Fallback: cold-create a window
    newWin = createBrowserWindow({ x, y, width, height, isDetached: true });
    const newState = getWindowState(newWin);
    if (newState) newState.tabs.add(tabId);
    newWin.show();
    newWin.once('ready-to-show', () => {
      newWin.webContents.send('adopt-tab', { tabId, url, title });
    });
  }
});

ipcMain.on('update-suggestions-overlay', (event, { suggestions, bounds, isLight, selectedIndex = -1 }) => {
  const win = getWindowFromWebContents(event.sender);
  const state = getWindowState(win);
  if (!win || !state) return;
  
  if (!state.suggestionsView) {
    initSuggestionsView(win, state);
  }
  const suggestionsView = state.suggestionsView;

  if (!suggestions || suggestions.length === 0) {
    hideSuggestionsView(win);
    return;
  }

  const paddingOffset = 16;
  const cardHeight = suggestions.length * 38 + 14;
  const height = cardHeight + (paddingOffset * 2);
  const x = Math.round(bounds.x - paddingOffset);
  const y = Math.round(bounds.y + 4 - paddingOffset);
  const width = Math.round(bounds.width + (paddingOffset * 2));

  const itemsHtml = suggestions.map((sug, idx) => {
    const isSelected = idx === selectedIndex;
    const escaped = sug.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const jsEscaped = escaped.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    const isUrl = /^(https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(sug);
    const iconSvg = isUrl
      ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
      : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

    return `
      <div class="sug-item ${isSelected ? 'selected' : ''}" data-index="${idx}" onmousedown="event.preventDefault(); selectSug('${jsEscaped}')" onclick="selectSug('${jsEscaped}')">
        <div class="sug-icon">${iconSvg}</div>
        <span class="sug-text">${escaped}</span>
      </div>
    `;
  }).join('');

  const cardBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(22, 23, 32, 0.88)';
  const cardBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
  const cardShadow = isLight ? '0 16px 40px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06)' : '0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)';
  const itemColor = isLight ? '#374151' : '#a9b1d6';
  const itemHoverBg = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  const itemHoverColor = isLight ? '#111827' : '#ffffff';
  const iconColor = isLight ? '#6b7280' : '#8f90a6';

  if (!win.contentView.children.includes(suggestionsView)) {
    win.contentView.addChildView(suggestionsView);
  }
  suggestionsView.setBounds({ x, y, width, height });

  const script = `if (window.updateContent) { window.updateContent(${JSON.stringify(itemsHtml)}, ${JSON.stringify(cardBg)}, ${JSON.stringify(cardBorder)}, ${JSON.stringify(cardShadow)}, ${JSON.stringify(itemColor)}, ${JSON.stringify(itemHoverBg)}, ${JSON.stringify(itemHoverColor)}, ${JSON.stringify(iconColor)}, ${isLight ? 'true' : 'false'}); }`;
  suggestionsView.webContents.executeJavaScript(script).catch(() => {});
});

function setupKeyboardShortcuts(targetWebContents) {
  if (!targetWebContents || targetWebContents.isDestroyed()) return;

  targetWebContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const isMac = process.platform === 'darwin';
    const modifier = isMac ? input.meta : input.control;
    const key = (input.key || '').toLowerCase();
    const code = input.code || '';
    const targetWin = getWindowFromWebContents(targetWebContents) || BrowserWindow.getFocusedWindow() || getMainWindow();
    if (!targetWin || targetWin.isDestroyed()) return;

    const sendAction = (action, data) => {
      event.preventDefault();
      targetWin.webContents.send('shortcut-action', action, data);
    };

    // Ctrl+T / Cmd+T -> New Tab
    if (modifier && !input.shift && !input.alt && (key === 't' || code === 'KeyT')) {
      sendAction('new-tab');
      return;
    }

    // Ctrl+H / Cmd+H -> Open Fullscreen History
    if (modifier && !input.shift && !input.alt && (key === 'h' || code === 'KeyH')) {
      sendAction('open-history');
      return;
    }

    // Ctrl+Shift+T / Cmd+Shift+T -> Reopen Closed Tab
    if (modifier && input.shift && !input.alt && (key === 't' || code === 'KeyT')) {
      sendAction('reopen-tab');
      return;
    }

    // Ctrl+W / Cmd+W -> Close Tab
    if (modifier && !input.shift && !input.alt && (key === 'w' || code === 'KeyW')) {
      sendAction('close-tab');
      return;
    }

    // Ctrl+L / Cmd+L / Alt+D -> Focus Address Bar
    if ((modifier && !input.shift && !input.alt && (key === 'l' || code === 'KeyL')) || (input.alt && !modifier && !input.shift && (key === 'd' || code === 'KeyD'))) {
      sendAction('focus-location');
      return;
    }

    // Ctrl+R / Cmd+R / F5 -> Reload
    if ((modifier && !input.shift && !input.alt && (key === 'r' || code === 'KeyR')) || (!modifier && !input.shift && !input.alt && (key === 'f5' || code === 'F5'))) {
      sendAction('reload');
      return;
    }

    // Ctrl+Shift+R / Cmd+Shift+R / Ctrl+F5 -> Force Reload
    if ((modifier && input.shift && (key === 'r' || code === 'KeyR')) || (input.control && (key === 'f5' || code === 'F5'))) {
      sendAction('force-reload');
      return;
    }

    // Ctrl+Tab / Ctrl+PageDown -> Next Tab
    if ((input.control && !input.shift && (key === 'tab' || code === 'Tab')) || (input.control && !input.shift && (key === 'pagedown' || code === 'PageDown'))) {
      sendAction('next-tab');
      return;
    }

    // Ctrl+Shift+Tab / Ctrl+PageUp -> Prev Tab
    if ((input.control && input.shift && (key === 'tab' || code === 'Tab')) || (input.control && (key === 'pageup' || code === 'PageUp'))) {
      sendAction('prev-tab');
      return;
    }

    // Ctrl+1 through Ctrl+8 / Cmd+1..8 -> Switch Tab by Index
    if (modifier && !input.shift && !input.alt && ((key >= '1' && key <= '8') || (code.startsWith('Digit') && code.slice(5) >= '1' && code.slice(5) <= '8'))) {
      const digit = (key >= '1' && key <= '8') ? parseInt(key, 10) : parseInt(code.slice(5), 10);
      sendAction('switch-tab-index', digit - 1);
      return;
    }

    // Ctrl+9 / Cmd+9 -> Switch to Last Tab
    if (modifier && !input.shift && !input.alt && (key === '9' || code === 'Digit9')) {
      sendAction('switch-tab-index', -1);
      return;
    }

    // Alt+Left / Cmd+[ -> Back
    if ((input.alt && !modifier && (key === 'arrowleft' || code === 'ArrowLeft')) || (isMac && modifier && (key === '[' || code === 'BracketLeft'))) {
      sendAction('go-back');
      return;
    }

    // Alt+Right / Cmd+] -> Forward
    if ((input.alt && !modifier && (key === 'arrowright' || code === 'ArrowRight')) || (isMac && modifier && (key === ']' || code === 'BracketRight'))) {
      sendAction('go-forward');
      return;
    }

    // Ctrl++ / Ctrl+= / Cmd+= -> Zoom In
    if (modifier && !input.alt && (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')) {
      sendAction('zoom-in');
      return;
    }

    // Ctrl+- / Cmd+- -> Zoom Out
    if (modifier && !input.alt && (key === '-' || code === 'Minus' || code === 'NumpadSubtract')) {
      sendAction('zoom-out');
      return;
    }

    // Ctrl+0 / Cmd+0 -> Zoom Reset
    if (modifier && !input.alt && (key === '0' || code === 'Digit0' || code === 'Numpad0')) {
      sendAction('zoom-reset');
      return;
    }
  });
}

ipcMain.on('zoom-in', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && activeView.webContents) {
    const current = activeView.webContents.getZoomFactor();
    activeView.webContents.setZoomFactor(Math.min(current + 0.1, 3.0));
  }
});

ipcMain.on('zoom-out', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && activeView.webContents) {
    const current = activeView.webContents.getZoomFactor();
    activeView.webContents.setZoomFactor(Math.max(current - 0.1, 0.5));
  }
});

ipcMain.on('zoom-reset', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const activeView = getActiveView(win);
  if (activeView && activeView.webContents) {
    activeView.webContents.setZoomFactor(1.0);
  }
});

let shortcutsWindow = null;

function getShortcutsHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Napture Keyboard Shortcuts</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    body {
      background-color: #0F0F14;
      color: #8F90A6;
      font-family: 'Inter', 'Outfit', -apple-system, sans-serif;
      padding: 24px;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .header h1 {
      font-size: 16px;
      font-weight: 600;
      color: #ECECEC;
      letter-spacing: 0.02em;
    }
    .category {
      margin-bottom: 18px;
      background: #171720;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 12px 16px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
    .category-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #7f8cff;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .category-title svg {
      color: #7f8cff;
    }
    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 13px;
    }
    .shortcut-row:last-child {
      border-bottom: none;
    }
    .shortcut-label {
      color: #ECECEC;
      font-weight: 400;
    }
    .keys {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    kbd {
      background: #24283b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      padding: 4px 8px;
      font-family: 'Outfit', monospace;
      font-size: 11px;
      font-weight: 600;
      color: #7f8cff;
      box-shadow: 0 2px 0 rgba(0, 0, 0, 0.4);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Keyboard Shortcuts</h1>
  </div>

  <div class="category">
    <div class="category-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
      Navigation
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Focus Address Bar</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>L</kbd> <span style="margin: 0 4px; color: #565f89;">or</span> <kbd>Alt</kbd><span>+</span><kbd>D</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Reload Page</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>R</kbd> <span style="margin: 0 4px; color: #565f89;">or</span> <kbd>F5</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Hard Reload</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>R</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Go Back / Forward</span>
      <div class="keys"><kbd>Alt</kbd><span>+</span><kbd>←</kbd> <span style="margin: 0 4px; color: #565f89;">/</span> <kbd>Alt</kbd><span>+</span><kbd>→</kbd></div>
    </div>
  </div>

  <div class="category">
    <div class="category-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
      Tab Management
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">New Tab</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>T</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Close Active Tab</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>W</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Reopen Closed Tab</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>T</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Next / Previous Tab</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>Tab</kbd> <span style="margin: 0 4px; color: #565f89;">/</span> <kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>Tab</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Jump to Tab 1 – 8</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>1</kbd> ... <kbd>8</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Jump to Last Tab</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>9</kbd></div>
    </div>
  </div>

  <div class="category">
    <div class="category-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      View Controls
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Zoom In / Out</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>+</kbd> <span style="margin: 0 4px; color: #565f89;">/</span> <kbd>Ctrl</kbd><span>+</span><kbd>-</kbd></div>
    </div>
    <div class="shortcut-row">
      <span class="shortcut-label">Reset Zoom</span>
      <div class="keys"><kbd>Ctrl</kbd><span>+</span><kbd>0</kbd></div>
    </div>
  </div>
</body>
</html>`;
}

function closeSecondaryWindows(exceptWindow = null) {
  if (shortcutsWindow && shortcutsWindow !== exceptWindow && !shortcutsWindow.isDestroyed()) {
    try { shortcutsWindow.close(); } catch (e) { console.error('Error closing shortcuts window:', e); }
    shortcutsWindow = null;
  }
  if (aboutWindow && aboutWindow !== exceptWindow && !aboutWindow.isDestroyed()) {
    try { aboutWindow.close(); } catch (e) { console.error('Error closing about window:', e); }
    aboutWindow = null;
  }
  if (settingsWindow && settingsWindow !== exceptWindow && !settingsWindow.isDestroyed()) {
    try { settingsWindow.close(); } catch (e) { console.error('Error closing settings window:', e); }
    settingsWindow = null;
  }
}

ipcMain.on('close-secondary-windows', () => {
  closeSecondaryWindows();
});

function openShortcutsWindow() {
  closeSecondaryWindows(shortcutsWindow);
  const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send('close-all-popups');
  }
  if (shortcutsWindow && !shortcutsWindow.isDestroyed()) {
    shortcutsWindow.focus();
    return;
  }

  shortcutsWindow = new BrowserWindow({
    width: 540,
    height: 660,
    title: 'Napture Keyboard Shortcuts',
    icon: path.join(__dirname, 'logo.png'),
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#16161e',
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  shortcutsWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getShortcutsHtml()));

  shortcutsWindow.on('closed', () => {
    shortcutsWindow = null;
  });
}

ipcMain.on('open-shortcuts-window', () => {
  openShortcutsWindow();
});

let aboutWindow = null;

function getAboutHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>About Napture</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    body {
      background-color: #0F0F14;
      color: #8F90A6;
      font-family: 'Inter', 'Outfit', -apple-system, sans-serif;
      padding: 32px 24px;
      user-select: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      -webkit-font-smoothing: antialiased;
    }
    .logo-container {
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      position: relative;
    }
    .logo-container img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 0 20px rgba(127, 140, 255, 0.4));
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #ECECEC;
      margin-bottom: 4px;
      letter-spacing: -0.01em;
    }
    .author {
      font-size: 13px;
      color: #7f8cff;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .version-badge {
      display: inline-block;
      background: #24283b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 12px;
      font-weight: 600;
      color: #bb9af7;
      margin-bottom: 24px;
    }
    .desc-card {
      background: #171720;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 12px 16px;
      width: 100%;
      font-size: 13px;
      line-height: 1.5;
      color: #ECECEC;
      margin-bottom: 20px;
    }
    .tech-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      width: 100%;
    }
    .tech-item {
      background: #171720;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px;
      text-align: left;
    }
    .tech-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8F90A6;
      margin-bottom: 2px;
    }
    .tech-val {
      font-size: 12px;
      font-weight: 600;
      color: #ECECEC;
    }
  </style>
</head>
<body>
  <div class="logo-container">
    <img src="logo.png" alt="Napture Logo">
  </div>
  <h1>Napture Browser</h1>
  <div class="author">By nebuff</div>
  <div class="version-badge">v1.0.0 (Developer Build)</div>

  <div class="desc-card">
    A next-generation vertical tab browser built for modern fluid web navigation, high performance, and customized desktop workflow.
  </div>

  <div class="tech-grid">
    <div class="tech-item">
      <div class="tech-label">Runtime Engine</div>
      <div class="tech-val">Electron 43 / Chromium 150</div>
    </div>
    <div class="tech-item">
      <div class="tech-label">Architecture</div>
      <div class="tech-val">WebContentsView</div>
    </div>
    <div class="tech-item">
      <div class="tech-label">Platform</div>
      <div class="tech-val">Windows x64</div>
    </div>
    <div class="tech-item">
      <div class="tech-label">Custom Protocols</div>
      <div class="tech-val">napture:// Registered</div>
    </div>
  </div>
</body>
</html>`;
}

function openAboutWindow() {
  closeSecondaryWindows(aboutWindow);
  const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send('close-all-popups');
  }
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 440,
    height: 520,
    title: 'About Napture',
    icon: path.join(__dirname, 'logo.png'),
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#12131a',
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  aboutWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getAboutHtml()));

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

ipcMain.on('open-about-window', () => {
  openAboutWindow();
});

let settingsWindow = null;

function getSettingsHtml() {
  return buildSettingsPage();
}

function openSettingsWindow(options) {
  closeSecondaryWindows(settingsWindow);
  const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send('close-all-popups');
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    if (options) {
      settingsWindow.webContents.send('settings-navigate', options);
    }
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Napture Settings',
    icon: path.join(__dirname, 'logo.png'),
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const settingsHtmlPath = path.join(app.getPath('userData'), 'settings.html');
  fs.writeFileSync(settingsHtmlPath, getSettingsHtml(), 'utf8');

  let targetUrl = `file://${settingsHtmlPath}`;
  if (options && options.section) {
    targetUrl += `#${options.section}`;
  }
  settingsWindow.loadURL(targetUrl);

  settingsWindow.webContents.on('did-finish-load', () => {
    if (options && settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings-navigate', options);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

ipcMain.on('open-settings-window', (event, options) => {
  openSettingsWindow(options);
});

function broadcastSettingChanged(key, value) {
  for (const win of browserWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('setting-changed', { key, value });
    }
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('setting-changed', { key, value });
  }
  if (typeof tabViews !== 'undefined' && tabViews) {
    for (const view of tabViews.values()) {
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.send('setting-changed', { key, value });
      }
    }
  }
}

ipcMain.handle('get-settings', () => {
  return getAllSettings();
});

ipcMain.handle('trigger-toolbar-customize', () => {
  const targetWin = Array.from(browserWindows)[0] || BrowserWindow.getFocusedWindow();
  if (targetWin && !targetWin.isDestroyed()) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
    targetWin.focus();
    targetWin.webContents.send('start-toolbar-customize');
    return true;
  }
  return false;
});

function ensureLinuxDesktopFile() {
  if (process.platform !== 'linux') return;
  try {
    const os = require('os');
    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    const desktopPath = path.join(appsDir, 'napture.desktop');

    let execCmd = '';
    if (process.env.APPIMAGE) {
      execCmd = `${process.env.APPIMAGE} %U`;
    } else if (app.isPackaged) {
      execCmd = `${process.execPath} %U`;
    } else {
      // In development mode, only register desktop file if local electron binary exists
      const localElectron = path.join(__dirname, 'node_modules', '.bin', 'electron');
      const rootElectron = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
      const electronBin = fs.existsSync(localElectron) ? localElectron : (fs.existsSync(rootElectron) ? rootElectron : null);
      if (electronBin) {
        execCmd = `${electronBin} ${path.join(__dirname, '..')} %U`;
      } else {
        return; // Avoid writing a broken `node` desktop entry in dev
      }
    }

    fs.mkdirSync(appsDir, { recursive: true });
    const iconPath = path.join(__dirname, 'logo.png');

    const content = `[Desktop Entry]
Name=Napture
Exec=${execCmd}
Terminal=false
Type=Application
Icon=${fs.existsSync(iconPath) ? iconPath : 'napture'}
StartupWMClass=Napture
Comment=Lightweight, cross-platform Chromium-based web browser
MimeType=x-scheme-handler/http;x-scheme-handler/https;text/html;application/xhtml+xml;
Categories=Network;WebBrowser;
`;
    fs.writeFileSync(desktopPath, content, 'utf8');
    try {
      const { execSync } = require('child_process');
      execSync(`update-desktop-database "${appsDir}" 2>/dev/null || true`);
    } catch (e) {}
  } catch (e) {
    console.error('Failed to create local desktop file for Napture:', e);
  }
}

ipcMain.handle('is-default-browser', () => {
  try {
    if (app.isDefaultProtocolClient('http')) {
      return true;
    }
    if (process.platform === 'linux') {
      const { execSync } = require('child_process');
      try {
        const currentBrowser = execSync('xdg-settings get default-web-browser 2>/dev/null', { encoding: 'utf8' }).trim().toLowerCase();
        if (currentBrowser.includes('napture')) {
          return true;
        }
      } catch (e) {}
      try {
        const currentMime = execSync('xdg-mime query default x-scheme-handler/http 2>/dev/null', { encoding: 'utf8' }).trim().toLowerCase();
        if (currentMime.includes('napture')) {
          return true;
        }
      } catch (e) {}
      try {
        const gioMime = execSync('gio mime x-scheme-handler/http 2>/dev/null', { encoding: 'utf8' }).toLowerCase();
        if (gioMime.includes('napture.desktop')) {
          return true;
        }
      } catch (e) {}
    }
    return false;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('make-default-browser', async () => {
  try {
    if (process.platform === 'win32') {
      registerWindowsBrowser();
      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
          app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
        }
      } else {
        app.setAsDefaultProtocolClient('http');
        app.setAsDefaultProtocolClient('https');
      }
      shell.openExternal('ms-settings:defaultapps');
      return true;
    }

    if (process.platform === 'linux') {
      ensureLinuxDesktopFile();
      const desktopName = 'napture.desktop';
      const os = require('os');
      const homeDir = os.homedir();

      const mimeTargetFiles = [
        path.join(homeDir, '.config', 'mimeapps.list'),
        path.join(homeDir, '.config', 'kde-mimeapps.list'),
        path.join(homeDir, '.config', 'kdedefaults', 'mimeapps.list'),
        path.join(homeDir, '.config', 'kdedefaults', 'kde-mimeapps.list'),
        path.join(homeDir, '.local', 'share', 'applications', 'mimeapps.list')
      ];

      for (const mimePath of mimeTargetFiles) {
        try {
          fs.mkdirSync(path.dirname(mimePath), { recursive: true });
          let content = fs.existsSync(mimePath) ? fs.readFileSync(mimePath, 'utf8') : '';
          const lines = content.split(/\r?\n/);
          const defaultLines = [];
          const addedLines = [];
          let currentSection = '';

          for (const l of lines) {
            const trim = l.trim();
            if (trim.startsWith('[')) {
              currentSection = trim;
            } else if (currentSection === '[Default Applications]') {
              if (!trim.startsWith('x-scheme-handler/http') &&
                  !trim.startsWith('x-scheme-handler/https') &&
                  !trim.startsWith('text/html') &&
                  !trim.startsWith('application/xhtml+xml') &&
                  trim.length > 0) {
                defaultLines.push(trim);
              }
            } else if (currentSection === '[Added Associations]') {
              if (!trim.startsWith('x-scheme-handler/http') &&
                  !trim.startsWith('x-scheme-handler/https') &&
                  !trim.startsWith('text/html') &&
                  !trim.startsWith('application/xhtml+xml') &&
                  trim.length > 0) {
                addedLines.push(trim);
              }
            }
          }

          defaultLines.unshift(
            `x-scheme-handler/http=${desktopName}`,
            `x-scheme-handler/https=${desktopName}`,
            `text/html=${desktopName}`,
            `application/xhtml+xml=${desktopName}`
          );

          addedLines.unshift(
            `x-scheme-handler/http=${desktopName};`,
            `x-scheme-handler/https=${desktopName};`,
            `text/html=${desktopName};`,
            `application/xhtml+xml=${desktopName};`
          );

          const isDesktopSpecific = path.basename(mimePath).includes('kde-');
          const out = isDesktopSpecific
            ? `[Default Applications]\n${defaultLines.join('\n')}\n`
            : `[Default Applications]\n${defaultLines.join('\n')}\n\n[Added Associations]\n${addedLines.join('\n')}\n`;
          fs.writeFileSync(mimePath, out, 'utf8');
        } catch (e) {}
      }

      const { execSync } = require('child_process');
      // KDE Plasma
      try { execSync(`kwriteconfig6 --file kdeglobals --group General --key BrowserApplication ${desktopName} 2>/dev/null || true`); } catch (e) {}
      try { execSync(`kwriteconfig5 --file kdeglobals --group General --key BrowserApplication ${desktopName} 2>/dev/null || true`); } catch (e) {}

      // GIO / GNOME
      try {
        execSync(`gio mime x-scheme-handler/http ${desktopName} 2>/dev/null || true`);
        execSync(`gio mime x-scheme-handler/https ${desktopName} 2>/dev/null || true`);
        execSync(`gio mime text/html ${desktopName} 2>/dev/null || true`);
      } catch (e) {}

      // XDG
      try {
        execSync(`xdg-settings set default-web-browser ${desktopName} 2>/dev/null || true`);
        execSync(`xdg-mime default ${desktopName} x-scheme-handler/http x-scheme-handler/https text/html application/xhtml+xml 2>/dev/null || true`);
      } catch (e) {}

      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
          app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
        }
      } else {
        app.setAsDefaultProtocolClient('http');
        app.setAsDefaultProtocolClient('https');
      }
      return true;
    }

    // macOS & other platforms
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
        app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');
    }
    return app.isDefaultProtocolClient('http');
  } catch (e) {
    console.error('Failed to set Napture as default browser:', e);
    return false;
  }
});

ipcMain.handle('save-setting', (event, { key, value }) => {
  const res = setSetting(key, value);
  setSetting('settings_last_modified', Date.now());
  if (key === 'performanceMode') {
    setSetting('batterySaver', value === 'battery_saver');
    applyPerformanceMode(value);
  }
  if (key === 'batterySaver') {
    const derived = value ? 'battery_saver' : 'balanced';
    setSetting('performanceMode', derived);
    applyPerformanceMode(derived);
  }
  if (key === 'spellCheck' && session.defaultSession) {
    try { session.defaultSession.setSpellCheckerEnabled(Boolean(value)); } catch (e) {}
  }
  if (key === 'defaultZoom') {
    const factor = parseInt(value, 10) / 100;
    if (!isNaN(factor) && typeof tabViews !== 'undefined') {
      for (const view of tabViews.values()) {
        if (view && view.webContents && !view.webContents.isDestroyed()) {
          view.webContents.setZoomFactor(factor);
        }
      }
    }
  }
  broadcastSettingChanged(key, value);
  if (typeof scheduleDebouncedSyncPush === 'function') {
    scheduleDebouncedSyncPush();
  }
  return res;
});

ipcMain.handle('save-all-settings', (event, settings) => {
  const res = saveAllSettings(settings);
  setSetting('settings_last_modified', Date.now());
  if (settings) {
    if (settings.performanceMode !== undefined) {
      applyPerformanceMode(settings.performanceMode);
    } else if (settings.batterySaver !== undefined) {
      applyPerformanceMode(settings.batterySaver ? 'battery_saver' : 'balanced');
    }
    if (settings.spellCheck !== undefined && session.defaultSession) {
      try { session.defaultSession.setSpellCheckerEnabled(Boolean(settings.spellCheck)); } catch (e) {}
    }
  }
  broadcastSettingChanged('ALL', settings);
  if (typeof scheduleDebouncedSyncPush === 'function') {
    scheduleDebouncedSyncPush();
  }
  return res;
});

ipcMain.handle('select-download-directory', async () => {
  const res = await dialog.showOpenDialog(settingsWindow || (BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0]), {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Download Location'
  });
  if (!res.canceled && res.filePaths.length > 0) {
    const pathSelected = res.filePaths[0];
    setSetting('downloadPath', pathSelected);
    const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (focusedWindow && !focusedWindow.isDestroyed()) {
      getMainWindow().webContents.send('setting-changed', { key: 'downloadPath', value: pathSelected });
    }
    return pathSelected;
  }
  return null;
});

let importerWindow = null;
let isImporting = false;

function getImporterHtml(logoBase64, browserName) {
  const browserTitles = {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    brave: 'Brave Browser',
    firefox: 'Mozilla Firefox',
    opera: 'Opera Browser',
    vivaldi: 'Vivaldi Browser',
    file: 'Bookmark File',
    all: 'Installed Browsers'
  };
  const titleName = browserTitles[(browserName || 'all').toLowerCase()] || (browserName || 'Browser');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Importing from ${titleName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-app: #0F0F14;
      --bg-card: rgba(18, 19, 26, 0.85);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-primary: #ffffff;
      --text-secondary: #a9b1d6;
      --text-muted: #8F90A6;
      --accent: #7f8cff;
      --accent-glow: rgba(127, 140, 255, 0.35);
      --font-main: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-app);
      color: var(--text-primary);
      font-family: var(--font-main);
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      user-select: none;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      -webkit-app-region: drag;
    }
    .importer-card {
      width: 88%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-app-region: no-drag;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px var(--accent-glow));
      animation: pulse 2.4s infinite ease-in-out;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.3px;
      line-height: 1.2;
    }
    .brand-author {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.2px;
    }
    .status-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .status-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 20px;
      min-height: 18px;
    }
    .progress-track {
      width: 100%;
      height: 8px;
      background: #171822;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 14px;
      position: relative;
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #6c7af7 0%, #7f8cff 50%, #9ca8ff 100%);
      box-shadow: 0 0 12px var(--accent-glow);
      border-radius: 4px;
      transition: width 0.2s cubic-bezier(0.1, 0.8, 0.1, 1);
    }
    .progress-fill.indeterminate {
      width: 40% !important;
      position: absolute;
      animation: indeterminate 1.4s infinite ease-in-out;
    }
    .metrics-row {
      display: flex;
      justify-content: space-between;
      width: 100%;
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        filter: drop-shadow(0 4px 12px var(--accent-glow));
      }
      50% {
        transform: scale(1.05);
        filter: drop-shadow(0 6px 20px rgba(127, 140, 255, 0.55));
      }
    }
    @keyframes indeterminate {
      0% { left: -40%; }
      100% { left: 100%; }
    }
  </style>
</head>
<body>
  <div class="importer-card">
    <div class="brand-group">
      ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" class="brand-logo" alt="Napture Logo" onerror="this.style.display='none'">` : ''}
      <div class="brand-text">
        <span class="brand-title">Napture</span>
        <span class="brand-author">| By nebuff</span>
      </div>
    </div>
    
    <div class="status-title" id="status-title">Importing from ${titleName}</div>
    <div class="status-subtitle" id="status-subtitle">Processing browser data...</div>
    
    <div class="progress-track">
      <div class="progress-fill indeterminate" id="progress-bar"></div>
    </div>

    <div class="metrics-row">
      <span id="speed-val">Reading profiles...</span>
      <span id="time-val">Please wait...</span>
    </div>
  </div>

  <script>
    const progressBar = document.getElementById('progress-bar');
    const statusTitle = document.getElementById('status-title');
    const statusSubtitle = document.getElementById('status-subtitle');
    const speedVal = document.getElementById('speed-val');
    const timeVal = document.getElementById('time-val');

    if (window.naptureAPI && window.naptureAPI.onImportProgress) {
      window.naptureAPI.onImportProgress((data) => {
        const { title, subtitle, count, isComplete } = data;
        if (title) statusTitle.textContent = title;
        if (subtitle) statusSubtitle.textContent = subtitle;
        if (count !== undefined) speedVal.textContent = count + ' Bookmarks';
        if (isComplete) {
          progressBar.classList.remove('indeterminate');
          progressBar.style.width = '100%';
          timeVal.textContent = 'Complete';
        }
      });
    }
  </script>
</body>
</html>`;
}

function createImporterWindow(browserName) {
  if (importerWindow && !importerWindow.isDestroyed()) {
    return Promise.resolve(importerWindow);
  }

  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString('base64');
    }
  } catch (e) {}

  importerWindow = new BrowserWindow({
    width: 460,
    height: 320,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0F0F14',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  importerWindow.on('closed', () => {
    importerWindow = null;
  });

  const importerHtmlPath = path.join(app.getPath('userData'), 'importer.html');
  fs.writeFileSync(importerHtmlPath, getImporterHtml(logoBase64, browserName), 'utf8');
  importerWindow.loadFile(importerHtmlPath);

  return new Promise((resolve) => {
    const onReady = () => {
      if (importerWindow && !importerWindow.isDestroyed()) {
        importerWindow.show();
      }
      setTimeout(() => resolve(importerWindow), 150);
    };

    if (importerWindow.webContents.isLoading()) {
      importerWindow.once('ready-to-show', onReady);
    } else {
      onReady();
    }
  });
}

ipcMain.handle('import-bookmarks-file', async (event, customFilePath) => {
  const { parseBookmarkFile } = require('./bookmark-parser');
  let filePath = customFilePath;

  if (!filePath) {
    const focusedWindow = BrowserWindow.getFocusedWindow() || (typeof getMainWindow === 'function' ? getMainWindow() : null);
    const res = await dialog.showOpenDialog(focusedWindow || undefined, {
      title: 'Import Bookmarks File',
      properties: ['openFile'],
      filters: [
        { name: 'Bookmark Files (*.html, *.htm, *.json)', extensions: ['html', 'htm', 'json'] },
        { name: 'HTML Files (*.html, *.htm)', extensions: ['html', 'htm'] },
        { name: 'JSON Files (*.json)', extensions: ['json'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { success: false, canceled: true, importedBookmarksCount: 0 };
    }
    filePath = res.filePaths[0];
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File does not exist', importedBookmarksCount: 0 };
  }

  // 1. Open importer window first and wait until completely loaded and painted
  isImporting = true;
  const impWin = await createImporterWindow('file');
  await new Promise(r => setTimeout(r, 100));

  // 2. Close main and settings windows so main process frees memory & webviews
  const activeMainWindows = Array.from(browserWindows);
  activeMainWindows.forEach(win => { if (win && win !== impWin && !win.isDestroyed()) win.close(); });
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();

  try {
    await new Promise(r => setTimeout(r, 20));
    const content = await fs.promises.readFile(filePath, 'utf8');
    const nodes = parseBookmarkFile(content);
    if (!nodes || nodes.length === 0) {
      if (impWin && !impWin.isDestroyed()) impWin.close();
      isImporting = false;
      createBrowserWindow();
      return { success: false, error: 'No valid bookmarks found in specified file', importedBookmarksCount: 0 };
    }

    const { addBookmarksBatch, setSetting } = require('./db/history');
    const importedCount = addBookmarksBatch(nodes, 0);
    setSetting('bookmarks_last_modified', Date.now());

    if (impWin && !impWin.isDestroyed()) {
      impWin.webContents.send('import-progress', {
        title: 'Import Completed',
        subtitle: `Successfully imported ${importedCount} bookmarks from file!`,
        count: importedCount,
        isComplete: true
      });
    }

    await new Promise(r => setTimeout(r, 1400));
    if (impWin && !impWin.isDestroyed()) impWin.close();

    // Re-open fresh main window
    isImporting = false;
    const newMainWin = createBrowserWindow();
    if (newMainWin && newMainWin.webContents) {
      newMainWin.webContents.once('did-finish-load', () => {
        newMainWin.webContents.send('browser-data-imported', {
          browser: 'File',
          importedBookmarks: nodes,
          importedBookmarksCount: importedCount,
          importedHistoryCount: 0
        });
      });
    }

    return {
      success: true,
      browser: 'File',
      importedBookmarks: nodes,
      importedBookmarksCount: importedCount,
      importedHistoryCount: 0,
      importedCount: importedCount
    };
  } catch (e) {
    console.error('Error importing bookmarks file:', e);
    if (impWin && !impWin.isDestroyed()) impWin.close();
    isImporting = false;
    createBrowserWindow();
    return { success: false, error: e.message, importedBookmarksCount: 0 };
  }
});

ipcMain.handle('import-browser-data', async (event, browserName) => {
  const os = require('os');
  const Database = require('better-sqlite3');
  const winAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';
  const homeDir = os.homedir();
  const osTemp = os.tmpdir();
  const platform = process.platform;

  // 1. Open dedicated importer window first and wait until completely painted
  isImporting = true;
  const impWin = await createImporterWindow(browserName);
  await new Promise(r => setTimeout(r, 100));

  // 2. Close main and settings windows to free resources and prevent not-responding freeze
  const activeMainWindows = Array.from(browserWindows);
  activeMainWindows.forEach(win => { if (win && win !== impWin && !win.isDestroyed()) win.close(); });
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();

  let bookmarkPaths = [];
  let historyPaths = [];
  let isFirefox = false;

  const browserLower = (browserName || 'chrome').toLowerCase();

  // Helper to resolve profiles for Chromium-based browsers
  const resolveChromiumPaths = (baseDir) => {
    if (!baseDir || !fs.existsSync(baseDir)) return;
    try {
      const subdirs = fs.readdirSync(baseDir);
      for (const d of subdirs) {
        const fullDir = path.join(baseDir, d);
        try {
          if (fs.statSync(fullDir).isDirectory()) {
            const bmFile = path.join(fullDir, 'Bookmarks');
            const histFile = path.join(fullDir, 'History');
            if (fs.existsSync(bmFile) && !bookmarkPaths.includes(bmFile)) bookmarkPaths.push(bmFile);
            if (fs.existsSync(histFile) && !historyPaths.includes(histFile)) historyPaths.push(histFile);
          }
        } catch (e) {}
      }
    } catch (e) {}
  };

  const resolveAllBrowserPaths = () => {
    if (platform === 'win32') {
      resolveChromiumPaths(path.join(winAppData, 'Google', 'Chrome', 'User Data'));
      resolveChromiumPaths(path.join(appData, 'Google', 'Chrome', 'User Data'));
      resolveChromiumPaths(path.join(winAppData, 'Microsoft', 'Edge', 'User Data'));
      resolveChromiumPaths(path.join(winAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'));
      resolveChromiumPaths(path.join(appData, 'Opera Software', 'Opera Stable'));
      resolveChromiumPaths(path.join(appData, 'Opera Software', 'Opera GX Stable'));
      resolveChromiumPaths(path.join(winAppData, 'Vivaldi', 'User Data'));
      resolveChromiumPaths(path.join(winAppData, 'Arc', 'User Data'));
    } else if (platform === 'darwin') {
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'com.operasoftware.Opera'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Vivaldi'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Arc', 'User Data'));
    } else {
      resolveChromiumPaths(path.join(homeDir, '.config', 'google-chrome'));
      resolveChromiumPaths(path.join(homeDir, '.config', 'microsoft-edge'));
      resolveChromiumPaths(path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'));
      resolveChromiumPaths(path.join(homeDir, '.config', 'vivaldi'));
    }
  };

  if (browserLower === 'chrome') {
    if (platform === 'win32') {
      resolveChromiumPaths(path.join(winAppData, 'Google', 'Chrome', 'User Data'));
      resolveChromiumPaths(path.join(appData, 'Google', 'Chrome', 'User Data'));
      resolveChromiumPaths(path.join(winAppData, 'Chromium', 'User Data'));
      resolveChromiumPaths(path.join(winAppData, 'Google', 'Chrome SxS', 'User Data'));
    } else if (platform === 'darwin') {
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome'));
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Chromium'));
    } else {
      resolveChromiumPaths(path.join(homeDir, '.config', 'google-chrome'));
      resolveChromiumPaths(path.join(homeDir, '.config', 'chromium'));
    }
  } else if (browserLower === 'edge') {
    if (platform === 'win32') resolveChromiumPaths(path.join(winAppData, 'Microsoft', 'Edge', 'User Data'));
    else if (platform === 'darwin') resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Microsoft Edge'));
    else resolveChromiumPaths(path.join(homeDir, '.config', 'microsoft-edge'));
  } else if (browserLower === 'brave') {
    if (platform === 'win32') resolveChromiumPaths(path.join(winAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'));
    else if (platform === 'darwin') resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'));
    else resolveChromiumPaths(path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'));
  } else if (browserLower === 'opera') {
    if (platform === 'win32') {
      resolveChromiumPaths(path.join(appData, 'Opera Software', 'Opera Stable'));
      resolveChromiumPaths(path.join(appData, 'Opera Software', 'Opera GX Stable'));
    } else if (platform === 'darwin') {
      resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'com.operasoftware.Opera'));
    }
  } else if (browserLower === 'vivaldi') {
    if (platform === 'win32') resolveChromiumPaths(path.join(winAppData, 'Vivaldi', 'User Data'));
    else if (platform === 'darwin') resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Vivaldi'));
    else resolveChromiumPaths(path.join(homeDir, '.config', 'vivaldi'));
  } else if (browserLower === 'arc') {
    if (platform === 'win32') resolveChromiumPaths(path.join(winAppData, 'Arc', 'User Data'));
    else if (platform === 'darwin') resolveChromiumPaths(path.join(homeDir, 'Library', 'Application Support', 'Arc', 'User Data'));
  } else if (browserLower === 'firefox') {
    isFirefox = true;
  } else {
    resolveAllBrowserPaths();
  }

  await new Promise(r => setTimeout(r, 20));

  let importedBookmarksCount = 0;
  let importedHistoryCount = 0;
  let importedBookmarkNodes = [];

  const { addBookmark, addBookmarksBatch, addHistory } = require('./db/history');
  const { parseBookmarkJson } = require('./bookmark-parser');

  const processChromiumBookmarks = async () => {
    for (const bPath of bookmarkPaths) {
      if (fs.existsSync(bPath)) {
        try {
          const raw = await fs.promises.readFile(bPath, 'utf8');
          const nodes = parseBookmarkJson(raw);
          if (nodes && nodes.length > 0) {
            const count = addBookmarksBatch(nodes, 0);
            importedBookmarksCount += count;
            importedBookmarkNodes.push(...nodes);
          }
        } catch (e) {
          console.error('Failed reading chromium bookmarks:', e);
        }
      }
    }
  };

  if (!isFirefox) {
    await processChromiumBookmarks();
    if (importedBookmarksCount === 0) {
      resolveAllBrowserPaths();
      await processChromiumBookmarks();
    }

    // 2. Process History for Chromium-based browsers
    for (const hPath of historyPaths) {
      if (fs.existsSync(hPath)) {
        const tmpFile = path.join(osTemp, `napture_import_hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.db`);
        try {
          fs.copyFileSync(hPath, tmpFile);
          const tempDb = new Database(tmpFile, { readonly: true });
          const rows = tempDb.prepare(`
            SELECT url, title, visit_count
            FROM urls
            WHERE url IS NOT NULL
              AND url NOT LIKE 'chrome%'
              AND url NOT LIKE 'edge%'
              AND url NOT LIKE 'about%'
            ORDER BY last_visit_time DESC
            LIMIT 1500
          `).all();
          tempDb.close();

          for (const row of rows) {
            if (row.url) {
              addHistory(row.url, row.title || row.url, '');
              importedHistoryCount++;
            }
          }
        } catch (e) {
          console.error('Failed reading chromium history db:', e);
        } finally {
          try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
        }
        if (importedHistoryCount > 0) break;
      }
    }
  } else {
    // Firefox
    const ffSearchRoots = [];
    if (platform === 'win32') {
      if (appData) ffSearchRoots.push(path.join(appData, 'Mozilla', 'Firefox'));
      if (winAppData) ffSearchRoots.push(path.join(winAppData, 'Mozilla', 'Firefox'));
    } else if (platform === 'darwin') {
      ffSearchRoots.push(path.join(homeDir, 'Library', 'Application Support', 'Firefox'));
      ffSearchRoots.push(path.join(homeDir, 'Library', 'Mozilla', 'Firefox'));
    } else {
      // Linux: Modern XDG standard (~/.config) + legacy (~/.mozilla) + Flatpak + Snap
      ffSearchRoots.push(path.join(homeDir, '.config', 'mozilla', 'firefox'));
      ffSearchRoots.push(path.join(homeDir, '.mozilla', 'firefox'));
      ffSearchRoots.push(path.join(homeDir, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'));
      ffSearchRoots.push(path.join(homeDir, '.var', 'app', 'org.mozilla.firefox', '.config', 'mozilla', 'firefox'));
      ffSearchRoots.push(path.join(homeDir, 'snap', 'firefox', 'common', '.mozilla', 'firefox'));
    }

    const candidateProfiles = [];

    for (const rootDir of ffSearchRoots) {
      if (!fs.existsSync(rootDir)) continue;

      // 1. Check profiles.ini in rootDir to prioritize default profile
      const iniFile = path.join(rootDir, 'profiles.ini');
      if (fs.existsSync(iniFile)) {
        try {
          const iniText = await fs.promises.readFile(iniFile, 'utf8');
          const lines = iniText.split(/\r?\n/);
          let currentPath = '';
          let isRel = true;
          let isDefault = false;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('[')) {
              if (currentPath) {
                const fullP = isRel ? path.join(rootDir, currentPath) : currentPath;
                if (isDefault) candidateProfiles.unshift(fullP);
                else if (!candidateProfiles.includes(fullP)) candidateProfiles.push(fullP);
              }
              currentPath = '';
              isRel = true;
              isDefault = false;
            } else if (trimmed.startsWith('Path=')) {
              currentPath = trimmed.substring(5).trim();
            } else if (trimmed.startsWith('IsRelative=')) {
              isRel = trimmed.substring(11).trim() === '1';
            } else if (trimmed.startsWith('Default=1')) {
              isDefault = true;
            }
          }
          if (currentPath) {
            const fullP = isRel ? path.join(rootDir, currentPath) : currentPath;
            if (isDefault) candidateProfiles.unshift(fullP);
            else if (!candidateProfiles.includes(fullP)) candidateProfiles.push(fullP);
          }
        } catch (e) {}
      }

      // Also check subdirectories directly (e.g. Profiles/ or *.default-release)
      try {
        const subs = fs.readdirSync(rootDir);
        for (const sub of subs) {
          const p = path.join(rootDir, sub);
          try {
            if (fs.statSync(p).isDirectory() && !candidateProfiles.includes(p)) {
              candidateProfiles.push(p);
            }
          } catch (e) {}
        }
      } catch (e) {}

      const subProfilesDir = path.join(rootDir, 'Profiles');
      if (fs.existsSync(subProfilesDir)) {
        try {
          const subs = fs.readdirSync(subProfilesDir);
          for (const sub of subs) {
            const p = path.join(subProfilesDir, sub);
            try {
              if (fs.statSync(p).isDirectory() && !candidateProfiles.includes(p)) {
                candidateProfiles.push(p);
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    const { parseFirefoxPlacesTree } = require('./bookmark-parser');

    for (const profDir of candidateProfiles) {
      const placesPath = path.join(profDir, 'places.sqlite');
      if (fs.existsSync(placesPath)) {
        const tmpFile = path.join(osTemp, `napture_import_ff_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.db`);
        try {
          fs.copyFileSync(placesPath, tmpFile);
          const tempDb = new Database(tmpFile, { readonly: true });

          const { bookmarkNodes, historyRows } = parseFirefoxPlacesTree(tempDb);
          tempDb.close();

          if (historyRows && historyRows.length > 0) {
            for (const h of historyRows) {
              addHistory(h.url, h.title, '');
              importedHistoryCount++;
            }
          }

          if (bookmarkNodes && bookmarkNodes.length > 0) {
            const count = addBookmarksBatch(bookmarkNodes, 0);
            importedBookmarksCount += count;
            importedBookmarkNodes.push(...bookmarkNodes);
          }
        } catch (e) {
          console.error('Failed reading firefox places.sqlite:', e);
        } finally {
          try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
        }

        if (importedBookmarksCount > 0 || importedHistoryCount > 0) {
          break;
        }
      }
    }
  }

  const totalCount = importedBookmarksCount + importedHistoryCount;

  // 3. Show completion status on importer window
  if (impWin && !impWin.isDestroyed()) {
    const subtitleMsg = totalCount > 0
      ? `Successfully imported ${importedBookmarksCount} bookmarks and ${importedHistoryCount} history items!`
      : `No bookmarks or history found to import.`;
    impWin.webContents.send('import-progress', {
      title: totalCount > 0 ? 'Import Completed' : 'Import Finished',
      subtitle: subtitleMsg,
      count: totalCount,
      isComplete: true
    });
  }

  await new Promise(r => setTimeout(r, 1400));

  if (impWin && !impWin.isDestroyed()) {
    impWin.close();
  }

  // 4. Open fresh main window
  isImporting = false;
  const newMainWin = createBrowserWindow();
  if (newMainWin && newMainWin.webContents) {
    newMainWin.webContents.once('did-finish-load', () => {
      newMainWin.webContents.send('browser-data-imported', {
        browser: browserName,
        importedBookmarks: importedBookmarkNodes,
        importedBookmarksCount,
        importedHistoryCount
      });
    });
  }

  return {
    success: true,
    browser: browserName,
    importedBookmarks: importedBookmarkNodes,
    importedBookmarksCount,
    importedHistoryCount,
    importedCount: totalCount
  };
});

ipcMain.handle('add-bookmark', (event, { title, url, parentId, isFolder }) => {
  return require('./db/history').addBookmark(title, url, parentId, isFolder);
});
ipcMain.handle('remove-bookmark', (event, id) => {
  return require('./db/history').removeBookmark(id);
});
ipcMain.handle('get-bookmarks', () => {
  return require('./db/history').getBookmarks();
});

function isWelcomeUrl(url) {
  if (!url) return true;
  const clean = url.trim().toLowerCase().replace(/\/+$/, '');
  return (
    clean === '' ||
    clean === 'about:blank' ||
    clean === 'napture:' ||
    clean === 'napture://' ||
    clean === 'napture://welcome' ||
    clean === 'napture://start' ||
    clean === 'napture://newtab' ||
    clean === 'ne:' ||
    clean === 'ne://' ||
    clean === 'ne://welcome' ||
    clean === 'ne://start' ||
    clean === 'ne://newtab' ||
    clean === 'about:welcome' ||
    clean === 'about:start' ||
    clean === 'about:newtab'
  );
}

function saveCurrentSessionFromMain() {
  try {
    const tabsToSave = [];
    for (const win of browserWindows) {
      if (!win || win.isDestroyed()) continue;
      const state = getWindowState(win);
      if (!state || state.isDetached || !state.tabs) continue;

      for (const tabId of state.tabs) {
        const view = tabViews.get(tabId);
        if (!view || !view.webContents || view.webContents.isDestroyed()) continue;
        const rawUrl = view.webContents.getURL();
        if (!rawUrl || isWelcomeUrl(rawUrl)) continue;
        const title = view.webContents.getTitle() || 'New Tab';
        tabsToSave.push({
          id: tabId,
          url: rawUrl,
          title: title,
          isPinned: 0
        });
      }
    }

    if (tabsToSave.length > 0) {
      require('./db/history').saveSession(tabsToSave);
    }
  } catch (e) {
    console.error('Error in saveCurrentSessionFromMain:', e);
  }
}

ipcMain.handle('save-session', (event, tabs) => {
  return require('./db/history').saveSession(tabs);
});
ipcMain.handle('load-session', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getWindowState(win);
  if (state && state.isDetached) {
    return [];
  }
  return require('./db/history').loadSession();
});

ipcMain.handle('clear-browsing-data', async (event, options = {}) => {
  if (options.history) {
    clearAllHistory();
  }
  if (options.cookies || options.cache) {
    const types = [];
    if (options.cookies) {
      types.push('cookies', 'localStorage', 'sessionStorage');
      if (syncEngine && typeof syncEngine.resetCookiesSyncState === 'function') {
        syncEngine.resetCookiesSyncState();
      }
    }
    if (options.cache) types.push('appcache', 'shadercache', 'cachestorage', 'serviceworkers');
    const { session } = require('electron');
    if (session && session.defaultSession) {
      await session.defaultSession.clearStorageData({ storages: types });
      if (options.cookies) {
        try { await session.defaultSession.cookies.flushStore(); } catch (e) {}
      }
      if (options.cache) {
        try {
          await session.defaultSession.clearCache();
          await session.defaultSession.clearHostResolverCache();
        } catch (e) {}
      }
    }
  }
  if (options.downloads) {
    downloadHistory = [];
    saveDownloadHistory();
  }
  return true;
});

function getDefaultSettings() {
  return {
    profileName: 'Default User',
    theme: 'dark',
    dynamicBackground: true,
    roundedCorners: true,
    enableAnimations: true,
    showHomeBtn: true,
    homeUrl: 'napture://welcome',
    toolbarLayout: JSON.stringify([
      { id: 'home-btn', type: 'system', name: 'Home Button', enabled: true },
      { id: 'sep-1', type: 'separator', name: 'Fixed Separator', enabled: true },
      { id: 'back-btn', type: 'system', name: 'Back Button', enabled: true },
      { id: 'forward-btn', type: 'system', name: 'Forward Button', enabled: true },
      { id: 'reload-btn', type: 'system', name: 'Reload Button', enabled: true },
      { id: 'margin-1', type: 'margin', name: 'Flexible Space', enabled: true },
      { id: 'address-container', type: 'system', name: 'Address Bar & Search', enabled: true }
    ]),
    sidebarBottomLayout: JSON.stringify([
      { id: 'downloads-btn', type: 'system', name: 'Recent Downloads', enabled: true },
      { id: 'history-btn', type: 'system', name: 'Browsing History', enabled: true },
      { id: 'newtab-btn', type: 'system', name: 'New Tab', enabled: true }
    ]),
    defaultZoom: '100',
    folderHoverOpen: false,
    switchToExistingTab: true,
    fontFamily: 'Inter, Outfit, sans-serif',
    fontSize: 'medium',
    searchEngine: 'napture',
    addressSuggestions: true,
    showFullUrl: false,
    safeBrowsing: 'standard',
    blockCookies: 'incognito',
    doNotTrack: false,
    httpsOnly: false,
    startupMode: 'restore_all',
    downloadPath: app.getPath('downloads'),
    askSaveLocation: false,
    showDownloadsOverlay: true,
    language: 'en-US',
    spellCheck: true,
    offerTranslate: true,
    memorySaver: false,
    memoryTarget: 700,
    batterySaver: false,
    performanceMode: 'balanced',
    hardwareAcceleration: true,
    liveCaptions: false,
    caretBrowsing: false,
    highContrastOutline: false
  };
}

ipcMain.handle('reset-all-settings', () => {
  const defaults = getDefaultSettings();
  resetAllSettings(defaults);
  const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    getMainWindow().webContents.send('setting-changed', { key: 'ALL_RESET', value: defaults });
  }
  return defaults;
});

ipcMain.handle('reset-all-data', async () => {
  const defaults = getDefaultSettings();
  resetAllData(defaults);

  // Clear download history
  downloadHistory = [];
  saveDownloadHistory();

  // Reset cookie sync state
  if (syncEngine && typeof syncEngine.resetCookiesSyncState === 'function') {
    syncEngine.resetCookiesSyncState();
  }

  // Clear session storage data (cookies, storage, cache)
  const { session } = require('electron');
  if (session && session.defaultSession) {
    try {
      await session.defaultSession.clearStorageData({
        storages: ['cookies', 'localStorage', 'sessionStorage', 'appcache', 'shadercache', 'cachestorage', 'serviceworkers', 'indexdb', 'websql']
      });
      await session.defaultSession.cookies.flushStore();
      await session.defaultSession.clearCache();
      await session.defaultSession.clearHostResolverCache();
    } catch (e) {
      console.error('Error clearing session storage data:', e);
    }
  }

  // Reset tab views and state across all open browser windows
  if (typeof browserWindows !== 'undefined' && browserWindows) {
    for (const win of browserWindows) {
      if (!win || win.isDestroyed()) continue;
      const state = getWindowState(win);
      if (state) {
        for (const tabId of Array.from(state.tabs)) {
          const view = tabViews.get(tabId);
          if (view) {
            try {
              if (state.activeTabId === tabId) {
                win.contentView.removeChildView(view);
              }
              view.webContents.destroy();
            } catch (err) {}
            tabViews.delete(tabId);
          }
        }
        state.tabs.clear();
        state.mruTabs = [];
        state.pinnedTabs.clear();
        state.activeTabId = null;
      }
      if (!win.isDestroyed()) {
        win.webContents.send('reset-all-completed');
        win.webContents.send('setting-changed', { key: 'ALL_RESET', value: defaults });
      }
    }
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('reset-all-completed');
    settingsWindow.webContents.send('setting-changed', { key: 'ALL_RESET', value: defaults });
  }

  return defaults;
});

ipcMain.handle('optimize-database', () => {
  return optimizeDatabase();
});

function calculateRemainingTimeStr(receivedBytes, totalBytes, startTime) {
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  if (elapsedSeconds <= 0 || receivedBytes <= 0 || totalBytes <= 0) return 'Calculating...';
  const speed = receivedBytes / elapsedSeconds;
  const remainingBytes = totalBytes - receivedBytes;
  if (remainingBytes <= 0) return 'Finishing...';
  const remainingSeconds = Math.ceil(remainingBytes / speed);
  if (remainingSeconds < 60) return `${remainingSeconds}s left`;
  if (remainingSeconds < 3600) return `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s left`;
  return `${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m left`;
}

function loadDownloadHistory() {
  try {
    const data = fs.readFileSync(downloadHistoryPath(), 'utf8');
    downloadHistory = JSON.parse(data);
  } catch (err) {
    downloadHistory = [];
  }
}

function saveDownloadHistory() {
  try {
    fs.writeFileSync(downloadHistoryPath(), JSON.stringify(downloadHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save download history', err);
  }
}

function broadcastDownloadUpdated() {
  try {
    const electronModule = require('electron');
    const wcModule = (typeof webContents !== 'undefined' && webContents) || (electronModule && electronModule.webContents);
    const allContents = (wcModule && typeof wcModule.getAllWebContents === 'function')
      ? wcModule.getAllWebContents()
      : [];
    for (const wc of allContents) {
      try {
        if (wc && typeof wc.isDestroyed === 'function' && !wc.isDestroyed()) {
          wc.send('download-updated', downloadHistory);
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('Failed to broadcast download update:', e);
  }
}

ipcMain.handle('get-file-icon', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return null;
  try {
    if (app && typeof app.getFileIcon === 'function') {
      const nativeImg = await app.getFileIcon(filePath, { size: 'normal' });
      if (nativeImg && !nativeImg.isEmpty()) {
        return nativeImg.toDataURL();
      }
    }
  } catch (e) {}
  return null;
});

ipcMain.handle('get-recent-downloads', () => {
  return downloadHistory;
});

ipcMain.handle('pause-download', (event, id) => {
  const item = activeDownloadItems.get(id);
  if (item && !item.isPaused()) {
    try { item.pause(); } catch (e) {}
    const record = downloadHistory.find(i => i.id === id);
    if (record) {
      record.paused = true;
      record.timeStr = 'Paused';
    }
    broadcastDownloadUpdated();
    return true;
  }
  return false;
});

ipcMain.handle('resume-download', (event, id) => {
  const item = activeDownloadItems.get(id);
  if (item && item.isPaused()) {
    try { item.resume(); } catch (e) {}
    const record = downloadHistory.find(i => i.id === id);
    if (record) {
      record.paused = false;
      record.timeStr = 'Resuming...';
    }
    broadcastDownloadUpdated();
    return true;
  }
  return false;
});

ipcMain.handle('cancel-download', (event, id) => {
  const item = activeDownloadItems.get(id);
  if (item) {
    try { item.cancel(); } catch (e) {}
    activeDownloadItems.delete(id);
  }
  const record = downloadHistory.find(i => i.id === id);
  if (record) {
    record.cancelled = true;
    record.completed = false;
    record.paused = false;
    record.timeStr = 'Cancelled';
  }
  saveDownloadHistory();
  broadcastDownloadUpdated();
  return true;
});

ipcMain.handle('clear-downloads-history', () => {
  downloadHistory = downloadHistory.filter(item => !item.completed && !item.cancelled);
  saveDownloadHistory();
  broadcastDownloadUpdated();
  return true;
});

ipcMain.handle('delete-download-item', (event, id) => {
  downloadHistory = downloadHistory.filter(i => i.id !== id);
  saveDownloadHistory();
  broadcastDownloadUpdated();
  return true;
});

ipcMain.handle('open-downloads-folder', () => {
  const configuredDir = getSetting('downloadPath', app.getPath('downloads'));
  const targetDir = fs.existsSync(configuredDir) ? configuredDir : app.getPath('downloads');
  shell.openPath(targetDir);
  return true;
});

ipcMain.handle('get-history', (event, query) => {
  return searchHistory(query);
});

ipcMain.handle('delete-history-item', (event, id) => {
  return deleteHistoryItem(id);
});

ipcMain.handle('delete-history-items', (event, ids) => {
  return deleteHistoryItems(ids);
});

ipcMain.handle('clear-all-history', () => {
  return clearAllHistory();
});

// --- Napture Zero-Knowledge Sync IPC Handlers ---
async function getCookiesForSync() {
  try {
    const { session } = require('electron');
    if (session && session.defaultSession) {
      const cookies = await session.defaultSession.cookies.get({});
      return cookies.map(c => {
        const domainClean = (c.domain || '').replace(/^\./, '');
        const protocol = c.secure ? 'https://' : 'http://';
        const url = domainClean ? `${protocol}${domainClean}${c.path || '/'}` : 'http://localhost/';
        return {
          url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          hostOnly: Boolean(c.hostOnly),
          path: c.path || '/',
          secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly),
          session: Boolean(c.session),
          expirationDate: c.expirationDate,
          sameSite: (['unspecified', 'no_restriction', 'lax', 'strict'].includes(c.sameSite)) ? c.sameSite : 'unspecified'
        };
      });
    }
  } catch (e) {
    console.error('Failed to get cookies for sync:', e);
  }
  return [];
}

let isImportingCookies = false;
async function applyCookiesFromSync(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) return;
  const { session } = require('electron');
  if (!session || !session.defaultSession) return;

  isImportingCookies = true;
  try {
    for (const c of cookies) {
      if (!c || !c.name || (!c.domain && !c.url)) continue;
      const domainClean = (c.domain || '').replace(/^\./, '');
      const isHostOnly = Boolean(c.hostOnly || !c.domain);
      const isPrefixHost = c.name && c.name.startsWith('__Host-');
      const isPrefixSecure = c.name && c.name.startsWith('__Secure-');
      const isSecure = Boolean(c.secure) || isPrefixHost || isPrefixSecure || c.sameSite === 'no_restriction';
      const protocol = isSecure ? 'https://' : 'http://';
      const path = c.path || '/';
      const url = c.url || (domainClean ? `${protocol}${domainClean}${path.startsWith('/') ? path : '/' + path}` : 'http://localhost/');

      const cookieDetails = {
        url: url,
        name: c.name,
        value: c.value,
        path: path,
        secure: isSecure,
        httpOnly: Boolean(c.httpOnly),
        sameSite: (['unspecified', 'no_restriction', 'lax', 'strict'].includes(c.sameSite)) ? c.sameSite : 'unspecified'
      };

      // In Electron cookies.set, domain must NOT start with a dot, and must not be set for hostOnly or __Host- cookies
      if (!isHostOnly && !isPrefixHost && domainClean) {
        cookieDetails.domain = domainClean;
      }

      if (!c.session && typeof c.expirationDate === 'number' && c.expirationDate > (Date.now() / 1000)) {
        cookieDetails.expirationDate = c.expirationDate;
      }

      try {
        await session.defaultSession.cookies.set(cookieDetails);
      } catch (err) {
        try {
          delete cookieDetails.domain;
          await session.defaultSession.cookies.set(cookieDetails);
        } catch (e2) {}
      }
    }
    await session.defaultSession.cookies.flushStore();
  } catch (e) {
    console.error('Error applying synced cookies:', e);
  } finally {
    setTimeout(() => { isImportingCookies = false; }, 1000);
  }
}
syncEngine.setCookiesImporter(applyCookiesFromSync);

let userSyncDebounceTimer = null;
function scheduleDebouncedSyncPush() {
  clearTimeout(userSyncDebounceTimer);
  userSyncDebounceTimer = setTimeout(() => {
    syncEngine.pushData(getCookiesForSync).catch(() => {});
  }, 2000);
}
setHistoryChangeListener(scheduleDebouncedSyncPush);

ipcMain.handle('save-bookmarks-tree', (event, tree) => {
  if (Array.isArray(tree)) {
    const historyDb = require('./db/history');
    const now = Date.now();
    historyDb.setSetting('bookmarks_tree', tree);
    historyDb.setSetting('bookmarks_last_modified', now);
    try {
      historyDb.clearAllBookmarks();
      historyDb.addBookmarksBatch(tree, 0);
    } catch (e) {}
    scheduleDebouncedSyncPush();
  }
  return true;
});

ipcMain.handle('save-pinned-sites', (event, sites) => {
  if (Array.isArray(sites)) {
    const historyDb = require('./db/history');
    const now = Date.now();
    historyDb.setSetting('pinned_sites_sync', sites);
    historyDb.setSetting('pinned_sites_last_modified', now);
    scheduleDebouncedSyncPush();
  }
  return true;
});

// Configure real-time sync broadcast to all active windows
syncEngine.setSyncUpdateNotifier((data) => {
  const { BrowserWindow, session } = require('electron');
  if (data && data.importedSettings) {
    const s = data.importedSettings;
    if (s.spellCheck !== undefined && session && session.defaultSession) {
      try { session.defaultSession.setSpellCheckerEnabled(Boolean(s.spellCheck)); } catch (e) {}
    }
    if (s.language && session && session.defaultSession) {
      try { session.defaultSession.setSpellCheckerLanguages([s.language]); } catch (e) {}
    }
    if (s.performanceMode !== undefined) {
      applyPerformanceMode(s.performanceMode);
    } else if (s.batterySaver !== undefined) {
      applyPerformanceMode(s.batterySaver ? 'battery_saver' : 'balanced');
    }
    if (s.defaultZoom) {
      const factor = parseInt(s.defaultZoom, 10) / 100;
      if (!isNaN(factor) && typeof tabViews !== 'undefined') {
        for (const view of tabViews.values()) {
          if (view && view.webContents && !view.webContents.isDestroyed()) {
            view.webContents.setZoomFactor(factor);
          }
        }
      }
    }
    broadcastSettingChanged('ALL', getAllSettings());
  }

  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('browser-data-imported', data);
    }
  });
});

ipcMain.handle('sync:get-status', async () => {
  return await syncEngine.getSyncStatus();
});

ipcMain.handle('sync:init-group', async (event, name) => {
  return await syncEngine.initSyncGroup(name);
});

ipcMain.handle('sync:generate-code', async () => {
  return await syncEngine.generatePairingCode();
});

ipcMain.handle('sync:join-group', async (event, { code, name }) => {
  return await syncEngine.joinWithPairingCode(code, name);
});

ipcMain.handle('sync:unlink-device', async (event, deviceId) => {
  return await syncEngine.unlinkDevice(deviceId);
});

ipcMain.handle('sync:rename-device', async (event, { deviceId, name }) => {
  return await syncEngine.renameDevice(deviceId, name);
});

ipcMain.handle('sync:leave-group', () => {
  return syncEngine.leaveSyncGroup();
});

ipcMain.handle('sync:sync-now', async () => {
  return await syncEngine.syncData(getCookiesForSync);
});

ipcMain.handle('sync:set-option', (event, options) => {
  return syncEngine.setSyncOptions(options);
});

function resolveDownloadItemPath(itemData) {
  const configuredDir = getSetting('downloadPath', app.getPath('downloads'));
  const fallbackDir = fs.existsSync(configuredDir) ? configuredDir : app.getPath('downloads');
  if (!itemData) return { targetPath: null, fallbackDir };
  let targetPath = typeof itemData === 'string' ? itemData : itemData.path;
  if (!targetPath && itemData && itemData.name) {
    targetPath = path.join(fallbackDir, itemData.name);
  }
  return { targetPath, fallbackDir };
}

function handleOpenFile(itemData) {
  const { targetPath, fallbackDir } = resolveDownloadItemPath(itemData);
  if (targetPath && fs.existsSync(targetPath)) {
    shell.openPath(targetPath);
  } else {
    shell.openPath(fallbackDir);
  }
}

function handleShowInFolder(itemData) {
  const { targetPath, fallbackDir } = resolveDownloadItemPath(itemData);
  if (targetPath && fs.existsSync(targetPath)) {
    shell.showItemInFolder(targetPath);
  } else {
    shell.openPath(fallbackDir);
  }
}

ipcMain.on('open-downloaded-file', (event, itemData) => {
  handleOpenFile(itemData);
});

ipcMain.handle('open-downloaded-file', (event, itemData) => {
  handleOpenFile(itemData);
  return true;
});

ipcMain.on('show-downloaded-file-in-folder', (event, itemData) => {
  handleShowInFolder(itemData);
});

ipcMain.handle('show-downloaded-file-in-folder', (event, itemData) => {
  handleShowInFolder(itemData);
  return true;
});

ipcMain.on('toggle-omnibar-popup', (event, { type, rect }) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (!win || win.isDestroyed()) return;
  const state = getWindowState(win);
  if (!state) return;

  if (state.isOmnibarPopupVisible && state.activeOmnibarPopupType === type) {
    hideOmnibarPopup(win);
    return;
  }

  const isLight = !nativeTheme.shouldUseDarkColors;
  showOmnibarPopup(win, type, rect, isLight);
});

ipcMain.on('hide-omnibar-popup', (event) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (win && !win.isDestroyed()) {
    hideOmnibarPopup(win);
  }
});

ipcMain.on('set-omnibar-popup-height', (event, height) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (!win || win.isDestroyed()) return;
  const state = getWindowState(win);
  if (!state || !state.omnibarPopupView || !state.isOmnibarPopupVisible) return;

  const winContentBounds = win.getContentBounds ? win.getContentBounds() : win.getBounds();
  const currentBounds = state.omnibarPopupView.getBounds();
  const maxHeight = Math.max(100, winContentBounds.height - currentBounds.y - 12);
  const clampedHeight = Math.min(Math.max(Math.round(height), 80), maxHeight);

  state.omnibarPopupView.setBounds({
    x: currentBounds.x,
    y: currentBounds.y,
    width: currentBounds.width,
    height: clampedHeight
  });
});

ipcMain.on('omnibar-popup-action', (event, { action, data }) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (win && !win.isDestroyed()) {
    hideOmnibarPopup(win);
    if (action === 'open-download') {
      let targetPath = data && data.path;
      if (!targetPath && data && data.name) {
        targetPath = path.join(app.getPath('downloads'), data.name);
      }
      if (targetPath && fs.existsSync(targetPath)) {
        shell.openPath(targetPath);
      } else {
        shell.openPath(app.getPath('downloads'));
      }
    } else if (action === 'open-downloads-folder') {
      shell.openPath(app.getPath('downloads'));
    } else if (action === 'clear-downloads') {
      downloadHistory = [];
      saveDownloadHistory();
      win.webContents.send('download-updated', []);
    } else if (action === 'clear-history') {
      clearAllHistory();
      win.webContents.send('omnibar-popup-action', { action, data });
    } else {
      win.webContents.send('omnibar-popup-action', { action, data });
    }
  }
});

ipcMain.on('page-clicked', (event) => {
  const win = getWindowFromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
  if (win && !win.isDestroyed()) {
    hideContextMenu(win);
    hideOmnibarPopup(win);
    win.webContents.send('close-all-popups');
  }
});

// Broadcast close-all-popups when user clicks inside any WebContentsView page
app.on('web-contents-created', (event, contents) => {
  if (typeof contents.setMaxListeners === 'function') {
    contents.setMaxListeners(0);
  }

  // Prevent main browser windows from triggering close-all-popups on themselves
  if (BrowserWindow.fromWebContents(contents)) return;

  const isExcludedView = () => {
    for (const win of browserWindows) {
      if (win.isDestroyed()) continue;
      const state = getWindowState(win);
      if (state) {
        if (state.suggestionsView && !state.suggestionsView.webContents.isDestroyed() && state.suggestionsView.webContents === contents) return true;
        if (state.contextMenuView && !state.contextMenuView.webContents.isDestroyed() && state.contextMenuView.webContents === contents) return true;
        if (state.omnibarPopupView && !state.omnibarPopupView.webContents.isDestroyed() && state.omnibarPopupView.webContents === contents) return true;
      }
    }
    return false;
  };

  contents.on('before-input-event', (evt, input) => {
    if (input && input.type === 'keyDown' && input.key === 'Escape') {
      if (isExcludedView()) return;
      const focusedWindow = BrowserWindow.getFocusedWindow() || Array.from(browserWindows)[0];
      if (focusedWindow && !focusedWindow.isDestroyed()) {
        hideContextMenu(focusedWindow);
        hideOmnibarPopup(focusedWindow);
        focusedWindow.webContents.send('close-all-popups');
      }
    }
  });
});

function registerWindowsBrowser() {
  if (process.platform !== 'win32') return;

  const { spawn } = require('child_process');
  const appPath = process.execPath;
  const appName = "Napture";
  const appDescription = "Lightweight, cross-platform Chromium-based web browser";
  const iconPath = `${appPath},0`;
  
  const startMenuInternetKey = `HKCU\\Software\\Clients\\StartMenuInternet\\Napture`;
  
  let openCommand = `"${appPath}"`;
  let openCommandWithArg = `"${appPath}" "%1"`;
  if (process.defaultApp && process.argv.length >= 2) {
    const appDir = path.resolve(process.argv[1]);
    openCommand = `"${appPath}" "${appDir}"`;
    openCommandWithArg = `"${appPath}" "${appDir}" "%1"`;
  }

  const commands = [
    ['add', startMenuInternetKey, '/ve', '/t', 'REG_SZ', '/d', appName, '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities`, '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', appName, '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities`, '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', appDescription, '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities`, '/v', 'ApplicationIcon', '/t', 'REG_SZ', '/d', iconPath, '/f'],
    
    ['add', `${startMenuInternetKey}\\Capabilities\\FileAssociations`, '/v', '.htm', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\FileAssociations`, '/v', '.html', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\FileAssociations`, '/v', '.shtml', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\FileAssociations`, '/v', '.xht', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\FileAssociations`, '/v', '.xhtml', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    
    ['add', `${startMenuInternetKey}\\Capabilities\\URLAssociations`, '/v', 'http', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\URLAssociations`, '/v', 'https', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    ['add', `${startMenuInternetKey}\\Capabilities\\URLAssociations`, '/v', 'ftp', '/t', 'REG_SZ', '/d', 'NaptureHTML', '/f'],
    
    ['add', `${startMenuInternetKey}\\DefaultIcon`, '/ve', '/t', 'REG_SZ', '/d', iconPath, '/f'],
    ['add', `${startMenuInternetKey}\\shell\\open\\command`, '/ve', '/t', 'REG_SZ', '/d', openCommand, '/f'],
    
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML', '/ve', '/t', 'REG_SZ', '/d', 'Napture HTML Document', '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\Application', '/v', 'AppUserModelId', '/t', 'REG_SZ', '/d', 'com.napture.browser', '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\Application', '/v', 'ApplicationIcon', '/t', 'REG_SZ', '/d', iconPath, '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\Application', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', appName, '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\Application', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', appDescription, '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\DefaultIcon', '/ve', '/t', 'REG_SZ', '/d', iconPath, '/f'],
    ['add', 'HKCU\\Software\\Classes\\NaptureHTML\\shell\\open\\command', '/ve', '/t', 'REG_SZ', '/d', openCommandWithArg, '/f'],
    
    ['add', 'HKCU\\Software\\RegisteredApplications', '/v', 'Napture', '/t', 'REG_SZ', '/d', 'Software\\Clients\\StartMenuInternet\\Napture\\Capabilities', '/f']
  ];

  let promise = Promise.resolve();
  for (const args of commands) {
    promise = promise.then(() => {
      return new Promise((resolve) => {
        const child = spawn('reg', args);
        child.on('close', () => resolve());
      });
    });
  }
  
  promise.then(() => {
    console.log('Napture web browser registry registration complete.');
  }).catch((err) => {
    console.error('Failed to run registry registration commands:', err);
  });
}

// App Lifecycle

app.on('memory-pressure', (event, level) => {
  if (level === 'critical' || level === 'moderate') {
    // Intercept system memory pressure warnings.
    try {
      const { session } = require('electron');
      if (session.defaultSession) {
        session.defaultSession.clearCache();
        session.defaultSession.clearHostResolverCache();
      }
    } catch(e) {}
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  setupProtocolHandlers();
  loadDownloadHistory();

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
  }

  // Register Windows Registry entries for Default Browser list
  if (process.platform === 'win32') {
    registerWindowsBrowser();
  }

  // Initialize History Database (if not already init)
  initDB();

  // Version migration: Automatically disable memory saver once for users updating from older versions
  if (!getSetting('memorySaver_v20_migrated', false)) {
    setSetting('memorySaver', false);
    setSetting('memorySaver_v20_migrated', true);
  }

  // Apply initial performance mode (frame rates, throttling)
  applyPerformanceMode();

  if (powerMonitor) {
    powerMonitor.on('on-battery', () => {
      applyPerformanceMode();
    });
    powerMonitor.on('on-ac', () => {
      applyPerformanceMode();
    });
  }

  // Napture Memory Saver & RSS-Driven Discarding
  setInterval(() => {
    const memSaver = getSetting('memorySaver', false);
    if (!memSaver) return;

    let totalWorkingSetSize = 0;
    let cachedMetrics = [];
    try {
      cachedMetrics = app.getAppMetrics();
      for (const m of cachedMetrics) {
        if (m.memory && m.memory.workingSetSize) {
          totalWorkingSetSize += m.memory.workingSetSize;
        }
      }
    } catch(e) {}

    const memTarget = getSetting('memoryTarget', 700);
    const memoryThreshold = memTarget * 1024;

    const protectedPids = new Set();
    const now = Date.now();
    for (const w of browserWindows) {
      const s = getWindowState(w);
      if (!s) continue;
      s.tabs.forEach(id => {
        const v = tabViews.get(id);
        if (v && v.webContents && !v.webContents.isDestroyed()) {
          let protect = false;
          if (id === s.activeTabId) protect = true;
          if (!protect && s.pinnedTabs && s.pinnedTabs.has(id)) protect = true;
          if (!protect && v._isArchiving) protect = true; // Protect tabs already being archived
          if (!protect && v._createdAt && (now - v._createdAt < 60000)) protect = true; // Protect tabs created in the last 1 minute
          if (!protect) {
            const isAudible = typeof v.webContents.isCurrentlyAudible === 'function' && v.webContents.isCurrentlyAudible();
            const isLoading = typeof v.webContents.isLoading === 'function' && v.webContents.isLoading();
            if (isAudible || isLoading) protect = true;
          }
          if (protect) {
            try { protectedPids.add(v.webContents.getOSProcessId()); } catch(e) {}
          }
        }
      });
    }

    const evictions = [];

    for (const win of browserWindows) {
      const state = getWindowState(win);
      if (!state) continue;
      
      state.tabs.forEach(id => {
        const view = tabViews.get(id);
        if (view && view.webContents && !view.webContents.isDestroyed()) {
          const isAudible = typeof view.webContents.isCurrentlyAudible === 'function' && view.webContents.isCurrentlyAudible();
          if (id === state.activeTabId || isAudible) {
            // Keep background throttling disabled for active tab and audible tabs (e.g. YouTube playing in background or foreground)
            view.webContents.setBackgroundThrottling(false);
          } else {
            view.webContents.setBackgroundThrottling(true);
          }

          if (totalWorkingSetSize > memoryThreshold) {
            try {
              const pid = view.webContents.getOSProcessId();
              if (!protectedPids.has(pid)) {

                // Get the working set size of this specific process before destroying it
                let processMemory = 0;
                try {
                  const procMetric = cachedMetrics.find(m => m.pid === pid);
                  if (procMetric && procMetric.memory && procMetric.memory.workingSetSize) {
                    processMemory = procMetric.memory.workingSetSize;
                  }
                } catch(e) {}

                if (processMemory > 0) {
                  totalWorkingSetSize -= processMemory;
                }

                evictions.push({ id, view });
                protectedPids.add(pid); // Avoid adding the same process multiple times
              }
            } catch (e) {}
          }
        }
      });
    }

    evictions.forEach(({ id, view }) => {
      view._isArchiving = true;
      view.webContents.executeJavaScript(`
        ({
          scrollX: window.scrollX,
          scrollY: window.scrollY
        })
      `).then(state => {
        // Double check if tab became active during serialization
        let isNowActive = false;
        for (const w of browserWindows) {
          const s = getWindowState(w);
          if (s && s.activeTabId === id) {
             isNowActive = true;
             break;
          }
        }
        if (isNowActive) {
           view._isArchiving = false;
           return;
        }

        const file = path.join(getArchivePath(), `${id}.json`);
        fs.writeFileSync(file, JSON.stringify(state), 'utf8');
        try { view.webContents.destroy(); } catch(e) {}
        tabViews.delete(id);
      }).catch(() => {
        // Double check if tab became active during serialization
        let isNowActive = false;
        for (const w of browserWindows) {
          const s = getWindowState(w);
          if (s && s.activeTabId === id) {
             isNowActive = true;
             break;
          }
        }
        if (isNowActive) {
           view._isArchiving = false;
           return;
        }
         try { view.webContents.destroy(); } catch(e) {}
         tabViews.delete(id);
      });
    });
  }, 60000);

  // Intercept HTTP request headers to remove Electron identifiers and sanitize Client Hints.
  // Preserves X-Requested-With: XMLHttpRequest required by GitHub merge status / AJAX fragments.
  const chromeVersion = activeChromiumVersion;
  const chromeMajorVersion = chromeVersion.split('.')[0];

  try {
    session.defaultSession.setUserAgent(cleanUserAgent);
  } catch (e) {}

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (getSetting('doNotTrack', false)) {
      headers['DNT'] = '1';
    }
    
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-electron-version') {
        delete headers[key];
      } else if (lower === 'x-requested-with') {
        const val = String(headers[key]).toLowerCase();
        if (val !== 'xmlhttprequest') {
          delete headers[key];
        }
      } else if (lower === 'user-agent') {
        headers[key] = cleanUserAgent;
      } else if (lower.startsWith('sec-ch-')) {
        // Sanitize Chromium Client Hints to replace Electron brand with Google Chrome.
        // Google, Cloudflare, and GitHub require matching Chromium headers and User-Agent without Electron leaks.
        if (typeof headers[key] === 'string') {
          if (lower === 'sec-ch-ua-full-version-list') {
            headers[key] = headers[key]
              .replace(/"Electron";v="[^"]*"/gi, `"Google Chrome";v="${chromeVersion}"`)
              .replace(/Electron/gi, 'Google Chrome');
          } else {
            headers[key] = headers[key]
              .replace(/"Electron";v="[^"]*"/gi, `"Google Chrome";v="${chromeMajorVersion}"`)
              .replace(/Electron/gi, 'Google Chrome');
          }
        }
      }
    }
    callback({ cancel: false, requestHeaders: headers });
  });

  const adTrackerPatterns = [
    'fpjs.io',
    'googlesyndication.com',
    'doubleclick.net',
    'google-analytics.com',
    'adservice.google.com',
    'adnxs.com',
    'adform.net',
    'scorecardresearch.com',
    'connect.facebook.net',
    'taboola.com',
    'outbrain.com',
    'amazon-adsystem.com',
    'pubmatic.com',
    'rubiconproject.com',
    'criteo.com',
    'moatads.com'
  ];

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const lowerUrl = details.url.toLowerCase();
    for (let i = 0; i < adTrackerPatterns.length; i++) {
      if (lowerUrl.includes(adTrackerPatterns[i])) {
        return callback({ cancel: true });
      }
    }

    // Fast-unwrap search engine redirect URLs (Google, DuckDuckGo) for frame navigations
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      const unwrapped = unwrapRedirectUrl(details.url);
      if (unwrapped !== details.url) {
        return callback({ redirectURL: unwrapped });
      }
    }

    if (getSetting('httpsOnly', false) && details.url.startsWith('http://')) {
      try {
        const urlObj = new URL(details.url);
        const h = urlObj.hostname;
        if (h !== 'localhost' && h !== '127.0.0.1' && !h.startsWith('192.168.') && !h.startsWith('10.')) {
          return callback({ redirectURL: details.url.replace(/^http:\/\//i, 'https://') });
        }
      } catch (e) {}
    }
    callback({});
  });

  try {
    session.defaultSession.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    session.defaultSession.setSpellCheckerEnabled(Boolean(getSetting('spellCheck', true)));
    session.defaultSession.setSpellCheckerLanguages([getSetting('language', 'en-US')]);
  } catch (e) {}

  // Handle standard browser permission requests cleanly without silent failures
  const allowedPermissions = [
    'media', 'display-capture', 'notifications', 'fullscreen', 'pointerLock',
    'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write',
    'storage-access', 'top-level-storage-access', 'idle-detection', 'window-management'
  ];
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      const blockCookies = getSetting('blockCookies', 'incognito');
      if (blockCookies === 'all') {
        return callback(false);
      }
      return callback(true);
    }
    callback(allowedPermissions.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      const blockCookies = getSetting('blockCookies', 'incognito');
      if (blockCookies === 'all') {
        return false;
      }
      return true;
    }
    return allowedPermissions.includes(permission);
  });
  if (session.defaultSession && session.defaultSession.cookies) {
    session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
      if (isImportingCookies) return;
      scheduleDebouncedSyncPush();
    });
  }

  session.defaultSession.on('will-download', (event, item) => {
    const configuredDir = getSetting('downloadPath', app.getPath('downloads'));
    const downloadsDir = fs.existsSync(configuredDir) ? configuredDir : app.getPath('downloads');
    const name = item.getFilename();
    let savePath = path.join(downloadsDir, name);

    // Auto-deduplicate filename if file already exists in Downloads
    let counter = 1;
    const extName = path.extname(name);
    const baseName = path.basename(name, extName);
    while (fs.existsSync(savePath)) {
      savePath = path.join(downloadsDir, `${baseName} (${counter})${extName}`);
      counter++;
    }

    if (getSetting('askSaveLocation', false)) {
      item.setSaveDialogOptions({ defaultPath: savePath });
    } else {
      item.setSavePath(savePath);
    }

    const totalBytes = item.getTotalBytes();
    const sizeStr = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown size';
    const ext = name.split('.').pop().toLowerCase();
    let type = 'document';
    if (['exe', 'msi', 'bat'].includes(ext)) type = 'exe';
    else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) type = 'archive';
    else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) type = 'image';
    else if (['mkv', 'mp4', 'webm', 'avi', 'mp3'].includes(ext)) type = 'media';
    else if (['html', 'js', 'json', 'css'].includes(ext)) type = 'code';

    const activeWin = BrowserWindow.getFocusedWindow() || getMainWindow();
    let startX = null;
    let startY = null;
    if (activeWin) {
      try {
        const point = screen.getCursorScreenPoint();
        const bounds = activeWin.getBounds();
        startX = Math.max(0, point.x - bounds.x);
        startY = Math.max(0, point.y - bounds.y);
      } catch (e) {}
    }

    const downloadId = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
    activeDownloadItems.set(downloadId, item);
    const startTime = Date.now();

    const newItem = {
      id: downloadId,
      name: name,
      path: savePath,
      sizeStr: sizeStr,
      timeStr: 'Downloading...',
      type: type,
      completed: false,
      paused: false,
      cancelled: false,
      progress: 0,
      startX: startX,
      startY: startY
    };

    downloadHistory.unshift(newItem);
    if (activeWin && getSetting('showDownloadsOverlay', true)) {
      activeWin.webContents.send('download-started', newItem);
    }
    broadcastDownloadUpdated();

    item.on('updated', (evt, state) => {
      if (state === 'interrupted') {
        newItem.paused = item.isPaused();
      }
      if (state === 'progressing') {
        if (item.isPaused()) {
          newItem.paused = true;
          newItem.timeStr = 'Paused';
        } else {
          newItem.paused = false;
          const received = item.getReceivedBytes();
          if (totalBytes > 0) {
            newItem.progress = Math.round((received / totalBytes) * 100);
          }
          const remainingStr = calculateRemainingTimeStr(received, totalBytes, startTime);
          newItem.timeStr = `${newItem.progress}% • ${remainingStr}`;
        }
        broadcastDownloadUpdated();
      }
    });

    item.once('done', async (evt, state) => {
      activeDownloadItems.delete(downloadId);
      if (state === 'completed') {
        newItem.completed = true;
        newItem.paused = false;
        newItem.timeStr = 'Just now';
        try {
          if (app && typeof app.getFileIcon === 'function' && fs.existsSync(newItem.path)) {
            const icon = await app.getFileIcon(newItem.path, { size: 'normal' });
            if (icon && !icon.isEmpty()) {
              newItem.iconUrl = icon.toDataURL();
            }
          }
        } catch (e) {}
      } else if (state === 'cancelled') {
        newItem.cancelled = true;
        newItem.completed = false;
        newItem.paused = false;
        newItem.timeStr = 'Cancelled';
      } else {
        newItem.cancelled = true;
        newItem.completed = false;
        newItem.paused = false;
        newItem.timeStr = 'Interrupted';
      }
      saveDownloadHistory();
      broadcastDownloadUpdated();
    });
  });

  createBrowserWindow();

  // Start background sync listener
  syncEngine.startBackgroundSync();

  // Start warming a spare window in the background for fast tab detachment
  setTimeout(createWarmWindow, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createBrowserWindow();
    }
  });
});

// --- Auto Updater Logic ---
const http = require('http');
const https = require('https');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

let latestUpdateInfo = null;
let updaterWindow = null;
let isUpdating = false;
const UPDATER_URL = 'https://updates.nebuff.xyz'; 

let getUpdaterHtml;
try {
  ({ getUpdaterHtml } = require('./updater-ui'));
} catch (e) {
  console.warn('Failed to load updater-ui module, using built-in fallback:', e);
  getUpdaterHtml = (logoBase64) => `<!DOCTYPE html><html><body style="background:#0F0F14;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;"><h3>Updating Napture...</h3></body></html>`;
}


ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const osName = process.platform === 'win32' ? 'Win' : (process.platform === 'darwin' ? 'Mac' : 'Linux');
    const arch = process.arch.includes('arm') ? 'arm' : 'x86';
    const currentVersion = app.getVersion();

    const url = `${UPDATER_URL}/api/v1/check?os=${osName}&arch=${arch}&version=${currentVersion}`;
    
    const reqProto = url.startsWith('https') ? https : http;
    reqProto.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.updateAvailable) {
            latestUpdateInfo = result;
            latestUpdateInfo.osName = osName;
            latestUpdateInfo.arch = arch;
          }
          resolve(result);
        } catch (e) {
          resolve({ error: 'Invalid response from update server' });
        }
      });
    }).on('error', (err) => {
      resolve({ error: err.message });
    });
  });
});

ipcMain.handle('install-update', async () => {
  if (!latestUpdateInfo) throw new Error("No update information available. Check for updates first.");
  
  isUpdating = true;

  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString('base64');
    }
  } catch (e) {
    console.error('Failed to read logo.png for updater:', e);
  }

  updaterWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0F0F14',
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  function cleanupAndCloseUpdater(errMsg = null) {
    isUpdating = false;
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      if (errMsg) {
        try {
          updaterWindow.webContents.send('update-download-error', { error: errMsg });
        } catch (e) {}
        setTimeout(() => {
          if (updaterWindow && !updaterWindow.isDestroyed()) {
            updaterWindow.close();
          }
        }, 3000);
      } else {
        updaterWindow.close();
      }
    }
    if (browserWindows.size === 0 && !isImporting) {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    }
  }

  updaterWindow.on('closed', () => {
    updaterWindow = null;
    isUpdating = false;
    if (browserWindows.size === 0 && !isImporting) {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    }
  });

  const updaterHtmlPath = path.join(app.getPath('userData'), 'updater.html');
  try {
    fs.writeFileSync(updaterHtmlPath, getUpdaterHtml(logoBase64), 'utf8');
    updaterWindow.loadFile(updaterHtmlPath);
  } catch (e) {
    console.error('Failed to write/load updater HTML:', e);
  }

  return new Promise((resolve, reject) => {
    let downloadPath = latestUpdateInfo.download_url || '';
    if (downloadPath.endsWith('.tar.gz')) {
      downloadPath = downloadPath.replace(/\.tar\.gz$/, '.zip');
    }
    const url = downloadPath.startsWith('http') ? downloadPath : `${UPDATER_URL}${downloadPath}`;
    
    const tempDir = app.getPath('temp');
    const zipPath = path.join(tempDir, 'napture-update.zip');
    const extractDir = path.join(tempDir, 'napture-update-files');

    function downloadWithRedirects(targetUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        cleanupAndCloseUpdater('Too many redirects while downloading update.');
        return reject(new Error('Too many redirects while downloading update.'));
      }

      const file = fs.createWriteStream(zipPath);
      const reqProto = targetUrl.startsWith('https') ? https : http;

      file.on('error', (err) => {
        file.destroy();
        fs.unlink(zipPath, () => {});
        cleanupAndCloseUpdater(err.message || 'File write error');
        reject(err);
      });

      const req = reqProto.get(targetUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          file.destroy();
          fs.unlink(zipPath, () => {});
          let nextUrl = res.headers.location;
          if (nextUrl.startsWith('/')) {
            const parsed = new URL(targetUrl);
            nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
          }
          return downloadWithRedirects(nextUrl, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          file.destroy();
          fs.unlink(zipPath, () => {});
          const errorMsg = 'Failed to download update (HTTP ' + res.statusCode + ')';
          cleanupAndCloseUpdater(errorMsg);
          return reject(new Error(errorMsg));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        const startTime = Date.now();

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          file.write(chunk);

          const percent = totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0;
          const elapsedMs = Date.now() - startTime;
          const speedBps = elapsedMs > 0 ? (receivedBytes / (elapsedMs / 1000)) : 0;

          let remainingSeconds = 0;
          if (totalBytes && speedBps > 0) {
            remainingSeconds = Math.round((totalBytes - receivedBytes) / speedBps);
          }

          if (updaterWindow && !updaterWindow.isDestroyed()) {
            updaterWindow.webContents.send('update-download-progress', {
              percent,
              receivedBytes,
              totalBytes,
              speedBps,
              remainingSeconds,
              isExtracting: false
            });
          }
        });

        res.on('end', () => {
          file.end();
        });

        file.on('close', () => {
          try {
            if (updaterWindow && !updaterWindow.isDestroyed()) {
              updaterWindow.webContents.send('update-download-progress', {
                percent: 100,
                receivedBytes: totalBytes,
                totalBytes: totalBytes,
                speedBps: 0,
                remainingSeconds: 0,
                isExtracting: true
              });
            }

            // Extract zip
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            fs.mkdirSync(extractDir, { recursive: true });
            
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractDir, true);

            // Save active tab session before closing windows for update
            saveCurrentSessionFromMain();

            // Close/destroy all other active browser and settings windows now that extraction is complete and verified
            const allWindows = BrowserWindow.getAllWindows();
            for (const win of allWindows) {
              if (win !== updaterWindow && !win.isDestroyed()) {
                win.destroy();
              }
            }

            const appPath = app.getAppPath(); // Should be resources/app without asar
            const execPath = process.execPath;
            const currentPid = process.pid;
            const isPackagedStr = app.isPackaged ? 'true' : 'false';
            
            if (process.platform === 'win32') {
              const cmdPath = path.join(tempDir, 'updater.cmd');
              const winExtractDir = extractDir.replace(/\//g, '\\');
              const winAppPath = appPath.replace(/\//g, '\\');
              const winExecPath = execPath.replace(/\//g, '\\');

              const cmdScript = `@echo off
setlocal
set "pidToWait=${currentPid}"
set "sourceDir=${winExtractDir}"
set "targetDir=${winAppPath}"
set "execPath=${winExecPath}"
set "isPackaged=${isPackagedStr}"

ping 127.0.0.1 -n 3 >nul 2>&1
taskkill /F /PID %pidToWait% >nul 2>&1

:continue_update
for %%F in ("%execPath%") do set "appName=%%~nxF"
taskkill /F /IM "%appName%" >nul 2>&1
ping 127.0.0.1 -n 2 >nul 2>&1

set "testFile=%targetDir%\\.write_test_%RANDOM%"
echo test > "%testFile%" 2>nul
if errorlevel 1 (
    if "%~1"=="ELEVATED" (
        exit /b
    )
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c', '\"\"\"%~f0\"\"\" ELEVATED' -Verb RunAs -WindowStyle Hidden"
    exit /b
)
del "%testFile%" 2>nul

robocopy "%sourceDir%" "%targetDir%" /E /IS /IT /R:3 /W:1 /NP /NDL /NFL /NJH /NJS >nul 2>&1
if %ERRORLEVEL% GEQ 8 (
    xcopy "%sourceDir%\\*" "%targetDir%\\" /E /Y /H /R /C >nul 2>&1
)

if "%isPackaged%"=="true" (
    start "" "%execPath%"
) else (
    start "" "%execPath%" "%targetDir%"
)

(goto) 2>nul & del /f /q "%~f0"
`;
              fs.writeFileSync(cmdPath, cmdScript, 'utf8');
              const child = spawn('cmd.exe', ['/c', cmdPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
              });
              child.unref();
            } else {
              const shPath = path.join(tempDir, 'updater.sh');
              const appImageEnv = process.env.APPIMAGE || '';
              
              const shScript = `#!/bin/bash
# Napture Updater Script for Linux & macOS
LOG_FILE="/tmp/napture-updater.log"
echo "[\$(date)] Starting Napture update process..." > "\$LOG_FILE"

# Wait for main process to exit
WAIT_COUNT=0
while kill -0 ${currentPid} 2>/dev/null; do
    if [ \$WAIT_COUNT -ge 20 ]; then
        echo "[\$(date)] Terminating main PID ${currentPid}..." >> "\$LOG_FILE"
        kill -9 ${currentPid} 2>/dev/null
        sleep 1
        break
    fi
    WAIT_COUNT=\$((WAIT_COUNT+1))
    sleep 0.5
done

sleep 1

# Handle AppImage update mode
APPIMAGE_TARGET="${appImageEnv}"
if [ -n "\$APPIMAGE_TARGET" ] && [ -f "\$APPIMAGE_TARGET" ]; then
    echo "[\$(date)] AppImage mode detected. Target: \$APPIMAGE_TARGET" >> "\$LOG_FILE"
    NEW_APPIMAGE=\$(find "${extractDir}" -maxdepth 2 -name "*.AppImage" 2>/dev/null | head -n 1)
    if [ -n "\$NEW_APPIMAGE" ] && [ -f "\$NEW_APPIMAGE" ]; then
        echo "[\$(date)] Found new AppImage: \$NEW_APPIMAGE" >> "\$LOG_FILE"
        cp -f "\$NEW_APPIMAGE" "\$APPIMAGE_TARGET" >> "\$LOG_FILE" 2>&1
        chmod +x "\$APPIMAGE_TARGET" >> "\$LOG_FILE" 2>&1
    fi
    nohup "\$APPIMAGE_TARGET" >/dev/null 2>&1 &
    rm -rf "${extractDir}" "${zipPath}" "\$0"
    exit 0
fi

# Directory update mode (RPM, DEB, or local application folder)
TARGET_DIR="${appPath}"
echo "[\$(date)] Target application directory: \$TARGET_DIR" >> "\$LOG_FILE"

if [ -w "\$TARGET_DIR" ]; then
    echo "[\$(date)] Target directory is directly writable." >> "\$LOG_FILE"
    cp -rf "${extractDir}"/* "\$TARGET_DIR/" >> "\$LOG_FILE" 2>&1
else
    echo "[\$(date)] Target directory requires root elevation..." >> "\$LOG_FILE"
    if [ "\$(uname)" == "Darwin" ]; then
        osascript -e "do shell script \\"cp -rf '${extractDir}'/* '\$TARGET_DIR/'\\" with administrator privileges" >> "\$LOG_FILE" 2>&1
    else
        # Linux Polkit / sudo elevation
        if command -v pkexec >/dev/null 2>&1; then
            echo "[\$(date)] Invoking pkexec authentication..." >> "\$LOG_FILE"
            pkexec bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        elif command -v kdesu >/dev/null 2>&1; then
            echo "[\$(date)] Invoking kdesu..." >> "\$LOG_FILE"
            kdesu -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        elif command -v gksu >/dev/null 2>&1; then
            echo "[\$(date)] Invoking gksu..." >> "\$LOG_FILE"
            gksu "bash -c \\"cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'\\"" >> "\$LOG_FILE" 2>&1
        elif [ -n "\$SUDO_ASKPASS" ] && command -v sudo >/dev/null 2>&1; then
            echo "[\$(date)] Invoking sudo -A..." >> "\$LOG_FILE"
            sudo -A bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        else
            echo "[\$(date)] Invoking sudo..." >> "\$LOG_FILE"
            sudo bash -c "cp -rf '${extractDir}'/* '\$TARGET_DIR/' && chmod -R a+rX '\$TARGET_DIR/'" >> "\$LOG_FILE" 2>&1
        fi
    fi
fi

chmod -R a+rX "\$TARGET_DIR/" 2>/dev/null || true
echo "[\$(date)] Copy finished. Relaunching Napture..." >> "\$LOG_FILE"
sleep 1

# Relaunch application cleanly
if [ "\$(uname)" == "Darwin" ] && [ "${isPackagedStr}" == "true" ]; then
    open -a "${execPath}/../../.."
else
    if [ "${isPackagedStr}" == "true" ]; then
        nohup "${execPath}" >/dev/null 2>&1 &
    else
        nohup "${execPath}" "\$TARGET_DIR" >/dev/null 2>&1 &
    fi
fi

echo "[\$(date)] Relaunch complete. Cleaning up..." >> "\$LOG_FILE"
rm -rf "${extractDir}" "${zipPath}" "\$0"
`;
              fs.writeFileSync(shPath, shScript, { mode: 0o777 });
              const child = spawn(shPath, [], { detached: true, stdio: 'ignore' });
              child.unref();
            }
            
            setTimeout(() => {
              app.exit(0);
              resolve();
            }, 600);
          } catch (e) {
            cleanupAndCloseUpdater("Extraction or script creation failed: " + e.message);
            reject(new Error("Extraction or script creation failed: " + e.message));
          }
        });
      });

      req.on('error', (err) => {
        file.destroy();
        fs.unlink(zipPath, () => {});
        cleanupAndCloseUpdater(err.message || 'Network download error');
        reject(err);
      });
    }

    downloadWithRedirects(url);
  });
});
// --- End Auto Updater Logic ---

app.on('child-process-gone', (event, details) => {
  if (details && (details.reason === 'oom' || details.reason === 'memory-eviction')) {
    try { const { session } = require('electron'); session.defaultSession.clearCache(); session.defaultSession.clearHostResolverCache(); } catch(e) {}
  }
});

app.on('before-quit', () => {
  saveCurrentSessionFromMain();
  if (warmWindow && !warmWindow.isDestroyed()) {
    try { warmWindow.destroy(); } catch (e) {}
    warmWindow = null;
    warmWindowReady = false;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isUpdating && !isImporting) {
    app.quit();
  }
});
