'use strict';

// Tab sleeping / wake-up engine shared by the main process.
// All Electron and browser state is injected through a runtime context so the
// production paths can be exercised in Jest without launching a browser.

function captureNavigationHistory(webContents, { maxEntries = 50 } = {}) {
  try {
    const history = webContents.navigationHistory;
    if (!history || typeof history.getAllEntries !== 'function') return null;
    let entries = history.getAllEntries();
    if (!Array.isArray(entries) || entries.length === 0) return null;

    let index = typeof history.getActiveIndex === 'function' ? history.getActiveIndex() : entries.length - 1;
    // Page state snapshots can be large; keep enough history to feel native
    // without writing unbounded archives for very long-lived tabs.
    if (entries.length > maxEntries) {
      const start = Math.max(0, Math.min(index - Math.floor(maxEntries / 2), entries.length - maxEntries));
      entries = entries.slice(start, start + maxEntries);
      index -= start;
    }

    return { entries, index };
  } catch (e) {
    return null;
  }
}

function captureScrollState(webContents, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      resolve(state || { scrollX: 0, scrollY: 0 });
    };
    const timer = setTimeout(() => finish({ scrollX: 0, scrollY: 0 }), timeoutMs);
    if (timer.unref) timer.unref();

    try {
      webContents.executeJavaScript('({ scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 })')
        .then((state) => { clearTimeout(timer); finish(state); })
        .catch(() => { clearTimeout(timer); finish({ scrollX: 0, scrollY: 0 }); });
    } catch (e) {
      clearTimeout(timer);
      finish({ scrollX: 0, scrollY: 0 });
    }
  });
}

function getAppMemorySnapshot(app) {
  let appBytes = 0;
  const bytesByPid = new Map();
  let metrics = [];
  try {
    metrics = app && typeof app.getAppMetrics === 'function' ? app.getAppMetrics() : [];
  } catch (e) {
    metrics = [];
  }

  for (const metric of metrics) {
    if (!metric || !metric.memory) continue;
    const workingSetKb = Number(metric.memory.workingSetSize);
    if (!Number.isFinite(workingSetKb) || workingSetKb <= 0) continue;
    const bytes = workingSetKb * 1024;
    appBytes += bytes;
    if (metric.pid) bytesByPid.set(metric.pid, bytes);
  }

  return { appBytes, bytesByPid };
}

function rehydrateArchivedTab(context, view, tabId, url) {
  const { fs, path, getArchivePath } = context;
  const file = path.join(getArchivePath(), `${tabId}.json`);
  const fallbackUrl = (url && url !== 'about:blank') ? url : 'napture://welcome';
  let data = null;

  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    data = null;
    try { fs.unlinkSync(file); } catch (err) {}
  }

  const archivedUrl = data && typeof data.url === 'string' ? data.url : null;
  const targetUrl = (archivedUrl && archivedUrl !== 'about:blank') ? archivedUrl : fallbackUrl;
  const archivedScrollX = Number(data && data.scrollX);
  const archivedScrollY = Number(data && data.scrollY);
  const scrollX = Number.isFinite(archivedScrollX) ? archivedScrollX : 0;
  const scrollY = Number.isFinite(archivedScrollY) ? archivedScrollY : 0;
  let scrollRestored = false;

  const restoreScroll = () => {
    if (scrollRestored) return;
    scrollRestored = true;
    if ((scrollX || scrollY) && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.executeJavaScript(`window.scrollTo(${scrollX}, ${scrollY});`).catch(() => {});
    }
    try { fs.unlinkSync(file); } catch (e) {}
  };

  const navigation = data && data.navigation;
  const canRestoreHistory = navigation &&
    Array.isArray(navigation.entries) &&
    navigation.entries.length > 0 &&
    view.webContents.navigationHistory &&
    typeof view.webContents.navigationHistory.restore === 'function';

  view.webContents.once('did-finish-load', restoreScroll);

  if (canRestoreHistory) {
    try {
      view.webContents.navigationHistory.restore({
        entries: navigation.entries,
        index: Number.isInteger(navigation.index) ? navigation.index : undefined
      }).catch(() => {
        try { view.webContents.loadURL(targetUrl); } catch (e) {}
      });
    } catch (e) {
      view.webContents.loadURL(targetUrl);
    }
  } else {
    view.webContents.loadURL(targetUrl);
  }
}

function sleepTabToDisk(context, win, state, tabId, view) {
  const {
    fs,
    path,
    getArchivePath,
    tabViews,
    getWindowByTabId,
    getWindowState,
    getActiveStreamingTabId,
    clearMediaForTab,
    notifyTabSlept
  } = context;

  if (!view || !view.webContents || view.webContents.isDestroyed() || view._isArchiving) return Promise.resolve();
  view._isArchiving = true;

  const wc = view.webContents;
  const navigation = captureNavigationHistory(wc);
  let url = '';
  let title = '';
  try {
    url = wc.getURL();
    title = wc.getTitle();
  } catch (e) {}

  return captureScrollState(wc).then((scrollState) => {
    // The tab may have been closed, activated, or moved while serializing.
    if (tabViews.get(tabId) !== view) return;
    const currentWin = getWindowByTabId(tabId);
    const currentState = currentWin ? getWindowState(currentWin) : null;
    if (!currentWin || !currentState || !currentState.tabs.has(tabId) || currentState.activeTabId === tabId) {
      view._isArchiving = false;
      return;
    }

    let stillAudible = false;
    try {
      stillAudible = typeof wc.isCurrentlyAudible === 'function' && wc.isCurrentlyAudible();
    } catch (e) {}
    if (stillAudible) {
      view._isArchiving = false;
      return;
    }

    if (!currentState.sleptTabs) currentState.sleptTabs = new Set();
    if (!currentState.sleepingTabInfo) currentState.sleepingTabInfo = new Map();

    const payload = {
      url: url || 'napture://welcome',
      title: title || 'New Tab',
      scrollX: Number(scrollState && scrollState.scrollX) || 0,
      scrollY: Number(scrollState && scrollState.scrollY) || 0,
      navigation,
      savedAt: Date.now()
    };

    try {
      fs.writeFileSync(path.join(getArchivePath(), `${tabId}.json`), JSON.stringify(payload), 'utf8');
    } catch (e) {
      view._isArchiving = false;
      return;
    }

    if (currentWin.contentView && currentWin.contentView.children.includes(view)) {
      try { currentWin.contentView.removeChildView(view); } catch (e) {}
    }
    currentState.sleptTabs.add(tabId);
    currentState.sleepingTabInfo.set(tabId, { url: payload.url, title: payload.title });

    // Let the chrome renderer show its sleep indicator before the renderer
    // process for this tab is torn down.
    if (typeof notifyTabSlept === 'function') {
      try { notifyTabSlept(tabId, { url: payload.url, title: payload.title }); } catch (e) {}
    }

    if (typeof clearMediaForTab === 'function') {
      clearMediaForTab(tabId);
    }

    try { wc.destroy(); } catch (e) {}
    tabViews.delete(tabId);
  }).catch(() => {
    view._isArchiving = false;
  });
}

async function runMemorySaver(context, { forcedPressure = null } = {}) {
  const {
    app,
    os,
    browserWindows,
    tabViews,
    getWindowState,
    getWindowByTabId,
    getSetting,
    getMemoryTargetBytes,
    classifyMemoryPressure,
    rankTabsForDiscard,
    defaultMemoryTargetMB,
    getActiveStreamingTabId,
    logger = console
  } = context;

  try {
    const enabled = getSetting('memorySaver', true) !== false;
    if (!enabled && !forcedPressure) return [];

    const { appBytes, bytesByPid } = getAppMemorySnapshot(app);
    const targetBytes = getMemoryTargetBytes(getSetting('memoryTarget', defaultMemoryTargetMB));
    const systemBytes = typeof os.totalmem === 'function' ? os.totalmem() : 0;
    const pressure = forcedPressure || classifyMemoryPressure({ appBytes, targetBytes, systemBytes });
    const streamingTabId = typeof getActiveStreamingTabId === 'function' ? getActiveStreamingTabId() : null;
    const now = Date.now();
    const tabs = [];

    for (const win of browserWindows) {
      if (!win || win.isDestroyed()) continue;
      const state = getWindowState(win);
      if (!state) continue;

      for (const tabId of state.tabs) {
        const view = tabViews.get(tabId);
        if (!view || !view.webContents || view.webContents.isDestroyed()) continue;

        let pid = 0;
        try { pid = view.webContents.getOSProcessId(); } catch (e) {}

        tabs.push({
          tabId,
          lastActiveAt: view._lastActiveAt || view._createdAt || 0,
          createdAt: view._createdAt || 0,
          memoryBytes: bytesByPid.get(pid) || 0,
          isActive: state.activeTabId === tabId,
          isPinned: !!(state.pinnedTabs && state.pinnedTabs.has(tabId)),
          isAudible: typeof view.webContents.isCurrentlyAudible === 'function' && view.webContents.isCurrentlyAudible(),
          isLoading: typeof view.webContents.isLoading === 'function' && view.webContents.isLoading(),
          isStreaming: streamingTabId === tabId,
          isArchiving: !!view._isArchiving
        });
      }
    }

    const ids = rankTabsForDiscard(tabs, {
      now,
      pressure,
      bytesToFree: Math.max(0, appBytes - targetBytes),
      maxDiscards: pressure === 'critical' ? 3 : pressure === 'high' ? 2 : 1
    });

    const tasks = [];
    for (const tabId of ids) {
      const win = getWindowByTabId(tabId);
      const state = win ? getWindowState(win) : null;
      const view = tabViews.get(tabId);
      if (!state || !view) continue;
      tasks.push(sleepTabToDisk(context, win, state, tabId, view));
    }

    await Promise.all(tasks);
    return ids;
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[MemorySaver] Failed to reclaim memory:', e);
    }
    return [];
  }
}

module.exports = {
  captureNavigationHistory,
  captureScrollState,
  getAppMemorySnapshot,
  rehydrateArchivedTab,
  sleepTabToDisk,
  runMemorySaver
};
