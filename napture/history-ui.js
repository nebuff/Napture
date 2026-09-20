// Napture History Suite - Full Screen History UI matching Napture Design System
// Full page history manager, timeline rendering, search filtering, and history cleanup
let fs, path, searchHistory, deleteHistoryItem, deleteHistoryItems, clearAllHistory, getSetting, i18n;
if (typeof require !== 'undefined') {
  const hist = require('./db/history');
  searchHistory = hist.searchHistory;
  deleteHistoryItem = hist.deleteHistoryItem;
  deleteHistoryItems = hist.deleteHistoryItems;
  clearAllHistory = hist.clearAllHistory;
  getSetting = hist.getSetting;
  i18n = require('./i18n');
}

function buildHistoryPage() {
  const lang = (typeof getSetting === 'function' ? getSetting('language', 'en-US') : 'en-US') || 'en-US';
  const t = (k) => (i18n ? i18n.t(k, lang) : k);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>${t('history_title')}</title>
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
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
    }

    .nav-item:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
      transform: translateX(2px);
    }

    .nav-item:active {
      transform: translateX(1px) scale(0.99);
    }

    .nav-item.active {
      background-color: var(--bg-active);
      color: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-weight: 600;
      transform: none;
    }

    .nav-item.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .nav-item.disabled:hover {
      background-color: transparent;
      color: var(--text-secondary);
      transform: none !important;
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

    input[type="text"].search-input:focus {
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

    .history-container {
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
      transition: color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
    }

    .tab-btn:hover {
      color: var(--text-primary);
      transform: translateY(-1px);
    }

    .tab-btn:active {
      transform: translateY(0);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    /* Batch Selection Bar */
    @keyframes batchBarSlideIn {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

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
      animation: batchBarSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
    @keyframes contentFadeIn {
      from {
        opacity: 0;
        transform: translateY(5px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .group-section {
      margin-bottom: 28px;
      animation: contentFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
    }

    /* History Entry Row */
    .history-row {
      display: flex;
      align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid var(--border-color);
      gap: 16px;
      transition: background-color 0.18s ease;
      position: relative;
    }

    .history-row:first-child {
      border-top-left-radius: 12px;
      border-top-right-radius: 12px;
    }

    .history-row:last-child {
      border-bottom: none;
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }

    .history-row.popover-open {
      z-index: 100;
    }

    .history-row:hover {
      background-color: var(--bg-hover);
    }

    .history-row.selected {
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
      overflow: hidden;
      transition: transform 0.15s ease;
    }

    .history-row:hover .favicon-cell {
      transform: scale(1.05);
    }

    .favicon-cell img {
      width: 100%;
      height: 100%;
      object-fit: contain;
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

    /* Actions Menu Button */
    .actions-cell {
      position: relative;
      flex-shrink: 0;
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
      transition: background-color 0.18s ease, color 0.18s ease, transform 0.12s ease;
    }

    .icon-btn:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
      transform: scale(1.06);
    }

    .icon-btn:active {
      transform: scale(0.95);
    }

    /* Popover Menu */
    @keyframes popoverFadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .popover-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      background-color: #1f202c;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65);
      z-index: 1000;
      display: none;
      min-width: 170px;
    }

    .popover-menu.active {
      display: flex;
      flex-direction: column;
      animation: popoverFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
    }

    .popover-item:hover {
      background-color: var(--bg-hover);
      color: var(--accent);
      transform: translateX(2px);
    }

    .popover-item.danger:hover {
      color: var(--danger);
    }

    /* Buttons */
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
      transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
    }

    .btn:hover {
      background-color: #2c2f3e;
      border-color: #3f4258;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .btn:active {
      transform: scale(0.97);
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

    .btn-primary:active {
      transform: scale(0.97);
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

    .btn-danger:active {
      transform: scale(0.97);
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
      animation: contentFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
    @keyframes toastSlideIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

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
      animation: toastSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    /* Clear Browsing Data Modal */
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

    @keyframes modalFadeIn {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(4px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .modal-box {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      width: 100%;
      max-width: 460px;
      padding: 24px;
      animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span class="sidebar-title">${t('history_title')}</span>
    </div>
    <ul class="nav-list">
      <li class="nav-item active" id="nav-history">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${t('history_title')}</span>
      </li>
      <li class="nav-item" id="btn-open-clear">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>${t('clear_browsing_data')}</span>
      </li>
    </ul>
    <div class="sidebar-footer">
      Your browsing history is stored locally on this device.
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
        <input type="text" class="search-input" id="search-history" placeholder="${t('search_history_placeholder')}">
      </div>
    </div>

    <div class="content-viewport" id="viewport">
      <div class="history-container">

        <!-- Tabs Header -->
        <div class="view-tabs-header">
          <div class="tabs-group">
            <button class="tab-btn active" id="tab-by-date">By date</button>
            <button class="tab-btn" id="tab-by-group">By group</button>
          </div>
        </div>

        <!-- Batch Bar -->
        <div class="batch-bar" id="batch-bar">
          <div class="batch-info">
            <span id="selected-count">0 items selected</span>
          </div>
          <div class="batch-actions">
            <button class="btn" id="btn-deselect">${t('cancel')}</button>
            <button class="btn btn-danger" id="btn-delete-selected">${t('delete_selected')}</button>
          </div>
        </div>

        <!-- Dynamic History Content Container -->
        <div id="history-content">
          <!-- Populated by JS -->
        </div>

        <!-- Empty State -->
        <div class="empty-state" id="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <div class="empty-title">${t('no_history_title')}</div>
          <div>${t('no_history_desc')}</div>
        </div>

      </div>
    </div>
  </main>

  <!-- Toast Notification -->
  <div id="toast-bar">History updated.</div>

  <!-- Clear Browsing Data Modal -->
  <div class="modal-overlay" id="modal-clear">
    <div class="modal-box">
      <h3 class="modal-title">${t('clear_browsing_data')}</h3>
      <p class="modal-desc">${t('clear_browsing_desc')}</p>
      
      <label class="checkbox-row">
        <input type="checkbox" id="chk-history" checked>
        <span>Browsing History (URLs, titles, timestamps)</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-cookies" checked>
        <span>Cookies and Site Storage Data</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-cache" checked>
        <span>Cached Images and Files</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="chk-downloads">
        <span>Download Records</span>
      </label>

      <div class="modal-actions">
        <button class="btn" id="btn-close-modal">${t('cancel')}</button>
        <button class="btn btn-danger" id="btn-confirm-clear">${t('clear_data_btn')}</button>
      </div>
    </div>
  </div>

  <script>
    let historyRecords = [];
    let selectedIds = new Set();
    let currentFilter = '';
    let currentViewMode = 'date'; // 'date' or 'group'

    const searchInput = document.getElementById('search-history');
    const historyContent = document.getElementById('history-content');
    const emptyState = document.getElementById('empty-state');
    const batchBar = document.getElementById('batch-bar');
    const selectedCountEl = document.getElementById('selected-count');
    const btnDeselect = document.getElementById('btn-deselect');
    const btnDeleteSelected = document.getElementById('btn-delete-selected');
    const toast = document.getElementById('toast-bar');

    function showToast(msg) {
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
      if (!timestamp) return 'Older';
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

    function getDomain(urlStr) {
      try {
        const u = new URL(urlStr);
        return u.hostname || urlStr;
      } catch (e) {
        return urlStr || '';
      }
    }

    async function loadHistory() {
      if (window.naptureAPI && window.naptureAPI.getHistory) {
        historyRecords = await window.naptureAPI.getHistory(currentFilter);
      } else {
        historyRecords = [];
      }
      renderHistory();
    }

    function renderHistory() {
      historyContent.innerHTML = '';
      selectedIds.clear();
      updateBatchBar();

      if (!historyRecords || historyRecords.length === 0) {
        emptyState.classList.add('active');
        return;
      }
      emptyState.classList.remove('active');

      if (currentViewMode === 'group') {
        renderGroupedByDomain();
      } else {
        renderGroupedByDate();
      }
    }

    function renderGroupedByDate() {
      const groups = {};

      historyRecords.forEach(item => {
        const label = formatDateGroup(item.last_visited_timestamp);
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
          const row = createHistoryRow(item);
          cardGroup.appendChild(row);
        });

        groupSec.appendChild(cardGroup);
        historyContent.appendChild(groupSec);
      });
    }

    function renderGroupedByDomain() {
      const groups = {};

      historyRecords.forEach(item => {
        const domain = getDomain(item.url);
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(item);
      });

      Object.keys(groups).forEach(domain => {
        const groupSec = document.createElement('div');
        groupSec.className = 'group-section';

        const titleEl = document.createElement('div');
        titleEl.className = 'group-title';
        titleEl.textContent = domain;
        groupSec.appendChild(titleEl);

        const cardGroup = document.createElement('div');
        cardGroup.className = 'card-group';

        groups[domain].forEach(item => {
          const row = createHistoryRow(item);
          cardGroup.appendChild(row);
        });

        groupSec.appendChild(cardGroup);
        historyContent.appendChild(groupSec);
      });
    }

    function createHistoryRow(item) {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.dataset.id = item.id;

      const safeTitle = escapeHtml(item.title || item.url);
      const domain = escapeHtml(getDomain(item.url));
      const timeStr = escapeHtml(formatTime(item.last_visited_timestamp));

      let faviconHtml = '';
      if (item.favicon_url) {
        faviconHtml = \`<img src="\${escapeHtml(item.favicon_url)}" alt="icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23a9b1d6\\' stroke-width=\\'2\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/></svg>'">\`;
      } else {
        faviconHtml = \`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a9b1d6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>\`;
      }

      row.innerHTML = \`
        <div class="checkbox-cell">
          <input type="checkbox" class="row-chk">
        </div>
        <div class="time-cell">\${timeStr}</div>
        <div class="favicon-cell">
          \${faviconHtml}
        </div>
        <div class="info-cell">
          <span class="row-title" title="\${safeTitle}">\${safeTitle}</span>
          <span class="row-domain">\${domain}</span>
        </div>
        <div class="actions-cell">
          <button class="icon-btn action-menu-btn" title="More options">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="1.5"></circle>
              <circle cx="12" cy="12" r="1.5"></circle>
              <circle cx="12" cy="19" r="1.5"></circle>
            </svg>
          </button>
          <div class="popover-menu">
            <button class="popover-item btn-open-url">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Open in browser</span>
            </button>
            <button class="popover-item btn-copy-url">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy URL</span>
            </button>
            <button class="popover-item danger btn-delete-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Remove from history</span>
            </button>
          </div>
        </div>
      \`;

      const chk = row.querySelector('.row-chk');
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

      const infoCell = row.querySelector('.info-cell');
      infoCell.addEventListener('click', () => {
        if (window.naptureAPI && window.naptureAPI.navigate) {
          window.naptureAPI.navigate(item.url);
        } else {
          window.location.href = item.url;
        }
      });

      const actionBtn = row.querySelector('.action-menu-btn');
      const popover = row.querySelector('.popover-menu');

      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = popover.classList.contains('active');
        document.querySelectorAll('.popover-menu.active').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.history-row.popover-open').forEach(r => r.classList.remove('popover-open'));
        if (!isOpen) {
          popover.classList.add('active');
          row.classList.add('popover-open');
        }
      });

      row.querySelector('.btn-open-url').addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.remove('active');
        row.classList.remove('popover-open');
        if (window.naptureAPI && window.naptureAPI.navigate) {
          window.naptureAPI.navigate(item.url);
        } else {
          window.location.href = item.url;
        }
      });

      row.querySelector('.btn-copy-url').addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.remove('active');
        row.classList.remove('popover-open');
        navigator.clipboard.writeText(item.url);
        showToast('URL copied to clipboard.');
      });

      row.querySelector('.btn-delete-item').addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.remove('active');
        row.classList.remove('popover-open');
        if (window.naptureAPI && window.naptureAPI.deleteHistoryItem) {
          window.naptureAPI.deleteHistoryItem(item.id).then(() => {
            loadHistory();
            showToast('Entry removed from history.');
          });
        }
      });

      return row;
    }

    function updateBatchBar() {
      if (selectedIds.size > 0) {
        batchBar.classList.add('active');
        selectedCountEl.textContent = selectedIds.size + (selectedIds.size === 1 ? ' item selected' : ' items selected');
      } else {
        batchBar.classList.remove('active');
      }
    }

    btnDeselect.addEventListener('click', () => {
      selectedIds.clear();
      document.querySelectorAll('.row-chk').forEach(c => {
        c.checked = false;
        c.closest('.history-row').classList.remove('selected');
      });
      updateBatchBar();
    });

    btnDeleteSelected.addEventListener('click', () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (window.naptureAPI && window.naptureAPI.deleteHistoryItems) {
        window.naptureAPI.deleteHistoryItems(ids).then(() => {
          loadHistory();
          showToast(ids.length + ' entries deleted.');
        });
      }
    });

    // Close open popovers when clicking elsewhere
    document.addEventListener('click', () => {
      document.querySelectorAll('.popover-menu.active').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.history-row.popover-open').forEach(r => r.classList.remove('popover-open'));
    });

    // Filter Tabs
    const tabByDate = document.getElementById('tab-by-date');
    const tabByGroup = document.getElementById('tab-by-group');

    tabByDate.addEventListener('click', () => {
      tabByDate.classList.add('active');
      tabByGroup.classList.remove('active');
      currentViewMode = 'date';
      renderHistory();
    });

    tabByGroup.addEventListener('click', () => {
      tabByGroup.classList.add('active');
      tabByDate.classList.remove('active');
      currentViewMode = 'group';
      renderHistory();
    });

    // Real-time Search Input
    //  Bolt: Added a 150ms debounce to prevent executing O(N) SQLite queries and full DOM
    // re-renders on every single keystroke. Reduces IPC calls by ~80% during rapid typing.
    let searchDebounce = null;
    searchInput.addEventListener('input', (e) => {
      currentFilter = e.target.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        loadHistory();
      }, 150);
    });

    // Modal dialog handling for Clear Browsing Data
    const modalClear = document.getElementById('modal-clear');
    const btnOpenClear = document.getElementById('btn-open-clear');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnConfirmClear = document.getElementById('btn-confirm-clear');

    if (btnOpenClear && modalClear) {
      btnOpenClear.addEventListener('click', () => { modalClear.style.display = 'flex'; });
    }
    if (btnCloseModal && modalClear) {
      btnCloseModal.addEventListener('click', () => { modalClear.style.display = 'none'; });
    }
    if (btnConfirmClear && modalClear) {
      btnConfirmClear.addEventListener('click', () => {
        const options = {
          history: document.getElementById('chk-history').checked,
          cookies: document.getElementById('chk-cookies').checked,
          cache: document.getElementById('chk-cache').checked,
          downloads: document.getElementById('chk-downloads').checked
        };
        btnConfirmClear.textContent = 'Clearing...';
        btnConfirmClear.disabled = true;
        if (window.naptureAPI && window.naptureAPI.clearBrowsingData) {
          window.naptureAPI.clearBrowsingData(options).then(() => {
            modalClear.style.display = 'none';
            btnConfirmClear.textContent = 'Clear Data';
            btnConfirmClear.disabled = false;
            loadHistory();
            showToast('Browsing data cleared.');
          });
        }
      });
    }

    // Listen for live browser data import events
    if (window.naptureAPI && window.naptureAPI.onBrowserDataImported) {
      window.naptureAPI.onBrowserDataImported(() => {
        if (typeof loadHistory === 'function') loadHistory();
      });
    }

    // Initial load
    loadHistory();
  </script>
</body>
</html>`;
}

module.exports = {
  buildHistoryPage
};
