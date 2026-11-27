// Preload for extension popup windows.
// Electron's popup chrome object does not expose chrome.tabs, which extensions
// use to open their sign-in page or their full-page view. This bridges a minimal
// chrome.tabs/chrome.windows implementation to the main process and routes the
// popup's expand control to a Napture tab.

const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('__naptureExtensionTabs', {
  create: (props) => ipcRenderer.invoke('extensions:tabs-create', props || {}),
  update: (id, props) => ipcRenderer.invoke('extensions:tabs-update', { id, props: props || {} }),
  query: (query) => ipcRenderer.invoke('extensions:tabs-query', query || {}),
  updateWindow: (id, props) => ipcRenderer.invoke('extensions:window-update', { id, props: props || {} })
});

// Extensions open their full-page view with chrome.tabs, which Electron does not
// expose to popup pages. Intercept the popup's expand control and open the full
// page as a Napture tab instead.
const EXPAND_LABEL = /^(expand|open in full( page)?|full.?page|open in tab)$/i;

function isExpandControl(el) {
  if (!el || typeof el.getAttribute !== 'function') return false;
  const label = ((el.getAttribute('title') || el.getAttribute('aria-label')) || '').trim();
  if (label) return EXPAND_LABEL.test(label);
  // The expand control is an icon-only element with aria-expanded.
  const hasExpanded = el.hasAttribute('aria-expanded');
  const iconOnly = !(el.textContent || '').trim();
  return hasExpanded && iconOnly && Boolean(el.querySelector && el.querySelector('svg'));
}

function handleExpandClick(event) {
  let el = event.target;
  while (el && el !== document.documentElement) {
    if (el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label') || el.hasAttribute('aria-expanded'))) {
      if (!isExpandControl(el)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ipcRenderer.invoke('extensions:open-full-page').catch(() => {});
      return;
    }
    el = el.parentElement;
  }
}

function installChromeShim() {
  const bridge = window.__naptureExtensionTabs;
  if (!bridge) return;

  const apply = () => {
    let chromeObj = null;
    try { chromeObj = window.chrome; } catch (e) { return false; }
    if (!chromeObj) return false;

    let tabsObj = null;
    try { tabsObj = chromeObj.tabs; } catch (e) { tabsObj = null; }

    if (!tabsObj) {
      try {
        Object.defineProperty(chromeObj, 'tabs', {
          value: {},
          configurable: true,
          enumerable: true,
          writable: true
        });
        tabsObj = chromeObj.tabs;
      } catch (e) {
        tabsObj = null;
      }
    }
    if (!tabsObj) return false;

    try {
      if (typeof tabsObj.create !== 'function') {
        tabsObj.create = (props) => bridge.create(props);
      }
      if (typeof tabsObj.query !== 'function') {
        tabsObj.query = (query) => bridge.query(query);
      }
      if (typeof tabsObj.update !== 'function') {
        tabsObj.update = (id, props) => bridge.update(id, props);
      }
    } catch (e) {}

    try {
      let windowsObj = chromeObj.windows;
      if (!windowsObj) {
        Object.defineProperty(chromeObj, 'windows', {
          value: {},
          configurable: true,
          enumerable: true,
          writable: true
        });
        windowsObj = chromeObj.windows;
      }
      if (windowsObj && typeof windowsObj.update !== 'function') {
        windowsObj.update = (id, props) => bridge.updateWindow(id, props);
      }
      if (windowsObj && typeof windowsObj.getCurrent !== 'function') {
        windowsObj.getCurrent = () => Promise.resolve({ id: -1, focused: true });
      }
    } catch (e) {}

    return true;
  };

  apply();
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (apply() || attempts > 40) clearInterval(timer);
  }, 50);

  return timer;
}

try {
  if (contextBridge.executeInMainWorld) {
    contextBridge.executeInMainWorld({ func: installChromeShim });
  } else {
    webFrame.executeJavaScript('(' + installChromeShim.toString() + ')();');
  }
} catch (e) {
  console.error('Failed to install extension popup chrome shim:', e && e.message);
}

try {
  const attach = () => document.addEventListener('click', handleExpandClick, true);
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
} catch (e) {}
