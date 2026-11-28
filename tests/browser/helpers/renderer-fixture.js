// Boots the real renderer controller inside jsdom. The document is built from
// the app's actual index.html body so the controller sees the same ids, classes
// and toolbar structure as it does at runtime.

const fs = require('fs');
const path = require('path');

const RENDERER_DIR = path.join(__dirname, '..', '..', '..', 'napture', 'renderer');
const INDEX_PATH = path.join(RENDERER_DIR, 'index.html');

function readIndexBody() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const match = html.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('Renderer fixture: <body> not found in index.html');
  return match[2];
}

const BODY_CONTENT = readIndexBody();
const settingHandlers = [];
const shortcutHandlers = [];
const tabContextMenuHandlers = [];

function installBrowserStubs() {
  // jsdom has no layout/observer/timer machinery; the renderer expects them.
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.requestAnimationFrame = (cb) => { cb(0); return 0; };
  window.cancelAnimationFrame = () => {};
}

const SUBSCRIPTION_NAMES = [
  'onTabLoadingState',
  'onTabNavigated',
  'onTabTitleUpdated',
  'onTabFaviconUpdated',
  'onOpenUrlInNewTab',
  'onTriggerResize',
  'onWindowMaximizeState',
  'onThemeColorUpdated'
];

// Same no-ops the controller installs for itself when it runs outside Electron.
const FALLBACK_NOOP_NAMES = [
  'createTab',
  'switchTab',
  'closeTab',
  'navigate',
  'goBack',
  'goForward',
  'reload',
  'windowMinimize',
  'windowMaximize',
  'windowClose',
  'resizeViewContents',
  'setDraggingState',
  'warmupTab',
  'syncPinnedTabs',
  'hideOmnibarPopup'
];

// The preload bridge implements all of these; the Proxy keeps the fixture honest
// about new APIs without listing dozens of no-ops. Pass withGetSettings: false
// to emulate the plain-browser fallback (bridge present, but no getSettings).
function installApiMock(options = {}) {
  settingHandlers.length = 0;
  shortcutHandlers.length = 0;
  tabContextMenuHandlers.length = 0;
  const overrides = {
    getSettings: () => Promise.resolve({}),
    onSettingChanged: (cb) => { settingHandlers.push(cb); return () => {}; },
    onShortcutAction: (cb) => { shortcutHandlers.push(cb); return () => {}; },
    onTabContextMenuAction: (cb) => { tabContextMenuHandlers.push(cb); return () => {}; },
    loadSession: () => Promise.resolve([]),
    extensionsList: () => Promise.resolve([]),
    getRecentDownloads: () => Promise.resolve([]),
    getHistory: () => Promise.resolve([]),
    getSuggestions: () => Promise.resolve([]),
    getActiveMediaInfo: () => Promise.resolve(null),
    isDefaultBrowser: () => Promise.resolve(false),
    checkForUpdates: () => Promise.resolve({ updateAvailable: false })
  };
  if (options.withGetSettings === false) {
    const api = {};
    for (const name of SUBSCRIPTION_NAMES) api[name] = () => () => {};
    for (const name of FALLBACK_NOOP_NAMES) api[name] = () => {};
    window.naptureAPI = api;
    return;
  }

  window.naptureAPI = new Proxy(overrides, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      if (prop.startsWith('on')) return () => () => {};
      return () => {};
    }
  });
}

function loadRendererFixture(options = {}) {
  installBrowserStubs();
  installApiMock(options);
  document.body.innerHTML = BODY_CONTENT;
  // Required only after the DOM and bridge exist, because the controller runs
  // its startup sequence as soon as it is evaluated.
  return require(path.join(RENDERER_DIR, 'renderer.js'));
}

// Pushes a settings change through the same IPC bridge the main process uses,
// so tests exercise the renderer's real settings merge instead of mutating a
// stale settings object.
function setRendererSetting(key, value) {
  for (const handler of settingHandlers) handler({ key, value });
}

// Pushes a shortcut action through the same preload subscription the main
// process uses, so tests exercise handleShortcutAction and its guards.
function sendShortcutAction(action, data) {
  for (const handler of shortcutHandlers) handler(action, data);
}

// Dispatches the action the main process sends after a tab context-menu item is
// clicked. bookmarks.js registers this listener and owns the action logic.
function sendTabContextMenuAction(action, payload) {
  for (const handler of tabContextMenuHandlers) handler(action, payload);
}

module.exports = {
  loadRendererFixture,
  setRendererSetting,
  sendShortcutAction,
  sendTabContextMenuAction
};
