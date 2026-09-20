// Napture Complete Settings Suite - Flat Design System with Live Runtime Binding
// Napture Browser Settings Panel - Preference tabs, theme switching, and config sync
let fs, path, getSetting, setSetting, getAllSettings, saveAllSettings, getAppVersions, isNeProtocolSupported, i18n;
if (typeof require !== 'undefined') {
  fs = require('fs');
  path = require('path');
  const utils = require('./shared-utils');
  getAppVersions = utils.getAppVersions;
  isNeProtocolSupported = utils.isNeProtocolSupported;
  const hist = require('./db/history');
  getSetting = hist.getSetting;
  setSetting = hist.setSetting;
  getAllSettings = hist.getAllSettings;
  saveAllSettings = hist.saveAllSettings;
  i18n = require('./i18n');
}

const DEFAULT_TOOLBAR_LAYOUT = [
  { id: 'home-btn', type: 'system', name: 'Home Button', enabled: true },
  { id: 'sep-1', type: 'separator', name: 'Fixed Separator', enabled: true },
  { id: 'back-btn', type: 'system', name: 'Back Button', enabled: true },
  { id: 'forward-btn', type: 'system', name: 'Forward Button', enabled: true },
  { id: 'reload-btn', type: 'system', name: 'Reload Button', enabled: true },
  { id: 'margin-1', type: 'margin', name: 'Flexible Space', enabled: true },
  { id: 'address-container', type: 'system', name: 'Address Bar & Search', enabled: true }
];

function validateToolbarLayout(layout, defaultLayout = null) {
  const fallback = defaultLayout || DEFAULT_TOOLBAR_LAYOUT;
  if (!Array.isArray(layout) || layout.length === 0) {
    return JSON.parse(JSON.stringify(fallback));
  }

  const validTypes = new Set(['system', 'link', 'folder', 'margin', 'spacer', 'separator']);
  const knownSystemIds = new Set([
    'brand-menu-btn', 'back-btn', 'forward-btn', 'reload-btn', 'home-btn',
    'address-container', 'downloads-btn', 'history-btn', 'bookmarks-btn', 'newtab-btn'
  ]);

  const seenIds = new Set();
  const sanitized = [];
  let hasAddressBar = false;

  for (const item of layout) {
    if (!item || typeof item !== 'object') continue;
    let { id, type, name, url, width, enabled, children } = item;

    if (!id || typeof id !== 'string') continue;
    id = id.trim();
    if (!id) continue;

    type = typeof type === 'string' ? type.toLowerCase().trim() : 'system';
    if (!validTypes.has(type)) {
      type = 'system';
    }

    if (type === 'spacer') type = 'margin';

    // Invariant: Deduplicate unique system items
    if (type === 'system' || knownSystemIds.has(id)) {
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
    } else {
      if (seenIds.has(id)) {
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
      seenIds.add(id);
    }

    if (id === 'address-container') {
      hasAddressBar = true;
      name = name || 'Address Bar & Search';
    }

    name = typeof name === 'string' && name.trim() ? name.trim() : id;

    const cleanItem = {
      id,
      type,
      name,
      enabled: enabled !== false
    };

    if (type === 'link' && url) {
      cleanItem.url = String(url).trim();
    }

    if (type === 'folder') {
      cleanItem.children = Array.isArray(children) ? children.filter(c => c && c.id) : [];
    }

    if (width && typeof width === 'number' && width > 0) {
      cleanItem.width = width;
    }

    sanitized.push(cleanItem);
  }

  // Invariant: Enforce at least 1 address bar
  if (!hasAddressBar) {
    const addressItem = {
      id: 'address-container',
      type: 'system',
      name: 'Address Bar & Search',
      enabled: true
    };
    if (sanitized.length > 0) {
      sanitized.splice(Math.min(sanitized.length, 4), 0, addressItem);
    } else {
      sanitized.push(addressItem);
    }
  }

  return sanitized;
}

function getDefaultSettings() {
  const isNeEnabled = typeof isNeProtocolSupported === 'function' ? isNeProtocolSupported() : true;
  return {
    // 1. Appearance & Features
    dynamicBackground: true,
    defaultZoom: '100',
    folderHoverOpen: false,
    switchToExistingTab: true,

    // 2. Toolbar Settings
    showHomeBtn: true,
    homeUrl: 'napture://welcome',
    addressSuggestions: true,
    showFullUrl: false,
    toolbarLayout: JSON.stringify(DEFAULT_TOOLBAR_LAYOUT),
    safeBrowsing: 'standard',
    doNotTrack: false,
    httpsOnly: false,

    // 3. Search Engine
    searchEngine: 'napture',

    // 4. Startup
    startupMode: 'restore_all',
    customStartupUrl: '',

    // 5. Downloads
    downloadPath: '',
    askSaveLocation: false,
    showDownloadsOverlay: true,

    // 6. Privacy & Security
    clearOnExit: false,
    blockPopups: true,
    blockLocationAccess: true,
    blockMicCamera: true,

    // 7. Languages
    language: 'en-US',

    // 8. System & Performance
    memorySaver: false,
    memoryTarget: 700,
    batterySaver: false,
    performanceMode: 'balanced',
    hardwareAcceleration: true,

    // 9. Protocols & Decentralized Web
    neProtocolEnabled: isNeEnabled,
    neResolvers: JSON.stringify([
      { host: '147.185.221.231', port: 65246, name: 'Lucnas' },
      { host: '147.185.221.231', port: 21811, name: 'Sanas' }
    ]),

    // 10. Quick Site Snippets
    snippets: JSON.stringify([])
  };
}

function buildSettingsPage() {
  const stored = getAllSettings();
  const defaults = getDefaultSettings();
  const settings = { ...defaults, ...stored };
  const lang = settings.language || 'en-US';
  const t = (k) => (i18n ? i18n.t(k, lang) : k);
  const { naptureVersion, newebChromiumVersion } = getAppVersions();
  const neSupported = typeof isNeProtocolSupported === 'function' ? isNeProtocolSupported() : true;

  const versions = {
    electron: process.versions.electron || '43.2.0',
    chrome: process.versions.chrome || '150.0.7871.129',
    node: process.versions.node || '22.x',
    v8: process.versions.v8 || '13.x'
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>Settings</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* Fully Flat Napture Design System */
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
      --success: #28a745;
      --font-main: 'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-app); }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

    body {
      background-color: #0F0F14;
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
      transform: none;
    }

    .nav-item * {
      pointer-events: none;
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
      padding: 0 36px;
      flex-shrink: 0;
    }

    .search-input-wrapper {
      position: relative;
      width: 100%;
      max-width: 420px;
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

    .search-input:focus {
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
    }

    .content-viewport {
      flex-grow: 1;
      overflow-y: auto;
      padding: 32px 40px;
    }

    .settings-container {
      max-width: 760px;
      margin: 0 auto;
      padding-bottom: 60px;
    }

    @keyframes sectionFadeIn {
      from {
        opacity: 0;
        transform: translateY(5px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .section {
      display: none;
      margin-bottom: 32px;
    }

    .section.active {
      display: block;
      animation: sectionFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .section.search-active {
      display: block;
    }

    .section-header {
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.3px;
    }

    /* Flat Card Group */
    .card-group {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 20px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      gap: 20px;
      transition: background-color 0.18s ease;
    }

    .card-row:hover {
      background-color: rgba(255, 255, 255, 0.015);
    }

    .card-row:last-child {
      border-bottom: none;
    }

    .row-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .row-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .row-desc {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Form Controls */
    .control-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    select, input[type="text"] {
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      padding: 7px 12px;
      font-family: inherit;
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    select {
      cursor: pointer;
      padding-right: 28px;
    }

    select:focus, input[type="text"]:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(127, 140, 255, 0.15);
    }

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

    /* Flat Toggle Switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }

    .switch input { opacity: 0; width: 0; height: 0; }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #282a36;
      border: 1px solid var(--border-color);
      border-radius: 20px;
      transition: background-color 0.22s ease, border-color 0.22s ease;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 2px;
      bottom: 2px;
      background-color: #767a8c;
      border-radius: 50%;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease;
    }

    input:checked + .slider {
      background-color: var(--accent);
      border-color: var(--accent);
    }

    input:checked + .slider:before {
      transform: translateX(16px);
      background-color: #ffffff;
    }

    /* Flat Radio Option Grid */
    .radio-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      width: 100%;
      padding: 16px 20px;
    }

    .radio-grid.three-col {
      grid-template-columns: repeat(3, 1fr);
    }

    @media (max-width: 768px) {
      .radio-grid.three-col {
        grid-template-columns: 1fr;
      }
    }

    .radio-card {
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 14px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
    }

    .radio-card:hover {
      border-color: rgba(127, 140, 255, 0.4);
      background-color: rgba(255, 255, 255, 0.04);
    }

    .radio-card:active {
      background-color: rgba(255, 255, 255, 0.06);
    }

    .radio-card.active {
      border-color: var(--accent);
      background-color: #20212a;
    }

    .radio-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary);
    }

    .radio-sub {
      font-size: 11px;
      color: var(--text-secondary);
    }

    /* Flat Metrics Table */
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }

    .metrics-table th, .metrics-table td {
      padding: 12px 20px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      font-size: 13px;
    }

    .metrics-table tr:last-child td {
      border-bottom: none;
    }

    .metrics-table td:last-child {
      text-align: right;
      font-family: monospace;
      color: #8c98ff;
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
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      animation: toastSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: opacity 0.2s ease, transform 0.2s ease;
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

    /* Modal Dialog */
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

    /* Toolbar Customizer Visual Builder Suite */
    .toolbar-customizer-modal-box {
      max-width: 860px !important;
      width: 92vw !important;
      max-height: 90vh !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      padding: 24px 28px !important;
    }

    .toolbar-builder-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      flex: 1;
      padding-right: 4px;
      max-height: calc(90vh - 200px);
    }

    .builder-section {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .builder-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .builder-section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .builder-section-subtitle {
      font-size: 11px;
      color: var(--text-secondary);
    }

    /* Live Preview Bar */
    .toolbar-live-preview-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(14, 15, 20, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      min-height: 42px;
      width: 100%;
      box-sizing: border-box;
      overflow-x: auto;
    }

    .preview-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    .preview-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      border-radius: 6px;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-primary);
      border: 1px solid rgba(255, 255, 255, 0.08);
      white-space: nowrap;
      user-select: none;
      flex-shrink: 0;
      padding: 0 8px;
      gap: 5px;
    }

    .preview-item.preview-btn {
      width: 28px;
      padding: 0;
      color: var(--text-secondary);
    }

    .preview-item.preview-address {
      flex: 1 1 180px;
      min-width: 130px;
      max-width: 440px;
      height: 28px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(127, 140, 255, 0.3);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      font-size: 11px;
      justify-content: flex-start;
    }

    .preview-item.preview-spacer {
      flex: 1 1 0px;
      min-width: 24px;
      height: 24px;
      border: 1px dashed rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.02);
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .preview-item.preview-separator {
      flex: 0 0 10px;
      width: 10px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      padding: 0;
    }

    .preview-item.preview-separator::after {
      content: '';
      width: 1px;
      height: 16px;
      background: rgba(255, 255, 255, 0.25);
    }

    /* Active Toolbar Slots */
    .active-slots-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 52px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      align-items: center;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .active-slots-container.drag-over-tray {
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.4);
    }

    .toolbar-slot-card {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--bg-hover);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: grab;
      user-select: none;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      position: relative;
    }

    .toolbar-slot-card:hover {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.08);
    }

    .toolbar-slot-card.is-address {
      border-color: rgba(127, 140, 255, 0.4);
      background: rgba(127, 140, 255, 0.08);
    }

    .toolbar-slot-card.dragging {
      opacity: 0.35;
      cursor: grabbing;
    }

    .toolbar-slot-card.drop-before::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--accent);
      border-radius: 3px;
      box-shadow: 0 0 8px var(--accent);
      z-index: 10;
      pointer-events: none;
    }

    .toolbar-slot-card.drop-after::after {
      content: '';
      position: absolute;
      right: -6px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--accent);
      border-radius: 3px;
      box-shadow: 0 0 8px var(--accent);
      z-index: 10;
      pointer-events: none;
    }

    .slot-drag-handle {
      color: var(--text-muted);
      cursor: grab;
      display: flex;
      align-items: center;
    }

    .slot-icon {
      color: var(--accent);
      display: flex;
      align-items: center;
    }

    .slot-name {
      font-weight: 500;
      font-size: 12px;
      white-space: nowrap;
    }

    .slot-type-badge {
      font-size: 9px;
      color: var(--text-muted);
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      text-transform: uppercase;
    }

    .slot-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: 4px;
    }

    .slot-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .slot-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .slot-btn:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
    }

    .slot-btn.remove-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    /* Available Items Tray */
    .tray-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 8px;
    }

    .tray-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: grab;
      transition: all 0.15s ease;
      user-select: none;
    }

    .tray-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-1px);
    }

    .tray-card.in-use {
      opacity: 0.45;
      cursor: not-allowed;
      background: rgba(0, 0, 0, 0.15);
      border-color: rgba(255, 255, 255, 0.04);
    }

    .tray-card.in-use:hover {
      transform: none;
    }

    .tray-card-left {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .tray-card-icon {
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .tray-card-info {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tray-card-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .tray-card-desc {
      font-size: 10px;
      color: var(--text-muted);
    }

    .tray-add-btn {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(127, 140, 255, 0.15);
      color: var(--accent);
      border: 1px solid rgba(127, 140, 255, 0.3);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .tray-add-btn:hover {
      background: var(--accent);
      color: #fff;
    }

    .tray-status-badge {
      font-size: 10px;
      color: var(--text-muted);
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Context menu in settings */
    .customizer-context-menu {
      position: fixed;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      padding: 4px;
      z-index: 3000;
      min-width: 150px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .customizer-context-menu.hidden {
      display: none !important;
    }

    .customizer-context-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      width: 100%;
    }

    .customizer-context-item:hover {
      background: var(--bg-hover);
      color: var(--accent);
    }

    /* Software Update Clean Layout */
    .update-version-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 20px;
      background: rgba(127, 140, 255, 0.15);
      color: var(--accent);
      border: 1px solid rgba(127, 140, 255, 0.25);
    }

    .alpha-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 170, 0, 0.18);
      color: #ffaa00;
      border: 1px solid rgba(255, 170, 0, 0.35);
      margin-left: 6px;
      display: inline-block;
      vertical-align: middle;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .btn-success {
      background-color: #10b981;
      border-color: #10b981;
      color: #ffffff;
    }

    .btn-success:hover {
      background-color: #059669;
      border-color: #059669;
    }

    .btn-update-icon {
      width: 14px;
      height: 14px;
      display: inline-block;
      vertical-align: middle;
      transition: transform 0.3s ease;
    }

    .btn.checking .btn-update-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .update-release-notes {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.6;
      background: rgba(255, 255, 255, 0.02);
    }

    .update-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 500;
    }
    .update-status-badge.success { color: #34d399; }
    .update-status-badge.info { color: #818cf8; }
    .update-status-badge.error { color: #f87171; }

    /* Sync Section Styles */
    .sync-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .sync-status-badge.active {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .sync-status-badge.inactive {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      border: 1px solid var(--border-color);
    }
    .sync-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .sync-code-container {
      background: #0f1015;
      border: 1px dashed rgba(127, 140, 255, 0.4);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      margin: 12px 20px;
      animation: sectionFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .sync-code-text {
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 3px;
      color: var(--accent);
      user-select: all;
    }
    .sync-code-timer {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .device-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 20px 16px 20px;
    }
    .device-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
    }
    .device-item:hover {
      background: rgba(255, 255, 255, 0.035);
      border-color: rgba(127, 140, 255, 0.28);
      transform: translateX(2px);
    }
    .device-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .device-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: rgba(127, 140, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }
    .device-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .device-sub {
      font-size: 11.5px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .activity-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      transition: color 0.3s ease;
    }
    .activity-status.online {
      color: #34d399;
    }
    .activity-status.offline {
      color: var(--text-muted);
    }
    .activity-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: currentColor;
      display: inline-block;
      flex-shrink: 0;
      transition: background-color 0.3s ease, box-shadow 0.3s ease;
    }
    .activity-status.online .activity-dot {
      background-color: #10b981;
    }
    .device-tag-this {
      font-size: 10.5px;
      padding: 2px 6px;
      background: rgba(127, 140, 255, 0.2);
      color: var(--accent);
      border-radius: 4px;
      margin-left: 6px;
    }

    /* Quick Site Snippets Styles */
    .snippet-prefix-wrapper {
      display: flex;
      align-items: center;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .snippet-prefix-wrapper:focus-within {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px rgba(127, 140, 255, 0.15);
    }
    .snippet-dot-prefix {
      padding: 7px 0 7px 10px;
      color: #767a8c;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }
    .snippet-prefix-wrapper input[type="text"] {
      border: none !important;
      box-shadow: none !important;
      background: transparent !important;
      padding-left: 2px !important;
      border-radius: 0 !important;
      flex: 1;
    }

    /* Protocols & Resolver Cluster Styles */
    .resolver-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid var(--border-color);
      transition: background-color 0.15s ease;
    }
    .resolver-item:last-child {
      border-bottom: none;
    }
    .resolver-item:hover {
      background-color: var(--bg-hover);
    }
    .resolver-meta {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .resolver-priority {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }
    .resolver-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .resolver-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .resolver-endpoint {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--font-mono, monospace);
    }
    .resolver-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .resolver-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .resolver-badge.online {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
    }
    .resolver-badge.offline {
      background: rgba(248, 113, 113, 0.12);
      color: #f87171;
    }
    .resolver-badge.testing {
      background: rgba(127, 140, 255, 0.12);
      color: var(--accent);
    }
  </style>
</head>
<body>

  <!-- Left Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span class="sidebar-title">${t('settings_title')}</span>
    </div>
    <ul class="nav-list">
      <li class="nav-item active" data-target="appearance">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.72 1.7-1.61 0-.43-.17-.83-.44-1.13-.27-.3-.44-.7-.44-1.13 0-.89.72-1.61 1.61-1.61h1.9c3.09 0 5.67-2.58 5.67-5.67 0-4.97-4.43-8.85-10-8.85z"></path>
        </svg>
        <span>${t('nav_appearance')}</span>
      </li>
      <li class="nav-item" data-target="toolbar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        <span>${t('nav_toolbar')}</span>
      </li>
      <li class="nav-item" data-target="snippets">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 18l6-6-6-6"></path>
          <path d="M8 6l-6 6 6 6"></path>
        </svg>
        <span>${t('nav_snippets')}</span>
      </li>
      <li class="nav-item" data-target="import">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>${t('import')}</span>
      </li>
      <li class="nav-item" data-target="sync">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
        <span>${t('nav_sync')}</span>
      </li>
      <li class="nav-item" data-target="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>${t('nav_search')}</span>
      </li>
      <li class="nav-item" data-target="privacy">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <span>${t('nav_privacy')}</span>
      </li>

      <li class="nav-item" data-target="downloads">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${t('nav_downloads')}</span>
      </li>
      <li class="nav-item" data-target="languages">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>${t('nav_languages')}</span>
      </li>
      <li class="nav-item" data-target="system">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
          <rect x="9" y="9" width="6" height="6"></rect>
          <line x1="9" y1="1" x2="9" y2="4"></line>
          <line x1="15" y1="1" x2="15" y2="4"></line>
          <line x1="9" y1="20" x2="9" y2="23"></line>
          <line x1="15" y1="20" x2="15" y2="23"></line>
          <line x1="20" y1="9" x2="23" y2="9"></line>
          <line x1="20" y1="15" x2="23" y2="15"></line>
          <line x1="1" y1="9" x2="4" y2="9"></line>
          <line x1="1" y1="15" x2="4" y2="15"></line>
        </svg>
        <span>${t('nav_system')}</span>
      </li>
      ${neSupported ? `
      <li class="nav-item" data-target="protocols">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
          <line x1="6" y1="6" x2="6.01" y2="6"></line>
          <line x1="6" y1="18" x2="6.01" y2="18"></line>
        </svg>
        <span>${t('nav_protocols')}</span>
      </li>` : ''}
      <li class="nav-item" data-target="default-browser">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <line x1="9" y1="20" x2="15" y2="20"></line>
        </svg>
        <span>${t('nav_default_browser')}</span>
      </li>
      <li class="nav-item" data-target="reset">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
        <span>${t('nav_reset')}</span>
      </li>
      <li class="nav-item" data-target="about">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>${t('nav_about')}</span>
      </li>
    </ul>
  </aside>

  <!-- Main Area -->
  <main class="main-area">
    <div class="top-bar">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="search-input" id="search-filter" placeholder="${t('search_settings_placeholder')}">
      </div>
    </div>

    <div class="content-viewport" id="viewport">
      <div class="settings-container">

        <!-- SECTION 1: Appearance -->
        <div class="section active" id="sec-appearance">
          <div class="section-header"><h2 class="section-title">${t('sec_appearance')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('dynamic_bg_label')}</div>
                <div class="row-desc">${t('dynamic_bg_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-dynamicBackground" ${settings.dynamicBackground ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('zoom_label')}</div>
                <div class="row-desc">${t('zoom_desc')}</div>
              </div>
              <select id="setting-defaultZoom">
                <option value="90" ${settings.defaultZoom === '90' ? 'selected' : ''}>90%</option>
                <option value="100" ${settings.defaultZoom === '100' ? 'selected' : ''}>100%</option>
                <option value="110" ${settings.defaultZoom === '110' ? 'selected' : ''}>110%</option>
                <option value="125" ${settings.defaultZoom === '125' ? 'selected' : ''}>125%</option>
                <option value="150" ${settings.defaultZoom === '150' ? 'selected' : ''}>150%</option>
              </select>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('folder_hover_label')}</div>
                <div class="row-desc">${t('folder_hover_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-folderHoverOpen" ${settings.folderHoverOpen ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('switch_to_existing_tab_label')}</div>
                <div class="row-desc">${t('switch_to_existing_tab_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-switchToExistingTab" ${settings.switchToExistingTab !== false ? 'checked' : ''}><span class="slider"></span></label>
            </div>
          </div>
        </div>

        <!-- SECTION: Quick Site Snippets -->
        <div class="section" id="sec-snippets">
          <div class="section-header" style="display: flex; align-items: center; justify-content: space-between;">
            <h2 class="section-title">${t('sec_snippets')}</h2>
            <button class="btn btn-primary" id="btn-add-snippet">${t('add_snippet_btn')}</button>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">
            ${t('snippets_desc')}
          </div>
          <div class="card-group" id="snippets-list-container">
            <!-- Dynamically populated snippet rows -->
          </div>
        </div>

        <!-- SECTION 2: Toolbar -->
        <div class="section" id="sec-toolbar">
          <div class="section-header"><h2 class="section-title">${t('sec_toolbar')}</h2></div>
          <div class="card-group">
            <div class="card-row" id="home-url-row">
              <div class="row-info">
                <div class="row-label">${t('home_url_label')}</div>
                <div class="row-desc">${t('home_url_desc')}</div>
              </div>
              <input type="text" id="setting-homeUrl" value="${settings.homeUrl}" style="width: 220px;">
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('suggestions_label')}</div>
                <div class="row-desc">${t('suggestions_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-addressSuggestions" ${settings.addressSuggestions ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('full_url_label')}</div>
                <div class="row-desc">${t('full_url_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-showFullUrl" ${settings.showFullUrl ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('customize_toolbar_label') || 'Customize Toolbar'}</div>
                <div class="row-desc">${t('customize_toolbar_desc') || 'Customize toolbar button visibility, order, custom link items, spacers, and configuration code'}</div>
              </div>
              <button class="btn btn-primary" id="btn-customize-toolbar">${t('customize_toolbar_btn') || 'Customize Toolbar'}</button>
            </div>
          </div>
        </div>

        <!-- SECTION 3: Import Data -->
        <div class="section" id="sec-import">
          <div class="section-header"><h2 class="section-title">${t('sec_bookmarks')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('import_bookmarks_btn')}</div>
                <div class="row-desc">Import exported HTML or JSON bookmark files from Chrome, Firefox, Safari, Edge, or Brave</div>
              </div>
              <button class="btn btn-primary" id="btn-import-file">Choose File...</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Auto-Detect & Import Installed Browsers</div>
                <div class="row-desc">Automatically scan and import bookmarks and history from all installed browsers on this machine</div>
              </div>
              <button class="btn btn-primary btn-import-target" data-browser="all">Auto-Import All</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Google Chrome</div>
                <div class="row-desc">Import bookmarks and history from Google Chrome & Chromium profiles</div>
              </div>
              <button class="btn btn-primary btn-import-target" data-browser="chrome">Import from Chrome</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Microsoft Edge</div>
                <div class="row-desc">Import bookmarks and browsing history from Edge</div>
              </div>
              <button class="btn btn-primary btn-import-target" data-browser="edge">Import from Edge</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Mozilla Firefox</div>
                <div class="row-desc">Import bookmarks and browsing history from Firefox</div>
              </div>
              <button class="btn btn-primary btn-import-target" data-browser="firefox">Import from Firefox</button>
            </div>
          </div>
        </div>

        <!-- SECTION: Zero-Knowledge Sync -->
        <div class="section" id="sec-sync">
          <div class="section-header">
            <h2 class="section-title">${t('nav_sync')}</h2>
          </div>
          <div id="sync-view-container">
            <div class="card-group">
              <div class="card-row">
                <div class="row-info">
                  <div class="row-label">Loading Sync Engine...</div>
                  <div class="row-desc">Checking encryption keys and linked devices</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION 4: Search Engine -->
        <div class="section" id="sec-search">
          <div class="section-header"><h2 class="section-title">${t('sec_search')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('search_engine_label')}</div>
                <div class="row-desc">${t('search_engine_desc')}</div>
              </div>
              <select id="setting-searchEngine">
                <option value="napture" ${settings.searchEngine === 'napture' ? 'selected' : ''}>Napture Search (Default)</option>
                <option value="google" ${settings.searchEngine === 'google' ? 'selected' : ''}>Google</option>
                <option value="duckduckgo" ${settings.searchEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
                <option value="bing" ${settings.searchEngine === 'bing' ? 'selected' : ''}>Microsoft Bing</option>
                <option value="brave" ${settings.searchEngine === 'brave' ? 'selected' : ''}>Brave Search</option>
                <option value="ecosia" ${settings.searchEngine === 'ecosia' ? 'selected' : ''}>Ecosia</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 5: Privacy & Security -->
        <div class="section" id="sec-privacy">
          <div class="section-header"><h2 class="section-title">${t('sec_privacy')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('clear_browsing_data')}</div>
                <div class="row-desc">${t('clear_browsing_desc')}</div>
              </div>
              <button class="btn btn-danger" id="btn-open-clear">${t('clear_data_btn')}</button>
            </div>
          </div>
          <div class="card-group">
            <div class="radio-grid" id="safeBrowsing-selection">
              <div class="radio-card ${settings.safeBrowsing === 'enhanced' ? 'active' : ''}" data-val="enhanced">
                <div class="radio-title">${t('sb_strict_title')}</div>
                <div class="radio-sub">${t('sb_strict_desc')}</div>
              </div>
              <div class="radio-card ${settings.safeBrowsing === 'standard' ? 'active' : ''}" data-val="standard">
                <div class="radio-title">${t('sb_standard_title')}</div>
                <div class="radio-sub">${t('sb_standard_desc')}</div>
              </div>
              <div class="radio-card ${settings.safeBrowsing === 'off' ? 'active' : ''}" data-val="off">
                <div class="radio-title">${t('sb_disabled_title')}</div>
                <div class="radio-sub">${t('sb_disabled_desc')}</div>
              </div>
            </div>
          </div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Third-Party Cookies & Storage</div>
                <div class="row-desc">Control how websites store site identifiers across cross-origin frames</div>
              </div>
              <select id="setting-blockCookies">
                <option value="incognito" ${settings.blockCookies === 'incognito' ? 'selected' : ''}>Block in Incognito only</option>
                <option value="all" ${settings.blockCookies === 'all' ? 'selected' : ''}>Block all third-party cookies</option>
                <option value="allow" ${settings.blockCookies === 'allow' ? 'selected' : ''}>Allow all cookies</option>
              </select>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('dnt_label')}</div>
                <div class="row-desc">${t('dnt_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-doNotTrack" ${settings.doNotTrack ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('https_only_label')}</div>
                <div class="row-desc">${t('https_only_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-httpsOnly" ${settings.httpsOnly ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Secure DNS over HTTPS (DoH)</div>
                <div class="row-desc">Encrypt domain naming resolution through verified resolvers</div>
              </div>
              <select id="setting-secureDns">
                <option value="cloudflare" ${settings.secureDns === 'cloudflare' ? 'selected' : ''}>Cloudflare (1.1.1.1)</option>
                <option value="google" ${settings.secureDns === 'google' ? 'selected' : ''}>Google Public DNS (8.8.8.8)</option>
                <option value="os" ${settings.secureDns === 'os' ? 'selected' : ''}>Operating System Default</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 7: Downloads -->
        <div class="section" id="sec-downloads">
          <div class="section-header"><h2 class="section-title">${t('sec_downloads')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('download_location_label')}</div>
                <div class="row-desc" id="display-download-path">${settings.downloadPath || 'Default OS Downloads directory'}</div>
              </div>
              <button class="btn" id="btn-change-download">${t('change_folder')}</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('ask_download_label')}</div>
                <div class="row-desc">${t('ask_download_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-askSaveLocation" ${settings.askSaveLocation ? 'checked' : ''}><span class="slider"></span></label>
            </div>
          </div>
        </div>

        <!-- SECTION 8: Languages -->
        <div class="section" id="sec-languages">
          <div class="section-header"><h2 class="section-title">${t('sec_languages')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('interface_lang_label')}</div>
                <div class="row-desc">${t('interface_lang_desc')}</div>
              </div>
              <select id="setting-language">
                <option value="en-US" ${settings.language === 'en-US' ? 'selected' : ''}>English (United States)</option>
                <option value="en-CA" ${settings.language === 'en-CA' ? 'selected' : ''}>English (Canadian)</option>
                <option value="cute" ${settings.language === 'cute' ? 'selected' : ''}>Cute Engwish</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 9: System & Performance -->
        <div class="section" id="sec-system">
          <div class="section-header"><h2 class="section-title">${t('sec_system')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('perf_profile_label')}</div>
                <div class="row-desc">${t('perf_profile_desc')}</div>
              </div>
            </div>
            <div class="radio-grid three-col" id="performanceMode-selection">
              <div class="radio-card ${(settings.performanceMode === 'battery_saver' || (settings.performanceMode !== 'balanced' && settings.performanceMode !== 'performance' && settings.batterySaver)) ? 'active' : ''}" data-val="battery_saver">
                <div class="radio-title">${t('perf_battery_title')} <span class="alpha-badge">Alpha</span></div>
                <div class="radio-sub">${t('perf_battery_sub')}</div>
              </div>
              <div class="radio-card ${(settings.performanceMode === 'balanced' || (!settings.performanceMode && !settings.batterySaver)) ? 'active' : ''}" data-val="balanced">
                <div class="radio-title">${t('perf_balanced_title')}</div>
                <div class="radio-sub">${t('perf_balanced_sub')}</div>
              </div>
              <div class="radio-card ${settings.performanceMode === 'performance' ? 'active' : ''}" data-val="performance">
                <div class="radio-title">${t('perf_perf_title')}</div>
                <div class="radio-sub">${t('perf_perf_sub')}</div>
              </div>
            </div>
          </div>

          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Memory Saver <span class="alpha-badge">Alpha</span></div>
                <div class="row-desc">Free up system memory by unbinding unused background tabs</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-memorySaver" ${settings.memorySaver ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Target Memory Usage (MB)</div>
                <div class="row-desc">Control the maximum memory footprint before tabs are suspended</div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                <input type="range" id="setting-memoryTarget" min="200" max="5000" step="100" value="${settings.memoryTarget || 700}" ${!settings.memorySaver ? 'disabled' : ''} style="flex: 1;">
                <span id="memoryTargetDisplay" style="min-width: 60px; text-align: right; font-size: 0.9rem; color: var(--text-secondary);">${settings.memoryTarget || 700} MB</span>
              </div>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('hw_accel_label')}</div>
                <div class="row-desc">${t('hw_accel_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-hardwareAcceleration" ${settings.hardwareAcceleration ? 'checked' : ''}><span class="slider"></span></label>
            </div>
          </div>
        </div>

        ${neSupported ? `
        <!-- SECTION: Protocols & Neweb (ne://) -->
        <div class="section" id="sec-protocols">
          <div class="section-header"><h2 class="section-title">${t('sec_protocols')}</h2></div>

          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('ne_protocol_label')}</div>
                <div class="row-desc">${t('ne_protocol_desc')}</div>
              </div>
              <label class="switch"><input type="checkbox" id="setting-neProtocolEnabled" ${settings.neProtocolEnabled !== false ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('dns_nodes_label')}</div>
                <div class="row-desc">${t('dns_nodes_desc')}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn" id="btn-flush-ne-dns">${t('flush_dns_cache')}</button>
                <button class="btn" id="btn-test-resolvers">Test All</button>
              </div>
            </div>
          </div>

          <div class="card-group">
            <div class="card-row" style="border-bottom: 1px solid var(--border-color);">
              <div class="row-info">
                <div class="row-label">Neweb DNS Resolvers</div>
                <div class="row-desc">Prioritized resolution cluster. Queries the top node and fails over sequentially if unreachable.</div>
              </div>
              <button class="btn" id="btn-reset-resolvers">${t('reset_factory_nodes')}</button>
            </div>

            <div id="resolvers-list-container" style="display: flex; flex-direction: column;">
              <!-- Dynamically populated rows -->
            </div>

            <div class="card-row" style="border-top: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.015); gap: 10px; flex-wrap: wrap;">
              <div class="row-info" style="min-width: 140px; flex: 1;">
                <div class="row-label" style="font-size: 12px; margin-bottom: 2px;">${t('add_node')}</div>
                <div class="row-desc" style="font-size: 11px;">Configure additional DNS responder nodes</div>
              </div>
              <div style="display: flex; gap: 8px; flex: 2; min-width: 280px; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
                <input type="text" id="new-resolver-name" placeholder="Name (optional)" style="flex: 1; min-width: 100px; padding: 6px 10px; font-size: 12px;">
                <input type="text" id="new-resolver-host" placeholder="IP / Host" style="flex: 1.2; min-width: 110px; padding: 6px 10px; font-size: 12px;">
                <input type="number" id="new-resolver-port" placeholder="Port" value="53" style="width: 64px; padding: 6px 8px; font-size: 12px;">
                <button class="btn btn-primary" id="btn-add-resolver" style="padding: 6px 14px;">${t('add_node')}</button>
              </div>
              <div id="add-resolver-error" style="width: 100%; color: var(--danger); font-size: 11.5px; margin-top: 2px; display: none;"></div>
            </div>
          </div>
        </div>` : ''}

        <!-- SECTION 10b: Default Browser -->
        <div class="section" id="sec-default-browser">
          <div class="section-header"><h2 class="section-title">${t('sec_default_browser')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('default_browser_label')}</div>
                <div class="row-desc" id="default-browser-status">${t('default_browser_desc')}</div>
              </div>
              <button class="btn btn-primary" id="btn-make-default" style="display: none;">${t('make_default_btn')}</button>
              <div id="badge-default-browser" class="update-status-badge success" style="display: none; padding: 6px 12px; border-radius: 4px; background: rgba(52, 211, 153, 0.1); font-weight: 600; font-size: 13px;">Default Browser</div>
            </div>
          </div>
        </div>

        <!-- SECTION 11: Reset -->
        <div class="section" id="sec-reset">
          <div class="section-header"><h2 class="section-title">${t('sec_reset')}</h2></div>
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">${t('restore_defaults_label')}</div>
                <div class="row-desc">${t('restore_defaults_desc')}</div>
              </div>
              <button class="btn btn-danger" id="btn-reset-defaults">${t('restore_defaults_btn')}</button>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label" style="color: var(--danger, #ff4d4f); font-weight: 600;">${t('reset_all_label')}</div>
                <div class="row-desc">${t('reset_all_desc')}</div>
              </div>
              <button class="btn btn-danger" id="btn-reset-all" style="background: #e53935; border-color: #d32f2f;">${t('reset_all_btn')}</button>
            </div>
          </div>
        </div>

        <!-- SECTION 12: About Napture -->
        <div class="section" id="sec-about">
          <div class="section-header"><h2 class="section-title">${t('sec_about')}</h2></div>

          <!-- Software Update Card Group -->
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label" style="display: flex; align-items: center; gap: 10px;">
                  Napture Browser
                  <span class="update-version-badge">v${naptureVersion.replace(/^v/, '')}</span>
                </div>
                <div class="row-desc" id="update-card-status">${t('about_desc')}</div>
              </div>
              <button class="btn btn-primary" id="btn-check-update">
                <svg class="btn-update-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
                <span id="btn-check-update-text">${t('check_updates_btn')}</span>
              </button>
            </div>
            <div class="update-release-notes" id="update-card-notes" style="display: none;"></div>
            <div class="update-progress-container" id="update-card-progress" style="display: none; margin-top: 12px; width: 100%;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; color: var(--text-secondary);">
                <span id="update-progress-status">Preparing download...</span>
                <span id="update-progress-percent">0%</span>
              </div>
              <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08);">
                <div id="update-progress-bar-inner" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.2s ease;"></div>
              </div>
            </div>
          </div>

          <!-- Technical Metrics Table -->
          <div class="card-group">
            <table class="metrics-table">
              <tr><td>Napture Browser Version</td><td>v${naptureVersion.replace(/^v/, '')}</td></tr>
              <tr><td>Neweb-Chromium Engine</td><td>${newebChromiumVersion}</td></tr>
              <tr><td>Embedded Chromium Engine</td><td>v${versions.chrome}</td></tr>
              <tr><td>Electron Framework Runtime</td><td>v${versions.electron}</td></tr>
              <tr><td>Node.js Core Runtime</td><td>v${versions.node}</td></tr>
              <tr><td>V8 JavaScript Engine</td><td>v${versions.v8}</td></tr>
              <tr><td>SQLite Database Engine</td><td>better-sqlite3 (v13.0.1)</td></tr>
            </table>
          </div>
        </div>

      </div>
    </div>
  </main>

  <!-- Clear Browsing Data Modal -->
  <div class="modal-overlay" id="modal-clear">
    <div class="modal-box">
      <h3 class="modal-title">Clear Browsing Data</h3>
      <p class="modal-desc">Select which records to delete from the local SQLite database and Chromium storage cache:</p>
      <label class="checkbox-row"><input type="checkbox" id="chk-history" checked><span>Browsing History (SQLite table)</span></label>
      <label class="checkbox-row"><input type="checkbox" id="chk-cookies" checked><span>Cookies & Site Storage</span></label>
      <label class="checkbox-row"><input type="checkbox" id="chk-cache" checked><span>Cached Web Images and Files</span></label>
      <label class="checkbox-row"><input type="checkbox" id="chk-downloads"><span>Recent Downloads History List</span></label>
      <div class="modal-actions">
        <button class="btn" id="btn-close-modal">Cancel</button>
        <button class="btn btn-danger" id="btn-confirm-clear">Clear Data</button>
      </div>
    </div>
  </div>

  <!-- Customize Toolbar Modal -->
  <div class="modal-overlay" id="modal-toolbar-customizer">
    <div class="modal-box toolbar-customizer-modal-box">
      <div class="modal-header-custom">
        <h3 class="modal-title" style="margin-bottom: 4px;">${t('customize_toolbar_label') || 'Customize Toolbar'}</h3>
        <p class="modal-desc" style="margin-bottom: 0;">Customize your top browser toolbar layout. Drag slots to reorder, add items from the tray, or configure custom links and spacers.</p>
      </div>

      <div style="display: flex; gap: 8px; margin: 12px 0 14px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
        <button class="btn btn-secondary toolbar-tab-btn" id="tab-toolbar-visual" style="font-size: 12px; padding: 6px 14px; background: var(--bg-hover);">Visual Layout</button>
        <button class="btn btn-secondary toolbar-tab-btn" id="tab-toolbar-code" style="font-size: 12px; padding: 6px 14px;">Code / JSON Editor</button>
      </div>

      <!-- Visual View -->
      <div id="toolbar-visual-view" class="toolbar-builder-container">
        <!-- Live Preview Pane -->
        <div class="builder-section">
          <div class="builder-section-header">
            <div class="builder-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              <span>Live Toolbar Preview</span>
            </div>
            <span class="builder-section-subtitle">Real-time preview of the top bar</span>
          </div>
          <div id="toolbar-live-preview" class="toolbar-live-preview-bar">
            <!-- Dynamic Preview Elements -->
          </div>
        </div>

        <!-- Active Toolbar Slots -->
        <div class="builder-section">
          <div class="builder-section-header">
            <div class="builder-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span>Active Toolbar</span>
              <span id="active-toolbar-count-badge" class="badge" style="font-size: 10px; margin-left: 4px; padding: 1px 6px;">7 items</span>
            </div>
            <span class="builder-section-subtitle">Drag to reorder slots &bull; Click &times; to remove</span>
          </div>
          <div id="toolbar-items-list" class="active-slots-container">
            <!-- Dynamic Reorderable Active Slot Chips -->
          </div>
        </div>

        <!-- Available Items / Tray -->
        <div class="builder-section">
          <div class="builder-section-header">
            <div class="builder-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              <span>Available Items / Tray</span>
            </div>
            <span class="builder-section-subtitle">Click "+ Add" or drag items into the active toolbar</span>
          </div>
          <div id="toolbar-available-tray" class="tray-grid">
            <!-- Dynamic Available Tray Cards -->
          </div>
        </div>
      </div>

      <!-- Code View -->
      <div id="toolbar-code-view" style="display: none; flex: 1; flex-direction: column; gap: 8px;">
        <p style="font-size: 11px; color: var(--text-muted);">Edit raw toolbar layout JSON code directly (layout invariants will be enforced):</p>
        <textarea id="toolbar-code-editor" style="width: 100%; height: 320px; font-family: monospace; font-size: 12px; background: var(--bg-input); color: #7aa2f7; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; resize: vertical; box-sizing: border-box; outline: none;"></textarea>
      </div>

      <!-- Custom Slot Context Menu -->
      <div id="customizer-context-menu" class="customizer-context-menu hidden"></div>

      <div class="modal-actions" style="margin-top: 16px; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 14px;">
        <button class="btn btn-secondary" id="btn-reset-toolbar-defaults">Reset Defaults</button>
        <div style="display: flex; gap: 10px;">
          <button class="btn" id="btn-close-toolbar-modal">Cancel</button>
          <button class="btn btn-primary" id="btn-save-toolbar-modal">Save & Apply</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Notification container -->
  <div id="toast-bar" style="display: none;"></div>

  <script>
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    const searchInput = document.getElementById('search-filter');

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    const toast = document.getElementById('toast-bar');
    function showToast(msg) {
      if (!toast) return;
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }

    async function checkDefaultBrowserStatus() {
      if (window.naptureAPI && window.naptureAPI.isDefaultBrowser) {
        const isDefault = await window.naptureAPI.isDefaultBrowser();
        const statusEl = document.getElementById('default-browser-status');
        const btnEl = document.getElementById('btn-make-default');
        const badgeEl = document.getElementById('badge-default-browser');

        if (statusEl && btnEl && badgeEl) {
          if (isDefault) {
            statusEl.textContent = 'Napture is currently your default web browser.';
            btnEl.style.display = 'none';
            badgeEl.style.display = 'inline-flex';
          } else {
            statusEl.textContent = 'Napture is not set as your default web browser.';
            btnEl.style.display = 'inline-block';
            badgeEl.style.display = 'none';
          }
        }
      }
    }

    // Check status on load and on window focus
    checkDefaultBrowserStatus();
    window.addEventListener('focus', checkDefaultBrowserStatus);

    // Check URL hash on load (e.g. napture://settings#about)
    function checkHashTarget() {
      const hashTarget = (window.location.hash || '').replace('#', '');
      if (hashTarget) {
        const itemToActivate = document.querySelector('.nav-item[data-target="' + hashTarget + '"]');
        if (itemToActivate) {
          navItems.forEach(el => el.classList.remove('active'));
          sections.forEach(sec => sec.classList.remove('active'));
          itemToActivate.classList.add('active');
          const secEl = document.getElementById('sec-' + hashTarget);
          if (secEl) secEl.classList.add('active');
        }
      }
    }
    checkHashTarget();
    window.addEventListener('hashchange', checkHashTarget);

    // Sidebar navigation switching
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        if (searchInput && searchInput.value.trim() !== '') {
          searchInput.value = '';
          filterSettings('');
        }
        navItems.forEach(el => el.classList.remove('active'));
        sections.forEach(sec => sec.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        if (target) {
          try { window.location.hash = target; } catch (e) {}
        }
        const secEl = document.getElementById('sec-' + target);
        if (secEl) secEl.classList.add('active');
        document.getElementById('viewport').scrollTop = 0;
      });
    });

    // Event delegation backup — catches clicks on any child element inside a nav-item
    const navListEl = document.querySelector('.nav-list');
    if (navListEl) {
      navListEl.addEventListener('click', (e) => {
        const item = e.target.closest('.nav-item');
        if (!item) return;
        if (searchInput && searchInput.value.trim() !== '') {
          searchInput.value = '';
          filterSettings('');
        }
        navItems.forEach(el => el.classList.remove('active'));
        sections.forEach(sec => sec.classList.remove('active'));
        item.classList.add('active');
        const target = item.getAttribute('data-target');
        if (target) {
          try { window.location.hash = target; } catch (e) {}
        }
        const secEl = document.getElementById('sec-' + target);
        if (secEl) secEl.classList.add('active');
        document.getElementById('viewport').scrollTop = 0;
      });
    }

    // Real-time live filtering
    function filterSettings(query) {
      const q = query.toLowerCase().trim();
      const allFilterableRows = document.querySelectorAll('.card-row, .radio-card, .metrics-table tr');
      
      let emptyEl = document.getElementById('search-empty-state');
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.id = 'search-empty-state';
        emptyEl.className = 'empty-state';
        emptyEl.innerHTML = '<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><div class="empty-title">No matching settings found</div><div>Try searching for a different keyword or setting name.</div>';
        document.querySelector('.settings-container').appendChild(emptyEl);
      }

      if (!q) {
        sections.forEach(sec => {
          sec.classList.remove('search-active');
          const id = sec.getAttribute('id');
          const activeItem = document.querySelector('.nav-item.active');
          const actTarget = activeItem ? activeItem.getAttribute('data-target') : '';
          sec.classList.toggle('active', id === ('sec-' + actTarget));
        });
        allFilterableRows.forEach(r => r.style.display = '');
        emptyEl.style.display = 'none';
        return;
      }

      let totalVisible = 0;

      sections.forEach(sec => {
        const secRows = sec.querySelectorAll('.card-row, .radio-card, .metrics-table tr');
        let secMatchCount = 0;

        secRows.forEach(r => {
          const text = r.textContent.toLowerCase();
          const matches = text.includes(q);
          r.style.display = matches ? '' : 'none';
          if (matches) secMatchCount++;
        });

        if (secMatchCount > 0) {
          sec.classList.add('search-active');
          sec.classList.remove('active');
          totalVisible += secMatchCount;
        } else {
          sec.classList.remove('search-active');
          sec.classList.remove('active');
        }
      });

      emptyEl.style.display = totalVisible === 0 ? 'flex' : 'none';
    }

    //  Bolt: Debounce the settings search input by 150ms. The filterSettings function
    // queries and toggles .style.display on numerous DOM nodes. Debouncing prevents
    // forced synchronous layouts and visual stuttering while typing.
    let searchDebounce = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        filterSettings(e.target.value);
      }, 150);
    });

    // Save setting to SQLite database and apply live locally
    function persistSetting(key, val) {
      if (window.naptureAPI && window.naptureAPI.saveSetting) {
        return window.naptureAPI.saveSetting(key, val);
      }
      return Promise.resolve();
    }

    // Attach event listeners for inputs & toggles (both 'change' and 'input' for instant execution)
    const settingMap = {
      'setting-dynamicBackground': 'dynamicBackground',
      'setting-homeUrl': 'homeUrl',
      'setting-defaultZoom': 'defaultZoom',
      'setting-folderHoverOpen': 'folderHoverOpen',
      'setting-switchToExistingTab': 'switchToExistingTab',
      'setting-searchEngine': 'searchEngine',
      'setting-addressSuggestions': 'addressSuggestions',
      'setting-showFullUrl': 'showFullUrl',
      'setting-blockCookies': 'blockCookies',
      'setting-doNotTrack': 'doNotTrack',
      'setting-httpsOnly': 'httpsOnly',
      'setting-secureDns': 'secureDns',
      'setting-askSaveLocation': 'askSaveLocation',
      'setting-language': 'language',
      'setting-memorySaver': 'memorySaver',
      'setting-memoryTarget': 'memoryTarget',
      'setting-hardwareAcceleration': 'hardwareAcceleration'
    };

    Object.keys(settingMap).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = settingMap[id];
      const handleUpdate = () => {
        const value = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'memorySaver') {
          const memTarget = document.getElementById('setting-memoryTarget');
          if (memTarget) memTarget.disabled = !value;
        }
        if (key === 'memoryTarget') {
          const display = document.getElementById('memoryTargetDisplay');
          if (display) display.textContent = value + ' MB';
        }
        if (key === 'language') {
          Promise.resolve(persistSetting(key, value)).then(() => {
            try { window.location.hash = 'languages'; } catch (e) {}
            setTimeout(() => { window.location.reload(); }, 50);
          }).catch(() => {
            try { window.location.hash = 'languages'; } catch (e) {}
            setTimeout(() => { window.location.reload(); }, 50);
          });
        } else {
          persistSetting(key, value);
        }
      };

      el.addEventListener('change', handleUpdate);
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'range')) {
        el.addEventListener('input', handleUpdate);
      }
    });

    // --- Snippets UI Management ---
    let currentSnippets = [];
    try {
      const rawSnippets = ${JSON.stringify(settings.snippets || '')};
      currentSnippets = rawSnippets ? JSON.parse(rawSnippets) : [
        { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
        { snippet: 'yt', description: 'Takes you to youtube', url: 'https://youtube.com' }
      ];
    } catch (e) {
      currentSnippets = [
        { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
        { snippet: 'yt', description: 'Takes you to youtube', url: 'https://youtube.com' }
      ];
    }

    function saveSnippets() {
      persistSetting('snippets', JSON.stringify(currentSnippets));
    }

    function renderSnippetsList() {
      const container = document.getElementById('snippets-list-container');
      if (!container) return;

      if (!currentSnippets || currentSnippets.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 20px; text-align: center;">No snippets set!</div>';
        return;
      }

      let html = '';
      currentSnippets.forEach((item, idx) => {
        const snip = escapeHtml(item.snippet || '').replace(/^\./, '');
        const desc = escapeHtml(item.description || '');
        const url = escapeHtml(item.url || 'https://');

        html += '<div class="card-row snippet-item-row" data-index="' + idx + '" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 14px 20px;">' +
          '<div style="flex: 1; min-width: 130px;">' +
            '<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">' + ${JSON.stringify(t('snippet_label'))} + '</div>' +
            '<div class="snippet-prefix-wrapper">' +
              '<span class="snippet-dot-prefix">.</span>' +
              '<input type="text" class="snippet-key-input" data-index="' + idx + '" value="' + snip + '" placeholder="mail">' +
            '</div>' +
          '</div>' +
          '<div style="flex: 1.5; min-width: 160px;">' +
            '<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">' + ${JSON.stringify(t('description_label'))} + '</div>' +
            '<input type="text" class="snippet-desc-input" data-index="' + idx + '" value="' + desc + '" placeholder="Takes you to gmail" style="width: 100%;">' +
          '</div>' +
          '<div style="flex: 2; min-width: 200px;">' +
            '<div style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">' + ${JSON.stringify(t('url_label'))} + '</div>' +
            '<input type="text" class="snippet-url-input" data-index="' + idx + '" value="' + url + '" placeholder="https://gmail.com" style="width: 100%;">' +
          '</div>' +
          '<div style="display: flex; align-items: flex-end; margin-top: 14px;">' +
            '<button class="btn btn-danger btn-remove-snippet" data-index="' + idx + '" title="Delete Snippet" style="padding: 6px 12px; font-size: 14px;">&times;</button>' +
          '</div>' +
        '</div>';
      });

      container.innerHTML = html;

      // Event listeners for inputs
      container.querySelectorAll('.snippet-key-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = parseInt(inp.dataset.index, 10);
          let cleanVal = inp.value.trim().replace(/^\./, '');
          if (inp.value !== cleanVal && inp.value.startsWith('.')) {
            inp.value = cleanVal;
          }
          if (currentSnippets[idx]) {
            currentSnippets[idx].snippet = cleanVal;
            saveSnippets();
          }
        });
      });

      container.querySelectorAll('.snippet-desc-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = parseInt(inp.dataset.index, 10);
          if (currentSnippets[idx]) {
            currentSnippets[idx].description = inp.value;
            saveSnippets();
          }
        });
      });

      container.querySelectorAll('.snippet-url-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = parseInt(inp.dataset.index, 10);
          if (currentSnippets[idx]) {
            currentSnippets[idx].url = inp.value;
            saveSnippets();
          }
        });
      });

      container.querySelectorAll('.btn-remove-snippet').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index, 10);
          if (!isNaN(idx) && idx >= 0 && idx < currentSnippets.length) {
            currentSnippets.splice(idx, 1);
            saveSnippets();
            renderSnippetsList();
          }
        });
      });
    }

    renderSnippetsList();

    const btnAddSnippet = document.getElementById('btn-add-snippet');
    if (btnAddSnippet) {
      btnAddSnippet.addEventListener('click', () => {
        currentSnippets.push({ snippet: '', description: '', url: 'https://' });
        saveSnippets();
        renderSnippetsList();
        const rows = document.querySelectorAll('.snippet-key-input');
        if (rows.length > 0) {
          const lastInput = rows[rows.length - 1];
          lastInput.focus();
        }
      });
    }

    // Radio Grid Selection
    function bindRadioGrid(gridId, settingKey, onSelect) {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      const cards = grid.querySelectorAll('.radio-card');
      cards.forEach(c => {
        c.addEventListener('click', () => {
          cards.forEach(o => o.classList.remove('active'));
          c.classList.add('active');
          const val = c.getAttribute('data-val');
          persistSetting(settingKey, val);
          if (typeof onSelect === 'function') onSelect(val);
        });
      });
    }

    bindRadioGrid('safeBrowsing-selection', 'safeBrowsing');
    bindRadioGrid('performanceMode-selection', 'performanceMode');

    // Import from File (HTML / JSON)
    const btnImportFile = document.getElementById('btn-import-file');
    if (btnImportFile) {
      btnImportFile.addEventListener('click', () => {
        if (window.naptureAPI && window.naptureAPI.importBookmarksFile) {
          const origText = btnImportFile.textContent;
          btnImportFile.textContent = 'Importing...';
          btnImportFile.disabled = true;
          window.naptureAPI.importBookmarksFile().then(res => {
            btnImportFile.disabled = false;
            if (res && res.success) {
              const count = res.importedBookmarksCount || 0;
              btnImportFile.textContent = 'Imported (' + count + ' Bookmarks)';
              showToast('Successfully imported ' + count + ' bookmarks from file!');
              setTimeout(() => { btnImportFile.textContent = origText; }, 4000);
            } else if (res && res.canceled) {
              btnImportFile.textContent = origText;
            } else {
              btnImportFile.textContent = origText;
              showToast('Failed to import bookmarks file: ' + (res.error || 'Unknown error'));
            }
          }).catch(err => {
            btnImportFile.disabled = false;
            btnImportFile.textContent = origText;
            showToast('Error importing bookmark file');
          });
        }
      });
    }

    // Individual Import Target Buttons
    document.querySelectorAll('.btn-import-target').forEach(btn => {
      btn.addEventListener('click', () => {
        const browser = btn.getAttribute('data-browser') || 'chrome';
        const origText = btn.textContent;
        btn.textContent = 'Importing...';
        btn.disabled = true;
        if (window.naptureAPI && window.naptureAPI.importBrowserData) {
          window.naptureAPI.importBrowserData(browser).then(res => {
            const bmCount = res.importedBookmarksCount || 0;
            const histCount = res.importedHistoryCount || 0;
            if (bmCount > 0 || histCount > 0) {
              btn.textContent = 'Imported (' + bmCount + ' Bookmarks, ' + histCount + ' History)';
              showToast('Bookmarks, history & data from ' + browser.toUpperCase() + ' sent straight to Napture!');
            } else {
              btn.textContent = 'No Data Found';
              showToast('No bookmarks or history found in ' + browser.toUpperCase() + ' profile.');
              setTimeout(() => { btn.textContent = origText; }, 3000);
            }

            // Merge imported bookmarks tree into renderer customBookmarks & localStorage
            if (res.importedBookmarks && Array.isArray(res.importedBookmarks) && res.importedBookmarks.length > 0) {
              try {
                const existingSaved = localStorage.getItem('napture-bookmarks');
                let currentList = existingSaved ? JSON.parse(existingSaved) : [];
                const existingUrls = new Set();
                const collect = (list) => {
                  list.forEach(item => {
                    if (item.url) existingUrls.add(item.url.trim().toLowerCase());
                    if (item.children) collect(item.children);
                  });
                };
                collect(currentList);

                const filterNew = (nodes) => {
                  return nodes.filter(n => {
                    if (n.type === 'link') {
                      const u = (n.url || '').trim().toLowerCase();
                      if (existingUrls.has(u)) return false;
                      existingUrls.add(u);
                      return true;
                    } else if (n.type === 'folder' && n.children) {
                      n.children = filterNew(n.children);
                      return n.children.length > 0;
                    }
                    return true;
                  });
                };

                const fresh = filterNew(res.importedBookmarks);
                if (fresh.length > 0) {
                  currentList.push(...fresh);
                  localStorage.setItem('napture-bookmarks', JSON.stringify(currentList));
                  if (typeof loadBookmarks === 'function') {
                    loadBookmarks();
                  } else if (window.parent && typeof window.parent.loadBookmarks === 'function') {
                    window.parent.loadBookmarks();
                  }
                }
              } catch (e) {
                console.error('Error merging imported bookmarks:', e);
              }
            }

            setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 4000);
          });
        }
      });
    });

    const btnChangeDL = document.getElementById('btn-change-download');
    if (btnChangeDL) {
      btnChangeDL.addEventListener('click', () => {
        if (window.naptureAPI && window.naptureAPI.selectDownloadDirectory) {
          window.naptureAPI.selectDownloadDirectory().then(newPath => {
            if (newPath) {
              const dlDisplay = document.getElementById('display-download-path');
              if (dlDisplay) dlDisplay.textContent = newPath;
              showToast('Download destination updated.');
            }
          });
        }
      });
    }

    const btnReset = document.getElementById('btn-reset-defaults');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all preferences to factory default values?')) {
          if (window.naptureAPI && window.naptureAPI.resetAllSettings) {
            window.naptureAPI.resetAllSettings().then(() => {
              showToast('All preferences restored to factory default.');
              setTimeout(() => { location.reload(); }, 800);
            });
          }
        }
      });
    }

    const btnResetAll = document.getElementById('btn-reset-all');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset EVERYTHING? This will permanently delete all your bookmarks, history, open & pinned tabs, download logs, and restore all preferences to factory defaults. This action cannot be undone.')) {
          if (window.naptureAPI && window.naptureAPI.resetAllData) {
            btnResetAll.disabled = true;
            btnResetAll.textContent = 'Resetting...';
            window.naptureAPI.resetAllData().then(() => {
              showToast('All browser data reset to factory defaults.');
              setTimeout(() => { location.reload(); }, 1000);
            }).catch(() => {
              btnResetAll.disabled = false;
              btnResetAll.textContent = 'Reset All';
              showToast('Failed to reset all data.');
            });
          }
        }
      });
    }

    const btnMakeDefault = document.getElementById('btn-make-default');
    if (btnMakeDefault) {
      btnMakeDefault.addEventListener('click', async () => {
        if (window.naptureAPI && window.naptureAPI.makeDefaultBrowser) {
          btnMakeDefault.disabled = true;
          btnMakeDefault.textContent = 'Setting Default...';
          const success = await window.naptureAPI.makeDefaultBrowser();
          if (success) {
            if (navigator.userAgent.includes('Windows')) {
              showToast('Opening Windows Default Apps Settings. Please set Napture.');
            } else {
              showToast('Napture has been configured as your default web browser!');
            }
          } else {
            showToast('Failed to initiate default browser setup.');
          }
          btnMakeDefault.disabled = false;
          btnMakeDefault.textContent = 'Make Default';
          setTimeout(checkDefaultBrowserStatus, 1000);
        }
      });
    }

    // Update Check logic
    const btnCheckUpdate = document.getElementById('btn-check-update');
    const btnCheckUpdateText = document.getElementById('btn-check-update-text');
    const updateCardStatus = document.getElementById('update-card-status');
    const updateCardNotes = document.getElementById('update-card-notes');

    if (btnCheckUpdate) {
      btnCheckUpdate.addEventListener('click', () => {
        // If an update is already ready, initiate install immediately
        if (btnCheckUpdate.dataset.action === 'install') {
          btnCheckUpdate.disabled = true;
          if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Downloading & Installing...';
          if (updateCardStatus) updateCardStatus.innerHTML = '<span class="update-status-badge info">Downloading update package...</span>';
          if (window.naptureAPI && window.naptureAPI.installUpdate) {
            window.naptureAPI.installUpdate().catch(err => {
              if (updateCardStatus) updateCardStatus.innerHTML = '<span class="update-status-badge error">Update failed: ' + err.message + '</span>';
              btnCheckUpdate.disabled = false;
              if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Retry Install';
            });
          }
          return;
        }

        btnCheckUpdate.classList.add('checking');
        btnCheckUpdate.disabled = true;
        if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Checking...';
        if (updateCardStatus) updateCardStatus.textContent = 'Contacting update server...';
        if (updateCardNotes) updateCardNotes.style.display = 'none';

        if (window.naptureAPI && window.naptureAPI.checkForUpdates) {
          window.naptureAPI.checkForUpdates().then((res) => {
            btnCheckUpdate.classList.remove('checking');
            btnCheckUpdate.disabled = false;
            
            if (res.updateAvailable) {
              btnCheckUpdate.dataset.action = 'install';
              if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Install & Restart';
              btnCheckUpdate.classList.remove('btn-primary');
              btnCheckUpdate.classList.add('btn-success');
              if (updateCardStatus) {
                updateCardStatus.innerHTML = '<span class="update-status-badge success">Version ' + res.version + ' is ready to install</span>';
              }
              if (updateCardNotes) {
                updateCardNotes.style.display = 'block';
                updateCardNotes.innerHTML = '<strong>Release Notes:</strong><br>' + (res.release_notes ? res.release_notes.replace(/\\n/g, '<br>') : 'Performance improvements and bug fixes.');
              }
            } else if (res.error) {
              if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Check Again';
              if (updateCardStatus) updateCardStatus.innerHTML = '<span class="update-status-badge error">Unable to check: ' + res.error + '</span>';
            } else {
              delete btnCheckUpdate.dataset.action;
              btnCheckUpdate.classList.remove('btn-success');
              btnCheckUpdate.classList.add('btn-primary');
              if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Check for Updates';
              if (updateCardStatus) updateCardStatus.innerHTML = '<span class="update-status-badge success">Napture is up to date</span>';
            }
          }).catch(err => {
            btnCheckUpdate.classList.remove('checking');
            btnCheckUpdate.disabled = false;
            if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Check Again';
            if (updateCardStatus) updateCardStatus.innerHTML = '<span class="update-status-badge error">Failed to check for updates</span>';
          });
        } else {
          btnCheckUpdate.classList.remove('checking');
          btnCheckUpdate.disabled = false;
          if (btnCheckUpdateText) btnCheckUpdateText.textContent = 'Check for Updates';
          if (updateCardStatus) updateCardStatus.textContent = 'Updater API not available in this environment.';
        }
      });
    }

    // Modal dialog handling
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
            showToast('Selected browsing records cleared.');
          });
        }
      });
    }

    // --- Toolbar Customizer Visual Builder Controller ---
    const DEFAULT_TOOLBAR_LAYOUT = [
      { id: 'home-btn', type: 'system', name: 'Home Button', enabled: true },
      { id: 'sep-1', type: 'separator', name: 'Fixed Separator', enabled: true },
      { id: 'back-btn', type: 'system', name: 'Back Button', enabled: true },
      { id: 'forward-btn', type: 'system', name: 'Forward Button', enabled: true },
      { id: 'reload-btn', type: 'system', name: 'Reload Button', enabled: true },
      { id: 'margin-1', type: 'margin', name: 'Flexible Space', enabled: true },
      { id: 'address-container', type: 'system', name: 'Address Bar & Search', enabled: true }
    ];

    function validateToolbarLayout(layout, defaultLayout = null) {
      const fallback = defaultLayout || DEFAULT_TOOLBAR_LAYOUT;
      if (!Array.isArray(layout) || layout.length === 0) {
        return JSON.parse(JSON.stringify(fallback));
      }

      const validTypes = new Set(['system', 'link', 'folder', 'margin', 'spacer', 'separator']);
      const knownSystemIds = new Set([
        'brand-menu-btn', 'back-btn', 'forward-btn', 'reload-btn', 'home-btn',
        'address-container', 'downloads-btn', 'history-btn', 'bookmarks-btn', 'newtab-btn'
      ]);

      const seenIds = new Set();
      const sanitized = [];
      let hasAddressBar = false;

      for (const item of layout) {
        if (!item || typeof item !== 'object') continue;
        let { id, type, name, url, width, enabled, children } = item;

        if (!id || typeof id !== 'string') continue;
        id = id.trim();
        if (!id) continue;

        type = typeof type === 'string' ? type.toLowerCase().trim() : 'system';
        if (!validTypes.has(type)) type = 'system';
        if (type === 'spacer') type = 'margin';

        if (type === 'system' || knownSystemIds.has(id)) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        } else {
          if (seenIds.has(id)) {
            id = type + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
          }
          seenIds.add(id);
        }

        if (id === 'address-container') {
          hasAddressBar = true;
          name = name || 'Address Bar & Search';
        }

        name = typeof name === 'string' && name.trim() ? name.trim() : id;

        const cleanItem = {
          id,
          type,
          name,
          enabled: enabled !== false
        };

        if (type === 'link' && url) cleanItem.url = String(url).trim();
        if (type === 'folder') cleanItem.children = Array.isArray(children) ? children.filter(c => c && c.id) : [];
        if (width && typeof width === 'number' && width > 0) cleanItem.width = width;

        sanitized.push(cleanItem);
      }

      if (!hasAddressBar) {
        const addressItem = {
          id: 'address-container',
          type: 'system',
          name: 'Address Bar & Search',
          enabled: true
        };
        if (sanitized.length > 0) {
          sanitized.splice(Math.min(sanitized.length, 5), 0, addressItem);
        } else {
          sanitized.push(addressItem);
        }
      }

      return sanitized;
    }

    const AVAILABLE_TRAY_ITEMS = [
      { id: 'back-btn', type: 'system', name: 'Back', desc: 'Navigate backward', category: 'Navigation', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>' },
      { id: 'forward-btn', type: 'system', name: 'Forward', desc: 'Navigate forward', category: 'Navigation', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>' },
      { id: 'reload-btn', type: 'system', name: 'Reload', desc: 'Refresh active page', category: 'Navigation', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>' },
      { id: 'home-btn', type: 'system', name: 'Home', desc: 'Open home page', category: 'Navigation', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>' },
      { id: 'downloads-btn', type: 'system', name: 'Downloads', desc: 'Recent downloads popup', category: 'Tools', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
      { id: 'history-btn', type: 'system', name: 'History', desc: 'Browsing history popup', category: 'Tools', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' },
      { id: 'bookmarks-btn', type: 'system', name: 'Bookmarks', desc: 'Toggle bookmarks sidebar', category: 'Tools', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>' },
      { id: 'newtab-btn', type: 'system', name: 'New Tab', desc: 'Open new browsing tab', category: 'Tools', icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' },
      { id: 'address-container', type: 'system', name: 'Address Bar & Search', desc: 'URL and search bar', category: 'Address', isAddressBar: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' },
      { id: 'template-margin', type: 'margin', name: 'Flexible Space', desc: 'Expanding spacer block', category: 'Layout', isMultiple: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline><polyline points="12 19 5 12 12 5"></polyline></svg>' },
      { id: 'template-separator', type: 'separator', name: 'Fixed Separator', desc: 'Divider line gap', category: 'Layout', isMultiple: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="12" y1="4" x2="12" y2="20"></line></svg>' },
      { id: 'template-link', type: 'link', name: 'Custom Link', desc: 'Web shortcut button', category: 'Custom', isMultiple: true, isCustomLink: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' }
    ];

    let currentToolbarLayout = [];
    try {
      const raw = ${JSON.stringify(settings.toolbarLayout || '')};
      const parsed = raw ? JSON.parse(raw) : DEFAULT_TOOLBAR_LAYOUT;
      currentToolbarLayout = validateToolbarLayout(parsed);
    } catch (e) {
      currentToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT));
    }

    let workingToolbarLayout = JSON.parse(JSON.stringify(currentToolbarLayout));
    let draggedSlotIdx = null;
    let draggedTrayItem = null;

    const btnOpenToolbarCustomizer = document.getElementById('btn-customize-toolbar');
    const modalToolbarCustomizer = document.getElementById('modal-toolbar-customizer');
    const btnCloseToolbarModal = document.getElementById('btn-close-toolbar-modal');
    const btnSaveToolbarModal = document.getElementById('btn-save-toolbar-modal');
    const btnResetToolbarDefaults = document.getElementById('btn-reset-toolbar-defaults');
    const tabToolbarVisual = document.getElementById('tab-toolbar-visual');
    const tabToolbarCode = document.getElementById('tab-toolbar-code');
    const toolbarVisualView = document.getElementById('toolbar-visual-view');
    const toolbarCodeView = document.getElementById('toolbar-code-view');
    const toolbarCodeEditor = document.getElementById('toolbar-code-editor');
    const toolbarItemsList = document.getElementById('toolbar-items-list');
    const toolbarAvailableTray = document.getElementById('toolbar-available-tray');
    const toolbarLivePreview = document.getElementById('toolbar-live-preview');
    const activeToolbarCountBadge = document.getElementById('active-toolbar-count-badge');
    const customizerContextMenu = document.getElementById('customizer-context-menu');

    function getItemIconSvg(item) {
      if (item.type === 'link') {
        return '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
      }
      if (item.type === 'folder') {
        return '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
      }
      if (item.type === 'margin' || item.type === 'spacer') {
        return '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline><polyline points="12 19 5 12 12 5"></polyline></svg>';
      }
      if (item.type === 'separator') {
        return '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><line x1="12" y1="4" x2="12" y2="20"></line></svg>';
      }
      const trayDef = AVAILABLE_TRAY_ITEMS.find(t => t.id === item.id);
      if (trayDef) return trayDef.icon;
      return '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="8"></circle></svg>';
    }

    function hideCustomizerContextMenu() {
      if (customizerContextMenu) customizerContextMenu.classList.add('hidden');
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#customizer-context-menu')) {
        hideCustomizerContextMenu();
      }
    });

    function showSlotContextMenu(e, item, idx) {
      if (!customizerContextMenu) return;
      e.preventDefault();
      e.stopPropagation();

      customizerContextMenu.innerHTML = '';

      if (idx > 0) {
        const moveLeftBtn = document.createElement('button');
        moveLeftBtn.className = 'customizer-context-item';
        moveLeftBtn.innerHTML = '<span>&larr; Move Left</span>';
        moveLeftBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          const temp = workingToolbarLayout[idx - 1];
          workingToolbarLayout[idx - 1] = workingToolbarLayout[idx];
          workingToolbarLayout[idx] = temp;
          renderToolbarCustomizer();
        });
        customizerContextMenu.appendChild(moveLeftBtn);
      }

      if (idx < workingToolbarLayout.length - 1) {
        const moveRightBtn = document.createElement('button');
        moveRightBtn.className = 'customizer-context-item';
        moveRightBtn.innerHTML = '<span>&rarr; Move Right</span>';
        moveRightBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          const temp = workingToolbarLayout[idx + 1];
          workingToolbarLayout[idx + 1] = workingToolbarLayout[idx];
          workingToolbarLayout[idx] = temp;
          renderToolbarCustomizer();
        });
        customizerContextMenu.appendChild(moveRightBtn);
      }

      if (item.type === 'link') {
        const editBtn = document.createElement('button');
        editBtn.className = 'customizer-context-item';
        editBtn.innerHTML = '<span>&#9998; Edit Link...</span>';
        editBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          const newName = prompt('Enter link title:', item.name || '');
          if (newName === null) return;
          const newUrl = prompt('Enter link URL:', item.url || 'https://');
          if (newUrl === null) return;
          item.name = newName.trim() || 'Link';
          item.url = newUrl.trim() || 'https://';
          renderToolbarCustomizer();
        });
        customizerContextMenu.appendChild(editBtn);
      }

      if (item.type === 'folder') {
        const renameBtn = document.createElement('button');
        renameBtn.className = 'customizer-context-item';
        renameBtn.innerHTML = '<span>&#9998; Rename Folder...</span>';
        renameBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          const newName = prompt('Enter folder name:', item.name || 'Folder');
          if (newName && newName.trim()) {
            item.name = newName.trim();
            renderToolbarCustomizer();
          }
        });
        customizerContextMenu.appendChild(renameBtn);
      }

      if (item.type === 'margin' || item.type === 'separator' || item.type === 'link') {
        const dupBtn = document.createElement('button');
        dupBtn.className = 'customizer-context-item';
        dupBtn.innerHTML = '<span>&#43; Duplicate</span>';
        dupBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          const copy = JSON.parse(JSON.stringify(item));
          copy.id = item.type + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
          workingToolbarLayout.splice(idx + 1, 0, copy);
          renderToolbarCustomizer();
        });
        customizerContextMenu.appendChild(dupBtn);
      }

      if (item.id !== 'address-container') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'customizer-context-item';
        removeBtn.style.color = '#f87171';
        removeBtn.innerHTML = '<span>&times; Remove from Toolbar</span>';
        removeBtn.addEventListener('click', () => {
          hideCustomizerContextMenu();
          workingToolbarLayout.splice(idx, 1);
          renderToolbarCustomizer();
        });
        customizerContextMenu.appendChild(removeBtn);
      }

      const resetBtn = document.createElement('button');
      resetBtn.className = 'customizer-context-item';
      resetBtn.innerHTML = '<span>Reset to Defaults</span>';
      resetBtn.addEventListener('click', () => {
        hideCustomizerContextMenu();
        workingToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT));
        renderToolbarCustomizer();
        showToast('Reset to default toolbar items');
      });
      customizerContextMenu.appendChild(resetBtn);

      const modalRect = modalToolbarCustomizer.getBoundingClientRect();
      const x = Math.min(e.clientX, modalRect.right - 180);
      const y = Math.min(e.clientY, modalRect.bottom - 160);

      customizerContextMenu.style.left = x + 'px';
      customizerContextMenu.style.top = y + 'px';
      customizerContextMenu.classList.remove('hidden');
    }

    function clearSlotDropIndicators() {
      if (!toolbarItemsList) return;
      toolbarItemsList.querySelectorAll('.toolbar-slot-card').forEach(c => {
        c.classList.remove('drop-before', 'drop-after');
      });
    }

    function renderToolbarLivePreview() {
      if (!toolbarLivePreview) return;
      toolbarLivePreview.innerHTML = '';

      const brand = document.createElement('div');
      brand.className = 'preview-brand';
      brand.innerHTML = '<span style="color:var(--accent);">N</span><span>Napture</span>';
      toolbarLivePreview.appendChild(brand);

      workingToolbarLayout.forEach(item => {
        if (item.enabled === false) return;
        const el = document.createElement('div');
        el.className = 'preview-item';

        if (item.id === 'address-container') {
          el.classList.add('preview-address');
          el.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Search or type URL...</span>';
        } else if (item.type === 'margin' || item.type === 'spacer') {
          el.classList.add('preview-spacer');
          el.textContent = 'Flexible Space';
        } else if (item.type === 'separator') {
          el.classList.add('preview-separator');
        } else if (item.type === 'link') {
          el.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span>' + escapeHtml(item.name || 'Link') + '</span>';
        } else if (item.type === 'folder') {
          el.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>' + escapeHtml(item.name || 'Folder') + '</span>';
        } else {
          el.classList.add('preview-btn');
          el.innerHTML = getItemIconSvg(item);
          el.title = item.name || item.id;
        }

        toolbarLivePreview.appendChild(el);
      });
    }

    function renderActiveToolbarSlots() {
      if (!toolbarItemsList) return;
      toolbarItemsList.innerHTML = '';

      if (activeToolbarCountBadge) {
        activeToolbarCountBadge.textContent = workingToolbarLayout.length + (workingToolbarLayout.length === 1 ? ' item' : ' items');
      }

      workingToolbarLayout.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'toolbar-slot-card';
        if (item.id === 'address-container') card.classList.add('is-address');
        card.setAttribute('draggable', 'true');
        card.dataset.index = idx;
        card.dataset.id = item.id;

        // Grip handle
        const grip = document.createElement('div');
        grip.className = 'slot-drag-handle';
        grip.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';
        card.appendChild(grip);

        // Icon
        const iconWrap = document.createElement('div');
        iconWrap.className = 'slot-icon';
        iconWrap.innerHTML = getItemIconSvg(item);
        card.appendChild(iconWrap);

        // Name
        const nameEl = document.createElement('span');
        nameEl.className = 'slot-name';
        nameEl.textContent = item.name || item.id;
        if (item.url) nameEl.title = item.url;
        card.appendChild(nameEl);

        // Type badge
        const badge = document.createElement('span');
        badge.className = 'slot-type-badge';
        badge.textContent = item.type || 'system';
        card.appendChild(badge);

        // Actions wrapper
        const actions = document.createElement('div');
        actions.className = 'slot-actions';

        // Move Left button
        const leftBtn = document.createElement('button');
        leftBtn.className = 'slot-btn';
        leftBtn.innerHTML = '&larr;';
        leftBtn.title = 'Move Left';
        leftBtn.disabled = idx === 0;
        leftBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (idx > 0) {
            const temp = workingToolbarLayout[idx - 1];
            workingToolbarLayout[idx - 1] = workingToolbarLayout[idx];
            workingToolbarLayout[idx] = temp;
            renderToolbarCustomizer();
          }
        });
        actions.appendChild(leftBtn);

        // Move Right button
        const rightBtn = document.createElement('button');
        rightBtn.className = 'slot-btn';
        rightBtn.innerHTML = '&rarr;';
        rightBtn.title = 'Move Right';
        rightBtn.disabled = idx === workingToolbarLayout.length - 1;
        rightBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (idx < workingToolbarLayout.length - 1) {
            const temp = workingToolbarLayout[idx + 1];
            workingToolbarLayout[idx + 1] = workingToolbarLayout[idx];
            workingToolbarLayout[idx] = temp;
            renderToolbarCustomizer();
          }
        });
        actions.appendChild(rightBtn);

        // Edit link button
        if (item.type === 'link') {
          const editBtn = document.createElement('button');
          editBtn.className = 'slot-btn';
          editBtn.innerHTML = '&#9998;';
          editBtn.title = 'Edit Link Title and URL';
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt('Enter link title:', item.name || '');
            if (newName === null) return;
            const newUrl = prompt('Enter link URL:', item.url || 'https://');
            if (newUrl === null) return;
            item.name = newName.trim() || 'Link';
            item.url = newUrl.trim() || 'https://';
            renderToolbarCustomizer();
          });
          actions.appendChild(editBtn);
        }

        // Rename folder button
        if (item.type === 'folder') {
          const editFolderBtn = document.createElement('button');
          editFolderBtn.className = 'slot-btn';
          editFolderBtn.innerHTML = '&#9998;';
          editFolderBtn.title = 'Rename Folder';
          editFolderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt('Enter folder name:', item.name || 'Folder');
            if (newName && newName.trim()) {
              item.name = newName.trim();
              renderToolbarCustomizer();
            }
          });
          actions.appendChild(editFolderBtn);
        }

        // Remove button (address container cannot be removed)
        if (item.id !== 'address-container') {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'slot-btn remove-btn';
          removeBtn.innerHTML = '&times;';
          removeBtn.title = 'Remove from Toolbar';
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            workingToolbarLayout.splice(idx, 1);
            renderToolbarCustomizer();
          });
          actions.appendChild(removeBtn);
        }

        card.appendChild(actions);

        // Drag & Drop events on slot card
        card.addEventListener('dragstart', (e) => {
          draggedSlotIdx = idx;
          draggedTrayItem = null;
          card.classList.add('dragging');
          e.dataTransfer.setData('text/plain', String(idx));
          e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          clearSlotDropIndicators();
          draggedSlotIdx = null;
        });

        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = card.getBoundingClientRect();
          const isLeft = (e.clientX - rect.left) < (rect.width / 2);
          const needsBefore = isLeft && !card.classList.contains('drop-before');
          const needsAfter = !isLeft && !card.classList.contains('drop-after');
          if (needsBefore || needsAfter) {
            clearSlotDropIndicators();
            if (isLeft) card.classList.add('drop-before');
            else card.classList.add('drop-after');
          }
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('drop-before', 'drop-after');
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          clearSlotDropIndicators();

          const rect = card.getBoundingClientRect();
          const isLeft = (e.clientX - rect.left) < (rect.width / 2);

          if (draggedSlotIdx !== null) {
            if (draggedSlotIdx === idx) return;
            const movedItem = workingToolbarLayout.splice(draggedSlotIdx, 1)[0];
            let insertIdx = idx;
            if (draggedSlotIdx < idx) {
              insertIdx = isLeft ? idx - 1 : idx;
            } else {
              insertIdx = isLeft ? idx : idx + 1;
            }
            workingToolbarLayout.splice(Math.max(0, insertIdx), 0, movedItem);
          } else if (draggedTrayItem !== null) {
            let newItem = null;
            if (draggedTrayItem.isCustomLink) {
              const title = prompt('Enter custom link title (e.g. GitHub):');
              if (!title) return;
              let url = prompt('Enter website URL:', 'https://');
              if (!url) return;
              const lUrl = url.toLowerCase();
              if (!lUrl.startsWith('http://') && !lUrl.startsWith('https://') && !lUrl.startsWith('napture://') && !lUrl.startsWith('file://')) {
                url = 'https://' + url;
              }
              newItem = { id: 'link-' + Date.now(), type: 'link', name: title.trim(), url: url.trim(), enabled: true };
            } else if (draggedTrayItem.type === 'margin') {
              newItem = { id: 'margin-' + Date.now(), type: 'margin', name: 'Flexible Space', enabled: true };
            } else if (draggedTrayItem.type === 'separator') {
              newItem = { id: 'sep-' + Date.now(), type: 'separator', name: 'Fixed Separator', enabled: true };
            } else {
              newItem = { id: draggedTrayItem.id, type: 'system', name: draggedTrayItem.name, enabled: true };
            }

            if (newItem) {
              const insertIdx = isLeft ? idx : idx + 1;
              workingToolbarLayout.splice(insertIdx, 0, newItem);
            }
          }

          renderToolbarCustomizer();
        });

        // Context Menu
        card.addEventListener('contextmenu', (e) => {
          showSlotContextMenu(e, item, idx);
        });

        toolbarItemsList.appendChild(card);
      });
    }

    function renderAvailableTray() {
      if (!toolbarAvailableTray) return;
      toolbarAvailableTray.innerHTML = '';

      AVAILABLE_TRAY_ITEMS.forEach(trayItem => {
        const card = document.createElement('div');
        card.className = 'tray-card';

        // Check if single-instance item is already in toolbar
        const isSingleInstance = !trayItem.isMultiple;
        const isAlreadyInUse = isSingleInstance && workingToolbarLayout.some(i => i.id === trayItem.id);

        if (isAlreadyInUse) {
          card.classList.add('in-use');
        } else {
          card.setAttribute('draggable', 'true');
          card.addEventListener('dragstart', (e) => {
            draggedTrayItem = trayItem;
            draggedSlotIdx = null;
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', trayItem.id);
            e.dataTransfer.effectAllowed = 'copy';
          });
          card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            draggedTrayItem = null;
          });
        }

        const left = document.createElement('div');
        left.className = 'tray-card-left';

        const icon = document.createElement('div');
        icon.className = 'tray-card-icon';
        icon.innerHTML = trayItem.icon;
        left.appendChild(icon);

        const info = document.createElement('div');
        info.className = 'tray-card-info';

        const title = document.createElement('div');
        title.className = 'tray-card-title';
        title.textContent = trayItem.name;
        info.appendChild(title);

        const desc = document.createElement('div');
        desc.className = 'tray-card-desc';
        desc.textContent = trayItem.desc;
        info.appendChild(desc);

        left.appendChild(info);
        card.appendChild(left);

        if (isAlreadyInUse) {
          const badge = document.createElement('div');
          badge.className = 'tray-status-badge';
          badge.textContent = 'In Toolbar';
          card.appendChild(badge);
        } else {
          const addBtn = document.createElement('button');
          addBtn.className = 'tray-add-btn';
          addBtn.innerHTML = '+ Add';
          addBtn.title = 'Add to Toolbar';
          addBtn.addEventListener('click', () => {
            if (trayItem.isCustomLink) {
              const title = prompt('Enter custom link title (e.g. GitHub):');
              if (!title) return;
              let url = prompt('Enter website URL:', 'https://');
              if (!url) return;
              const lUrl = url.toLowerCase();
              if (!lUrl.startsWith('http://') && !lUrl.startsWith('https://') && !lUrl.startsWith('napture://') && !lUrl.startsWith('file://')) {
                url = 'https://' + url;
              }
              workingToolbarLayout.push({ id: 'link-' + Date.now(), type: 'link', name: title.trim(), url: url.trim(), enabled: true });
            } else if (trayItem.type === 'margin') {
              workingToolbarLayout.push({ id: 'margin-' + Date.now(), type: 'margin', name: 'Flexible Space', enabled: true });
            } else if (trayItem.type === 'separator') {
              workingToolbarLayout.push({ id: 'sep-' + Date.now(), type: 'separator', name: 'Fixed Separator', enabled: true });
            } else {
              workingToolbarLayout.push({ id: trayItem.id, type: 'system', name: trayItem.name, enabled: true });
            }
            renderToolbarCustomizer();
          });
          card.appendChild(addBtn);
        }

        toolbarAvailableTray.appendChild(card);
      });
    }

    // Container drag listeners for dropping at the end or removing items
    if (toolbarItemsList) {
      toolbarItemsList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      toolbarItemsList.addEventListener('drop', (e) => {
        if (e.target === toolbarItemsList && draggedTrayItem) {
          e.preventDefault();
          if (draggedTrayItem.isCustomLink) {
            const title = prompt('Enter custom link title (e.g. GitHub):');
            if (!title) return;
            let url = prompt('Enter website URL:', 'https://');
            if (!url) return;
            const lUrl = url.toLowerCase();
            if (!lUrl.startsWith('http://') && !lUrl.startsWith('https://') && !lUrl.startsWith('napture://') && !lUrl.startsWith('file://')) {
              url = 'https://' + url;
            }
            workingToolbarLayout.push({ id: 'link-' + Date.now(), type: 'link', name: title.trim(), url: url.trim(), enabled: true });
          } else if (draggedTrayItem.type === 'margin') {
            workingToolbarLayout.push({ id: 'margin-' + Date.now(), type: 'margin', name: 'Flexible Space', enabled: true });
          } else if (draggedTrayItem.type === 'separator') {
            workingToolbarLayout.push({ id: 'sep-' + Date.now(), type: 'separator', name: 'Fixed Separator', enabled: true });
          } else {
            workingToolbarLayout.push({ id: draggedTrayItem.id, type: 'system', name: draggedTrayItem.name, enabled: true });
          }
          renderToolbarCustomizer();
        }
      });
    }

    // Tray container drag listener for drag-to-remove
    if (toolbarAvailableTray) {
      toolbarAvailableTray.addEventListener('dragover', (e) => {
        if (draggedSlotIdx !== null) {
          const item = workingToolbarLayout[draggedSlotIdx];
          if (item && item.id !== 'address-container') {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }
      });

      toolbarAvailableTray.addEventListener('drop', (e) => {
        if (draggedSlotIdx !== null) {
          const item = workingToolbarLayout[draggedSlotIdx];
          if (item && item.id !== 'address-container') {
            e.preventDefault();
            e.stopPropagation();
            workingToolbarLayout.splice(draggedSlotIdx, 1);
            draggedSlotIdx = null;
            renderToolbarCustomizer();
            showToast('Removed item from toolbar');
          }
        }
      });
    }

    function syncToolbarCodeEditor() {
      if (toolbarCodeEditor) {
        toolbarCodeEditor.value = JSON.stringify(workingToolbarLayout, null, 2);
      }
    }

    function syncToolbarFromCodeEditor() {
      if (!toolbarCodeEditor) return true;
      try {
        const parsed = JSON.parse(toolbarCodeEditor.value);
        if (Array.isArray(parsed)) {
          workingToolbarLayout = validateToolbarLayout(parsed);
          return true;
        } else {
          showToast('Invalid JSON: Must be an array of toolbar items');
          return false;
        }
      } catch (err) {
        showToast('Invalid JSON syntax: ' + err.message);
        return false;
      }
    }

    function renderToolbarCustomizer() {
      workingToolbarLayout = validateToolbarLayout(workingToolbarLayout);
      renderActiveToolbarSlots();
      renderAvailableTray();
      renderToolbarLivePreview();
      syncToolbarCodeEditor();
    }

    if (tabToolbarVisual && tabToolbarCode && toolbarVisualView && toolbarCodeView) {
      tabToolbarVisual.addEventListener('click', () => {
        if (syncToolbarFromCodeEditor()) {
          renderToolbarCustomizer();
          toolbarVisualView.style.display = 'flex';
          toolbarCodeView.style.display = 'none';
          tabToolbarVisual.style.background = 'var(--bg-hover)';
          tabToolbarCode.style.background = '';
        }
      });

      tabToolbarCode.addEventListener('click', () => {
        syncToolbarCodeEditor();
        toolbarVisualView.style.display = 'none';
        toolbarCodeView.style.display = 'flex';
        tabToolbarCode.style.background = 'var(--bg-hover)';
        tabToolbarVisual.style.background = '';
      });
    }

    if (btnResetToolbarDefaults) {
      btnResetToolbarDefaults.addEventListener('click', () => {
        workingToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT));
        renderToolbarCustomizer();
        showToast('Reset to default toolbar items');
      });
    }

    function openCustomizerModal() {
      if (!modalToolbarCustomizer) return;
      workingToolbarLayout = JSON.parse(JSON.stringify(currentToolbarLayout));
      renderToolbarCustomizer();
      if (toolbarVisualView) toolbarVisualView.style.display = 'flex';
      if (toolbarCodeView) toolbarCodeView.style.display = 'none';
      if (tabToolbarVisual) tabToolbarVisual.style.background = 'var(--bg-hover)';
      if (tabToolbarCode) tabToolbarCode.style.background = '';
      modalToolbarCustomizer.style.display = 'flex';
    }

    if (btnOpenToolbarCustomizer) {
      btnOpenToolbarCustomizer.addEventListener('click', () => {
        if (window.naptureAPI && window.naptureAPI.triggerToolbarCustomize) {
          window.naptureAPI.triggerToolbarCustomize();
        } else {
          openCustomizerModal();
        }
      });
    }

    if (btnCloseToolbarModal && modalToolbarCustomizer) {
      btnCloseToolbarModal.addEventListener('click', () => {
        hideCustomizerContextMenu();
        modalToolbarCustomizer.style.display = 'none';
      });
    }

    if (btnSaveToolbarModal && modalToolbarCustomizer) {
      btnSaveToolbarModal.addEventListener('click', async () => {
        hideCustomizerContextMenu();
        if (toolbarCodeView && toolbarCodeView.style.display === 'flex') {
          if (!syncToolbarFromCodeEditor()) return;
        }

        currentToolbarLayout = validateToolbarLayout(workingToolbarLayout);
        const jsonStr = JSON.stringify(currentToolbarLayout);

        await persistSetting('toolbarLayout', jsonStr);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('napture-toolbar-layout', jsonStr);
        }
        modalToolbarCustomizer.style.display = 'none';
        showToast('Toolbar layout updated');
      });
    }

    // --- Napture Zero-Knowledge Sync UI Controller ---
    let currentSyncStatus = null;
    let pairingTimerInterval = null;

    async function loadSyncUI() {
      const container = document.getElementById('sync-view-container');
      if (!container) return;
      if (!window.naptureAPI || !window.naptureAPI.getSyncStatus) {
        setTimeout(loadSyncUI, 100);
        return;
      }

      try {
        currentSyncStatus = await window.naptureAPI.getSyncStatus();
        renderSyncUI(currentSyncStatus);
      } catch (err) {
        container.innerHTML = \`
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Sync Service Offline</div>
                <div class="row-desc">\${err.message || 'Could not connect to sync service.'}</div>
              </div>
              <button class="btn btn-primary" id="btn-sync-retry">Retry Connection</button>
            </div>
          </div>
        \`;
        document.getElementById('btn-sync-retry')?.addEventListener('click', () => {
          container.innerHTML = \`
            <div class="card-group">
              <div class="card-row">
                <div class="row-info">
                  <div class="row-label">Connecting to Sync Engine...</div>
                  <div class="row-desc">Checking encryption keys and linked devices</div>
                </div>
              </div>
            </div>
          \`;
          loadSyncUI();
        });
      }
    }

    function renderSyncUI(status) {
      const container = document.getElementById('sync-view-container');
      if (!container) return;

      if (!status.isLinked) {
        // UNLINKED STATE
        container.innerHTML = \`
          <div class="card-group">
            <div class="card-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
              <div class="row-label" style="font-size: 15px; font-weight: 600;">Link Devices</div>
              <div class="row-desc" style="max-width: 600px; line-height: 1.5;">
                Link all your devices together to share the same data
              </div>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Device Name</div>
                <div class="row-desc">How this device will appear to other synced devices</div>
              </div>
              <input type="text" id="sync-device-name-input" class="text-input" value="\${escapeHtml(status.deviceName || '')}" style="width: 220px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px;">
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Start a New Sync Group</div>
                <div class="row-desc">Create an encrypted sync cluster and make this device the primary node</div>
              </div>
              <button class="btn btn-primary" id="btn-sync-init">Start Sync Group</button>
            </div>
            <div class="card-row" style="flex-direction: column; align-items: stretch; gap: 12px;">
              <div class="row-info">
                <div class="row-label">Link with Existing Device</div>
                <div class="row-desc">Enter the 8-character pairing code generated on your other device</div>
              </div>
              <div style="display: flex; gap: 10px;">
                <input type="text" id="sync-code-input" placeholder="NAPT-XXXX-XXXX" maxlength="14" style="flex: 1; text-transform: uppercase; font-family: monospace; font-weight: 600; letter-spacing: 1.5px; padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--accent); border-radius: 6px;">
                <button class="btn btn-primary" id="btn-sync-claim">Link Device</button>
              </div>
            </div>
          </div>
        \`;

        document.getElementById('btn-sync-init')?.addEventListener('click', async () => {
          const btn = document.getElementById('btn-sync-init');
          const devName = document.getElementById('sync-device-name-input')?.value;
          btn.disabled = true;
          btn.textContent = 'Initializing...';
          try {
            const newStatus = await window.naptureAPI.initSyncGroup(devName);
            showToast('Sync group initialized successfully!');
            renderSyncUI(newStatus);
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Start Sync Group';
            showToast('Failed to initialize: ' + e.message);
          }
        });

        document.getElementById('btn-sync-claim')?.addEventListener('click', async () => {
          const btn = document.getElementById('btn-sync-claim');
          const code = document.getElementById('sync-code-input')?.value;
          const devName = document.getElementById('sync-device-name-input')?.value;
          if (!code || code.trim().length < 8) {
            showToast('Please enter a valid pairing code');
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Linking...';
          try {
            const newStatus = await window.naptureAPI.joinSyncGroup(code, devName);
            showToast('Device linked and synced successfully!');
            renderSyncUI(newStatus);
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Link Device';
            showToast(e.message || 'Invalid or expired code');
          }
        });

      } else {
        // LINKED STATE
        const devicesListHtml = (status.connectedDevices || []).map(d => {
          const isThisDevice = d.device_id === status.deviceId;
          const isOnline = isThisDevice || !!d.isOnline;
          const platform = (d.platform || '').toLowerCase();
          let iconSvg = '<rect x="4" y="4" width="16" height="16" rx="2"></rect>';
          if (platform.includes('win')) {
            iconSvg = '<path d="M3 4l8-1v8H3V4zm9-1.2l9-1.3v9.5h-9V1.8zM3 13h8v8l-8-1v-7zm9 0h9v9.5l-9-1.3V13z"/>';
          } else if (platform.includes('mac') || platform.includes('darwin')) {
            iconSvg = '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>';
          } else if (platform.includes('linux')) {
            iconSvg = '<circle cx="12" cy="12" r="10"/>';
          }

          const activityText = isOnline ? 'Active now' : formatTimeAgo(d.last_active);
          const statusClass = isOnline ? 'online' : 'offline';

          return \`
            <div class="device-item" data-device-id="\${d.device_id}" data-is-this="\${isThisDevice}" data-is-online="\${isOnline}" data-last-active="\${d.last_active || 0}">
              <div class="device-meta">
                <div class="device-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    \${iconSvg}
                  </svg>
                </div>
                <div>
                  <div class="device-name" style="display: flex; align-items: center; gap: 6px;">
                    <span class="device-name-text" id="dev-name-text-\${d.device_id}">\${escapeHtml(d.device_name)}</span>
                    <input type="text" class="device-name-input" id="dev-name-input-\${d.device_id}" value="\${escapeHtml(d.device_name)}" style="display: none; padding: 2px 6px; font-size: 12px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; width: 140px;">
                    <button class="btn-edit-dev-name" data-id="\${d.device_id}" title="Rename Device" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--text-muted); display: inline-flex; align-items: center;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-save-dev-name" data-id="\${d.device_id}" title="Save" style="display: none; background: none; border: none; cursor: pointer; padding: 2px; color: var(--accent); align-items: center;">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                    \${isThisDevice ? '<span class="device-tag-this">This Device</span>' : ''}
                  </div>
                  <div class="device-sub" id="dev-sub-\${d.device_id}">
                    <span class="activity-status \${statusClass}">
                      <span class="activity-dot"></span>
                      <span class="activity-text">\${activityText}</span>
                    </span>
                  </div>
                </div>
              </div>
              \${!isThisDevice ? \`<button class="btn btn-secondary btn-unlink-device" data-id="\${d.device_id}" style="padding: 4px 10px; font-size: 11.5px; color: #f87171;">Unlink</button>\` : ''}
            </div>
          \`;
        }).join('');

        container.innerHTML = \`
          <!-- Status Header Card -->
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="row-label">Sync Status</span>
                  <span style="font-size: 13px; color: var(--text-secondary); font-weight: 500;">\${status.isLinked ? 'Updated' : 'Offline'}</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary" id="btn-sync-now">Sync Now</button>
                <button class="btn btn-secondary" id="btn-sync-leave" style="color: var(--danger);">Leave Group</button>
              </div>
            </div>
          </div>

          <!-- Pairing Code Card -->
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Link Another Device</div>
                <div class="row-desc">Generate a one-time 10-minute pairing code to connect another laptop or desktop (up to 5 devices)</div>
              </div>
              <button class="btn btn-primary" id="btn-generate-code">Get Pairing Code</button>
            </div>
            <div id="pairing-code-display-area" style="display: none;"></div>
          </div>

          <!-- Sync Items Toggles -->
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Bookmarks & Structure</div>
                <div class="row-desc">Synchronize bookmark trees, folders, and custom positions</div>
              </div>
              <label class="switch"><input type="checkbox" id="sync-opt-bookmarks" \${status.syncOptions?.syncBookmarks ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Pinned Tabs & Shortcuts</div>
                <div class="row-desc">Synchronize your pinned tabs and persistent quick-access sites</div>
              </div>
              <label class="switch"><input type="checkbox" id="sync-opt-pinned" \${status.syncOptions?.syncPinnedTabs !== false ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Browsing History</div>
                <div class="row-desc">Synchronize visited pages, visit timestamps, and page titles</div>
              </div>
              <label class="switch"><input type="checkbox" id="sync-opt-history" \${status.syncOptions?.syncHistory ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Session Cookies</div>
                <div class="row-desc">Synchronize login sessions securely across trusted devices</div>
              </div>
              <label class="switch"><input type="checkbox" id="sync-opt-cookies" \${status.syncOptions?.syncCookies !== false ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Browser Settings & Preferences</div>
                <div class="row-desc">Synchronize search engine, themes, privacy options, and customized settings</div>
              </div>
              <label class="switch"><input type="checkbox" id="sync-opt-settings" \${status.syncOptions?.syncSettings !== false ? 'checked' : ''}><span class="slider"></span></label>
            </div>
          </div>

          <!-- Connected Devices List -->
          <div class="card-group">
            <div class="card-row">
              <div class="row-info">
                <div class="row-label">Connected Devices (\${(status.connectedDevices || []).length} / 5)</div>
                <div class="row-desc">All devices currently part of your group</div>
              </div>
            </div>
            <div class="device-list">
              \${devicesListHtml || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px 0;">No other devices connected yet.</div>'}
            </div>
          </div>
        \`;

        // Bind Option Toggles
        [
          { id: 'bookmarks', key: 'syncBookmarks', label: 'bookmarks' },
          { id: 'pinned', key: 'syncPinnedTabs', label: 'pinned tabs' },
          { id: 'history', key: 'syncHistory', label: 'history' },
          { id: 'cookies', key: 'syncCookies', label: 'cookies' },
          { id: 'settings', key: 'syncSettings', label: 'settings' }
        ].forEach(({ id, key, label }) => {
          document.getElementById(\`sync-opt-\${id}\`)?.addEventListener('change', (e) => {
            window.naptureAPI.setSyncOption({ [key]: e.target.checked });
            showToast(\`Sync \${label} \${e.target.checked ? 'enabled' : 'disabled'}\`);
          });
        });

        // Bind Sync Now
        document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
          const btn = document.getElementById('btn-sync-now');
          btn.disabled = true;
          btn.textContent = 'Syncing...';
          try {
            const res = await window.naptureAPI.syncNow();
            if (res && res.synced === false) {
              throw new Error(res.error || res.reason || 'Unknown error during sync');
            }
            showToast('All items synchronized successfully!');
            await loadSyncUI();
          } catch (e) {
            showToast('Sync error: ' + e.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Sync Now';
          }
        });

        // Bind Leave Group
        document.getElementById('btn-sync-leave')?.addEventListener('click', async () => {
          if (confirm('Are you sure you want to disconnect this device from the sync group?')) {
            await window.naptureAPI.leaveSyncGroup();
            showToast('Disconnected from sync group');
            await loadSyncUI();
          }
        });

        // Bind Generate Pairing Code
        document.getElementById('btn-generate-code')?.addEventListener('click', async () => {
          const btn = document.getElementById('btn-generate-code');
          const area = document.getElementById('pairing-code-display-area');
          btn.disabled = true;
          btn.textContent = 'Generating...';

          try {
            const res = await window.naptureAPI.generatePairingCode();
            area.style.display = 'block';
            let secondsLeft = Math.floor((res.expiresAt - Date.now()) / 1000);

            area.innerHTML = \`
              <div class="sync-code-container" style="position: relative;">
                <button id="btn-close-sync-code" style="position: absolute; top: 10px; right: 12px; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Enter this code on your other device:</div>
                <div class="sync-code-text" id="sync-code-val">\${res.code}</div>
                <div class="sync-code-timer" id="sync-code-timer-text">Code expires in 10:00</div>
                <button class="btn btn-secondary" id="btn-copy-sync-code" style="margin-top: 10px; padding: 4px 14px; font-size: 12px;">Copy Code</button>
              </div>
            \`;

            document.getElementById('btn-close-sync-code')?.addEventListener('click', () => {
              if (pairingTimerInterval) clearInterval(pairingTimerInterval);
              area.style.display = 'none';
              btn.disabled = false;
              btn.textContent = 'Get Pairing Code';
            });

            document.getElementById('btn-copy-sync-code')?.addEventListener('click', () => {
              navigator.clipboard.writeText(res.code);
              showToast('Pairing code copied to clipboard!');
            });

            if (pairingTimerInterval) clearInterval(pairingTimerInterval);
            pairingTimerInterval = setInterval(() => {
              secondsLeft--;
              const timerEl = document.getElementById('sync-code-timer-text');
              if (secondsLeft <= 0) {
                clearInterval(pairingTimerInterval);
                if (timerEl) timerEl.textContent = 'Code expired. Please generate a new one.';
              } else if (timerEl) {
                const mins = Math.floor(secondsLeft / 60);
                const secs = secondsLeft % 60;
                timerEl.textContent = \`Code expires in \${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
              }
            }, 1000);
          } catch (e) {
            showToast('Failed to generate code: ' + e.message);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Get Pairing Code';
          }
        });

        // Bind Device Inline Rename
        document.querySelectorAll('.btn-edit-dev-name').forEach(btn => {
          btn.addEventListener('click', () => {
            const devId = btn.dataset.id;
            const textEl = document.getElementById(\`dev-name-text-\${devId}\`);
            const inputEl = document.getElementById(\`dev-name-input-\${devId}\`);
            const saveBtn = document.querySelector(\`.btn-save-dev-name[data-id="\${devId}"]\`);

            if (textEl && inputEl && saveBtn) {
              textEl.style.display = 'none';
              btn.style.display = 'none';
              inputEl.style.display = 'inline-block';
              saveBtn.style.display = 'inline-flex';
              inputEl.focus();
              inputEl.select();

              const saveName = async () => {
                const newName = inputEl.value.trim();
                if (newName && newName !== textEl.textContent) {
                  try {
                    await window.naptureAPI.renameSyncDevice(devId, newName);
                    showToast(\`Device renamed to \${newName}\`);
                    await loadSyncUI();
                  } catch (err) {
                    showToast('Failed to rename: ' + err.message);
                  }
                } else {
                  textEl.style.display = 'inline';
                  btn.style.display = 'inline-flex';
                  inputEl.style.display = 'none';
                  saveBtn.style.display = 'none';
                }
              };

              saveBtn.onclick = saveName;
              inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') saveName();
                else if (e.key === 'Escape') {
                  inputEl.value = textEl.textContent;
                  textEl.style.display = 'inline';
                  btn.style.display = 'inline-flex';
                  inputEl.style.display = 'none';
                  saveBtn.style.display = 'none';
                }
              };
            }
          });
        });

        // Bind Unlink Device buttons
        document.querySelectorAll('.btn-unlink-device').forEach(b => {
          b.addEventListener('click', async () => {
            const devId = b.dataset.id;
            if (confirm('Unlink this device from the sync cluster?')) {
              await window.naptureAPI.unlinkDevice(devId);
              showToast('Device unlinked');
              await loadSyncUI();
            }
          });
        });
      }
    }

    function formatTimeAgo(timestamp) {
      if (!timestamp) return 'Never active';
      const diff = Date.now() - timestamp;
      if (diff < 45000) return 'Active just now';
      if (diff < 3600000) return \`Active \${Math.floor(diff / 60000)}m ago\`;
      if (diff < 86400000) return \`Active \${Math.floor(diff / 3600000)}h ago\`;
      if (diff < 172800000) return 'Active yesterday';
      return \`Active \${Math.floor(diff / 86400000)}d ago\`;
    }

    function updateAllDeviceActivityDisplays() {
      const items = document.querySelectorAll('.device-item');
      items.forEach(item => {
        const isThis = item.dataset.isThis === 'true';
        const isOnline = item.dataset.isOnline === 'true';
        const lastActive = parseInt(item.dataset.lastActive || '0', 10);
        const isCurrentlyActive = isThis || isOnline;
        const text = isCurrentlyActive ? 'Active now' : formatTimeAgo(lastActive);

        const statusSpan = item.querySelector('.activity-status');
        const textSpan = item.querySelector('.activity-text');
        if (statusSpan && textSpan) {
          statusSpan.className = \`activity-status \${isCurrentlyActive ? 'online' : 'offline'}\`;
          if (textSpan.textContent !== text) {
            textSpan.textContent = text;
          }
        }
      });
    }

    let liveActivityTimer = null;
    if (!liveActivityTimer) {
      liveActivityTimer = setInterval(updateAllDeviceActivityDisplays, 5000);
    }

    // Auto-update Sync UI when devices join, leave, rename, group changes, or presence updates in real-time
    if (window.naptureAPI && window.naptureAPI.onBrowserDataImported) {
      window.naptureAPI.onBrowserDataImported(async (data) => {
        if (!data) return;
        if (data.devicePresence) {
          const { deviceId, isOnline, lastActive } = data.devicePresence;
          const item = document.querySelector(\`.device-item[data-device-id="\${deviceId}"]\`);
          if (item) {
            item.dataset.isOnline = isOnline ? 'true' : 'false';
            if (lastActive) item.dataset.lastActive = String(lastActive);
            updateAllDeviceActivityDisplays();
          } else {
            await loadSyncUI();
          }
        } else if (data.importedSettings) {
          for (const [key, val] of Object.entries(data.importedSettings)) {
            const el = document.getElementById(\`setting-\${key}\`);
            if (el) {
              if (el.type === 'checkbox') {
                el.checked = Boolean(val);
              } else {
                el.value = String(val);
              }
            }
          }
        } else if (data.deviceJoined || data.deviceUnlinked || data.deviceRenamed || data.groupDisbanded) {
          await loadSyncUI();
        }
      });
    }

    if (window.naptureAPI && window.naptureAPI.onSettingChanged) {
      window.naptureAPI.onSettingChanged((data) => {
        if (!data) return;
        const key = data.key;
        const val = data.value;

        if (key === 'ALL' && typeof val === 'object' && val !== null) {
          for (const [k, v] of Object.entries(val)) {
            applyLiveSettingUpdate(k, v);
          }
          loadSyncUI();
          return;
        }

        applyLiveSettingUpdate(key, val);
      });
    }

    function applyLiveSettingUpdate(key, val) {
      const el = document.getElementById('setting-' + key);
      if (el) {
        if (el.type === 'checkbox') {
          el.checked = Boolean(val);
        } else {
          el.value = String(val);
        }
      }

      // Update Radio Grids (performanceMode, safeBrowsing, startupMode)
      const grid = document.getElementById(key + '-selection');
      if (grid) {
        const cards = grid.querySelectorAll('.radio-card');
        cards.forEach(card => {
          const cardVal = card.getAttribute('data-val');
          if (cardVal === String(val)) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });
      }

      if (key === 'batterySaver') {
        const perfGrid = document.getElementById('performanceMode-selection');
        if (perfGrid) {
          const cards = perfGrid.querySelectorAll('.radio-card');
          if (val) {
            cards.forEach(card => {
              if (card.getAttribute('data-val') === 'battery_saver') card.classList.add('active');
              else card.classList.remove('active');
            });
          } else {
            const activeCard = perfGrid.querySelector('.radio-card.active');
            if (activeCard && activeCard.getAttribute('data-val') === 'battery_saver') {
              cards.forEach(card => {
                if (card.getAttribute('data-val') === 'balanced') card.classList.add('active');
                else card.classList.remove('active');
              });
            }
          }
        }
      }
    }

    ${neSupported ? `
    // Protocols & Resolver Cluster UI Management
    const DEFAULT_NE_RESOLVERS = [
      { host: '147.185.221.231', port: 65246, name: 'Lucnas' },
      { host: '147.185.221.231', port: 21811, name: 'Sanas' }
    ];

    let currentResolvers = [];

    async function loadProtocolsUI() {
      const container = document.getElementById('resolvers-list-container');
      if (!container) return;

      try {
        if (window.naptureAPI && window.naptureAPI.getSettings) {
          const allSettings = await window.naptureAPI.getSettings();
          if (allSettings && allSettings.neResolvers) {
            currentResolvers = JSON.parse(allSettings.neResolvers);
          } else {
            currentResolvers = DEFAULT_NE_RESOLVERS;
          }
        } else {
          currentResolvers = DEFAULT_NE_RESOLVERS;
        }
      } catch (e) {
        currentResolvers = DEFAULT_NE_RESOLVERS;
      }

      renderResolversList();
    }

    function renderResolversList() {
      const container = document.getElementById('resolvers-list-container');
      if (!container) return;

      if (!currentResolvers || currentResolvers.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.82rem; padding: 14px 18px;">No DNS resolvers configured. Add one below or click Restore Defaults.</div>';
        return;
      }

      let html = '';
      for (let idx = 0; idx < currentResolvers.length; idx++) {
        const r = currentResolvers[idx];
        const prio = idx + 1;
        const name = escapeHtml(r.name || 'Resolver Node');
        const endpoint = escapeHtml(r.host) + ':' + r.port;
        const delBtn = currentResolvers.length > 1 ? '<button class="btn btn-delete-resolver" data-index="' + idx + '" style="font-size: 11.5px; padding: 4px 8px; color: var(--text-muted);">Delete</button>' : '';

        html += '<div class="resolver-item" data-index="' + idx + '">' +
          '<div class="resolver-meta">' +
            '<div class="resolver-priority">' + prio + '</div>' +
            '<div class="resolver-info">' +
              '<div class="resolver-name">' + name + '</div>' +
              '<div class="resolver-endpoint">' + endpoint + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="resolver-actions">' +
            '<span class="resolver-badge" id="resolver-status-' + idx + '" style="display: none;"></span>' +
            '<button class="btn btn-test-single-resolver" data-index="' + idx + '" style="font-size: 11.5px; padding: 4px 8px;">Test</button>' +
            delBtn +
          '</div>' +
        '</div>';
      }

      container.innerHTML = html;

      container.querySelectorAll('.btn-delete-resolver').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.index, 10);
          if (!isNaN(idx) && idx >= 0 && idx < currentResolvers.length) {
            currentResolvers.splice(idx, 1);
            if (window.naptureAPI && window.naptureAPI.saveSetting) {
              await window.naptureAPI.saveSetting('neResolvers', JSON.stringify(currentResolvers));
            }
            renderResolversList();
          }
        });
      });

      container.querySelectorAll('.btn-test-single-resolver').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.index, 10);
          const node = currentResolvers[idx];
          if (!node) return;
          const badge = document.getElementById('resolver-status-' + idx);
          if (badge) {
            badge.style.display = 'inline-flex';
            badge.className = 'resolver-badge testing';
            badge.textContent = 'Pinging...';
          }
          btn.disabled = true;
          if (window.naptureAPI && window.naptureAPI.testNeResolver) {
            const res = await window.naptureAPI.testNeResolver(node.host, node.port);
            if (badge) {
              if (res.ok) {
                badge.className = 'resolver-badge online';
                badge.textContent = res.latencyMs + 'ms';
              } else {
                badge.className = 'resolver-badge offline';
                badge.textContent = 'Offline';
              }
            }
          }
          btn.disabled = false;
        });
      });
    }

    document.getElementById('btn-add-resolver')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-resolver-name');
      const hostInput = document.getElementById('new-resolver-host');
      const portInput = document.getElementById('new-resolver-port');
      const errBox = document.getElementById('add-resolver-error');

      const name = nameInput ? nameInput.value.trim() : '';
      const host = hostInput ? hostInput.value.trim() : '';
      const port = parseInt(portInput ? portInput.value : '53', 10);

      if (!host) {
        if (errBox) { errBox.textContent = 'Please specify an IP address or hostname.'; errBox.style.display = 'block'; }
        return;
      }
      if (isNaN(port) || port < 1 || port > 65535) {
        if (errBox) { errBox.textContent = 'Port must be between 1 and 65535.'; errBox.style.display = 'block'; }
        return;
      }
      if (errBox) errBox.style.display = 'none';

      currentResolvers.push({
        host,
        port,
        name: name || ('Node (' + host + ')')
      });

      if (window.naptureAPI && window.naptureAPI.saveSetting) {
        await window.naptureAPI.saveSetting('neResolvers', JSON.stringify(currentResolvers));
      }

      if (nameInput) nameInput.value = '';
      if (hostInput) hostInput.value = '';
      if (portInput) portInput.value = '53';

      renderResolversList();
    });

    document.getElementById('btn-reset-resolvers')?.addEventListener('click', async () => {
      currentResolvers = [...DEFAULT_NE_RESOLVERS];
      if (window.naptureAPI && window.naptureAPI.saveSetting) {
        await window.naptureAPI.saveSetting('neResolvers', JSON.stringify(currentResolvers));
      }
      renderResolversList();
    });

    document.getElementById('btn-flush-ne-dns')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-flush-ne-dns');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Flushing...';
      }
      if (window.naptureAPI && window.naptureAPI.flushNeDnsCache) {
        await window.naptureAPI.flushNeDnsCache();
      }
      if (btn) {
        btn.textContent = 'Cache Cleared!';
        setTimeout(() => {
          btn.textContent = 'Flush DNS Cache';
          btn.disabled = false;
        }, 1500);
      }
    });

    document.getElementById('btn-test-resolvers')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-resolvers');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Testing...';
      }
      await Promise.all(currentResolvers.map(async (node, i) => {
        const badge = document.getElementById('resolver-status-' + i);
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.className = 'resolver-badge testing';
          badge.textContent = 'Pinging...';
        }
        if (window.naptureAPI && window.naptureAPI.testNeResolver) {
          const res = await window.naptureAPI.testNeResolver(node.host, node.port);
          if (badge) {
            if (res.ok) {
              badge.className = 'resolver-badge online';
              badge.textContent = res.latencyMs + 'ms';
            } else {
              badge.className = 'resolver-badge offline';
              badge.textContent = 'Offline';
            }
          }
        }
      }));
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Test All Resolvers';
      }
    });
    ` : ''}

    // Automatically load Sync & Protocols UI immediately on settings page initialization
    loadSyncUI();
    ${neSupported ? `
    loadProtocolsUI();

    document.querySelector('.nav-item[data-target="protocols"]')?.addEventListener('click', () => {
      loadProtocolsUI();
    });

    if (window.location.hash === '#protocols') {
      loadProtocolsUI();
    }
    ` : ''}

    document.querySelector('.nav-item[data-target="sync"]')?.addEventListener('click', () => {
      loadSyncUI();
    });

    if (window.location.hash === '#sync') {
      loadSyncUI();
    }

    if (window.location.hash && window.location.hash.includes('customize=true')) {
      const tbItem = document.querySelector('.nav-item[data-target="toolbar"]');
      if (tbItem) tbItem.click();
      openCustomizerModal();
    }

    if (window.naptureAPI && window.naptureAPI.onSettingsNavigate) {
      window.naptureAPI.onSettingsNavigate((options) => {
        if (!options) return;
        if (options.section) {
          const navTarget = document.querySelector('.nav-item[data-target="' + options.section + '"]');
          if (navTarget) navTarget.click();
        }
        if (options.openCustomize && options.section === 'toolbar') {
          openCustomizerModal();
        }
      });
    }
  </script>
</body>
</html>`;
}

module.exports = {
  buildSettingsPage,
  getDefaultSettings,
  validateToolbarLayout,
  DEFAULT_TOOLBAR_LAYOUT
};
