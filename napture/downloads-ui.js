// Napture Downloads Suite - Full Screen Downloads UI matching Napture Design System
// Manages download item cards, active progress indicators, and system shell actions
let getSetting, i18n;
if (typeof require !== 'undefined') {
  try {
    const hist = require('./db/history');
    getSetting = hist.getSetting;
  } catch (e) {}
  try {
    i18n = require('./i18n');
  } catch (e) {}
}

function buildDownloadsPage() {
  const lang = (typeof getSetting === 'function' ? getSetting('language', 'en-US') : 'en-US') || 'en-US';
  const t = (k) => (i18n ? i18n.t(k, lang) : k);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>Downloads - Napture</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-app: transparent;
      --bg-sidebar: transparent;
      --bg-card: rgba(18, 19, 26, 0.6);
      --bg-input: #12131a;
      --bg-hover: #2a2b36;
      --bg-active: #20212a;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: #7f8cff;
      --text-primary: #ffffff;
      --text-secondary: #a9b1d6;
      --text-muted: #565f89;
      --accent: #7f8cff;
      --accent-hover: #6c7af7;
      --danger: #e81123;
      --danger-hover: #c40e1d;
      --font-main: 'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-app); }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

    body {
      background-color: var(--bg-app);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      height: 100vh;
      overflow: hidden;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    /* Sidebar Navigation */
    .sidebar {
      width: 240px;
      background-color: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 10;
    }

    .sidebar-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }

    .nav-list {
      list-style: none;
      padding: 12px 8px;
      overflow-y: auto;
      flex-grow: 1;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      margin-bottom: 4px;
      color: var(--text-secondary);
      cursor: pointer;
      font-weight: 500;
      border-radius: 8px;
      border: 1px solid transparent;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    }

    .nav-item:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    .nav-item.active {
      background-color: var(--bg-active);
      color: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-weight: 600;
    }

    .nav-badge {
      margin-left: auto;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      padding: 0 6px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      line-height: 18px;
    }

    .nav-item:hover .nav-badge {
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.1);
    }

    .nav-item.active .nav-badge {
      color: #ffffff;
      background: rgba(127, 140, 255, 0.25);
    }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--border-color);
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Main Content Area */
    .main-area {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Sticky Search Bar Header */
    .top-bar {
      height: 61px;
      background-color: var(--bg-app);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 36px;
      flex-shrink: 0;
    }

    .search-input-wrapper {
      position: relative;
      width: 100%;
      max-width: 460px;
    }

    input[type="text"].search-input, .search-input {
      width: 100%;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      color: var(--text-primary);
      padding: 8px 12px 8px 36px !important;
      font-family: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    input[type="text"].search-input:focus, .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(127, 140, 255, 0.15);
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      width: 15px;
      height: 15px;
      pointer-events: none;
    }

    /* Content Viewport */
    .content-viewport {
      flex-grow: 1;
      overflow-y: auto;
      padding: 28px 40px;
    }

    .downloads-container, .history-container {
      max-width: 840px;
      margin: 0 auto;
      padding-bottom: 60px;
    }

    /* Tabs Header Bar */
    .view-tabs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .tabs-group {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 10px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.18s ease, border-color 0.18s ease;
    }

    .tab-btn:hover {
      color: var(--text-primary);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    /* Batch Selection Bar */
    .batch-bar {
      display: none;
      align-items: center;
      justify-content: space-between;
      background-color: var(--bg-card);
      border: 1px solid var(--border-focus);
      border-radius: 10px;
      padding: 10px 18px;
      margin-bottom: 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .batch-bar.active {
      display: flex;
    }

    .batch-info {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
    }

    .batch-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Group Section */
    .group-section {
      margin-bottom: 28px;
    }

    .group-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 10px;
      letter-spacing: -0.1px;
    }

    /* Flat Card Group */
    .card-group {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    }

    /* Download Entry Row matching History Row */
    .download-row, .history-row {
      display: flex;
      align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid var(--border-color);
      gap: 16px;
      transition: background-color 0.18s ease;
      position: relative;
    }

    .download-row:first-child, .history-row:first-child {
      border-top-left-radius: 11px;
      border-top-right-radius: 11px;
    }

    .download-row:last-child, .history-row:last-child {
      border-bottom-left-radius: 11px;
      border-bottom-right-radius: 11px;
      border-bottom: none;
    }

    .download-row.popover-open, .history-row.popover-open {
      z-index: 100;
    }

    .download-row:hover, .history-row:hover {
      background-color: var(--bg-hover);
    }

    .download-row.selected, .history-row.selected {
      background-color: var(--bg-active);
    }

    /* Custom Checkbox */
    .checkbox-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .checkbox-cell input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .time-cell {
      width: 70px;
      font-size: 11.5px;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .favicon-cell {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 4px;
      background-color: var(--bg-input);
      color: var(--text-secondary);
      overflow: hidden;
    }

    .info-cell {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      cursor: pointer;
    }

    .row-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 480px;
      transition: color 0.15s ease;
    }

    .row-title:hover {
      color: var(--accent);
      text-decoration: underline;
    }

    .row-domain {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row-progress-line {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background-color: var(--accent);
    }

    /* Actions Menu Button */
    .actions-cell {
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.18s ease, color 0.18s ease;
    }

    .icon-btn:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    /* Popover Menu */
    .popover-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      background-color: #1f202c;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 1000;
      display: none;
      min-width: 170px;
    }

    .popover-menu.active {
      display: flex;
      flex-direction: column;
    }

    .popover-item {
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .popover-item:hover {
      background-color: var(--bg-hover);
      color: var(--accent);
    }

    .popover-item.danger:hover {
      color: var(--danger);
    }

    /* Standard Flat Buttons */
    .btn {
      background-color: #242633;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 7px 16px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    }

    .btn:hover {
      background-color: #2c2f3e;
      border-color: #3f4258;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .btn-primary {
      background-color: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    .btn-primary:hover {
      background-color: var(--accent-hover);
      border-color: var(--accent-hover);
      box-shadow: 0 2px 8px rgba(127, 140, 255, 0.22);
    }

    .btn-danger {
      background-color: var(--danger);
      border-color: var(--danger);
      color: #ffffff;
    }

    .btn-danger:hover {
      background-color: var(--danger-hover);
      border-color: var(--danger-hover);
    }

    /* Empty State */
    .empty-state {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      color: var(--text-muted);
    }

    .empty-state.active {
      display: flex;
    }

    .empty-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      color: var(--text-muted);
      opacity: 0.6;
    }

    .empty-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    /* Flat Toast Notification */
    #toast-bar {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background-color: var(--bg-card);
      border: 1px solid var(--border-focus);
      border-radius: 10px;
      color: var(--text-primary);
      padding: 12px 20px;
      font-weight: 500;
      font-size: 13px;
      display: none;
      z-index: 1000;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    }

    /* Clear Browsing Data Modal (Reused across Settings, History, and Downloads) */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(10, 11, 14, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      backdrop-filter: blur(4px);
    }

    .modal-box {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      width: 100%;
      max-width: 460px;
      padding: 24px;
    }

    .modal-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .modal-desc {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: color 0.15s ease;
    }

    .checkbox-row:hover {
      color: var(--accent);
    }

    .checkbox-row input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }
  </style>
</head>
<body>

  <!-- Left Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span class="sidebar-title">${t('sec_downloads') || 'Downloads'}</span>
    </div>

    <ul class="nav-list">
      <li class="nav-item active" data-filter="all" id="nav-all">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>All Downloads</span>
        <span class="nav-badge" id="badge-all">0</span>
      </li>

      <li class="nav-item" data-filter="active" id="nav-active">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>In Progress</span>
        <span class="nav-badge" id="badge-active">0</span>
      </li>

      <li class="nav-item" data-filter="completed" id="nav-completed">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Completed</span>
        <span class="nav-badge" id="badge-completed">0</span>
      </li>

      <li class="nav-item" data-filter="cancelled" id="nav-cancelled">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span>Cancelled</span>
      </li>

      <li class="nav-item" id="btn-open-folder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Open Downloads Folder</span>
      </li>

      <li class="nav-item" id="btn-clear-completed">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>${t('clear_browsing_data') || 'Clear Browsing Data'}</span>
      </li>
    </ul>

    <div class="sidebar-footer">
      Your downloaded files are stored locally on this device.
    </div>
  </aside>

  <!-- Main Area -->
  <main class="main-area">
    <div class="top-bar">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="search-input" id="search-downloads" placeholder="Search downloads...">
      </div>
    </div>

    <div class="content-viewport" id="viewport">
      <div class="downloads-container">

        <!-- Tabs Header -->
        <div class="view-tabs-header">
          <div class="tabs-group">
            <button class="tab-btn active" id="tab-by-date">By date</button>
            <button class="tab-btn" id="tab-by-group">By type</button>
          </div>
        </div>

        <!-- Batch Bar -->
        <div class="batch-bar" id="batch-bar">
          <div class="batch-info">
            <span id="selected-count">0 items selected</span>
          </div>
          <div class="batch-actions">
            <button class="btn" id="btn-deselect">Cancel</button>
            <button class="btn btn-danger" id="btn-delete-selected">Delete Selected</button>
          </div>
        </div>

        <!-- Dynamic Downloads Content Container -->
        <div id="downloads-content">
          <!-- Populated by JS -->
        </div>

        <!-- Empty State -->
        <div class="empty-state" id="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <div class="empty-title">No downloads found</div>
          <div>Files you download in Napture will appear here.</div>
        </div>

      </div>
    </div>
  </main>

  <!-- Toast Notification -->
  <div id="toast-bar">Downloads updated.</div>

  <!-- Reused Clear Browsing Data Modal matching Settings and History pages -->
  <div class="modal-overlay" id="modal-clear">
    <div class="modal-box">
      <h3 class="modal-title">${t('clear_browsing_data') || 'Clear Browsing Data'}</h3>
      <p class="modal-desc">${t('clear_browsing_desc') || 'Select which records to delete from local storage:'}</p>

      <label class="checkbox-row">
        <input type="checkbox" id="chk-history">
        <span>Browsing History (URLs, titles, timestamps)</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-cookies">
        <span>Cookies and Site Storage Data</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-cache">
        <span>Cached Images and Files</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-downloads" checked>
        <span>Download Records</span>
      </label>

      <div class="modal-actions">
        <button class="btn" id="btn-close-modal">${t('cancel') || 'Cancel'}</button>
        <button class="btn btn-danger" id="btn-confirm-clear">${t('clear_data_btn') || 'Clear Data'}</button>
      </div>
    </div>
  </div>

  <script>
    let allDownloads = [];
    let selectedIds = new Set();
    let currentFilter = 'all';
    let currentViewMode = 'date'; // 'date' or 'group'
    let searchQuery = '';

    const searchInput = document.getElementById('search-downloads');
    const downloadsContent = document.getElementById('downloads-content');
    const emptyState = document.getElementById('empty-state');
    const batchBar = document.getElementById('batch-bar');
    const selectedCountEl = document.getElementById('selected-count');
    const btnDeselect = document.getElementById('btn-deselect');
    const btnDeleteSelected = document.getElementById('btn-delete-selected');
    const toast = document.getElementById('toast-bar');

    function showToast(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return hours + ':' + minutes + ' ' + ampm;
    }

    function formatDateGroup(timestamp) {
      if (!timestamp) return 'Recent';
      const date = new Date(timestamp);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const yesterdayStart = todayStart - 86400000;

      const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

      if (timestamp >= todayStart) {
        return 'Today - ' + date.toLocaleDateString('en-US', options);
      } else if (timestamp >= yesterdayStart) {
        return 'Yesterday - ' + date.toLocaleDateString('en-US', options);
      } else {
        return date.toLocaleDateString('en-US', options);
      }
    }

    function getFileTypeClass(filename) {
      const ext = (filename || '').split('.').pop().toLowerCase();
      if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', '7zip', 'tgz'].includes(ext)) return 'archive';
      if (['exe', 'msi', 'deb', 'rpm', 'appimage', 'sh', 'dmg', 'pkg', 'apk', 'bin'].includes(ext)) return 'executable';
      if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'media';
      if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(ext)) return 'document';
      return 'file';
    }

    function getFileCategoryLabel(typeClass) {
      if (typeClass === 'archive') return 'Archives & Compressed';
      if (typeClass === 'executable') return 'Applications & Installers';
      if (typeClass === 'media') return 'Media & Images';
      if (typeClass === 'document') return 'Documents';
      return 'Other Files';
    }

    function getFileTypeIconSvg(typeClass) {
      if (typeClass === 'archive') {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>';
      }
      if (typeClass === 'executable') {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>';
      }
      if (typeClass === 'media') {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      }
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
    }

    function getDomain(urlStr) {
      try {
        const u = new URL(urlStr);
        return u.hostname || urlStr;
      } catch (e) {
        return urlStr || '';
      }
    }

    function updateBadges() {
      const activeCount = allDownloads.filter(d => !d.completed && !d.cancelled).length;
      const completedCount = allDownloads.filter(d => d.completed && !d.cancelled).length;

      const bAll = document.getElementById('badge-all');
      const bActive = document.getElementById('badge-active');
      const bCompleted = document.getElementById('badge-completed');

      if (bAll) bAll.textContent = allDownloads.length;
      if (bActive) bActive.textContent = activeCount;
      if (bCompleted) bCompleted.textContent = completedCount;
    }

    function updateBatchBar() {
      if (selectedIds.size > 0) {
        batchBar.classList.add('active');
        if (selectedCountEl) {
          selectedCountEl.textContent = selectedIds.size + (selectedIds.size === 1 ? ' item selected' : ' items selected');
        }
      } else {
        batchBar.classList.remove('active');
      }
    }

    async function loadDownloads() {
      if (window.naptureAPI && window.naptureAPI.getRecentDownloads) {
        allDownloads = await window.naptureAPI.getRecentDownloads() || [];
      } else if (window.naptureAPI && window.naptureAPI.getDownloadsHistory) {
        allDownloads = await window.naptureAPI.getDownloadsHistory() || [];
      } else {
        allDownloads = [];
      }
      renderDownloads();
    }

    function getFilteredDownloads() {
      return allDownloads.filter(item => {
        if (currentFilter === 'active' && (item.completed || item.cancelled)) return false;
        if (currentFilter === 'completed' && (!item.completed || item.cancelled)) return false;
        if (currentFilter === 'cancelled' && !item.cancelled) return false;

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = (item.name || '').toLowerCase().includes(q);
          const urlMatch = (item.url || '').toLowerCase().includes(q);
          if (!nameMatch && !urlMatch) return false;
        }
        return true;
      });
    }

    function renderDownloads() {
      if (!downloadsContent) return;
      downloadsContent.innerHTML = '';
      selectedIds.clear();
      updateBatchBar();
      updateBadges();

      const filtered = getFilteredDownloads();

      if (filtered.length === 0) {
        emptyState.classList.add('active');
        return;
      }
      emptyState.classList.remove('active');

      if (currentViewMode === 'group') {
        renderGroupedByType(filtered);
      } else {
        renderGroupedByDate(filtered);
      }
    }

    function renderGroupedByDate(filtered) {
      const groups = {};
      filtered.forEach(item => {
        const label = formatDateGroup(item.timestamp || item.receivedBytesTime || Date.now());
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
      });

      Object.keys(groups).forEach(label => {
        const groupSec = document.createElement('div');
        groupSec.className = 'group-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'group-title';
        titleEl.textContent = label;
        groupSec.appendChild(titleEl);

        const cardGroup = document.createElement('div');
        cardGroup.className = 'card-group';

        groups[label].forEach(item => {
          const row = createDownloadRow(item);
          cardGroup.appendChild(row);
        });

        groupSec.appendChild(cardGroup);
        downloadsContent.appendChild(groupSec);
      });
    }

    function renderGroupedByType(filtered) {
      const groups = {};
      filtered.forEach(item => {
        const typeClass = getFileTypeClass(item.name);
        const label = getFileCategoryLabel(typeClass);
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
      });

      Object.keys(groups).forEach(label => {
        const groupSec = document.createElement('div');
        groupSec.className = 'group-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'group-title';
        titleEl.textContent = label;
        groupSec.appendChild(titleEl);

        const cardGroup = document.createElement('div');
        cardGroup.className = 'card-group';

        groups[label].forEach(item => {
          const row = createDownloadRow(item);
          cardGroup.appendChild(row);
        });

        groupSec.appendChild(cardGroup);
        downloadsContent.appendChild(groupSec);
      });
    }

    function createDownloadRow(item) {
      const row = document.createElement('div');
      row.className = 'download-row history-row';
      row.dataset.id = item.id;
      if (selectedIds.has(item.id)) row.classList.add('selected');

      const isDownloading = !item.completed && !item.cancelled;
      const typeClass = getFileTypeClass(item.name);
      const safeTitle = escapeHtml(item.name || 'Downloaded File');
      const domain = escapeHtml(getDomain(item.url));
      const timeStr = escapeHtml(formatTime(item.timestamp || item.receivedBytesTime || Date.now()));

      let subtext = '';
      if (isDownloading) {
        subtext = (item.sizeStr ? item.sizeStr + ' • ' : '') + 'Downloading' + (item.progress !== undefined ? ' (' + Math.round(item.progress) + '%)' : '') + (domain ? ' • ' + domain : '');
      } else if (item.cancelled) {
        subtext = (item.sizeStr ? item.sizeStr + ' • ' : '') + 'Cancelled' + (domain ? ' • ' + domain : '');
      } else {
        subtext = (item.sizeStr ? item.sizeStr + ' • ' : '') + domain;
      }

      let iconHtml = '';
      if (item.iconUrl) {
        iconHtml = '<img class="file-icon-img" src="' + escapeHtml(item.iconUrl) + '" alt="" style="width: 100%; height: 100%; object-fit: contain;" />';
      } else {
        iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a9b1d6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
      }

      let progressLine = '';
      if (isDownloading && item.progress !== undefined) {
        progressLine = '<div class="row-progress-line" style="width: ' + Math.min(100, Math.max(0, item.progress)) + '%;"></div>';
      }

      const isChecked = selectedIds.has(item.id) ? 'checked' : '';
      const actionItemHtml = isDownloading
        ? '<button class="popover-item danger btn-cancel-dl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Cancel download</span></button>'
        : '<button class="popover-item danger btn-delete-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Remove from list</span></button>';

      row.innerHTML = \`
        <div class="checkbox-cell">
          <input type="checkbox" class="row-chk" data-id="\${escapeHtml(item.id)}" \${isChecked}>
        </div>
        <div class="time-cell">\${timeStr}</div>
        <div class="favicon-cell" data-path="\${escapeHtml(item.path || '')}">
          \${iconHtml}
        </div>
        <div class="info-cell">
          <span class="row-title" title="\${safeTitle}">\${safeTitle}</span>
          <span class="row-domain">\${subtext}</span>
        </div>
        <div class="actions-cell">
          <button class="icon-btn btn-show-folder" title="Show in folder" data-action="open-folder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="icon-btn action-menu-btn" title="More options">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="1.5"></circle>
              <circle cx="12" cy="12" r="1.5"></circle>
              <circle cx="12" cy="19" r="1.5"></circle>
            </svg>
          </button>
          <div class="popover-menu">
            <button class="popover-item btn-open-file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Open file</span>
            </button>
            <button class="popover-item btn-pop-folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span>Show in folder</span>
            </button>
            <button class="popover-item btn-copy-url">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy download link</span>
            </button>
            \${actionItemHtml}
          </div>
        </div>
        \${progressLine}
      \`;

      // Dynamically fetch native OS file icon if not yet available
      if (!item.iconUrl && item.path && window.naptureAPI && window.naptureAPI.getFileIcon) {
        window.naptureAPI.getFileIcon(item.path).then(dataUrl => {
          if (dataUrl) {
            item.iconUrl = dataUrl;
            const favCell = row.querySelector('.favicon-cell');
            if (favCell) {
              favCell.innerHTML = '<img class="file-icon-img" src="' + escapeHtml(dataUrl) + '" alt="" style="width: 100%; height: 100%; object-fit: contain;" />';
            }
          }
        }).catch(() => {});
      }

      // Checkbox handler
      const chk = row.querySelector('.row-chk');
      if (chk) {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          if (chk.checked) {
            selectedIds.add(item.id);
            row.classList.add('selected');
          } else {
            selectedIds.delete(item.id);
            row.classList.remove('selected');
          }
          updateBatchBar();
        });
      }

      // Title & Info click -> Open file
      const infoCell = row.querySelector('.info-cell');
      if (infoCell) {
        infoCell.addEventListener('click', () => {
          if (window.naptureAPI && window.naptureAPI.openDownloadedFile) {
            window.naptureAPI.openDownloadedFile(item);
          }
        });
      }

      // Quick show in folder button
      const showFolderBtn = row.querySelector('.btn-show-folder');
      if (showFolderBtn) {
        showFolderBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.naptureAPI && window.naptureAPI.showDownloadedFileInFolder) {
            window.naptureAPI.showDownloadedFileInFolder(item);
            showToast('Opened file in folder');
          }
        });
      }

      // Popover actions
      const actionBtn = row.querySelector('.action-menu-btn');
      const popover = row.querySelector('.popover-menu');

      if (actionBtn && popover) {
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wasActive = popover.classList.contains('active');
          document.querySelectorAll('.popover-menu.active').forEach(p => {
            p.classList.remove('active');
            const parentRow = p.closest('.download-row');
            if (parentRow) parentRow.classList.remove('popover-open');
          });
          if (!wasActive) {
            popover.classList.add('active');
            row.classList.add('popover-open');
          } else {
            row.classList.remove('popover-open');
          }
        });
      }

      const btnOpenFile = row.querySelector('.btn-open-file');
      if (btnOpenFile) {
        btnOpenFile.addEventListener('click', (e) => {
          e.stopPropagation();
          if (popover) popover.classList.remove('active');
          row.classList.remove('popover-open');
          if (window.naptureAPI && window.naptureAPI.openDownloadedFile) {
            window.naptureAPI.openDownloadedFile(item);
          }
        });
      }

      const btnPopFolder = row.querySelector('.btn-pop-folder');
      if (btnPopFolder) {
        btnPopFolder.addEventListener('click', (e) => {
          e.stopPropagation();
          if (popover) popover.classList.remove('active');
          row.classList.remove('popover-open');
          if (window.naptureAPI && window.naptureAPI.showDownloadedFileInFolder) {
            window.naptureAPI.showDownloadedFileInFolder(item);
            showToast('Opened file in folder');
          }
        });
      }

      const btnCopyUrl = row.querySelector('.btn-copy-url');
      if (btnCopyUrl) {
        btnCopyUrl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (popover) popover.classList.remove('active');
          row.classList.remove('popover-open');
          if (item.url) {
            navigator.clipboard.writeText(item.url);
            showToast('Download URL copied to clipboard');
          }
        });
      }

      const btnCancelDl = row.querySelector('.btn-cancel-dl');
      if (btnCancelDl) {
        btnCancelDl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (popover) popover.classList.remove('active');
          row.classList.remove('popover-open');
          if (window.naptureAPI && window.naptureAPI.cancelDownload) {
            window.naptureAPI.cancelDownload(item.id);
            showToast('Download cancelled');
          }
        });
      }

      const btnDeleteItem = row.querySelector('.btn-delete-item');
      if (btnDeleteItem) {
        btnDeleteItem.addEventListener('click', (e) => {
          e.stopPropagation();
          if (popover) popover.classList.remove('active');
          row.classList.remove('popover-open');
          if (window.naptureAPI && window.naptureAPI.deleteDownloadItem) {
            window.naptureAPI.deleteDownloadItem(item.id);
            allDownloads = allDownloads.filter(d => d.id !== item.id);
            renderDownloads();
            showToast('Download removed from list');
          }
        });
      }

      return row;
    }

    // Deselect handlers
    if (btnDeselect) {
      btnDeselect.addEventListener('click', () => {
        selectedIds.clear();
        document.querySelectorAll('.row-chk').forEach(c => {
          c.checked = false;
          c.closest('.download-row').classList.remove('selected');
        });
        updateBatchBar();
      });
    }

    // Delete Selected
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (window.naptureAPI && window.naptureAPI.deleteDownloadItem) {
          Promise.all(ids.map(id => window.naptureAPI.deleteDownloadItem(id))).then(() => {
            allDownloads = allDownloads.filter(d => !selectedIds.has(d.id));
            selectedIds.clear();
            updateBatchBar();
            renderDownloads();
            showToast(ids.length + ' downloads removed.');
          });
        }
      });
    }

    // Clear completed action
    const btnClearCompletedNav = document.getElementById('btn-clear-completed');
    if (btnClearCompletedNav) {
      btnClearCompletedNav.addEventListener('click', () => {
        const modal = document.getElementById('modal-clear');
        if (modal) modal.style.display = 'flex';
      });
    }

    // Close open popovers when clicking elsewhere
    document.addEventListener('click', () => {
      document.querySelectorAll('.popover-menu.active').forEach(p => {
        p.classList.remove('active');
        const parentRow = p.closest('.download-row');
        if (parentRow) parentRow.classList.remove('popover-open');
      });
    });

    // Real-time Search Input with 150ms debounce
    let searchDebounce = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          renderDownloads();
        }, 150);
      });
    }

    // View Header Tabs
    const tabByDate = document.getElementById('tab-by-date');
    const tabByGroup = document.getElementById('tab-by-group');

    if (tabByDate && tabByGroup) {
      tabByDate.addEventListener('click', () => {
        tabByDate.classList.add('active');
        tabByGroup.classList.remove('active');
        currentViewMode = 'date';
        renderDownloads();
      });

      tabByGroup.addEventListener('click', () => {
        tabByGroup.classList.add('active');
        tabByDate.classList.remove('active');
        currentViewMode = 'group';
        renderDownloads();
      });
    }

    // Nav Filter Items
    document.querySelectorAll('.nav-item[data-filter]').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item[data-filter]').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        currentFilter = item.getAttribute('data-filter');
        renderDownloads();
      });
    });

    // Open Downloads Folder in OS
    const openFolderHandler = () => {
      if (window.naptureAPI && window.naptureAPI.openDownloadsFolder) {
        window.naptureAPI.openDownloadsFolder();
        showToast('Opened downloads folder');
      } else if (window.naptureAPI && window.naptureAPI.showDownloadedFileInFolder) {
        window.naptureAPI.showDownloadedFileInFolder({});
        showToast('Opened downloads folder');
      }
    };

    const btnOpenFolder = document.getElementById('btn-open-folder');
    if (btnOpenFolder) btnOpenFolder.addEventListener('click', openFolderHandler);

    // Reused Clear Browsing Data modal handling (matching Settings and History pages)
    const modalClear = document.getElementById('modal-clear');
    const btnClearCompleted = document.getElementById('btn-clear-completed');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnConfirmClear = document.getElementById('btn-confirm-clear');

    if (btnClearCompleted && modalClear) {
      btnClearCompleted.addEventListener('click', () => {
        modalClear.style.display = 'flex';
      });
    }

    if (btnCloseModal && modalClear) {
      btnCloseModal.addEventListener('click', () => {
        modalClear.style.display = 'none';
      });
    }

    if (btnConfirmClear && modalClear) {
      btnConfirmClear.addEventListener('click', () => {
        const options = {
          history: !!(document.getElementById('chk-history') && document.getElementById('chk-history').checked),
          cookies: !!(document.getElementById('chk-cookies') && document.getElementById('chk-cookies').checked),
          cache: !!(document.getElementById('chk-cache') && document.getElementById('chk-cache').checked),
          downloads: !!(document.getElementById('chk-downloads') && document.getElementById('chk-downloads').checked)
        };
        btnConfirmClear.textContent = 'Clearing...';
        btnConfirmClear.disabled = true;

        const onClearSuccess = () => {
          modalClear.style.display = 'none';
          btnConfirmClear.textContent = 'Clear Data';
          btnConfirmClear.disabled = false;
          if (options.downloads) {
            allDownloads = allDownloads.filter(d => !d.completed && !d.cancelled);
            selectedIds.clear();
            updateBatchBar();
            renderDownloads();
          }
          showToast('Browsing data cleared.');
        };

        const onClearFail = () => {
          modalClear.style.display = 'none';
          btnConfirmClear.textContent = 'Clear Data';
          btnConfirmClear.disabled = false;
          loadDownloads();
        };

        if (window.naptureAPI && window.naptureAPI.clearBrowsingData) {
          window.naptureAPI.clearBrowsingData(options).then(onClearSuccess).catch(onClearFail);
        } else if (window.naptureAPI && window.naptureAPI.clearDownloadsHistory) {
          window.naptureAPI.clearDownloadsHistory().then(onClearSuccess).catch(onClearFail);
        } else {
          modalClear.style.display = 'none';
          btnConfirmClear.textContent = 'Clear Data';
          btnConfirmClear.disabled = false;
        }
      });
    }

    // Live updates from main process & active download polling
    if (window.naptureAPI && window.naptureAPI.onDownloadUpdated) {
      window.naptureAPI.onDownloadUpdated((updatedList) => {
        allDownloads = updatedList || [];
        renderDownloads();
      });
    }

    // Auto-update download progress when active downloads are progressing
    let progressPollTimer = null;
    function syncActiveDownloadPolling() {
      const hasActive = allDownloads.some(d => !d.completed && !d.cancelled);
      if (hasActive && !progressPollTimer) {
        progressPollTimer = setInterval(async () => {
          if (window.naptureAPI && window.naptureAPI.getRecentDownloads) {
            allDownloads = await window.naptureAPI.getRecentDownloads() || [];
            renderDownloads();
            if (!allDownloads.some(d => !d.completed && !d.cancelled)) {
              clearInterval(progressPollTimer);
              progressPollTimer = null;
            }
          }
        }, 500);
      } else if (!hasActive && progressPollTimer) {
        clearInterval(progressPollTimer);
        progressPollTimer = null;
      }
    }

    const origRenderDownloads = renderDownloads;
    renderDownloads = function() {
      origRenderDownloads();
      syncActiveDownloadPolling();
    };

    // Initial load
    loadDownloads();
  </script>
</body>
</html>`;
}

module.exports = {
  buildDownloadsPage
};
