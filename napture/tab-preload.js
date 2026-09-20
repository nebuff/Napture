// Tab Preload: Injected into browsing WebContentsViews
// For internal pages (napture://, ne://, file://), safely exposes naptureAPI for settings/history/welcome UI.
// For external web pages, strictly isolates the context and sanitizes browser fingerprints to standard Google Chrome.

const { contextBridge, ipcRenderer, webFrame } = require('electron');

const isInternalPage = () => {
  try {
    const proto = window.location.protocol;
    const host = (window.location.hostname || '').toLowerCase();
    if (proto === 'file:') return true;
    if (proto === 'napture:') return true;
    if (proto === 'ne:') {
      return !host || ['welcome', 'start', 'newtab', 'settings', 'history', 'about', 'keyboard', 'shortcuts', 'logo', 'error'].includes(host);
    }
    return false;
  } catch (e) {
    return false;
  }
};

if (isInternalPage()) {
  try {
    contextBridge.exposeInMainWorld('naptureAPI', {
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
      openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
      getSettings: () => ipcRenderer.invoke('get-settings'),
      saveSetting: (key, value) => ipcRenderer.invoke('save-setting', { key, value }),
      saveAllSettings: (settings) => ipcRenderer.invoke('save-all-settings', settings),
      isNeProtocolSupported: () => ipcRenderer.invoke('is-ne-protocol-supported'),
      flushNeDnsCache: () => ipcRenderer.invoke('flush-ne-dns-cache'),
      testNeResolver: (host, port) => ipcRenderer.invoke('test-ne-resolver', { host, port }),
      closeSecondaryWindows: () => ipcRenderer.send('close-secondary-windows'),
      triggerToolbarCustomize: () => ipcRenderer.invoke('trigger-toolbar-customize'),
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
        return () => ipcRenderer.removeListener('close-popups', subscription);
      }
    });
  } catch (e) {}
}

// Intercept page clicks across all web contents to auto-dismiss open browser popups/menus (throttled)
let lastClickDismissTime = 0;
window.addEventListener('pointerdown', (e) => {
  if (e && e.button === 2) return; // Right-click will trigger context-menu event; do not send page-clicked to prevent race conditions!
  const now = Date.now();
  if (now - lastClickDismissTime > 200) {
    lastClickDismissTime = now;
    try { ipcRenderer.send('page-clicked'); } catch (e) {}
  }
}, { capture: true, passive: true });

const initScript = `
(function() {
  try {
    const uaMatch = (navigator.userAgent || '').match(/Chrome\\/([0-9]+(?:\\.[0-9]+)*)/);
    const chromeVer = uaMatch ? uaMatch[1] : '131.0.6778.86';
    const chromeMaj = chromeVer.split('.')[0] || '131';

    // 1. Sanitize navigator.userAgentData to remove Electron brands and supply Google Chrome
    if (typeof NavigatorUAData !== 'undefined' && NavigatorUAData.prototype) {
      const cleanBrands = [
        { brand: 'Chromium', version: chromeMaj },
        { brand: 'Not_A Brand', version: '24' },
        { brand: 'Google Chrome', version: chromeMaj }
      ];
      const cleanFullVersionList = [
        { brand: 'Chromium', version: chromeVer },
        { brand: 'Not_A Brand', version: '24.0.0.0' },
        { brand: 'Google Chrome', version: chromeVer }
      ];

      try {
        Object.defineProperty(NavigatorUAData.prototype, 'brands', {
          get: function() { return cleanBrands; },
          configurable: true,
          enumerable: true
        });
      } catch(e) {}

      if (navigator.userAgentData) {
        const originalGetHighEntropyValues = navigator.userAgentData.getHighEntropyValues;
        if (typeof originalGetHighEntropyValues === 'function') {
          navigator.userAgentData.getHighEntropyValues = function(hints) {
            return originalGetHighEntropyValues.call(this, hints).then(res => {
              if (res) {
                res.brands = cleanBrands;
                if (res.fullVersionList) {
                  res.fullVersionList = cleanFullVersionList;
                }
                if (res.uaFullVersion) {
                  res.uaFullVersion = chromeVer;
                }
              }
              return res;
            });
          };
        }
      }
    }

    // 2. Add standard Google Chrome window.chrome properties (csi, loadTimes, app)
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        installState: function(cb) { if (cb) cb('not_installed'); },
        runningState: function() { return 'cannot_run'; }
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function() {
        return {
          onloadT: Date.now(),
          pageT: (performance.now() || 0),
          startE: Date.now() - 100,
          tran: 15
        };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function() {
        return {
          commitLoadTime: Date.now() / 1000,
          connectionInfo: 'http/1.1',
          finishDocumentLoadTime: Date.now() / 1000,
          finishLoadTime: Date.now() / 1000,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'unknown',
          requestTime: (Date.now() - 100) / 1000,
          startLoadTime: (Date.now() - 100) / 1000,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false
        };
      };
    }

    // 3. Remove navigator.webdriver automation flag if present and sanitize vendor
    if (Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')) {
      try {
        Object.defineProperty(Navigator.prototype, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
      } catch(e) {}
    }
    try {
      Object.defineProperty(Navigator.prototype, 'vendor', {
        get: () => 'Google Inc.',
        configurable: true
      });
    } catch(e) {}
  } catch (e) {}
})();
`;

try {
  webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: initScript }]);
} catch (e) {}
