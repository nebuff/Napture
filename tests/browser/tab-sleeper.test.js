const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runMemorySaver,
  sleepTabToDisk,
  rehydrateArchivedTab,
  captureNavigationHistory
} = require('../../napture/tab-sleeper');
const {
  DEFAULT_MEMORY_TARGET_MB,
  getMemoryTargetBytes,
  classifyMemoryPressure,
  rankTabsForDiscard
} = require('../../napture/memory-manager');

const MB = 1024 * 1024;
const MINUTE = 60 * 1000;

function makeWebContents(spec) {
  let destroyed = false;
  const wc = {
    isDestroyed: jest.fn(() => destroyed),
    destroy: jest.fn(() => { destroyed = true; }),
    getOSProcessId: jest.fn(() => spec.pid),
    isCurrentlyAudible: jest.fn(() => !!spec.audible),
    isLoading: jest.fn(() => !!spec.loading),
    getURL: jest.fn(() => spec.url || 'https://example.test'),
    getTitle: jest.fn(() => spec.title || 'Example'),
    executeJavaScript: jest.fn((script) => {
      if (String(script).includes('scrollX')) {
        return Promise.resolve({ scrollX: spec.scrollX ?? 11, scrollY: spec.scrollY ?? 22 });
      }
      return Promise.resolve();
    }),
    navigationHistory: {
      getAllEntries: jest.fn(() => spec.entries || [
        { url: spec.url || 'https://example.test', title: spec.title || 'Example', pageState: 'state-1' },
        { url: `${spec.url || 'https://example.test'}/next`, title: 'Next', pageState: 'state-2' }
      ]),
      getActiveIndex: jest.fn(() => spec.activeIndex ?? 1),
      restore: jest.fn().mockResolvedValue()
    }
  };
  return wc;
}

function makeView(wc, lastActiveAt) {
  return {
    webContents: wc,
    _lastActiveAt: lastActiveAt,
    _createdAt: lastActiveAt,
    _backgroundThrottled: false
  };
}

function makeWindow(views) {
  const children = views.slice();
  return {
    isDestroyed: jest.fn(() => false),
    contentView: {
      children,
      removeChildView: jest.fn((view) => {
        const idx = children.indexOf(view);
        if (idx !== -1) children.splice(idx, 1);
      })
    },
    webContents: {
      send: jest.fn(),
      isDestroyed: jest.fn(() => false)
    }
  };
}

function setupHarness({ tabs, activeTabId, pinnedIds = [], settings = {}, metricsByPid = {} }) {
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napture-tab-sleeper-'));
  const tabViews = new Map();
  const views = [];

  for (const [tabId, spec] of Object.entries(tabs)) {
    const wc = makeWebContents({ url: `https://${tabId}.test`, title: tabId, ...spec });
    const view = makeView(wc, spec.lastActiveAt);
    tabViews.set(tabId, view);
    views.push(view);
  }

  const state = {
    tabs: new Set(Object.keys(tabs)),
    activeTabId,
    pinnedTabs: new Set(pinnedIds),
    mruTabs: [],
    sleptTabs: new Set(),
    sleepingTabInfo: new Map()
  };
  const win = makeWindow(views);
  const windowStates = new Map([[win, state]]);
  const metrics = Object.entries(metricsByPid).map(([pid, megabytes]) => ({
    pid: Number(pid),
    memory: { workingSetSize: megabytes * 1024 }
  }));

  const context = {
    app: { getAppMetrics: jest.fn(() => metrics) },
    os: { totalmem: jest.fn(() => 16 * 1024 * MB) },
    path,
    fs,
    browserWindows: [win],
    tabViews,
    getWindowState: (targetWin) => windowStates.get(targetWin) || null,
    getWindowByTabId: (tabId) => (state.tabs.has(tabId) ? win : null),
    getArchivePath: () => archiveDir,
    getSetting: jest.fn((key, fallback) => (
      Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
    )),
    getMemoryTargetBytes,
    classifyMemoryPressure,
    rankTabsForDiscard,
    defaultMemoryTargetMB: DEFAULT_MEMORY_TARGET_MB,
    getActiveStreamingTabId: () => null,
    clearMediaForTab: jest.fn(),
    logger: { error: jest.fn() }
  };

  return { context, state, win, tabViews, archiveDir, views };
}

describe('tab-sleeper integration', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length) {
      try { fs.rmSync(tempDirs.pop(), { recursive: true, force: true }); } catch (e) {}
    }
  });

  function track(harness) {
    tempDirs.push(harness.archiveDir);
    return harness;
  }

  test('sleeps the least-recently-used unprotected tab when main-process memory exceeds its target', async () => {
    const now = Date.now();
    const harness = track(setupHarness({
      activeTabId: 'active',
      pinnedIds: ['pinned'],
      tabs: {
        active: { pid: 1, lastActiveAt: now },
        pinned: { pid: 2, lastActiveAt: now - 6 * 60 * MINUTE },
        old: { pid: 3, lastActiveAt: now - 3 * 60 * MINUTE, url: 'https://old.test', title: 'Old Page' },
        fresh: { pid: 4, lastActiveAt: now - 30 * 1000 },
        audio: { pid: 5, lastActiveAt: now - 4 * 60 * MINUTE, audible: true }
      },
      settings: { memorySaver: true, memoryTarget: 1000 },
      // 1.2 GB total against a 1 GB target, 200 MB over.
      metricsByPid: { 1: 300, 2: 200, 3: 400, 4: 100, 5: 200 }
    }));

    const oldView = harness.tabViews.get('old');
    const activeView = harness.tabViews.get('active');
    const pinnedView = harness.tabViews.get('pinned');
    const audioView = harness.tabViews.get('audio');

    const slept = await runMemorySaver(harness.context);

    expect(slept).toEqual(['old']);
    expect(oldView.webContents.destroy).toHaveBeenCalledTimes(1);
    expect(harness.tabViews.has('old')).toBe(false);
    expect(harness.state.sleptTabs.has('old')).toBe(true);
    expect(harness.state.sleepingTabInfo.get('old')).toEqual({
      url: 'https://old.test',
      title: 'Old Page'
    });
    expect(harness.context.clearMediaForTab).toHaveBeenCalledWith('old');
    expect(harness.win.contentView.removeChildView).toHaveBeenCalledWith(oldView);

    expect(activeView.webContents.destroy).not.toHaveBeenCalled();
    expect(pinnedView.webContents.destroy).not.toHaveBeenCalled();
    expect(audioView.webContents.destroy).not.toHaveBeenCalled();
    expect(harness.state.sleptTabs.has('fresh')).toBe(false);

    const archiveFile = path.join(harness.archiveDir, 'old.json');
    expect(fs.existsSync(archiveFile)).toBe(true);
    const archive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
    expect(archive.url).toBe('https://old.test');
    expect(archive.title).toBe('Old Page');
    expect(archive.scrollX).toBe(11);
    expect(archive.scrollY).toBe(22);
    expect(archive.navigation.entries).toHaveLength(2);
    expect(archive.navigation.index).toBe(1);
  });

  test('performs hard-idle maintenance even when the app is below target', async () => {
    const now = Date.now();
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: {
        active: { pid: 1, lastActiveAt: now },
        stale: { pid: 2, lastActiveAt: now - 90 * MINUTE },
        recent: { pid: 3, lastActiveAt: now - 10 * MINUTE }
      },
      settings: { memorySaver: true, memoryTarget: 1500 },
      metricsByPid: { 1: 120, 2: 90, 3: 90 }
    }));

    const slept = await runMemorySaver(harness.context);

    expect(slept).toEqual(['stale']);
    expect(harness.state.sleptTabs.has('stale')).toBe(true);
    expect(harness.state.sleptTabs.has('recent')).toBe(false);
  });

  test('honors the memory-saver toggle but still reclaims memory on forced OS pressure', async () => {
    const now = Date.now();
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: {
        active: { pid: 1, lastActiveAt: now },
        old: { pid: 2, lastActiveAt: now - 3 * 60 * MINUTE }
      },
      settings: { memorySaver: false, memoryTarget: 1000 },
      metricsByPid: { 1: 300, 2: 900 }
    }));

    const oldView = harness.tabViews.get('old');

    expect(await runMemorySaver(harness.context)).toEqual([]);
    expect(oldView.webContents.destroy).not.toHaveBeenCalled();

    const slept = await runMemorySaver(harness.context, { forcedPressure: 'critical' });

    expect(slept).toEqual(['old']);
    expect(oldView.webContents.destroy).toHaveBeenCalledTimes(1);
    expect(harness.state.sleptTabs.has('old')).toBe(true);
  });

  test('does not sleep a tab that became active while its scroll state was serializing', async () => {
    const now = Date.now();
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: {
        active: { pid: 1, lastActiveAt: now },
        background: { pid: 2, lastActiveAt: now - 90 * MINUTE }
      },
      settings: { memorySaver: true, memoryTarget: 1500 },
      metricsByPid: { 1: 100, 2: 100 }
    }));

    const view = harness.tabViews.get('background');
    let resolveScroll;
    view.webContents.executeJavaScript.mockReturnValue(new Promise((resolve) => {
      resolveScroll = resolve;
    }));

    const sleeping = sleepTabToDisk(harness.context, harness.win, harness.state, 'background', view);
    harness.state.activeTabId = 'background';
    resolveScroll({ scrollX: 4, scrollY: 8 });
    await sleeping;

    expect(view.webContents.destroy).not.toHaveBeenCalled();
    expect(harness.tabViews.has('background')).toBe(true);
    expect(harness.state.sleptTabs.has('background')).toBe(false);
    expect(view._isArchiving).toBe(false);
  });

  test('restores back/forward history, scroll position, and removes the archive on wake', async () => {
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: { active: { pid: 1, lastActiveAt: Date.now() } },
      settings: {},
      metricsByPid: { 1: 100 }
    }));

    const entries = [
      { url: 'https://restored.test/', title: 'First', pageState: 'page-state-1' },
      { url: 'https://restored.test/next', title: 'Second', pageState: 'page-state-2' }
    ];
    const archiveFile = path.join(harness.archiveDir, 'restored-tab.json');
    fs.writeFileSync(archiveFile, JSON.stringify({
      url: 'https://restored.test/next',
      title: 'Second',
      scrollX: 12,
      scrollY: 34,
      navigation: { entries, index: 1 }
    }));

    const wc = makeWebContents({ pid: 9 });
    const handlers = {};
    wc.once = jest.fn((event, handler) => { handlers[event] = handler; });
    wc.loadURL = jest.fn();
    const view = { webContents: wc };

    rehydrateArchivedTab(harness.context, view, 'restored-tab', 'https://fallback.test');

    expect(wc.navigationHistory.restore).toHaveBeenCalledWith({ entries, index: 1 });
    expect(wc.loadURL).not.toHaveBeenCalled();
    expect(wc.executeJavaScript).not.toHaveBeenCalled();

    handlers['did-finish-load']();

    expect(wc.executeJavaScript).toHaveBeenCalledWith('window.scrollTo(12, 34);');
    expect(fs.existsSync(archiveFile)).toBe(false);
  });

  test('falls back to the tab URL when no sleep archive exists', () => {
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: { active: { pid: 1, lastActiveAt: Date.now() } },
      settings: {},
      metricsByPid: { 1: 100 }
    }));

    const wc = makeWebContents({ pid: 10 });
    wc.once = jest.fn();
    wc.loadURL = jest.fn();

    rehydrateArchivedTab(harness.context, { webContents: wc }, 'never-slept', 'https://fallback.test');

    expect(wc.loadURL).toHaveBeenCalledWith('https://fallback.test');
    expect(wc.navigationHistory.restore).not.toHaveBeenCalled();
  });

  test('falls back to loading the URL when history restoration rejects', async () => {
    const harness = track(setupHarness({
      activeTabId: 'active',
      tabs: { active: { pid: 1, lastActiveAt: Date.now() } },
      settings: {},
      metricsByPid: { 1: 100 }
    }));

    const archiveFile = path.join(harness.archiveDir, 'broken-restore.json');
    fs.writeFileSync(archiveFile, JSON.stringify({
      url: 'https://archived.test/',
      navigation: {
        entries: [{ url: 'https://archived.test/', title: 'Archived', pageState: 'state' }],
        index: 0
      }
    }));

    const wc = makeWebContents({ pid: 11 });
    wc.once = jest.fn();
    wc.loadURL = jest.fn();
    wc.navigationHistory.restore = jest.fn().mockRejectedValue(new Error('restore failed'));

    rehydrateArchivedTab(harness.context, { webContents: wc }, 'broken-restore', 'https://fallback.test');
    await new Promise((resolve) => setImmediate(resolve));

    expect(wc.loadURL).toHaveBeenCalledWith('https://archived.test/');
  });

  test('caps archived navigation history to the most recent 50 entries', () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      url: `https://history.test/${index}`,
      title: `Page ${index}`
    }));
    const wc = {
      navigationHistory: {
        getAllEntries: () => entries,
        getActiveIndex: () => 90
      }
    };

    const captured = captureNavigationHistory(wc);

    expect(captured.entries).toHaveLength(50);
    expect(captured.entries[0].url).toBe('https://history.test/50');
    expect(captured.entries[49].url).toBe('https://history.test/99');
    expect(captured.index).toBe(40);
  });
});
