// Electron Preload script - Exposes safe IPC bridge methods to renderer contexts
// Do not create new modals; reuse existing ones.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('naptureAPI', {
  // Renderer to Main Process calls
  createTab: (tabId, url) => ipcRenderer.send('create-tab', { tabId, url }),
  switchTab: (payload) => ipcRenderer.send('switch-tab', payload),
  toggleMuteTab: (tabId) => ipcRenderer.send('toggle-mute-tab', tabId),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  resizeViewContents: (bounds) => ipcRenderer.send('resize-view-contents', bounds),
  setDraggingState: (isDragging) => ipcRenderer.send('set-dragging-state', isDragging),
  setSuggestionsHeight: (height) => ipcRenderer.send('set-suggestions-height', height),
  getSuggestions: (query) => ipcRenderer.invoke('get-suggestions', query),
  updateSuggestionsOverlay: (payload) => ipcRenderer.send('update-suggestions-overlay', payload),
  selectSuggestion: (sug) => ipcRenderer.send('select-suggestion', sug),
  detachTab: (data) => ipcRenderer.send('detach-tab', data),
  adoptTabToWindow: (data) => ipcRenderer.send('adopt-tab-to-window', data),
  warmupTab: (data) => ipcRenderer.send('warmup-tab', data),
  syncPinnedTabs: (ids) => ipcRenderer.send('sync-pinned-tabs', ids),
  syncBookmarkTabs: (ids) => ipcRenderer.send('sync-bookmark-tabs', ids),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('update-download-progress', subscription);
    return () => ipcRenderer.removeListener('update-download-progress', subscription);
  },
  onUpdateDownloadError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('update-download-error', subscription);
    return () => ipcRenderer.removeListener('update-download-error', subscription);
  },
  controlMedia: (action, value) => ipcRenderer.send('control-media', { action, value }),
  getActiveMediaInfo: () => ipcRenderer.invoke('get-active-media-info'),
  onMediaStateChanged: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('media-state-changed', subscription);
    return () => ipcRenderer.removeListener('media-state-changed', subscription);
  },
  onMediaVolumeUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('media-volume-updated', subscription);
    return () => ipcRenderer.removeListener('media-volume-updated', subscription);
  },
  startMediaVideoStream: (tabId) => ipcRenderer.send('start-media-video-stream', { tabId }),
  stopMediaVideoStream: (tabId) => ipcRenderer.send('stop-media-video-stream', { tabId }),
  onMediaVideoFrame: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('media-video-frame', subscription);
    return () => ipcRenderer.removeListener('media-video-frame', subscription);
  },

  // Main to Renderer Process subscriptions
  onSuggestionSelected: (callback) => {
    const subscription = (event, sug) => callback(sug);
    ipcRenderer.on('suggestion-selected', subscription);
    return () => ipcRenderer.removeListener('suggestion-selected', subscription);
  },
  onTabLoadingState: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tab-loading-state', subscription);
    return () => ipcRenderer.removeListener('tab-loading-state', subscription);
  },
  onTabNavigated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tab-navigated', subscription);
    return () => ipcRenderer.removeListener('tab-navigated', subscription);
  },
  onTabTitleUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tab-title-updated', subscription);
    return () => ipcRenderer.removeListener('tab-title-updated', subscription);
  },
  onTabFaviconUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tab-favicon-updated', subscription);
    return () => ipcRenderer.removeListener('tab-favicon-updated', subscription);
  },
  onOpenUrlInNewTab: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('open-url-in-new-tab', subscription);
    return () => ipcRenderer.removeListener('open-url-in-new-tab', subscription);
  },
  onTriggerResize: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('trigger-resize', subscription);
    return () => ipcRenderer.removeListener('trigger-resize', subscription);
  },
  onWindowMaximizeState: (callback) => {
    const subscription = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximize-state', subscription);
    return () => ipcRenderer.removeListener('window-maximize-state', subscription);
  },
  onThemeColorUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('theme-color-updated', subscription);
    return () => ipcRenderer.removeListener('theme-color-updated', subscription);
  },
  onShortcutAction: (callback) => {
    const subscription = (event, action, data) => callback(action, data);
    ipcRenderer.on('shortcut-action', subscription);
    return () => ipcRenderer.removeListener('shortcut-action', subscription);
  },
  onAdoptTab: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('adopt-tab', subscription);
    return () => ipcRenderer.removeListener('adopt-tab', subscription);
  },
  onRemoveTab: (callback) => {
    const subscription = (event, tabId) => callback(tabId);
    ipcRenderer.on('remove-tab', subscription);
    return () => ipcRenderer.removeListener('remove-tab', subscription);
  },
  onTabAdoptedByAnotherWindow: (callback) => {
    const subscription = (event, tabId) => callback(tabId);
    ipcRenderer.on('tab-adopted-by-another-window', subscription);
    return () => ipcRenderer.removeListener('tab-adopted-by-another-window', subscription);
  },
  zoomIn: () => ipcRenderer.send('zoom-in'),
  zoomOut: () => ipcRenderer.send('zoom-out'),
  zoomReset: () => ipcRenderer.send('zoom-reset'),
  openShortcutsWindow: () => ipcRenderer.send('open-shortcuts-window'),
  openAboutWindow: () => ipcRenderer.send('open-about-window'),
  openSettingsWindow: (options) => ipcRenderer.send('open-settings-window', options),
  onSettingsNavigate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('settings-navigate', subscription);
    return () => ipcRenderer.removeListener('settings-navigate', subscription);
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key, value) => ipcRenderer.invoke('save-setting', { key, value }),
  saveAllSettings: (settings) => ipcRenderer.invoke('save-all-settings', settings),
  isNeProtocolSupported: () => ipcRenderer.invoke('is-ne-protocol-supported'),
  flushNeDnsCache: () => ipcRenderer.invoke('flush-ne-dns-cache'),
  testNeResolver: (host, port) => ipcRenderer.invoke('test-ne-resolver', { host, port }),
  closeSecondaryWindows: () => ipcRenderer.send('close-secondary-windows'),
  onAddressBarFocused: () => ipcRenderer.send('address-bar-focused'),
  getDownloadsHistory: () => ipcRenderer.invoke('get-downloads-history'),
  getHistory: (query) => ipcRenderer.invoke('get-history', query),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  deleteHistoryItems: (ids) => ipcRenderer.invoke('delete-history-items', ids),
  clearAllHistory: () => ipcRenderer.invoke('clear-all-history'),
  getRecentDownloads: () => ipcRenderer.invoke('get-recent-downloads'),
  onDownloadUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-updated', subscription);
    return () => ipcRenderer.removeListener('download-updated', subscription);
  },
  onDownloadStarted: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-started', subscription);
    return () => ipcRenderer.removeListener('download-started', subscription);
  },
  onCloseAllPopups: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('close-all-popups', subscription);
    return () => ipcRenderer.removeListener('close-all-popups', subscription);
  },
  openDownloadedFile: (itemData) => ipcRenderer.send('open-downloaded-file', itemData),
  showDownloadedFileInFolder: (itemData) => ipcRenderer.send('show-downloaded-file-in-folder', itemData),
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  deleteDownloadItem: (id) => ipcRenderer.invoke('delete-download-item', id),
  clearDownloadsHistory: () => ipcRenderer.invoke('clear-downloads-history'),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
  onOpenHistoryUrl: (callback) => {
    const subscription = (event, url) => callback(url);
    ipcRenderer.on('open-history-url', subscription);
    return () => ipcRenderer.removeListener('open-history-url', subscription);
  },
  onHtmlFullscreenState: (callback) => {
    const subscription = (event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('html-fullscreen-state', subscription);
    return () => ipcRenderer.removeListener('html-fullscreen-state', subscription);
  },
  addBookmark: (title, url, parentId, isFolder) => ipcRenderer.invoke('add-bookmark', { title, url, parentId, isFolder }),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  saveBookmarksTree: (tree) => ipcRenderer.invoke('save-bookmarks-tree', tree),
  savePinnedSites: (sites) => ipcRenderer.invoke('save-pinned-sites', sites),
  saveSession: (tabs) => ipcRenderer.invoke('save-session', tabs),
  loadSession: () => ipcRenderer.invoke('load-session'),
  selectDownloadDirectory: () => ipcRenderer.invoke('select-download-directory'),
  importBrowserData: (browser) => ipcRenderer.invoke('import-browser-data', browser),
  importBookmarksFile: (filePath) => ipcRenderer.invoke('import-bookmarks-file', filePath),
  onBrowserDataImported: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browser-data-imported', subscription);
    return () => ipcRenderer.removeListener('browser-data-imported', subscription);
  },
  onImportProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('import-progress', subscription);
    return () => ipcRenderer.removeListener('import-progress', subscription);
  },
  clearBrowsingData: (options) => ipcRenderer.invoke('clear-browsing-data', options),
  resetAllSettings: () => ipcRenderer.invoke('reset-all-settings'),
  resetAllData: () => ipcRenderer.invoke('reset-all-data'),
  onResetAllCompleted: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('reset-all-completed', subscription);
    return () => ipcRenderer.removeListener('reset-all-completed', subscription);
  },
  optimizeDatabase: () => ipcRenderer.invoke('optimize-database'),
  isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser'),
  makeDefaultBrowser: () => ipcRenderer.invoke('make-default-browser'),
  onSettingChanged: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('setting-changed', subscription);
    return () => ipcRenderer.removeListener('setting-changed', subscription);
  },
  // Napture Zero-Knowledge Sync APIs
  getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
  initSyncGroup: (name) => ipcRenderer.invoke('sync:init-group', name),
  generatePairingCode: () => ipcRenderer.invoke('sync:generate-code'),
  joinSyncGroup: (code, name) => ipcRenderer.invoke('sync:join-group', { code, name }),
  unlinkDevice: (deviceId) => ipcRenderer.invoke('sync:unlink-device', deviceId),
  renameSyncDevice: (deviceId, name) => ipcRenderer.invoke('sync:rename-device', { deviceId, name }),
  leaveSyncGroup: () => ipcRenderer.invoke('sync:leave-group'),
  syncNow: () => ipcRenderer.invoke('sync:sync-now'),
  setSyncOption: (options) => ipcRenderer.invoke('sync:set-option', options),
  allowCertificateError: (targetUrl) => ipcRenderer.invoke('allow-certificate-error', targetUrl),
  onClosePopups: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('close-popups', subscription);
    ipcRenderer.on('close-all-popups', subscription);
    return () => {
      ipcRenderer.removeListener('close-popups', subscription);
      ipcRenderer.removeListener('close-all-popups', subscription);
    };
  },
  showTabContextMenu: (items, coords) => ipcRenderer.send('show-tab-context-menu', items, coords),
  onTabContextMenuAction: (callback) => {
    const subscription = (event, action, payload) => callback(action, payload);
    ipcRenderer.on('tab-context-menu-action', subscription);
    return () => ipcRenderer.removeListener('tab-context-menu-action', subscription);
  },
  contextMenuAction: (index) => ipcRenderer.send('context-menu-action', index),
  onUpdateMenu: (callback) => {
    const subscription = (event, html, styles, x, y) => callback(html, styles, x, y);
    ipcRenderer.on('update-menu', subscription);
    return () => ipcRenderer.removeListener('update-menu', subscription);
  },
  showToolbarFolderMenu: (data) => ipcRenderer.send('show-toolbar-folder-menu', data),
  onToolbarFolderItemClicked: (callback) => {
    const subscription = (event, child) => callback(child);
    ipcRenderer.on('toolbar-folder-item-clicked', subscription);
    return () => ipcRenderer.removeListener('toolbar-folder-item-clicked', subscription);
  },
  triggerToolbarCustomize: () => ipcRenderer.invoke('trigger-toolbar-customize'),
  setToolbarCustomizing: (isCustomizing) => ipcRenderer.send('set-toolbar-customizing', isCustomizing),
  onStartToolbarCustomize: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('start-toolbar-customize', subscription);
    return () => ipcRenderer.removeListener('start-toolbar-customize', subscription);
  },
  toggleOmnibarPopup: (payload) => ipcRenderer.send('toggle-omnibar-popup', payload),
  hideOmnibarPopup: () => ipcRenderer.send('hide-omnibar-popup'),
  setOmnibarPopupHeight: (height) => ipcRenderer.send('set-omnibar-popup-height', height),
  omnibarPopupAction: (action, data) => ipcRenderer.send('omnibar-popup-action', { action, data }),
  onOmnibarPopupAction: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('omnibar-popup-action', subscription);
    return () => ipcRenderer.removeListener('omnibar-popup-action', subscription);
  }
});
