// Napture Renderer Controller
// Napture Browser Renderer - Main UI controller, tabs, webviews, and events

// Polyfill/Mock for non-Electron environment (e.g., standard browser testing or static visual verification)
if (typeof window !== 'undefined' && !window.naptureAPI) {
  window.naptureAPI = {
    createTab: () => {},
    switchTab: () => {},
    closeTab: () => {},
    navigate: () => {},
    goBack: () => {},
    goForward: () => {},
    reload: () => {},
    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    resizeViewContents: () => {},
    onTabLoadingState: () => () => {},
    onTabNavigated: () => () => {},
    onTabTitleUpdated: () => () => {},
    onTabFaviconUpdated: () => () => {},
    onOpenUrlInNewTab: () => () => {},
    onTriggerResize: () => () => {},
    onWindowMaximizeState: () => () => {},
    onThemeColorUpdated: () => () => {},
    setDraggingState: () => {},
    warmupTab: (data) => {},
    syncPinnedTabs: () => {}
  };
}

// Browser State
let tabs = [];
let activeTabId = null;

Object.defineProperty(window, 'tabs', {
  get() { return tabs; },
  set(val) { tabs = val; },
  configurable: true,
  enumerable: true
});

Object.defineProperty(window, 'activeTabId', {
  get() { return activeTabId; },
  set(val) { activeTabId = val; },
  configurable: true,
  enumerable: true
});

let pinnedSites = [];
let draggedTab = null;
let dragCounter = 0;
let draggedPinnedSite = null;
let tabsDragCounter = 0;
let draggedTopBarIdx = null;
let draggedSidebarIdx = null;
let draggedPaletteItem = null;

const DEFAULT_TOOLBAR_LAYOUT_ITEMS = [
  { id: 'home-btn', type: 'system', name: 'Home Button', enabled: true },
  { id: 'sep-1', type: 'separator', name: 'Fixed Separator', enabled: true },
  { id: 'back-btn', type: 'system', name: 'Back Button', enabled: true },
  { id: 'forward-btn', type: 'system', name: 'Forward Button', enabled: true },
  { id: 'reload-btn', type: 'system', name: 'Reload Button', enabled: true },
  { id: 'margin-1', type: 'margin', name: 'Flexible Space', enabled: true },
  { id: 'address-container', type: 'system', name: 'Address Bar & Search', enabled: true }
];

const DEFAULT_SIDEBAR_BOTTOM_LAYOUT = [
  { id: 'downloads-btn', type: 'system', name: 'Recent Downloads', enabled: true },
  { id: 'history-btn', type: 'system', name: 'Browsing History', enabled: true },
  { id: 'newtab-btn', type: 'system', name: 'New Tab', enabled: true }
];

let currentSettings = {
  searchEngine: 'napture',
  addressSuggestions: true,
  showFullUrl: false,
  showHomeBtn: true,
  homeUrl: 'napture://welcome',
  dynamicBackground: true,
  folderHoverOpen: false,
  switchToExistingTab: true,
  toolbarLayout: JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS)
};

if (typeof window !== 'undefined') {
  window.currentSettings = currentSettings;
}

if (typeof window !== 'undefined' && window.naptureAPI && window.naptureAPI.getSettings) {
  window.naptureAPI.getSettings().then((s) => {
    if (s) {
      currentSettings = { ...currentSettings, ...s };
      window.currentSettings = currentSettings;
      applySettingsToUI();
      if (typeof loadToolbarState === 'function') loadToolbarState();
      if (typeof renderToolbarCustomizable === 'function') renderToolbarCustomizable();
    }
  });
  if (window.naptureAPI.onSettingChanged) {
    window.naptureAPI.onSettingChanged((data) => {
      if (data && data.key) {
        if (data.key === 'ALL' || data.key === 'ALL_RESET') {
          currentSettings = { ...currentSettings, ...data.value };
        } else {
          currentSettings[data.key] = data.value;
        }
        window.currentSettings = currentSettings;
        applySettingsToUI();
        if (data.key === 'toolbarLayout' || data.key === 'ALL' || data.key === 'ALL_RESET') {
          if (!isToolbarCustomizing) {
            if (typeof loadToolbarState === 'function') loadToolbarState();
            if (typeof renderToolbarCustomizable === 'function') renderToolbarCustomizable();
          }
        }
        if (data.key === 'sidebarBottomLayout' || data.key === 'ALL' || data.key === 'ALL_RESET') {
          if (!isToolbarCustomizing) {
            if (typeof loadSidebarBottomState === 'function') loadSidebarBottomState();
            if (typeof renderSidebarBottom === 'function') renderSidebarBottom();
          }
        }
      }
    });
  }
}

function applySettingsToUI() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  
  if (currentSettings.toolbarLayout) {
    try {
      const layout = typeof currentSettings.toolbarLayout === 'string' ? JSON.parse(currentSettings.toolbarLayout) : currentSettings.toolbarLayout;
      if (Array.isArray(layout)) {
        layout.forEach(item => {
          if (item && item.id) {
            const el = document.getElementById(item.id);
            if (el) {
              if (item.enabled === false) {
                el.classList.add('hidden');
              } else {
                el.classList.remove('hidden');
              }
            }
          }
        });
      }
    } catch (e) {}
  }

  if (typeof tabs !== 'undefined' && typeof activeTabId !== 'undefined') {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
      if (typeof updateAddressBarDisplay === 'function') {
        updateAddressBarDisplay(activeTab.url, activeTab.title);
      }
      if (typeof applyThemeColor === 'function') {
        applyThemeColor(activeTab.themeColor);
      }
    } else if (typeof applyThemeColor === 'function') {
      applyThemeColor(null);
    }
  }
}

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const homeBtn = document.getElementById('home-btn');
const addressInput = document.getElementById('address-input');
const addressDisplay = document.getElementById('address-display');
const loadingIndicator = document.getElementById('loading-indicator');
const addressLoadingBar = document.getElementById('address-loading-bar');
const securityBadge = document.getElementById('security-badge');
const shortcutsGrid = document.getElementById('shortcuts-grid');

function updatePageLoadingState(isLoading) {
  const headerBar = document.getElementById('header-bar');
  const addressContainer = document.getElementById('address-container');
  const addrBar = addressLoadingBar || document.getElementById('address-loading-bar');

  if (isLoading) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    if (headerBar) headerBar.classList.add('is-loading');
    if (addressContainer) addressContainer.classList.add('is-loading');
    if (addrBar) addrBar.classList.add('active');
  } else {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (headerBar) headerBar.classList.remove('is-loading');
    if (addressContainer) addressContainer.classList.remove('is-loading');
    if (addrBar) addrBar.classList.remove('active');
  }
}

// Custom Window Controls
const winMinimize = document.getElementById('win-minimize');
const winMaximize = document.getElementById('win-maximize');
const winClose = document.getElementById('win-close');
const maximizeIcon = document.getElementById('maximize-icon');
const restoreIcon = document.getElementById('restore-icon');

let sessionSaveTimeout = null;

// Unique ID Generator
function generateId() {
  return 'tab-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
}

// ----------------------------------------------------
// Viewport Resizing Logic (Calculates exact absolute positions)
// ----------------------------------------------------
let _viewResizeRaf = null;
let _lastSentBounds = null;

function sendViewResize() {
  const placeholder = document.getElementById('viewport-placeholder');
  if (!placeholder || !window.naptureAPI || !window.naptureAPI.resizeViewContents) return;
  const rect = placeholder.getBoundingClientRect();
  const bounds = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  if (bounds.width <= 0 || bounds.height <= 0) return;
  // Avoid redundant IPC calls if bounds have not changed
  if (_lastSentBounds &&
      _lastSentBounds.x === bounds.x &&
      _lastSentBounds.y === bounds.y &&
      _lastSentBounds.width === bounds.width &&
      _lastSentBounds.height === bounds.height) {
    return;
  }
  _lastSentBounds = bounds;
  window.naptureAPI.resizeViewContents(bounds);
}

// Observe resizing of the placeholder with rAF-debounced throttling to prevent IPC flooding and CPU spikes
const resizeObserver = new ResizeObserver(() => {
  if (_viewResizeRaf) cancelAnimationFrame(_viewResizeRaf);
  _viewResizeRaf = requestAnimationFrame(() => {
    _viewResizeRaf = null;
    sendViewResize();
  });
});
const viewportPlaceholder = document.getElementById('viewport-placeholder');
if (viewportPlaceholder) {
  resizeObserver.observe(viewportPlaceholder);
}

// ----------------------------------------------------
// ----------------------------------------------------
// Mouse-following Drag Ghost Preview Controller
// ----------------------------------------------------
const emptyDragImage = new Image();
emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const dragGhostEl = document.getElementById('drag-ghost');
const dragGhostFavicon = dragGhostEl ? dragGhostEl.querySelector('.drag-ghost-favicon') : null;
const dragGhostTitle = dragGhostEl ? dragGhostEl.querySelector('.drag-ghost-title') : null;

function createDragGhost(data) {
  if (!dragGhostEl) return;

  if (dragGhostFavicon) {
    dragGhostFavicon.innerHTML = '';
    if (data.favicon) {
      const img = document.createElement('img');
      img.src = data.favicon;
      img.onerror = () => {
        dragGhostFavicon.innerHTML = getDefaultFaviconIcon(data.url || '');
      };
      dragGhostFavicon.appendChild(img);
    } else {
      dragGhostFavicon.innerHTML = getDefaultFaviconIcon(data.url || '');
    }
  }

  if (dragGhostTitle) {
    dragGhostTitle.textContent = data.title || 'New Tab';
  }

  dragGhostEl.classList.remove('hidden');
}

function updateDragGhostPosition(e) {
  if (!dragGhostEl || dragGhostEl.classList.contains('hidden')) return;
  const x = e.clientX || 0;
  const y = e.clientY || 0;
  if (x > 0 || y > 0) {
    const isHoveringPinned = shortcutsGrid && shortcutsGrid.classList.contains('drag-over');
    if (isHoveringPinned) {
      dragGhostEl.classList.add('is-hovering-pinned');
    } else {
      dragGhostEl.classList.remove('is-hovering-pinned');
    }

    dragGhostEl.style.transform = `translate3d(${x + 12}px, ${y + 12}px, 0)`;
  }
}

function removeDragGhost() {
  if (!dragGhostEl) return;
  dragGhostEl.classList.remove('is-hovering-pinned');
  dragGhostEl.classList.add('hidden');
  dragGhostEl.style.transform = 'translate3d(-9999px, -9999px, 0)';
}

let dropTargetInfo = null;
let activeDragState = { tab: null, pinned: null, targetInfo: null };

function clearDropIndicators() {
  if (!tabsContainer) return;
  const tabEls = tabsContainer.querySelectorAll('.tab');
  tabEls.forEach(t => t.classList.remove('drop-target-top', 'drop-target-bottom', 'shift-down', 'shift-up'));
  dropTargetInfo = null;
}

function renderTabsAnimated() {
  if (!tabsContainer) {
    renderTabs();
    return;
  }

  const firstPositions = new Map();
  const existingTabEls = tabsContainer.querySelectorAll('.tab');
  existingTabEls.forEach(el => {
    const id = el.dataset.tabId;
    if (id) {
      firstPositions.set(id, el.getBoundingClientRect().top);
    }
  });

  renderTabs();

  const newTabEls = tabsContainer.querySelectorAll('.tab');

  // Bolt: Batch DOM reads to prevent layout thrashing
  const moves = [];
  newTabEls.forEach(el => {
    const id = el.dataset.tabId;
    const firstTop = firstPositions.get(id);
    if (firstTop !== undefined) {
      const lastTop = el.getBoundingClientRect().top;
      const deltaY = firstTop - lastTop;
      if (Math.abs(deltaY) > 1) {
        moves.push({ el, deltaY });
      }
    }
  });

  // Bolt: Batch DOM writes
  moves.forEach(({ el, deltaY }) => {
    el.style.transition = 'none';
    el.style.transform = `translateY(${deltaY}px)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      });
    });
  });
}

function saveCurrentSessionNow() {
  if (!window.naptureAPI || !window.naptureAPI.saveSession) return;
  clearTimeout(sessionSaveTimeout);

  const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
  const pinnedUrls = new Set(pinnedSites.map(p => (p.url || '').trim().toLowerCase().replace(/\/+$/, '')));

  const bookmarkTabIds = window.getBookmarkTabIds ? new Set(window.getBookmarkTabIds()) : new Set();
  const bUrls = [];
  if (window.customBookmarks) {
    function collectUrl(list) {
      for (const item of list) {
        if (item.type === 'folder' && item.children) collectUrl(item.children);
        else if (item.type === 'link' && item.url) bUrls.push((item.url || '').trim().toLowerCase().replace(/\/+$/, ''));
      }
    }
    collectUrl(window.customBookmarks);
  }
  const bookmarkUrls = new Set(bUrls);

  // Only save regular non-pinned, non-bookmark tabs with actual urls (strip welcome pages, pinned tabs, and bookmark tabs)
  const validTabs = tabs
    .map(t => {
      const cleanUrl = (t.url || '').trim().toLowerCase().replace(/\/+$/, '');
      const isPinned = pinnedTabIds.has(t.id) || pinnedUrls.has(cleanUrl);
      const isBookmark = bookmarkTabIds.has(t.id) || bookmarkUrls.has(cleanUrl);
      return { ...t, isPinned, isBookmark };
    })
    .filter(t => !isWelcomeUrl(t.url) && !t.isPinned && !t.isBookmark);

  window.naptureAPI.saveSession(validTabs);
}

function scheduleSessionSave() {
  if (!window.naptureAPI || !window.naptureAPI.saveSession) return;
  clearTimeout(sessionSaveTimeout);
  sessionSaveTimeout = setTimeout(saveCurrentSessionNow, 400);
}

window.addEventListener('beforeunload', () => {
  saveCurrentSessionNow();
});

window.addEventListener('pagehide', () => {
  saveCurrentSessionNow();
});

// Quick Menu & Main Panel Handlers
const quickMenuBtn = document.getElementById('quick-menu-btn');
const quickMenuPanel = document.getElementById('quick-menu-panel');
const quickMenuCloseBtn = document.getElementById('quick-menu-close-btn');
const quickMenuSettings = document.getElementById('quick-menu-settings');
const quickMenuAbout = document.getElementById('quick-menu-about');

if (quickMenuBtn && quickMenuPanel) {
  quickMenuBtn.addEventListener('click', (e) => {
    if (isToolbarCustomizing) return;
    e.stopPropagation();
    const willOpen = quickMenuPanel.classList.contains('hidden') || quickMenuPanel.classList.contains('closing');
    closeAllPopups(quickMenuPanel);
    if (willOpen) {
      showPanel(quickMenuPanel);
    } else {
      hidePanel(quickMenuPanel);
    }
  });

  if (quickMenuSettings) {
    quickMenuSettings.addEventListener('click', () => {
      closeAllPopups();
      openInternalPage('napture://settings/', 'Settings');
    });
  }

  if (quickMenuAbout) {
    quickMenuAbout.addEventListener('click', () => {
      closeAllPopups();
      openInternalPage('napture://about/', 'About Napture');
    });
  }

  document.addEventListener('click', (e) => {
    const isInside = e.composedPath
      ? e.composedPath().some(el => el === quickMenuPanel || el === quickMenuBtn)
      : (quickMenuPanel.contains(e.target) || quickMenuBtn.contains(e.target));
    if (!isInside) {
      hidePanel(quickMenuPanel);
    }
  });
}

function endDrag() {
  draggedTab = null;
  draggedPinnedSite = null;
  draggedTopBarIdx = null;
  draggedPaletteItem = null;
  activeDragState = { tab: null, pinned: null, targetInfo: null };
  dragCounter = 0;
  tabsDragCounter = 0;

  document.body.classList.remove('dragging-tab');
  document.body.classList.remove('dragging-pinned-site');
  document.body.classList.remove('dragging-bookmark');

  if (shortcutsGrid) shortcutsGrid.classList.remove('drag-over');
  if (tabsContainer) tabsContainer.classList.remove('drag-over');
  const bookmarksEl = document.getElementById('bookmarks-container');
  if (bookmarksEl) bookmarksEl.classList.remove('drag-over');

  clearDropIndicators();
  removeDragGhost();
  if (window.naptureAPI && window.naptureAPI.setDraggingState) {
    window.naptureAPI.setDraggingState(false);
  }
}

// Global mouse and drag position trackers to guarantee smooth cursor following & state cleanup
function scheduleDetachCheck(tabData, x, y) {
  if (!tabData) return;
  
  // Instantly hide the tab so it feels like it detached immediately
  const tabEl = document.querySelector(`.tab-container[data-id="${tabData.tabId}"]`) || document.querySelector(`.tab[data-id="${tabData.tabId}"]`);
  if (tabEl) tabEl.style.display = 'none';

  // Immediately clear drag state and indicators from the source window
  endDrag();

  setTimeout(() => {
    // If the tab was adopted by another window, onTabAdoptedByAnotherWindow 
    // will have already removed it from our local tabs array!
    const idx = tabs.findIndex(t => t.id === tabData.tabId);
    if (idx === -1) return; // Tab no longer belongs to us

    window.naptureAPI.detachTab({
      tabId: tabData.tabId,
      url: tabData.url,
      title: tabData.title,
      x, y,
      width: 1200, height: 800
    });

    tabs.splice(idx, 1);
    if (activeTabId === tabData.tabId) {
      if (tabs.length > 0) switchTab(tabs[0].id);
      else activeTabId = null;
    }
    renderTabsAnimated();

    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const regularTabs = tabs.filter(t => !pinnedTabIds.has(t.id));
    if (regularTabs.length === 0) {
      window.naptureAPI.windowClose();
    }
  }, 0); // reduced from 120ms to 0ms for instant execution
}

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (draggedTopBarIdx !== null && e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  updateDragGhostPosition(e);
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (draggedTopBarIdx !== null && !e.target.closest('.header-center')) {
    const removed = activeToolbarLayout[draggedTopBarIdx];
    if (removed && removed.id !== 'address-container') {
      activeToolbarLayout.splice(draggedTopBarIdx, 1);
      draggedTopBarIdx = null;
      saveToolbarState();
      renderToolbarCustomizable();
      if (typeof renderCustomizerWorkspace === 'function') renderCustomizerWorkspace();
    }
  }
  endDrag();
});

document.addEventListener('mousemove', updateDragGhostPosition);
document.addEventListener('dragend', (e) => {
  if (draggedTab && e.dataTransfer && e.dataTransfer.dropEffect === 'none') {
    scheduleDetachCheck(draggedTab, e.screenX, e.screenY);
  }
  endDrag();
});
window.addEventListener('mouseup', () => { endDrag(); });

// ----------------------------------------------------
// Pinned Sites Storage & Rendering (Drag-and-Drop)
// ----------------------------------------------------
window.addEventListener('storage', (e) => {
  if (e.key === 'pinned-sites') {
    loadPinnedSites({ skipLocalStorageWrite: true });
    renderPinnedSites();
    renderTabsAnimated();
  }
});

if (window.naptureAPI && window.naptureAPI.onTabAdoptedByAnotherWindow) {
  window.naptureAPI.onTabAdoptedByAnotherWindow((tabId) => {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx !== -1) {
      tabs.splice(idx, 1);
      if (activeTabId === tabId) {
        if (tabs.length > 0) switchTab(tabs[0].id);
        else activeTabId = null;
      }
      renderTabsAnimated();
    }
    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const regularTabs = tabs.filter(t => !pinnedTabIds.has(t.id));
    if (regularTabs.length === 0) {
      window.naptureAPI.windowClose();
    }
  });
}

if (window.naptureAPI && window.naptureAPI.onAdoptTab) {
  window.naptureAPI.onAdoptTab((data) => {
    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const regularTabs = tabs.filter(t => !pinnedTabIds.has(t.id));
    if (regularTabs.length === 1 && isWelcomeUrl(regularTabs[0].url)) {
      if (window.naptureAPI.closeTab) window.naptureAPI.closeTab(regularTabs[0].id);
      const idx = tabs.findIndex(t => t.id === regularTabs[0].id);
      if (idx !== -1) tabs.splice(idx, 1);
    }
    tabs.push({ id: data.tabId, url: data.url, title: data.title, favicon: null, isLoading: false, themeColor: null });
    renderTabsAnimated();
    switchTab(data.tabId);
  });
}

function loadPinnedSites(options = {}) {
  const saved = localStorage.getItem('pinned-sites');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Deduplicate parsed pinned sites by clean URL
      const uniqueParsed = [];
      const seen = new Set();
      for (const p of parsed) {
        if (!p || !p.url) continue;
        const clean = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
        if (!seen.has(clean)) {
          seen.add(clean);
          uniqueParsed.push(p);
        }
      }

      const oldPinned = [...pinnedSites];
      
      pinnedSites = uniqueParsed.map(newP => {
        const cleanNew = (newP.url || '').trim().toLowerCase().replace(/\/+$/, '');
        const existing = oldPinned.find(oldP => {
          const cleanOld = (oldP.url || '').trim().toLowerCase().replace(/\/+$/, '');
          return cleanOld === cleanNew;
        });
        return { ...newP, tabId: existing ? existing.tabId : null };
      });
      
      oldPinned.forEach(oldP => {
        const cleanOld = (oldP.url || '').trim().toLowerCase().replace(/\/+$/, '');
        const stillExists = pinnedSites.find(p => {
          const cleanNew = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
          return cleanNew === cleanOld;
        });
        
        if (!stillExists && oldP.tabId && activeTabId !== oldP.tabId) {
          const idx = tabs.findIndex(t => t.id === oldP.tabId);
          if (idx !== -1) {
            tabs.splice(idx, 1);
            if (window.naptureAPI && window.naptureAPI.closeTab) {
              window.naptureAPI.closeTab(oldP.tabId);
            }
            renderTabsAnimated();
          }
        }
      });
      // Save deduplicated version back to localStorage without triggering a network sync loop
      if (!options.skipLocalStorageWrite) {
        const toSave = pinnedSites.map(({ title, url, favicon }) => ({ title, url, favicon }));
        const newSavedStr = JSON.stringify(toSave);
        if (newSavedStr !== saved) {
          localStorage.setItem('pinned-sites', newSavedStr);
        }
      }
    } catch (e) {
      console.error('Error loading pinned sites:', e);
    }
  }
}

function savePinnedSites() {
  // Strip in-memory tabIds before persisting — tabIds don't survive restarts
  // Deduplicate before saving
  const unique = [];
  const seen = new Set();
  for (const p of pinnedSites) {
    if (!p || !p.url) continue;
    const clean = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
    if (!seen.has(clean)) {
      seen.add(clean);
      unique.push(p);
    }
  }
  pinnedSites = unique;

  const toSave = pinnedSites.map(({ title, url, favicon }) => ({ title, url, favicon }));
  const newSavedStr = JSON.stringify(toSave);
  if (newSavedStr !== localStorage.getItem('pinned-sites')) {
    localStorage.setItem('pinned-sites', newSavedStr);
  }
  if (window.naptureAPI && window.naptureAPI.syncPinnedTabs) {
    window.naptureAPI.syncPinnedTabs(pinnedSites.map(p => p.tabId).filter(id => id != null));
  }
  if (window.naptureAPI && window.naptureAPI.savePinnedSites) {
    window.naptureAPI.savePinnedSites(toSave);
  }
}

// existingTabId: the id of an already-open tab to adopt as the pinned tab.
// If not provided, a silent background tab is created for this site.
function addPinnedSite(title, url, favicon, existingTabId) {
  if (existingTabId && pinnedSites.some(p => p.tabId === existingTabId)) return;
  const tabId = existingTabId || createTab(url, false);
  pinnedSites.push({ title, url, favicon, tabId });
  savePinnedSites();
  renderPinnedSites();
  renderTabs();
}

function unpinPinnedSite(target) {
  const targetTabId = (typeof target === 'object' && target !== null) ? target.tabId : target;
  const targetUrl = (typeof target === 'object' && target !== null) ? target.url : target;

  pinnedSites = pinnedSites.filter(p => {
    if (targetTabId && p.tabId === targetTabId) return false;
    if (targetUrl && (p.url === targetUrl || p.url.replace(/\/+$/, '') === targetUrl.replace(/\/+$/, ''))) return false;
    return true;
  });

  savePinnedSites();
  renderPinnedSites();
  renderTabs();
}

function removePinnedSite(target, event) {
  if (event) event.stopPropagation();
  unpinPinnedSite(target);
}

function getEmojiOrFallbackForUrl(url, title) {
  return title ? title.charAt(0).toUpperCase() : '';
}

let wasDroppedInPinnedGrid = false;

function renderPinnedSites() {
  const pinnedContainer = document.getElementById('pinned-shortcuts') || document.querySelector('.pinned-shortcuts');
  const isDraggingTab = document.body.classList.contains('dragging-tab');

  if (pinnedContainer) {
    if (pinnedSites.length === 0) {
      pinnedContainer.classList.add('is-empty');
    } else {
      pinnedContainer.classList.remove('is-empty');
    }

    if (isDraggingTab) {
      pinnedContainer.classList.add('is-dragging');
    } else {
      pinnedContainer.classList.remove('is-dragging');
    }
  }

  shortcutsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  pinnedSites.forEach((p, index) => {
    const btn = document.createElement('button');
    btn.className = 'shortcut-btn';
    btn.dataset.index = index;
    // Highlight if this pinned site's tab is currently active
    if (p.tabId && p.tabId === activeTabId) {
      btn.classList.add('active');
    }
    btn.title = p.title;
    btn.draggable = true;

    btn.addEventListener('dragstart', (e) => {
      if (isToolbarCustomizing) {
        e.preventDefault();
        return;
      }
      btn.classList.add('dragging');
      document.body.classList.add('dragging-pinned-site');
      window.naptureAPI.setDraggingState(true);
      if (e.dataTransfer) {
        e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
      }

      const pinnedData = {
        title: p.title,
        url: p.url,
        favicon: p.favicon,
        tabId: p.tabId,
        index: index
      };
      draggedPinnedSite = pinnedData;
      wasDroppedInPinnedGrid = false;
      createDragGhost(pinnedData);
      updateDragGhostPosition(e);

      e.dataTransfer.effectAllowed = 'all';
      e.dataTransfer.setData('text/plain', JSON.stringify(pinnedData));
    });

    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      if (draggedPinnedSite && !wasDroppedInPinnedGrid) {
        const siteToUnpin = draggedPinnedSite;
        endDrag();
        unpinPinnedSite(siteToUnpin);
      } else {
        endDrag();
        renderPinnedSites();
      }
    });

    btn.addEventListener('click', () => {
      if (isToolbarCustomizing) return;
      const tabExists = p.tabId && tabs.some(t => t.id === p.tabId);
      if (!tabExists) {
        p.tabId = createTab(p.url, true);
        savePinnedSites();
        renderPinnedSites();
      } else {
        switchTab(p.tabId);
      }
    });

    btn.addEventListener('auxclick', (e) => {
      if (isToolbarCustomizing) return;
      if (e.button === 1) {
        e.preventDefault();
        if (p.url && typeof createTab === 'function') {
          createTab(p.url, false);
        }
      }
    });

    btn.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });

    const iconSpan = document.createElement('span');
    iconSpan.className = 'shortcut-icon';

    const favUrl = p.favicon || getFaviconForUrl(p.url);
    if (favUrl) {
      const img = document.createElement('img');
      img.src = favUrl;
      img.style.width = '16px';
      img.style.height = '16px';
      img.style.objectFit = 'contain';
      img.onerror = () => {
        iconSpan.textContent = getEmojiOrFallbackForUrl(p.url, p.title);
      };
      iconSpan.appendChild(img);
    } else {
      iconSpan.textContent = getEmojiOrFallbackForUrl(p.url, p.title);
    }

    btn.appendChild(iconSpan);
    fragment.appendChild(btn);
  });
  shortcutsGrid.appendChild(fragment);
}

// Drag-and-Drop event registrations for Pinned Area & Sidebar Top
const pinnedContainer = document.getElementById('pinned-shortcuts') || document.querySelector('.pinned-shortcuts');
const shortcutsGridEl = document.getElementById('shortcuts-grid');
const sidebarTopEl = document.querySelector('.sidebar-top');

function handlePinnedDrop(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  let currentTab = draggedTab || (activeDragState && activeDragState.tab);
  let currentPinned = draggedPinnedSite || (activeDragState && activeDragState.pinned);

  if (!currentTab && !currentPinned && e && e.dataTransfer) {
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tabId && parsed.url) currentTab = parsed;
        else if (parsed.index !== undefined) currentPinned = parsed;
      }
    } catch (err) {}
  }

  if (currentPinned) {
    wasDroppedInPinnedGrid = true;
    const targetBtn = e.target ? e.target.closest('.shortcut-btn') : null;
    if (targetBtn && targetBtn.dataset.index !== undefined) {
      const toIndex = parseInt(targetBtn.dataset.index, 10);
      const fromIndex = currentPinned.index;
      if (fromIndex !== undefined && fromIndex !== toIndex && toIndex >= 0 && toIndex < pinnedSites.length) {
        const [moved] = pinnedSites.splice(fromIndex, 1);
        pinnedSites.splice(toIndex, 0, moved);
        savePinnedSites();
      }
    }
    renderPinnedSites();
    endDrag();
    return;
  }

  if (currentTab && currentTab.url) {
    addPinnedSite(currentTab.title, currentTab.url, currentTab.favicon, currentTab.tabId);
  }

  renderPinnedSites();
  renderTabsAnimated();
  endDrag();
}

[pinnedContainer, shortcutsGridEl].forEach(el => {
  if (!el) return;
  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (shortcutsGrid) shortcutsGrid.classList.add('drag-over');
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (shortcutsGrid) shortcutsGrid.classList.add('drag-over');
    clearDropIndicators();
    updateDragGhostPosition(e);
  });

  el.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (shortcutsGrid) shortcutsGrid.classList.remove('drag-over');
    }
  });

  el.addEventListener('drop', handlePinnedDrop);
});

if (sidebarTopEl) {
  sidebarTopEl.addEventListener('dragover', (e) => {
    if (draggedTab && pinnedContainer) {
      const containerRect = pinnedContainer.getBoundingClientRect();
      if (e.clientY <= containerRect.bottom + 6) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (shortcutsGrid) shortcutsGrid.classList.add('drag-over');
        clearDropIndicators();
        updateDragGhostPosition(e);
      } else {
        if (shortcutsGrid) shortcutsGrid.classList.remove('drag-over');
      }
    }
  });

  sidebarTopEl.addEventListener('drop', (e) => {
    if (draggedTab && pinnedContainer) {
      const containerRect = pinnedContainer.getBoundingClientRect();
      if (e.clientY <= containerRect.bottom + 6) {
        handlePinnedDrop(e);
      }
    }
  });
}

if (tabsContainer) {
  tabsContainer.addEventListener('dragenter', (e) => {
    e.preventDefault();
    tabsDragCounter++;
    tabsContainer.classList.add('drag-over');
  });

  tabsContainer.addEventListener('dragover', (e) => {
  e.preventDefault();

  const pinnedRect = pinnedContainer ? pinnedContainer.getBoundingClientRect() : null;
  if (pinnedRect && e.clientY <= pinnedRect.bottom) {
    if (draggedTab) {
      e.dataTransfer.dropEffect = 'move';
      if (shortcutsGrid) shortcutsGrid.classList.add('drag-over');
      clearDropIndicators();
      updateDragGhostPosition(e);
      return;
    }
  }

  if (shortcutsGrid) shortcutsGrid.classList.remove('drag-over');

  e.dataTransfer.dropEffect = 'move';
  tabsContainer.classList.add('drag-over');
  updateDragGhostPosition(e);

  const sidebarEl = tabsContainer.closest('.sidebar-top') || document.querySelector('.sidebar-top');
  if (sidebarEl) {
    const sRect = sidebarEl.getBoundingClientRect();
    if (e.clientY < sRect.top + 36) {
      sidebarEl.scrollTop -= 10;
    } else if (e.clientY > sRect.bottom - 36) {
      sidebarEl.scrollTop += 10;
    }
  }

  const targetTab = e.target.closest('.tab');
  if (!targetTab) {
    const allTabs = Array.from(tabsContainer.querySelectorAll('.tab:not(.dragging)'));
    allTabs.forEach(t => t.classList.remove('drop-target-top', 'drop-target-bottom', 'shift-down', 'shift-up'));

    if (allTabs.length > 0) {
      const firstTab = allTabs[0];
      const firstTabRect = firstTab.getBoundingClientRect();

      if (e.clientY <= firstTabRect.top + 12) {
        // Target TOP slot of vertical tab list
        firstTab.classList.add('drop-target-top');
        allTabs.forEach(t => t.classList.add('shift-down'));
        activeDragState.targetInfo = { targetTabId: firstTab.dataset.tabId, position: 'before' };
        dropTargetInfo = activeDragState.targetInfo;
      } else {
        // Target END slot of vertical tab list
        const lastTab = allTabs[allTabs.length - 1];
        lastTab.classList.add('drop-target-bottom');
        activeDragState.targetInfo = { targetTabId: lastTab.dataset.tabId, position: 'after' };
        dropTargetInfo = activeDragState.targetInfo;
      }
    } else {
      activeDragState.targetInfo = { targetTabId: null, position: 'end' };
      dropTargetInfo = activeDragState.targetInfo;
    }
  }
});

  tabsContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    tabsDragCounter--;
    if (tabsDragCounter <= 0) {
      tabsDragCounter = 0;
      tabsContainer.classList.remove('drag-over');
      clearDropIndicators();
    }
  });
}

function executeTabReorder(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  let currentPinned = draggedPinnedSite || (activeDragState && activeDragState.pinned);
  let currentTab = draggedTab || (activeDragState && activeDragState.tab);
  const targetInfo = dropTargetInfo || (activeDragState && activeDragState.targetInfo);

  if (!currentTab && !currentPinned && e && e.dataTransfer) {
    try {
      const raw = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.source === 'bookmark') {
          currentTab = parsed;
        } else if (parsed.tabId) currentTab = parsed;
        else if (parsed.index !== undefined) currentPinned = parsed;
      }
    } catch (err) {}
  }

  if (currentTab && (currentTab.tabId || currentTab.url || currentTab.source === 'bookmark')) {
    const isBookmark = currentTab.source === 'bookmark';
    let tabIdToUse = currentTab.tabId;
    let shouldCreateTab = false;

    if (isBookmark) {
      if (currentTab.id && typeof window.removeBookmarkById === 'function') {
        window.removeBookmarkById(currentTab.id, false);
      }
      if (!tabIdToUse) {
        tabIdToUse = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        shouldCreateTab = true;
      }
    }

    const fromIndex = tabIdToUse ? tabs.findIndex(t => t.id === tabIdToUse) : -1;
    if (fromIndex !== -1) {
      const [movedTab] = tabs.splice(fromIndex, 1);

      let toIndex = -1;
      if (targetInfo && targetInfo.targetTabId) {
        toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
        if (toIndex !== -1 && targetInfo.position === 'after') {
          toIndex += 1;
        }
      }

      if (toIndex !== -1) {
        tabs.splice(toIndex, 0, movedTab);
      } else {
        tabs.push(movedTab);
      }

      renderTabsAnimated();
      if (isBookmark) {
        switchTab(tabIdToUse);
      }
    } else {
      // Adopt tab from another window or create new tab
      if (!shouldCreateTab && tabIdToUse) {
        if (window.naptureAPI && window.naptureAPI.adoptTabToWindow) {
          window.naptureAPI.adoptTabToWindow({ tabId: tabIdToUse });
        }
      }

      let toIndex = -1;
      if (targetInfo && targetInfo.targetTabId) {
        toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
        if (toIndex !== -1 && targetInfo.position === 'after') {
          toIndex += 1;
        }
      }

      const movedTab = {
        id: tabIdToUse,
        url: currentTab.url || 'napture://welcome',
        title: currentTab.title || 'New Tab',
        favicon: currentTab.favicon || null,
        isLoading: false,
        themeColor: null
      };

      if (toIndex !== -1) {
        tabs.splice(toIndex, 0, movedTab);
      } else {
        tabs.push(movedTab);
      }

      if (shouldCreateTab && window.naptureAPI && window.naptureAPI.createTab) {
        window.naptureAPI.createTab(tabIdToUse, movedTab.url);
      }

      renderTabsAnimated();
      switchTab(tabIdToUse);
    }
  } else if (currentPinned) {
    const pinnedTabId = currentPinned.tabId;
    
    // Determine if we need to adopt from another window FIRST before unpinning
    // to prevent the old window from closing it in response to the storage event
    let isAdopting = false;
    if (pinnedTabId) {
      const fromIndex = tabs.findIndex(t => t.id === pinnedTabId);
      if (fromIndex === -1) {
        isAdopting = true;
        if (window.naptureAPI && window.naptureAPI.adoptTabToWindow) {
          window.naptureAPI.adoptTabToWindow({ tabId: pinnedTabId });
        }
      }
    }

    unpinPinnedSite(currentPinned);

    if (pinnedTabId) {
      const fromIndex = tabs.findIndex(t => t.id === pinnedTabId);
      if (!isAdopting && fromIndex !== -1) {
        const [movedTab] = tabs.splice(fromIndex, 1);
        let toIndex = -1;
        if (targetInfo && targetInfo.targetTabId) {
          toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
          if (toIndex !== -1 && targetInfo.position === 'after') {
            toIndex += 1;
          }
        }
        if (toIndex !== -1) {
          tabs.splice(toIndex, 0, movedTab);
        } else {
          tabs.push(movedTab);
        }
        renderTabsAnimated();
      } else if (isAdopting) {
        let toIndex = -1;
        if (targetInfo && targetInfo.targetTabId) {
          toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
          if (toIndex !== -1 && targetInfo.position === 'after') {
            toIndex += 1;
          }
        }

        const movedTab = {
          id: pinnedTabId,
          url: currentPinned.url,
          title: currentPinned.title,
          favicon: currentPinned.favicon,
          isLoading: false,
          themeColor: null
        };

        if (toIndex !== -1) {
          tabs.splice(toIndex, 0, movedTab);
        } else {
          tabs.push(movedTab);
        }

        renderTabsAnimated();
        switchTab(movedTab.id);
      }
    }
  }

  clearDropIndicators();
  endDrag();
  renderPinnedSites();
}

if (tabsContainer) tabsContainer.addEventListener('drop', executeTabReorder);

const tabsSectionEl = document.querySelector('.tabs-section');
if (tabsSectionEl && tabsSectionEl !== tabsContainer) {
  tabsSectionEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tabsContainer) tabsContainer.classList.add('drag-over');
    updateDragGhostPosition(e);
  });
  tabsSectionEl.addEventListener('dragleave', (e) => {
    if (!tabsSectionEl.contains(e.relatedTarget)) {
      if (tabsContainer) tabsContainer.classList.remove('drag-over');
    }
  });
  tabsSectionEl.addEventListener('drop', executeTabReorder);
}

// ----------------------------------------------------
// Dynamic Color Themes (Adaptive Framing)
// ----------------------------------------------------
function parseToRGB(colorStr) {
  if (!colorStr) return null;
  const container = document.documentElement || document.body;
  if (!container) return null;
  const temp = document.createElement('div');
  temp.style.color = colorStr;
  container.appendChild(temp);
  const style = window.getComputedStyle(temp).color;
  container.removeChild(temp);

  const match = style.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
  }
  return null;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function applyThemeColor(colorStr) {
  const root = document.documentElement;

  // Temporarily disable transition during switch for instant background matching
  document.body.classList.add('switching-tabs');
  clearTimeout(window._themeTransitionTimeout);
  window._themeTransitionTimeout = setTimeout(() => {
    document.body.classList.remove('switching-tabs');
  }, 50);

  if (!colorStr || !currentSettings.dynamicBackground) {
    document.body.classList.remove('has-custom-theme');
    document.body.classList.remove('has-light-theme');
    document.body.classList.add('has-floating-gradient');
    // Reset to beautiful default transparent/Mica/Acrylic blur theme
    root.style.setProperty('--bg-darkest', 'rgba(18, 19, 26, 0.7)');
    root.style.setProperty('--sidebar-panel-bg', 'rgba(23, 23, 32, 0.75)');
    root.style.setProperty('--bg-dark', 'rgba(18, 19, 26, 0.65)');
    root.style.setProperty('--bg-active', 'rgba(32, 33, 42, 0.65)');
    root.style.setProperty('--bg-hover', 'rgba(42, 43, 54, 0.65)');
    root.style.setProperty('--accent', '#7f8cff');
    root.style.setProperty('--text-primary', '#ffffff');
    root.style.setProperty('--text-secondary', '#a9b1d6');
    root.style.setProperty('--text-muted', '#565f89');
    root.style.setProperty('--border-overlay', 'rgba(255, 255, 255, 0.08)');
    return;
  }

  const rgb = parseToRGB(colorStr);
  if (!rgb) return;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const h = hsl.h;
  const s = hsl.s;
  const l = hsl.l;

  // Calculate perceived luminance (0 to 255) for accurate high contrast dynamic popup colors
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
  const isLight = l >= 55 || luminance > 140;

  document.body.classList.add('has-custom-theme');
  document.body.classList.remove('has-floating-gradient');

  if (isLight) {
    // Light Theme adaptation
    document.body.classList.add('has-light-theme');
    root.style.setProperty('--bg-darkest', colorStr);
    root.style.setProperty('--sidebar-panel-bg', colorStr);
    root.style.setProperty('--bg-dark', `hsl(${h}, ${Math.max(0, s - 8)}%, ${Math.max(0, l - 5)}%)`);
    root.style.setProperty('--bg-active', `hsl(${h}, ${Math.max(0, s - 4)}%, ${Math.max(0, l - 12)}%)`);
    root.style.setProperty('--bg-hover', `hsl(${h}, ${Math.max(0, s - 6)}%, ${Math.max(0, l - 8)}%)`);
    root.style.setProperty('--accent', `hsl(${h}, ${Math.max(60, s)}%, 35%)`);
    root.style.setProperty('--text-primary', `hsl(${h}, ${Math.min(30, s)}%, 12%)`);
    root.style.setProperty('--text-secondary', `hsl(${h}, ${Math.min(25, s)}%, 32%)`);
    root.style.setProperty('--text-muted', `hsl(${h}, ${Math.min(20, s)}%, 52%)`);
    root.style.setProperty('--border-overlay', `rgba(0, 0, 0, 0.08)`);
  } else {
    // Dark Theme adaptation
    document.body.classList.remove('has-light-theme');
    root.style.setProperty('--bg-darkest', colorStr);
    root.style.setProperty('--sidebar-panel-bg', colorStr);
    root.style.setProperty('--bg-dark', `hsl(${h}, ${Math.max(0, s - 5)}%, ${Math.max(0, l - 4)}%)`);
    root.style.setProperty('--bg-active', `hsl(${h}, ${s}%, ${Math.min(100, l + 8)}%)`);
    root.style.setProperty('--bg-hover', `hsl(${h}, ${s}%, ${Math.min(100, l + 12)}%)`);
    root.style.setProperty('--accent', `hsl(${h}, ${Math.max(60, s)}%, 75%)`);
    root.style.setProperty('--text-primary', `#ffffff`);
    root.style.setProperty('--text-secondary', `hsl(${h}, ${Math.min(20, s)}%, 75%)`);
    root.style.setProperty('--text-muted', `hsl(${h}, ${Math.min(15, s)}%, 48%)`);
    root.style.setProperty('--border-overlay', `rgba(255, 255, 255, 0.08)`);
  }
}

function getInitialTabTitle(url) {
  if (!url || isWelcomeUrl(url)) return 'New Tab';
  try {
    if (url.startsWith('napture://') || url.startsWith('ne://')) {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      if (host === 'settings') return 'Settings';
      if (host === 'about') return 'About Napture';
      if (host === 'history') return 'History';
      if (host === 'keyboard' || host === 'shortcuts') return 'Shortcuts';
      if (host === 'error') return 'Problem Loading Page';
      return host || 'Napture';
    }
    const full = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') ? url : `https://${url}`;
    const parsed = new URL(full);
    return parsed.hostname || 'Loading...';
  } catch (e) {
    return 'Loading...';
  }
}

// ----------------------------------------------------
// Tab & Window Navigation Operations
// ----------------------------------------------------
// switchTo: if false, the tab is created in the background without switching focus.
// Returns the new tabId.
function createTab(url = 'napture://welcome', switchTo = true, customTabId = null) {
  // If switch to existing tab/bookmark is enabled, check if the non-welcome URL is already open or bookmarked
  if (!customTabId && url && !isWelcomeUrl(url) && (!currentSettings || currentSettings.switchToExistingTab !== false)) {
    const cleanTarget = String(url).trim().toLowerCase().replace(/\/+$/, '');
    if (cleanTarget) {
      // 1. Check open tabs
      const existingTab = tabs.find(t => t && t.url && !isWelcomeUrl(t.url) && String(t.url).trim().toLowerCase().replace(/\/+$/, '') === cleanTarget);
      if (existingTab) {
        switchTab(existingTab.id);
        if (typeof window.updateActiveBookmark === 'function') {
          window.updateActiveBookmark();
        }
        return existingTab.id;
      }

      // 2. Check bookmarks
      const bList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : (typeof customBookmarks !== 'undefined' && Array.isArray(customBookmarks) ? customBookmarks : []);
      const lookupBm = typeof findBookmarkByUrl === 'function' ? findBookmarkByUrl : (typeof window !== 'undefined' && window.findBookmarkByUrl ? window.findBookmarkByUrl : null);
      const foundBm = lookupBm ? lookupBm(bList, url) : null;
      if (foundBm && foundBm.item) {
        const bm = foundBm.item;
        if (bm.tabId && tabs.some(t => t.id === bm.tabId)) {
          switchTab(bm.tabId);
          if (typeof window.updateActiveBookmark === 'function') {
            window.updateActiveBookmark();
          }
          return bm.tabId;
        } else {
          // Open bookmark with its pre-assigned tab ID
          const newId = bm.tabId || ('tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
          bm.tabId = newId;
          const saveBm = typeof saveBookmarks === 'function' ? saveBookmarks : (typeof window !== 'undefined' && window.saveBookmarks ? window.saveBookmarks : null);
          if (saveBm) saveBm();
          const createdTabId = createTab(bm.url || url, true, newId);
          if (typeof window.updateActiveBookmark === 'function') {
            window.updateActiveBookmark();
          }
          return createdTabId;
        }
      }
    }
  }

  const tabId = customTabId || generateId();
  const isWelcome = isWelcomeUrl(url);
  const newTab = {
    id: tabId,
    title: getInitialTabTitle(url),
    url: url,
    isLoading: !isWelcome,
    favicon: null,
    canGoBack: false,
    canGoForward: false,
    themeColor: null,
    openerTabId: activeTabId || null
  };

  tabs.push(newTab);
  window.naptureAPI.createTab(tabId, url);

  if (switchTo) {
    switchTab(tabId);
  } else {
    renderTabs();
    if (typeof window.updateActiveBookmark === 'function') {
      window.updateActiveBookmark();
    }
  }

  return tabId;
}

function openInternalPage(url, title) {
  if (!url) return;

  const getNormalizedUrl = (u) => {
    if (!u) return '';
    let norm = u.trim().toLowerCase();
    if (!norm.endsWith('/')) norm += '/';
    return norm;
  };

  const targetNorm = getNormalizedUrl(url);

  // Check if a tab with this internal page is already open
  const existingTab = tabs.find(t => t.url && getNormalizedUrl(t.url) === targetNorm);

  if (existingTab) {
    switchTab(existingTab.id);
    return;
  }

  let pageTitle = title;
  if (!pageTitle) {
    if (url.includes('settings')) pageTitle = 'Settings';
    else if (url.includes('about')) pageTitle = 'About Napture';
    else if (url.includes('keyboard') || url.includes('shortcuts')) pageTitle = 'Keyboard Shortcuts';
    else if (url.includes('history')) pageTitle = 'History';
    else if (url.includes('downloads')) pageTitle = 'Downloads';
    else pageTitle = 'Napture Page';
  }

  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab && isWelcomeUrl(activeTab.url)) {
    activeTab.url = url;
    activeTab.title = pageTitle;
    window.naptureAPI.navigate(url);
    updateHeaderVisibility(url);
    updateSecurityIcon(url);
    renderTabs();
  } else {
    createTab(url, true);
  }
}

function isExplicitWelcomeUrl(url) {
  if (!url) return false;
  const clean = url.trim().toLowerCase().replace(/\/+$/, '');
  return (
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

function isWelcomeUrl(url) {
  if (!url) return true;
  const clean = url.trim().toLowerCase().replace(/\/+$/, '');
  return (
    clean === '' ||
    clean === 'about:blank' ||
    isExplicitWelcomeUrl(url)
  );
}

function updateHeaderVisibility(url) {
  const headerBar = document.getElementById('header-bar');
  const isWelcome = isWelcomeUrl(url);
  if (headerBar) {
    if (isWelcome) {
      headerBar.classList.add('is-welcome-tab');
    } else {
      headerBar.classList.remove('is-welcome-tab');
    }
  }
  if (isWelcome) {
    document.body.classList.add('is-welcome-tab');
  } else {
    document.body.classList.remove('is-welcome-tab');
  }
}

function switchTab(tabId) {
  if (isToolbarCustomizing) return;
  activeTabId = tabId;
  _lastSentBounds = null;
  renderTabs();
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    updateAddressBarDisplay(activeTab.url, activeTab.title);
    if (document.activeElement !== addressInput) {
      hideAddressInput();
    }
    updateSecurityIcon(activeTab.url);
    updateNavButtons(activeTab.canGoBack, activeTab.canGoForward);
    updateHeaderVisibility(activeTab.url);
    if (isWelcomeUrl(activeTab.url)) {
      activeTab.themeColor = null;
      applyThemeColor(null);
    } else {
      applyThemeColor(activeTab.themeColor);
    }
    
    updatePageLoadingState(Boolean(activeTab.isLoading));
  } else {
    updateHeaderVisibility('');
  }

  window.naptureAPI.switchTab({ tabId, url: activeTab ? activeTab.url : '' });
  // Guarantee resizing on tab switch by forcing sending fresh bounds
  _lastSentBounds = null;
  sendViewResize();
  setTimeout(sendViewResize, 20);
  if (tabId === lastMediaSourceTabId || activeVideoStreamTabId) {
    if (typeof stopVideoStream === 'function') stopVideoStream();
    const mCard = document.getElementById('media-card');
    const mVid = document.getElementById('media-video-container');
    const mExp = document.getElementById('media-expand-video-btn');
    if (mCard) mCard.classList.remove('has-video');
    if (mVid) mVid.classList.add('hidden');
    if (mExp) mExp.classList.add('hidden');
  }

  refreshMediaInfo();
  setTimeout(refreshMediaInfo, 100);
  setTimeout(refreshMediaInfo, 250);
  // Update pinned icon highlight to reflect the new active tab
  renderPinnedSites();
  if (typeof window.updateActiveBookmark === 'function') {
    window.updateActiveBookmark();
  }
}

let closedTabsHistory = [];

function closeTab(tabId, event) {
  if (isToolbarCustomizing) return;
  if (event) event.stopPropagation();

  const targetTab = tabs.find(t => t.id === tabId);
  if (targetTab && !isWelcomeUrl(targetTab.url)) {
    closedTabsHistory.push({ url: targetTab.url, title: targetTab.title });
    if (closedTabsHistory.length > 20) closedTabsHistory.shift();
  }

  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;

  if (lastMediaSourceTabId === tabId) {
    lastMediaSourceTabId = null;
    isMediaActive = false;
    if (typeof stopVideoStream === 'function') stopVideoStream();
    const mCard = document.getElementById('media-card');
    const mVid = document.getElementById('media-video-container');
    const mExp = document.getElementById('media-expand-video-btn');
    if (mCard) {
      mCard.classList.add('hidden');
      mCard.classList.remove('has-video');
    }
    if (mVid) mVid.classList.add('hidden');
    if (mExp) mExp.classList.add('hidden');
    if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
  }

  window.naptureAPI.closeTab(tabId);
  tabs = tabs.filter(t => t.id !== tabId);

  let pinnedChanged = false;
  pinnedSites.forEach(p => {
    if (p.tabId === tabId) {
      p.tabId = null;
      pinnedChanged = true;
    }
  });
  if (pinnedChanged) {
    savePinnedSites();
    renderPinnedSites();
  }

  if (activeTabId === tabId) {
    if (tabs.length > 0) {
      if (targetTab && targetTab.openerTabId && tabs.some(t => t.id === targetTab.openerTabId)) {
        switchTab(targetTab.openerTabId);
      } else {
        const nextActiveIndex = Math.min(index, tabs.length - 1);
        switchTab(tabs[nextActiveIndex].id);
      }
    } else {
      createTab('napture://welcome');
    }
  } else {
    renderTabs();
  }
  if (typeof window.updateActiveBookmark === 'function') {
    window.updateActiveBookmark();
  }
}

function renderTabs() {
  tabsContainer.innerHTML = '';

  // Pinned tabs live in the pinned area only — never show them in the tabs list
  const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
  const bookmarkTabIds = window.getBookmarkTabIds ? new Set(window.getBookmarkTabIds()) : new Set();

  const regularTabs = tabs.filter(tab => !pinnedTabIds.has(tab.id) && !bookmarkTabIds.has(tab.id) && !isWelcomeUrl(tab.url));
  const fragment = document.createDocumentFragment();

  if (regularTabs.length === 0) {
    // Show a friendly empty-state where a tab would be
    const emptyEl = document.createElement('div');
    emptyEl.className = 'tabs-empty';
    emptyEl.title = 'Double click here to open a new tab';
    emptyEl.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7; flex-shrink: 0;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Double click to open tab</span>`;
    emptyEl.addEventListener('dblclick', () => {
      if (isToolbarCustomizing) return;
      createTab('napture://welcome', true);
    });
    fragment.appendChild(emptyEl);
  } else {
    regularTabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
      tabEl.dataset.tabId = tab.id;
      tabEl.draggable = true;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-label', tab.title || 'Tab');

      // Draggable event listeners
      tabEl.addEventListener('dragstart', (e) => {
        if (isToolbarCustomizing) {
          e.preventDefault();
          return;
        }
        window.naptureAPI.setDraggingState(true);
        if (e.dataTransfer) {
          e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
        }
        const tabData = {
          tabId: tab.id,
          title: tab.title,
          url: tab.url,
          favicon: tab.favicon
        };
        draggedTab = tabData;
        activeDragState.tab = tabData;
        activeDragState.pinned = null;
        activeDragState.targetInfo = null;

        createDragGhost(tabData);
        updateDragGhostPosition(e);

        e.dataTransfer.effectAllowed = 'all';
        e.dataTransfer.setData('text/plain', JSON.stringify(tabData));

        setTimeout(() => {
          tabEl.classList.add('dragging');
          document.body.classList.add('dragging-tab');
          renderPinnedSites();
        }, 0);
      });

      tabEl.addEventListener('dragend', (e) => {
        tabEl.classList.remove('dragging');
        document.body.classList.remove('dragging-tab');

        const isOutOfBounds = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
        const isDropNone = e.dataTransfer && e.dataTransfer.dropEffect === 'none';

        if (draggedTab && (isDropNone || isOutOfBounds)) {
          scheduleDetachCheck(draggedTab, e.screenX, e.screenY);
        }

        draggedTab = null;
        dragCounter = 0;
        clearDropIndicators();
        removeDragGhost();
        window.naptureAPI.setDraggingState(false);
        renderPinnedSites();
      });

      tabEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();

        e.dataTransfer.dropEffect = 'move';

        updateDragGhostPosition(e);

        const rect = tabEl.getBoundingClientRect();
        const midY = rect.top + (rect.height / 2);
        const isAbove = e.clientY < midY;

        const allTabs = Array.from(tabsContainer.querySelectorAll('.tab:not(.dragging)'));
        const hoverIndex = allTabs.indexOf(tabEl);

        allTabs.forEach((t, idx) => {
          t.classList.remove('drop-target-top', 'drop-target-bottom', 'shift-down', 'shift-up');
          if (isAbove) {
            if (idx >= hoverIndex) t.classList.add('shift-down');
            else t.classList.add('shift-up');
          } else {
            if (idx > hoverIndex) t.classList.add('shift-down');
            else t.classList.add('shift-up');
          }
        });

        const pos = isAbove ? 'before' : 'after';
        if (isAbove) {
          tabEl.classList.add('drop-target-top');
        } else {
          tabEl.classList.add('drop-target-bottom');
        }

        dropTargetInfo = { targetTabId: tab.id, position: pos };
        activeDragState.targetInfo = { targetTabId: tab.id, position: pos };
      });

      tabEl.addEventListener('drop', executeTabReorder);
      tabEl.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        switchTab(tab.id);
      });
      tabEl.addEventListener('auxclick', (e) => {
        if (isToolbarCustomizing) return;
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.id, e);
        }
      });
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      });
      tabEl.addEventListener('mouseenter', () => {
        if (document.body.classList.contains('dragging-tab') ||
            document.body.classList.contains('dragging-bookmark') ||
            document.body.classList.contains('dragging-pinned-site') ||
            draggedTab || draggedPinnedSite) {
          return;
        }
        if (window.naptureAPI && window.naptureAPI.warmupTab) {
          // Debounce warmup: wait 300ms before firing to avoid process-spam on rapid hover
          tabEl._warmupTimer = setTimeout(() => {
            if (document.body.classList.contains('dragging-tab') ||
                document.body.classList.contains('dragging-bookmark') ||
                document.body.classList.contains('dragging-pinned-site') ||
                draggedTab || draggedPinnedSite) {
              return;
            }
            window.naptureAPI.warmupTab({ tabId: tab.id, url: tab.url });
          }, 300);
        }
      });
      tabEl.addEventListener('mouseleave', () => {
        if (tabEl._warmupTimer) {
          clearTimeout(tabEl._warmupTimer);
          tabEl._warmupTimer = null;
        }
      });

      // Favicon or Spinner
      const iconEl = document.createElement('div');
      iconEl.className = 'tab-favicon';
      
      if (tab.isLoading) {
        iconEl.innerHTML = '<div class="loading-spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></div>';
      } else if (tab.favicon) {
        const img = document.createElement('img');
        img.src = tab.favicon;
        img.onerror = () => {
          iconEl.innerHTML = getDefaultFaviconIcon(tab.url);
        };
        iconEl.appendChild(img);
      } else {
        iconEl.innerHTML = getDefaultFaviconIcon(tab.url);
      }

      const titleEl = document.createElement('div');
      titleEl.className = 'tab-title';
      titleEl.textContent = tab.title;

      const closeEl = document.createElement('div');
      closeEl.className = 'tab-close';
      closeEl.innerHTML = '&times;';
      closeEl.setAttribute('role', 'button');
      closeEl.setAttribute('aria-label', 'Close tab');
      closeEl.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        closeTab(tab.id, e);
      });

      tabEl.appendChild(iconEl);
      tabEl.appendChild(titleEl);
      tabEl.appendChild(closeEl);
      
      fragment.appendChild(tabEl);
    });
  }

  tabsContainer.appendChild(fragment);

  scheduleSessionSave();
}

function getDefaultFaviconIcon(url) {
  if (!url || url.startsWith('napture://') || url.startsWith('ne://') || isWelcomeUrl(url)) {
    return `<img src="logo.png" style="width: 14px; height: 14px; object-fit: contain; flex-shrink: 0;" alt="Napture Logo">`;
  }
  return `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>`;
}

function isInternalUrl(url) {
  if (!url) return false;
  if (url.startsWith('napture://')) return true;
  if (url.startsWith('ne://')) {
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      return !host || ['welcome', 'start', 'newtab', 'settings', 'about', 'history', 'keyboard', 'shortcuts', 'logo', 'error'].includes(host);
    } catch (e) {
      return false;
    }
  }
  return false;
}

function updateSecurityIcon(url) {
  if (url.startsWith('https://')) {
    securityBadge.style.color = '#10b981';
    securityBadge.title = 'Connection is secure (HTTPS)';
  } else if (url.startsWith('napture://')) {
    securityBadge.style.color = '#7f8cff';
    securityBadge.title = 'Napture System Page';
  } else if (url.startsWith('ne://')) {
    securityBadge.style.color = '#73daca';
    securityBadge.title = 'Authoritative Neweb Protocol (ne://)';
  } else if (url.startsWith('file://')) {
    securityBadge.style.color = '#3b82f6';
    securityBadge.title = 'Local System File';
  } else {
    securityBadge.style.color = '#f59e0b';
    securityBadge.title = 'Connection is not secure (HTTP)';
  }
}

function updateNavButtons(canGoBack, canGoForward) {
  backBtn.disabled = !canGoBack;
  forwardBtn.disabled = !canGoForward;
}

function handleAddressSubmit() {
  let url = addressInput.value.trim();
  if (!url) return;

  // Check for Quick Site Snippets
  let snippetsList = [];
  if (currentSettings && currentSettings.snippets) {
    try {
      snippetsList = typeof currentSettings.snippets === 'string' ? JSON.parse(currentSettings.snippets) : currentSettings.snippets;
    } catch (e) {}
  }

  if (Array.isArray(snippetsList) && snippetsList.length > 0) {
    const cleanInput = url.split(' - ')[0].trim().toLowerCase();
    const matched = snippetsList.find(s => {
      if (!s || !s.snippet) return false;
      const key = '.' + String(s.snippet).trim().replace(/^\./, '').toLowerCase();
      return key === cleanInput;
    });

    if (matched && matched.url) {
      let targetUrl = String(matched.url).trim();
      if (targetUrl) {
        if (!targetUrl.includes('://')) {
          targetUrl = 'https://' + targetUrl;
        }
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
          activeTab.url = targetUrl;
          if (window.naptureAPI && window.naptureAPI.navigate) {
            window.naptureAPI.navigate(targetUrl);
          }
          hideAddressInput();
          return;
        }
      }
    }
  }

  const protocolPattern = /^[a-zA-Z0-9+-.]+:\/\//;
  const naptureShortPattern = /^(about|settings|keyboard|shortcuts|welcome|start|newtab|history)$/i;
  const nePattern = /^([a-zA-Z0-9-]+\.)+ne(\/.*)?$/i;
  const domainPattern = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/i;
  const localhostPattern = /^localhost(:\d+)?(\/.*)?$/i;
  const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/;

  if (protocolPattern.test(url)) {
    // Valid standard protocol
  } else if (naptureShortPattern.test(url)) {
    url = 'napture://' + url;
  } else if (nePattern.test(url) && (!currentSettings || currentSettings.neProtocolEnabled !== false)) {
    url = 'ne://' + url;
  } else if (domainPattern.test(url) || localhostPattern.test(url) || ipPattern.test(url)) {
    url = 'https://' + url;
  } else {
    const engineUrls = {
      napture: 'https://search.nebuff.xyz/search?q=',
      google: 'https://google.com/search?q=',
      duckduckgo: 'https://duckduckgo.com/?q=',
      bing: 'https://www.bing.com/search?q=',
      brave: 'https://search.brave.com/search?q=',
      ecosia: 'https://www.ecosia.org/search?q='
    };
    const searchBase = engineUrls[currentSettings.searchEngine] || engineUrls.napture;
    url = `${searchBase}${encodeURIComponent(url)}`;
  }

  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    if (url === 'napture://settings' || url === 'napture://settings/') {
      openInternalPage('napture://settings/', 'Settings');
      hideAddressInput();
      return;
    }
    if (url === 'napture://keyboard' || url === 'napture://keyboard/' || url === 'napture://shortcuts' || url === 'napture://shortcuts/') {
      openInternalPage('napture://keyboard/', 'Keyboard Shortcuts');
      hideAddressInput();
      return;
    }
    if (url === 'napture://about' || url === 'napture://about/') {
      openInternalPage('napture://about/', 'About Napture');
      hideAddressInput();
      return;
    }
    if (url === 'napture://history' || url === 'napture://history/') {
      openInternalPage('napture://history', 'History');
      hideAddressInput();
      return;
    }
    if (isInternalUrl(url) && !isWelcomeUrl(url) && !isWelcomeUrl(activeTab.url)) {
      openInternalPage(url);
      hideAddressInput();
      return;
    }

    if (isWelcomeUrl(activeTab.url) && !isWelcomeUrl(url) && (!currentSettings || currentSettings.switchToExistingTab !== false)) {
      const cleanTarget = String(url).trim().toLowerCase().replace(/\/+$/, '');
      if (cleanTarget) {
        // 1. Check open tabs
        const existingTab = tabs.find(t => t.id !== activeTab.id && t.url && !isWelcomeUrl(t.url) && String(t.url).trim().toLowerCase().replace(/\/+$/, '') === cleanTarget);
        if (existingTab) {
          switchTab(existingTab.id);
          closeTab(activeTab.id);
          hideAddressInput();
          return;
        }

        // 2. Check bookmarks
        const bList = (typeof window !== 'undefined' && Array.isArray(window.customBookmarks)) ? window.customBookmarks : (typeof customBookmarks !== 'undefined' && Array.isArray(customBookmarks) ? customBookmarks : []);
        const lookupBm = typeof findBookmarkByUrl === 'function' ? findBookmarkByUrl : (typeof window !== 'undefined' && window.findBookmarkByUrl ? window.findBookmarkByUrl : null);
        const foundBm = lookupBm ? lookupBm(bList, url) : null;
        if (foundBm && foundBm.item) {
          const bm = foundBm.item;
          if (bm.tabId && tabs.some(t => t.id === bm.tabId && t.id !== activeTab.id)) {
            switchTab(bm.tabId);
            closeTab(activeTab.id);
            hideAddressInput();
            return;
          } else {
            bm.tabId = activeTab.id;
            const saveBm = typeof saveBookmarks === 'function' ? saveBookmarks : (typeof window !== 'undefined' && window.saveBookmarks ? window.saveBookmarks : null);
            if (saveBm) saveBm();
            if (typeof window.updateActiveBookmark === 'function') {
              window.updateActiveBookmark();
            }
          }
        }
      }
    }

    activeTab.url = url;
    activeTab.isLoading = !isWelcomeUrl(url);
    updatePageLoadingState(activeTab.isLoading);
    if (!isWelcomeUrl(url)) {
      activeTab.title = getInitialTabTitle(url);
    }
    renderTabs();
    window.naptureAPI.navigate(url);
    updateHeaderVisibility(url);
    updateSecurityIcon(url);
    updateAddressBarDisplay(url, activeTab.title);
  }
  hideAddressInput();
}

function formatUrlDisplay(url, title) {
  if (!url || isExplicitWelcomeUrl(url)) {
    return {
      domain: 'napture://',
      name: 'welcome'
    };
  }
  if (url === 'about:blank') {
    return { domain: '', name: 'about:blank' };
  }
  if (currentSettings && currentSettings.showFullUrl) {
    return { domain: url, name: '' };
  }

  try {
    if (url.startsWith('napture://')) {
      const page = url.replace('napture://', '');
      return { domain: 'napture://', name: page || 'welcome' };
    }
    if (url.startsWith('ne://')) {
      try {
        const u = new URL(url);
        const host = (u.hostname || '').toLowerCase();
        if (!host || ['welcome', 'start', 'newtab', 'settings', 'about', 'history', 'keyboard', 'shortcuts', 'error'].includes(host)) {
          return { domain: 'ne://', name: host || 'welcome' };
        }
        const pageName = u.pathname === '/' || !u.pathname ? host : (u.pathname.split('/').filter(Boolean).pop() || host);
        return { domain: `${host}/`, name: pageName };
      } catch (e) {
        return { domain: 'ne://', name: url.replace('ne://', '') };
      }
    }
    if (url.startsWith('file://')) {
      const parts = url.split('/');
      const filename = parts.pop() || 'file';
      return { domain: 'file://', name: decodeURIComponent(filename) };
    }

    const urlObj = new URL(url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`);
    const domain = `${urlObj.hostname}/`;

    let pageName = '';
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);

    if (pathSegments.length > 0) {
      pageName = decodeURIComponent(pathSegments[pathSegments.length - 1]);
    } else if (urlObj.searchParams.get('q')) {
      pageName = urlObj.searchParams.get('q');
    } else if (title && title !== 'New Tab' && title !== urlObj.hostname && title !== 'napture://welcome' && title !== 'ne://welcome') {
      pageName = title;
    } else {
      pageName = urlObj.hostname;
    }

    return { domain, name: pageName };
  } catch (e) {
    return { domain: '', name: url };
  }
}

function updateAddressBarDisplay(url, title) {
  const fullUrl = isExplicitWelcomeUrl(url) ? 'napture://welcome' : (url || '');
  if (addressInput && document.activeElement !== addressInput) {
    addressInput.value = fullUrl;
  }

  if (addressDisplay) {
    const formatted = formatUrlDisplay(fullUrl, title);
    const domainEscaped = escapeHtml(formatted.domain);
    const nameEscaped = escapeHtml(formatted.name);
    addressDisplay.innerHTML = `<span class="url-domain">${domainEscaped}</span><span class="url-name">${nameEscaped}</span>`;
  }
}

let isSelectingAddress = false;

function showAddressInput() {
  if (isToolbarCustomizing) return;
  if (!addressInput || !addressDisplay) return;
  addressDisplay.classList.add('hidden');
  addressInput.classList.remove('hidden');
  isSelectingAddress = true;
  addressInput.focus();
  addressInput.select();
}

function hideAddressInput(force = false) {
  if (!addressInput || !addressDisplay) return;
  if (!force && isAddressSuggestionsActive && document.activeElement === addressInput) return;
  if (addressInput.setSelectionRange) {
    try { addressInput.setSelectionRange(0, 0); } catch (e) {}
  }
  if (window.getSelection) {
    try { window.getSelection().removeAllRanges(); } catch (e) {}
  }
  addressInput.classList.add('hidden');
  addressDisplay.classList.remove('hidden');
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) {
    updateAddressBarDisplay(activeTab.url, activeTab.title);
  }
}

// ----------------------------------------------------
// UI Events & Subscriptions Setup
// ----------------------------------------------------
if (newTabBtn) {
  newTabBtn.addEventListener('click', () => {
    if (isToolbarCustomizing) return;
    createTab('napture://welcome');
  });
}

// Address Bar Suggestions Controller
const addressSuggestions = document.getElementById('address-suggestions');
const addressContainer = document.getElementById('address-container');
let addressSugIndex = -1;
let currentAddressSuggestions = [];
let addressDebounce = null;
let isAddressSuggestionsActive = false;

function hideAddressSuggestions() {
  isAddressSuggestionsActive = false;
  if (addressSuggestions) {
    addressSuggestions.innerHTML = '';
    addressSuggestions.classList.add('hidden');
  }
  addressSugIndex = -1;
  currentAddressSuggestions = [];
  if (window.naptureAPI && window.naptureAPI.updateSuggestionsOverlay) {
    window.naptureAPI.updateSuggestionsOverlay({ suggestions: [], bounds: { x: 0, y: 0, width: 0 } });
  }
}

function renderAddressSuggestions() {
  if (!addressSuggestions) return;
  if (currentAddressSuggestions.length === 0) {
    hideAddressSuggestions();
    return;
  }
  isAddressSuggestionsActive = true;
  if (window.naptureAPI && window.naptureAPI.updateSuggestionsOverlay && addressContainer) {
    const rect = addressContainer.getBoundingClientRect();
    const isLight = document.body.classList.contains('has-light-theme');
    window.naptureAPI.updateSuggestionsOverlay({
      suggestions: currentAddressSuggestions,
      bounds: { x: rect.left, y: rect.bottom, width: rect.width },
      isLight: isLight
    });
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const welcomeSearch = document.getElementById('welcome-search');
if (welcomeSearch) {
  welcomeSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = welcomeSearch.value.trim();
      if (q) {
        navigateToQuery(q);
        welcomeSearch.value = '';
      }
    }
  });
}

if (addressDisplay) {
  addressDisplay.addEventListener('click', (e) => {
    if (isToolbarCustomizing) return;
    e.stopPropagation();
    showAddressInput();
  });
}

if (addressInput && addressSuggestions) {
  addressInput.addEventListener('input', () => {
    clearTimeout(addressDebounce);
    const val = addressInput.value.trim();
    if (!val || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('napture://') || val.startsWith('ne://') || val.includes('://') || /^(about|settings|keyboard|shortcuts|welcome|start|newtab)$/i.test(val)) {
      hideAddressSuggestions();
      return;
    }
    closeAllPopups('address-suggestions');

    // Check for matching Quick Site Snippets
    if (val.startsWith('.')) {
      let snippetsList = [];
      if (currentSettings && currentSettings.snippets) {
        try {
          snippetsList = typeof currentSettings.snippets === 'string' ? JSON.parse(currentSettings.snippets) : currentSettings.snippets;
        } catch (e) {}
      }

      if (Array.isArray(snippetsList) && snippetsList.length > 0) {
        const valLower = val.toLowerCase();
        const snippetMatches = [];
        snippetsList.forEach(s => {
          if (!s || !s.snippet) return;
          const key = '.' + String(s.snippet).trim().replace(/^\./, '');
          if (key.toLowerCase().startsWith(valLower)) {
            const desc = s.description && String(s.description).trim() ? ' - ' + String(s.description).trim() : '';
            snippetMatches.push(`${key}${desc}`);
          }
        });

        if (snippetMatches.length > 0) {
          currentAddressSuggestions = snippetMatches;
          renderAddressSuggestions();
          return;
        }
      }
    }

    addressDebounce = setTimeout(() => {
      if (window.naptureAPI && window.naptureAPI.getSuggestions) {
        window.naptureAPI.getSuggestions(val)
          .then(data => {
            currentAddressSuggestions = (data && data[1]) ? data[1].slice(0, 6) : [];
            renderAddressSuggestions();
          })
          .catch(() => hideAddressSuggestions());
      } else {
        hideAddressSuggestions();
      }
    }, 120);
  });

  addressInput.addEventListener('keydown', (e) => {
    if (isAddressSuggestionsActive) {
      if (e.key === 'ArrowDown') {
        if (currentAddressSuggestions.length > 0) {
          e.preventDefault();
          addressSugIndex = (addressSugIndex + 1) % currentAddressSuggestions.length;
          addressInput.value = currentAddressSuggestions[addressSugIndex];
          renderAddressSuggestions();
          return;
        }
      } else if (e.key === 'ArrowUp') {
        if (currentAddressSuggestions.length > 0) {
          e.preventDefault();
          addressSugIndex = (addressSugIndex - 1 + currentAddressSuggestions.length) % currentAddressSuggestions.length;
          addressInput.value = currentAddressSuggestions[addressSugIndex];
          renderAddressSuggestions();
          return;
        }
      } else if (e.key === 'Escape') {
        hideAddressSuggestions();
        return;
      }
    }

  });

  let savedSelStart = 0;
  let savedSelEnd = 0;

  function saveInputSelection() {
    if (addressInput && document.activeElement === addressInput) {
      try {
        savedSelStart = addressInput.selectionStart;
        savedSelEnd = addressInput.selectionEnd;
      } catch (e) {}
    }
  }

  addressInput.addEventListener('keydown', saveInputSelection);
  addressInput.addEventListener('keyup', saveInputSelection);
  addressInput.addEventListener('input', saveInputSelection);
  addressInput.addEventListener('click', saveInputSelection);

  addressInput.addEventListener('focus', () => {
    isSelectingAddress = true;
    requestAnimationFrame(() => {
      addressInput.select();
      saveInputSelection();
    });
  });

  addressInput.addEventListener('mouseup', (e) => {
    if (isSelectingAddress) {
      e.preventDefault();
      isSelectingAddress = false;
    }
    saveInputSelection();
  });

  addressInput.addEventListener('blur', () => {
    if (isAddressSuggestionsActive) {
      requestAnimationFrame(() => {
        if (addressInput && isAddressSuggestionsActive) {
          addressInput.focus();
          try {
            if (savedSelStart !== null && savedSelEnd !== null) {
              addressInput.setSelectionRange(savedSelStart, savedSelEnd);
            }
          } catch (e) {}
        }
      });
      return;
    }
    isSelectingAddress = false;
    setTimeout(() => {
      if (document.activeElement === addressInput) return;
      if (isAddressSuggestionsActive) return;
      hideAddressInput();
    }, 100);
  });

  window.addEventListener('blur', () => {
    isSelectingAddress = false;
    if (!isAddressSuggestionsActive) {
      hideAddressInput();
    }
  });

  document.addEventListener('click', (e) => {
    if (addressContainer && !addressContainer.contains(e.target)) {
      hideAddressSuggestions();
      hideAddressInput(true);
    }
  });
}

if (addressInput) {
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      hideAddressSuggestions();
      handleAddressSubmit();
      addressInput.blur();
    }
  });
}

if (backBtn) backBtn.addEventListener('click', () => {
  if (isToolbarCustomizing) return;
  window.naptureAPI && window.naptureAPI.goBack && window.naptureAPI.goBack();
});
if (forwardBtn) forwardBtn.addEventListener('click', () => {
  if (isToolbarCustomizing) return;
  window.naptureAPI && window.naptureAPI.goForward && window.naptureAPI.goForward();
});
if (reloadBtn) reloadBtn.addEventListener('click', () => {
  if (isToolbarCustomizing) return;
  window.naptureAPI && window.naptureAPI.reload && window.naptureAPI.reload();
});
if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    if (isToolbarCustomizing) return;
    const targetUrl = (currentSettings && currentSettings.homeUrl) || 'napture://welcome';
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
      activeTab.url = targetUrl;
      if (isWelcomeUrl(targetUrl)) {
        activeTab.favicon = null;
        activeTab.title = 'New Tab';
      }
      if (window.naptureAPI && window.naptureAPI.navigate) window.naptureAPI.navigate(targetUrl);
      updateHeaderVisibility(targetUrl);
      updateSecurityIcon(targetUrl);
      updateAddressBarDisplay(targetUrl, activeTab.title);
      renderTabs();
    }
  });
}

// Custom Frameless Window control click listeners
if (winMinimize) {
  winMinimize.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.windowMinimize) window.naptureAPI.windowMinimize();
  });
}

if (winMaximize) {
  winMaximize.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.windowMaximize) window.naptureAPI.windowMaximize();
  });
}

if (winClose) {
  winClose.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.windowClose) window.naptureAPI.windowClose();
  });
}

// Subscribe to Main Process IPC updates

const tabLoadingWatchdogs = new Map();

window.naptureAPI.onTabLoadingState(({ tabId, isLoading }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.isLoading = isLoading;

    if (tabLoadingWatchdogs.has(tabId)) {
      clearTimeout(tabLoadingWatchdogs.get(tabId));
      tabLoadingWatchdogs.delete(tabId);
    }

    if (isLoading) {
      // Safety watchdog: auto-clear loading state after 10s if backend is delayed
      tabLoadingWatchdogs.set(tabId, setTimeout(() => {
        tab.isLoading = false;
        tabLoadingWatchdogs.delete(tabId);
        const tabEl = tabsContainer ? tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`) : null;
        if (tabEl) {
          const iconEl = tabEl.querySelector('.tab-favicon');
          if (iconEl) {
            if (tab.favicon) {
              const img = document.createElement('img');
              img.src = tab.favicon;
              img.onerror = () => { iconEl.innerHTML = getDefaultFaviconIcon(tab.url); };
              iconEl.innerHTML = '';
              iconEl.appendChild(img);
            } else {
              iconEl.innerHTML = getDefaultFaviconIcon(tab.url);
            }
          }
        }
        if (tabId === activeTabId) {
          updatePageLoadingState(false);
        }
      }, 10000));
    }

    // Bolt: Surgical DOM update to avoid full re-render
    const tabEl = tabsContainer ? tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`) : null;
    if (tabEl) {
      const iconEl = tabEl.querySelector('.tab-favicon');
      if (iconEl) {
        if (isLoading) {
          iconEl.innerHTML = '<div class="loading-spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></div>';
        } else if (tab.favicon) {
          const img = document.createElement('img');
          img.src = tab.favicon;
          img.onerror = () => { iconEl.innerHTML = getDefaultFaviconIcon(tab.url); };
          iconEl.innerHTML = '';
          iconEl.appendChild(img);
        } else {
          iconEl.innerHTML = getDefaultFaviconIcon(tab.url);
        }
      }
    } else {
      renderTabs();
    }

    if (tabId === activeTabId) {
      updatePageLoadingState(isLoading);
      if (isLoading && !isWelcomeUrl(tab.url)) {
        updateHeaderVisibility(tab.url);
      }
    }
  }
});

window.naptureAPI.onTabNavigated(({ tabId, url, title, canGoBack, canGoForward }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    if (url && url !== 'about:blank' && !isExplicitWelcomeUrl(url)) {
      tab.url = url;
    } else if (url && isExplicitWelcomeUrl(url)) {
      tab.url = url;
    } else if (!tab.url) {
      tab.url = 'napture://welcome';
    }

    if (isWelcomeUrl(tab.url)) {
      tab.favicon = null;
      tab.themeColor = null;
    }
    // Only update title if provided and not reverting to 'New Tab' when we already have a real title
    if (title && (title !== 'New Tab' || !tab.title || tab.title === 'New Tab')) {
      tab.title = title;
    }
    if (canGoBack !== undefined) tab.canGoBack = canGoBack;
    if (canGoForward !== undefined) tab.canGoForward = canGoForward;

    // Bolt: Surgical DOM update to avoid full re-render
    const tabEl = tabsContainer ? tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`) : null;
    if (tabEl && !isWelcomeUrl(tab.url)) {
      const titleEl = tabEl.querySelector('.tab-title');
      if (titleEl && tab.title) titleEl.textContent = tab.title;
      tabEl.setAttribute('aria-label', tab.title || 'Tab');
    } else {
      renderTabs();
    }

    if (tabId === activeTabId) {
      if (document.activeElement !== addressInput) {
        updateAddressBarDisplay(tab.url, tab.title);
      }
      updateSecurityIcon(tab.url);
      updateNavButtons(tab.canGoBack, tab.canGoForward);
      updateHeaderVisibility(tab.url);
      if (isWelcomeUrl(tab.url)) {
        applyThemeColor(null);
      }
    }

    scheduleSessionSave();
  }
});

window.naptureAPI.onTabTitleUpdated(({ tabId, title }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    if (title && (title !== 'New Tab' || !tab.title || tab.title === 'New Tab')) {
      tab.title = title;
    }

    // Bolt: Surgical DOM update to avoid full re-render
    const tabEl = tabsContainer ? tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`) : null;
    if (tabEl) {
      const titleEl = tabEl.querySelector('.tab-title');
      if (titleEl && tab.title) titleEl.textContent = tab.title;
      tabEl.setAttribute('aria-label', tab.title || 'Tab');
    } else {
      renderTabs();
    }

    if (tabId === activeTabId && document.activeElement !== addressInput) {
      updateAddressBarDisplay(tab.url, tab.title);
    }

    scheduleSessionSave();
  }
});

window.naptureAPI.onTabFaviconUpdated(({ tabId, favicon }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.favicon = favicon;

    // Bolt: Surgical DOM update to avoid full re-render
    const tabEl = tabsContainer ? tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`) : null;
    if (tabEl) {
      const iconEl = tabEl.querySelector('.tab-favicon');
      if (iconEl && !tab.isLoading) {
        if (favicon) {
          const img = document.createElement('img');
          img.src = favicon;
          img.onerror = () => { iconEl.innerHTML = getDefaultFaviconIcon(tab.url); };
          iconEl.innerHTML = '';
          iconEl.appendChild(img);
        } else {
          iconEl.innerHTML = getDefaultFaviconIcon(tab.url);
        }
      }
    } else {
      renderTabs();
    }
  }
  
  let pinnedChanged = false;
  pinnedSites.forEach(p => {
    if (p.tabId === tabId) {
      p.favicon = favicon;
      pinnedChanged = true;
    }
  });
  if (pinnedChanged) {
    savePinnedSites();
    renderPinnedSites();
  }
  
  if (window.customBookmarks && typeof window.updateBookmarkFavicon === 'function') {
    window.updateBookmarkFavicon(tabId, favicon);
  }
});

window.naptureAPI.onOpenUrlInNewTab(({ url }) => {
  createTab(url);
});

window.naptureAPI.onTriggerResize(() => {
  sendViewResize();
  if (typeof ensureToolbarVisibility === 'function') ensureToolbarVisibility();
});

window.addEventListener('resize', () => {
  if (typeof ensureToolbarVisibility === 'function') ensureToolbarVisibility();
});

window.naptureAPI.onWindowMaximizeState((isMaximized) => {
  if (isMaximized) {
    maximizeIcon.classList.add('hidden');
    restoreIcon.classList.remove('hidden');
  } else {
    maximizeIcon.classList.remove('hidden');
    restoreIcon.classList.add('hidden');
  }
});

window.naptureAPI.onThemeColorUpdated(({ tabId, color }) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.themeColor = color;
    if (tabId === activeTabId) {
      applyThemeColor(color);
    }
  }
});

if (window.naptureAPI && window.naptureAPI.onSuggestionSelected) {
  window.naptureAPI.onSuggestionSelected((sug) => {
    if (addressInput) {
      addressInput.value = sug;
      hideAddressSuggestions();
      handleAddressSubmit();
    }
  });
}

function handleShortcutAction(action, data) {
  if (isToolbarCustomizing) {
    const blockedActions = [
      'new-tab', 'open-history', 'close-tab', 'reopen-tab',
      'focus-location', 'reload', 'force-reload', 'next-tab',
      'prev-tab', 'switch-tab-index', 'go-back', 'go-forward'
    ];
    if (blockedActions.includes(action)) return;
  }
  switch (action) {
    case 'new-tab':
      createTab('napture://welcome');
      break;
    case 'open-history':
      openInternalPage('napture://history', 'History');
      break;
    case 'close-tab':
      if (activeTabId) closeTab(activeTabId);
      break;
    case 'reopen-tab':
      if (closedTabsHistory.length > 0) {
        const last = closedTabsHistory.pop();
        createTab(last.url);
      }
      break;
    case 'focus-location':
      if (addressInput) {
        addressInput.focus();
        addressInput.select();
      }
      break;
    case 'reload':
      if (activeTabId && window.naptureAPI && window.naptureAPI.reload) window.naptureAPI.reload();
      break;
    case 'force-reload':
      if (activeTabId && window.naptureAPI && window.naptureAPI.reload) window.naptureAPI.reload();
      break;
    case 'next-tab': {
      if (tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        switchTab(tabs[nextIndex].id);
      }
      break;
    }
    case 'prev-tab': {
      if (tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        switchTab(tabs[prevIndex].id);
      }
      break;
    }
    case 'switch-tab-index': {
      if (tabs.length === 0) break;
      if (data === -1) {
        switchTab(tabs[tabs.length - 1].id);
      } else if (data >= 0 && data < tabs.length) {
        switchTab(tabs[data].id);
      }
      break;
    }
    case 'go-back':
      if (window.naptureAPI && window.naptureAPI.goBack) window.naptureAPI.goBack();
      break;
    case 'go-forward':
      if (window.naptureAPI && window.naptureAPI.goForward) window.naptureAPI.goForward();
      break;
    case 'zoom-in':
      if (window.naptureAPI && window.naptureAPI.zoomIn) window.naptureAPI.zoomIn();
      break;
    case 'zoom-out':
      if (window.naptureAPI && window.naptureAPI.zoomOut) window.naptureAPI.zoomOut();
      break;
    case 'zoom-reset':
      if (window.naptureAPI && window.naptureAPI.zoomReset) window.naptureAPI.zoomReset();
      break;
  }
}

if (window.naptureAPI && window.naptureAPI.onShortcutAction) {
  window.naptureAPI.onShortcutAction((action, data) => {
    handleShortcutAction(action, data);
  });
}

// Main Napture Dropdown Menu Handlers
const brandMenuBtn = document.getElementById('brand-menu-btn');
const naptureMainMenu = document.getElementById('napture-main-menu');
const menuItemNewTab = document.getElementById('menu-item-new-tab');
const menuItemHistory = document.getElementById('menu-item-history');
const menuItemDownloads = document.getElementById('menu-item-downloads');
const menuItemAbout = document.getElementById('menu-item-about');
const menuItemSettings = document.getElementById('menu-item-settings');
const menuItemShortcuts = document.getElementById('menu-item-shortcuts');

function executeMenuAction(actionName) {
  if (naptureMainMenu) {
    hidePanel(naptureMainMenu);
  }
  switch (actionName) {
    case 'new-tab':
      createTab('napture://welcome');
      break;
    case 'history':
      openInternalPage('napture://history', 'History');
      break;
    case 'downloads':
      openInternalPage('napture://downloads', 'Downloads');
      break;
    case 'about':
      openInternalPage('napture://about/', 'About Napture');
      break;
    case 'settings':
      openInternalPage('napture://settings/', 'Settings');
      break;
    case 'shortcuts':
      openInternalPage('napture://keyboard/', 'Keyboard Shortcuts');
      break;
  }
}

if (brandMenuBtn && naptureMainMenu) {
  brandMenuBtn.addEventListener('click', (e) => {
    if (isToolbarCustomizing) return;
    e.preventDefault();
    e.stopPropagation();
    const willOpen = naptureMainMenu.classList.contains('hidden') || naptureMainMenu.classList.contains('closing');
    closeAllPopups(naptureMainMenu);
    if (willOpen) {
      showPanel(naptureMainMenu);
    } else {
      hidePanel(naptureMainMenu);
    }
  });

  naptureMainMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest ? e.target.closest('.menu-item') : null;
    if (!btn) return;
    e.preventDefault();
    const id = btn.id;
    if (id === 'menu-item-new-tab') executeMenuAction('new-tab');
    else if (id === 'menu-item-history') executeMenuAction('history');
    else if (id === 'menu-item-downloads') executeMenuAction('downloads');
    else if (id === 'menu-item-about') executeMenuAction('about');
    else if (id === 'menu-item-settings') executeMenuAction('settings');
    else if (id === 'menu-item-shortcuts') executeMenuAction('shortcuts');
  });

  document.addEventListener('click', (e) => {
    if (!naptureMainMenu.classList.contains('hidden')) {
      const isInside = e.composedPath
        ? e.composedPath().some(el => el === naptureMainMenu || el === brandMenuBtn)
        : (naptureMainMenu.contains(e.target) || brandMenuBtn.contains(e.target));
      if (!isInside) {
        hidePanel(naptureMainMenu);
      }
    }
  });
}

function bindMenuItem(el, actionName) {
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    executeMenuAction(actionName);
  });
}

bindMenuItem(menuItemNewTab, 'new-tab');
bindMenuItem(menuItemHistory, 'history');
bindMenuItem(menuItemDownloads, 'downloads');
bindMenuItem(menuItemAbout, 'about');
bindMenuItem(menuItemSettings, 'settings');
bindMenuItem(menuItemShortcuts, 'shortcuts');

// Recent Downloads Panel Handlers
function getDownloadIconSvg(type) {
  if (type === 'archive') {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e0af68" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`;
  }
  if (type === 'exe') {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect></svg>`;
  }
  if (type === 'image') {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bb9af7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
  }
  if (type === 'media') {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f7768e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
  }
  if (type === 'code') {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7dcfff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a9b1d6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
}

async function updateDownloadsUI() {
  if (!window.naptureAPI || !window.naptureAPI.getRecentDownloads) return;
  const history = await window.naptureAPI.getRecentDownloads();
  renderDownloadsList(history);
}

document.addEventListener('pointerdown', (e) => {
  window.lastClickX = e.clientX;
  window.lastClickY = e.clientY;
}, true);

function updateDownloadIconState(items) {
  const activeDownloads = (items || []).filter(i => !i.completed && !i.cancelled);
  const targetBtns = [
    document.getElementById('downloads-btn'),
    document.getElementById('toolbar-downloads-btn')
  ].filter(Boolean);

  targetBtns.forEach(btn => {
    if (activeDownloads.length > 0) {
      const activeItem = activeDownloads[0];
      const safeName = escapeHtml(activeItem.name || '');
      let timeDisplay = activeItem.paused ? 'Paused' : (activeItem.timeStr.includes('•') ? activeItem.timeStr.split('•').pop().trim() : activeItem.timeStr);
      if (!timeDisplay || timeDisplay === 'Downloading...') {
        timeDisplay = `${activeItem.progress || 0}%`;
      }
      btn.innerHTML = `
        <div class="download-icon-bar-container" title="Downloading: ${safeName}">
          <div class="download-icon-bar-fill" style="width: ${activeItem.progress || 0}%"></div>
          <span class="download-icon-bar-text">${escapeHtml(timeDisplay)}</span>
        </div>
      `;
    } else {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      `;
    }
  });
}

function renderDownloadsList(items) {
  updateDownloadIconState(items);

  const listEl = document.getElementById('downloads-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || items.length === 0) {
    listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #565f89; font-size: 12px;">No recent downloads</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'download-item';
    if (!item.completed && !item.cancelled) {
      el.classList.add('is-downloading');
    }

    let progressHtml = '';
    if (!item.completed && !item.cancelled && item.progress !== undefined) {
      progressHtml = `
        <div class="download-progress-bar">
          <div class="download-progress-fill" style="width: ${item.progress}%"></div>
        </div>
      `;
    }

    const safeName = escapeHtml(item.name || '');

    let actionsHtml = '';
    if (!item.completed && !item.cancelled) {
      const pauseIcon = item.paused
        ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
        : '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

      actionsHtml = `
        <div class="download-actions">
          <button class="download-btn-action download-btn-pause" title="${item.paused ? 'Resume' : 'Pause'}" aria-label="${item.paused ? 'Resume' : 'Pause'}">
            ${pauseIcon}
          </button>
          <button class="download-btn-action download-btn-cancel" title="Cancel" aria-label="Cancel">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="download-file-icon">
        ${getDownloadIconSvg(item.type)}
      </div>
      <div class="download-file-info">
        <div class="download-file-name" title="${safeName}">${safeName}</div>
        <div class="download-file-meta">${item.sizeStr} • ${item.timeStr}</div>
        ${progressHtml}
      </div>
      ${actionsHtml}
    `;

    if (!item.completed && !item.cancelled) {
      const btnPause = el.querySelector('.download-btn-pause');
      const btnCancel = el.querySelector('.download-btn-cancel');

      if (btnPause) {
        btnPause.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.naptureAPI) {
            if (item.paused && window.naptureAPI.resumeDownload) {
              window.naptureAPI.resumeDownload(item.id);
            } else if (!item.paused && window.naptureAPI.pauseDownload) {
              window.naptureAPI.pauseDownload(item.id);
            }
          }
        });
      }

      if (btnCancel) {
        btnCancel.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.naptureAPI && window.naptureAPI.cancelDownload) {
            window.naptureAPI.cancelDownload(item.id);
          }
        });
      }
    }

    el.addEventListener('click', () => {
      const downloadsPanel = document.getElementById('downloads-panel');
      if (downloadsPanel) hidePanel(downloadsPanel);
      if (window.naptureAPI && window.naptureAPI.openDownloadedFile) {
        window.naptureAPI.openDownloadedFile(item);
      }
    });

    fragment.appendChild(el);
  });
  listEl.appendChild(fragment);
}

const downloadsBtn = document.getElementById('downloads-btn');
const downloadsPanel = document.getElementById('downloads-panel');
const downloadsCloseBtn = document.getElementById('downloads-close-btn');

if (downloadsBtn) {
  downloadsBtn.addEventListener('click', (e) => {
    if (isToolbarCustomizing) return;
    e.stopPropagation();
    toggleOmnibarDownloadsPopup(downloadsBtn);
  });
}

if (window.naptureAPI && window.naptureAPI.onDownloadUpdated) {
  window.naptureAPI.onDownloadUpdated((items) => {
    renderDownloadsList(items);
  });
}

function triggerDownloadFlyAnimation(data) {
  const targetBtn = document.getElementById('downloads-btn') || document.getElementById('toolbar-downloads-btn');
  if (!targetBtn) return;

  const btnRect = targetBtn.getBoundingClientRect();
  const targetX = btnRect.left + (btnRect.width / 2);
  const targetY = btnRect.top + (btnRect.height / 2);

  let startX = (data && data.startX != null && data.startX > 0) ? data.startX : window.lastClickX;
  let startY = (data && data.startY != null && data.startY > 0) ? data.startY : window.lastClickY;

  if (startX == null || startY == null || isNaN(startX) || isNaN(startY)) {
    startX = window.innerWidth / 2;
    startY = window.innerHeight / 2;
  }

  const particle = document.createElement('div');
  particle.className = 'download-fly-badge';
  particle.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8cff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
  `;
  const nameSpan = document.createElement('span');
  nameSpan.textContent = (data && data.name) ? data.name : 'Downloading...';
  particle.appendChild(nameSpan);

  particle.style.left = `${startX}px`;
  particle.style.top = `${startY}px`;
  particle.style.transform = `translate(-50%, -50%) scale(0.3)`;
  particle.style.opacity = '0';

  document.body.appendChild(particle);

  requestAnimationFrame(() => {
    particle.style.opacity = '1';
    particle.style.transform = `translate(-50%, -50%) scale(1.05)`;

    setTimeout(() => {
      particle.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(0.1)`;
      particle.style.opacity = '0.1';

      setTimeout(() => {
        particle.remove();
        targetBtn.classList.remove('pulse-pop');
        void targetBtn.offsetWidth; // Force CSS reflow
        targetBtn.classList.add('pulse-pop');
      }, 550);
    }, 250);
  });
}

if (window.naptureAPI && window.naptureAPI.onDownloadStarted) {
  window.naptureAPI.onDownloadStarted((data) => {
    triggerDownloadFlyAnimation(data);
  });
}

function hidePanel(panel) {
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  panel.classList.remove('closing');
  panel.style.display = '';
  panel.style.opacity = '';
  panel.style.pointerEvents = '';
  panel.style.maxHeight = '';
  if (typeof updateActivityCardsVisibility === 'function') {
    updateActivityCardsVisibility();
  }
}

function showPanel(panel) {
  if (!panel) return;
  panel.classList.remove('closing');
  panel.classList.remove('hidden');
  if (typeof updateActivityCardsVisibility === 'function') {
    updateActivityCardsVisibility();
  }
}

function closeAllPopups(exceptPanel = null) {
  const naptureMainMenu = document.getElementById('napture-main-menu');
  const downloadsPanel = document.getElementById('downloads-panel');
  const quickMenuPanel = document.getElementById('quick-menu-panel');
  const historyPanel = document.getElementById('history-panel');
  const contextMenu = document.getElementById('tab-context-menu');
  const searchDropdown = document.getElementById('search-dropdown');

  if (naptureMainMenu && naptureMainMenu !== exceptPanel) hidePanel(naptureMainMenu);
  if (downloadsPanel && downloadsPanel !== exceptPanel) hidePanel(downloadsPanel);
  if (quickMenuPanel && quickMenuPanel !== exceptPanel) hidePanel(quickMenuPanel);
  if (historyPanel && historyPanel !== exceptPanel) hidePanel(historyPanel);
  if (contextMenu && contextMenu !== exceptPanel) contextMenu.classList.add('hidden');
  if (searchDropdown && searchDropdown !== exceptPanel) searchDropdown.classList.add('hidden');

  const omnibarDownloadsPopup = document.getElementById('omnibar-downloads-popup');
  const omnibarHistoryPopup = document.getElementById('omnibar-history-popup');
  if (omnibarDownloadsPopup && omnibarDownloadsPopup !== exceptPanel) omnibarDownloadsPopup.classList.add('hidden');
  if (omnibarHistoryPopup && omnibarHistoryPopup !== exceptPanel) omnibarHistoryPopup.classList.add('hidden');

  if (window.naptureAPI && window.naptureAPI.hideOmnibarPopup) {
    window.naptureAPI.hideOmnibarPopup();
  }

  if (exceptPanel !== 'address-suggestions' && typeof hideAddressSuggestions === 'function') {
    hideAddressSuggestions();
  }

  if (typeof updateActivityCardsVisibility === 'function') {
    updateActivityCardsVisibility();
  }

  if (!exceptPanel && window.naptureAPI && window.naptureAPI.closeSecondaryWindows) {
    window.naptureAPI.closeSecondaryWindows();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllPopups();
    return;
  }

  const isMac = (navigator.platform || '').toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? e.metaKey : e.ctrlKey;
  const key = (e.key || '').toLowerCase();
  const code = e.code || '';
  const isInputFocused = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

  // Ctrl+T -> New Tab
  if (modifier && !e.shiftKey && !e.altKey && (key === 't' || code === 'KeyT')) {
    e.preventDefault();
    handleShortcutAction('new-tab');
    return;
  }

  // Ctrl+H -> History
  if (modifier && !e.shiftKey && !e.altKey && (key === 'h' || code === 'KeyH')) {
    e.preventDefault();
    handleShortcutAction('open-history');
    return;
  }

  // Ctrl+Shift+T -> Reopen Tab
  if (modifier && e.shiftKey && !e.altKey && (key === 't' || code === 'KeyT')) {
    e.preventDefault();
    handleShortcutAction('reopen-tab');
    return;
  }

  // Ctrl+W -> Close Tab
  if (modifier && !e.shiftKey && !e.altKey && (key === 'w' || code === 'KeyW')) {
    e.preventDefault();
    handleShortcutAction('close-tab');
    return;
  }

  // Ctrl+L / Alt+D -> Focus Address
  if ((modifier && !e.shiftKey && !e.altKey && (key === 'l' || code === 'KeyL')) || (e.altKey && !modifier && !e.shiftKey && (key === 'd' || code === 'KeyD'))) {
    e.preventDefault();
    handleShortcutAction('focus-location');
    return;
  }

  // Ctrl+R / F5 -> Reload
  if ((modifier && !e.shiftKey && !e.altKey && (key === 'r' || code === 'KeyR')) || (!modifier && !e.shiftKey && !e.altKey && (key === 'f5' || code === 'F5'))) {
    e.preventDefault();
    handleShortcutAction('reload');
    return;
  }

  // Ctrl+Shift+R / Ctrl+F5 -> Force Reload
  if ((modifier && e.shiftKey && (key === 'r' || code === 'KeyR')) || (modifier && (key === 'f5' || code === 'F5'))) {
    e.preventDefault();
    handleShortcutAction('force-reload');
    return;
  }

  // Ctrl+Tab / Ctrl+PageDown -> Next Tab
  if ((e.ctrlKey && !e.shiftKey && (key === 'tab' || code === 'Tab')) || (e.ctrlKey && !e.shiftKey && (key === 'pagedown' || code === 'PageDown'))) {
    e.preventDefault();
    handleShortcutAction('next-tab');
    return;
  }

  // Ctrl+Shift+Tab / Ctrl+PageUp -> Prev Tab
  if ((e.ctrlKey && e.shiftKey && (key === 'tab' || code === 'Tab')) || (e.ctrlKey && (key === 'pageup' || code === 'PageUp'))) {
    e.preventDefault();
    handleShortcutAction('prev-tab');
    return;
  }

  // Ctrl+1..8 -> Switch Tab Index
  if (modifier && !e.shiftKey && !e.altKey && ((key >= '1' && key <= '8') || (code.startsWith('Digit') && code.slice(5) >= '1' && code.slice(5) <= '8'))) {
    e.preventDefault();
    const digit = (key >= '1' && key <= '8') ? parseInt(key, 10) : parseInt(code.slice(5), 10);
    handleShortcutAction('switch-tab-index', digit - 1);
    return;
  }

  // Ctrl+9 -> Switch to Last Tab
  if (modifier && !e.shiftKey && !e.altKey && (key === '9' || code === 'Digit9')) {
    e.preventDefault();
    handleShortcutAction('switch-tab-index', -1);
    return;
  }

  // Alt+Left -> Back
  if ((e.altKey && !modifier && (key === 'arrowleft' || code === 'ArrowLeft')) || (isMac && modifier && (key === '[' || code === 'BracketLeft'))) {
    if (!isInputFocused) {
      e.preventDefault();
      handleShortcutAction('go-back');
      return;
    }
  }

  // Alt+Right -> Forward
  if ((e.altKey && !modifier && (key === 'arrowright' || code === 'ArrowRight')) || (isMac && modifier && (key === ']' || code === 'BracketRight'))) {
    if (!isInputFocused) {
      e.preventDefault();
      handleShortcutAction('go-forward');
      return;
    }
  }
});

// Dismiss open popups when clicking anywhere outside of them (capture phase to avoid stopPropagation blockers)
document.addEventListener('mousedown', (e) => {
  const historyPanel = document.getElementById('history-panel');
  const historyBtn = document.getElementById('history-btn');
  const downloadsPanel = document.getElementById('downloads-panel');
  const downloadsBtn = document.getElementById('downloads-btn');
  const quickMenuPanel = document.getElementById('quick-menu-panel');
  const quickMenuBtn = document.getElementById('quick-menu-btn');
  const naptureMainMenu = document.getElementById('napture-main-menu');
  const brandMenuBtn = document.getElementById('brand-menu-btn');
  const contextMenu = document.getElementById('tab-context-menu');

  // If clicking on the trigger buttons themselves, let their click listener handle toggling
  if (historyBtn && (historyBtn === e.target || historyBtn.contains(e.target))) return;
  if (downloadsBtn && (downloadsBtn === e.target || downloadsBtn.contains(e.target))) return;
  if (quickMenuBtn && (quickMenuBtn === e.target || quickMenuBtn.contains(e.target))) return;
  if (brandMenuBtn && (brandMenuBtn === e.target || brandMenuBtn.contains(e.target))) return;

  if (historyPanel && !historyPanel.classList.contains('hidden')) {
    if (!historyPanel.contains(e.target)) hidePanel(historyPanel);
  }

  if (downloadsPanel && !downloadsPanel.classList.contains('hidden')) {
    if (!downloadsPanel.contains(e.target)) hidePanel(downloadsPanel);
  }

  if (quickMenuPanel && !quickMenuPanel.classList.contains('hidden')) {
    if (!quickMenuPanel.contains(e.target)) hidePanel(quickMenuPanel);
  }

  if (naptureMainMenu && !naptureMainMenu.classList.contains('hidden')) {
    if (!naptureMainMenu.contains(e.target)) hidePanel(naptureMainMenu);
  }

  if (e.button === 0 && contextMenu && !contextMenu.classList.contains('hidden')) {
    if (!contextMenu.contains(e.target)) {
      contextMenu.classList.add('hidden');
      if (window.naptureAPI && window.naptureAPI.contextMenuAction) {
        window.naptureAPI.contextMenuAction(-1);
      }
    }
  }
}, { capture: true, passive: true });

if (window.naptureAPI && window.naptureAPI.onCloseAllPopups) {
  window.naptureAPI.onCloseAllPopups(() => {
    closeAllPopups();
  });
}

// HTML Fullscreen: hide browser chrome when a page goes fullscreen (e.g. YouTube video)
if (window.naptureAPI && window.naptureAPI.onHtmlFullscreenState) {
  window.naptureAPI.onHtmlFullscreenState((isFullscreen) => {
    const header = document.getElementById('header-bar');
    const sidebar = document.getElementById('sidebar');
    const app = document.getElementById('app');

    if (isFullscreen) {
      if (header) header.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      if (app) app.classList.add('html-fullscreen');
    } else {
      if (header) header.style.display = '';
      if (sidebar) sidebar.style.display = '';
      if (app) app.classList.remove('html-fullscreen');
      // Recalculate viewport bounds after restoring UI
      setTimeout(sendViewResize, 50);
    }
  });
}

const viewportContainer = document.getElementById('viewport-container');
if (viewportContainer) {
  viewportContainer.addEventListener('click', () => {
    closeAllPopups();
  });
}

const headerBarEl = document.getElementById('header-bar');
if (headerBarEl) {
  headerBarEl.addEventListener('dblclick', (e) => {
    if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, .napture-dropdown-menu, .brand-menu-btn, .nav-btn, .win-btn, #address-container')) {
      return;
    }
    if (window.naptureAPI && window.naptureAPI.windowMaximize) {
      window.naptureAPI.windowMaximize();
    }
  });
}

// App Startup
loadPinnedSites();

(async () => {
  if (window.naptureAPI && window.naptureAPI.getSettings) {
    const s = await window.naptureAPI.getSettings();
    if (s) {
      currentSettings = { ...currentSettings, ...s };
      applySettingsToUI();
      if (typeof loadToolbarState === 'function') loadToolbarState();
      if (typeof renderToolbarCustomizable === 'function') renderToolbarCustomizable();
    }
  }

  // Load bookmarks immediately so window.customBookmarks & window.getBookmarkTabIds are available
  if (typeof loadBookmarks === 'function') {
    loadBookmarks();
  }

  const mode = currentSettings.startupMode || 'restore_all';
  const shouldRestorePinned = (mode === 'restore_all' || mode === 'restore_pinned' || mode === 'restore_pinned_bookmarks');
  const shouldRestoreSession = (mode !== 'restore_none');

  if (shouldRestorePinned) {
  }
  renderPinnedSites();

  let restoredTabs = 0;
  if (window.naptureAPI && window.naptureAPI.loadSession && shouldRestoreSession) {
    const sessionTabs = await window.naptureAPI.loadSession();
    if (sessionTabs && sessionTabs.length > 0) {
      const pinnedUrls = new Set(pinnedSites.map(p => (p.url || '').trim().toLowerCase().replace(/\/+$/, '')));
      
      const bUrls = [];
      if (window.customBookmarks) {
        function collectUrl(list) {
          for (const item of list) {
            if (item.type === 'folder' && item.children) collectUrl(item.children);
            else if (item.type === 'link' && item.url) bUrls.push((item.url || '').trim().toLowerCase().replace(/\/+$/, ''));
          }
        }
        collectUrl(window.customBookmarks);
      }
      const bookmarkUrls = new Set(bUrls);
      const bookmarkTabIds = window.getBookmarkTabIds ? new Set(window.getBookmarkTabIds()) : new Set();

      let firstRestoredTabId = null;
      for (const t of sessionTabs) {
        if (t.isPinned) continue;
        if (t.id && bookmarkTabIds.has(t.id)) continue;
        const cleanUrl = (t.url || '').trim().toLowerCase().replace(/\/+$/, '');
        if (!cleanUrl || isWelcomeUrl(cleanUrl)) continue;
        if (pinnedUrls.has(cleanUrl) || bookmarkUrls.has(cleanUrl)) continue; // Don't restore tabs already present in pinned/bookmarks area

        const createdId = createTab(t.url, false);
        if (!firstRestoredTabId) firstRestoredTabId = createdId;
        restoredTabs++;
      }

      if (firstRestoredTabId) {
        switchTab(firstRestoredTabId);
      }
    }
  }

  const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
  const bookmarkTabIds = window.getBookmarkTabIds ? new Set(window.getBookmarkTabIds()) : new Set();
  const regularTabsCount = tabs.filter(t => !pinnedTabIds.has(t.id) && !bookmarkTabIds.has(t.id)).length;
  if (restoredTabs === 0 && regularTabsCount === 0) {
    createTab('napture://welcome'); // Start on a fresh welcome tab
  }
})();

// Brand intro animation: "Napture | By nebuff" -> morphs into logo.png
setTimeout(() => {
  const brandBadge = document.getElementById('brand-badge');
  if (brandBadge) {
    brandBadge.classList.add('collapsed');
  }
}, 1800);

// Perform initial view size calculation once window is loaded
window.addEventListener('load', () => {
  setTimeout(sendViewResize, 100);
  setTimeout(() => {
    if (typeof ensureToolbarVisibility === 'function') ensureToolbarVisibility();
  }, 120);
});

// History Panel Handlers
async function updateHistoryUI(query = '') {
  if (!window.naptureAPI || !window.naptureAPI.getHistory) return;
  const history = await window.naptureAPI.getHistory(query);
  renderHistoryList(history);
}

function renderHistoryList(items) {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || items.length === 0) {
    listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #565f89; font-size: 12px;">No history entries</div>';
    return;
  }

  const grouped = {
    today: [],
    yesterday: [],
    older: []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  items.forEach(item => {
    if (item.last_visited_timestamp >= todayStart) {
      grouped.today.push(item);
    } else if (item.last_visited_timestamp >= yesterdayStart) {
      grouped.yesterday.push(item);
    } else {
      grouped.older.push(item);
    }
  });

  const fragment = document.createDocumentFragment();

  const appendGroup = (title, groupItems) => {
    if (groupItems.length === 0) return;

    const titleEl = document.createElement('div');
    titleEl.className = 'history-group-title';
    titleEl.textContent = title;
    fragment.appendChild(titleEl);

    groupItems.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';

      const safeTitle = document.createElement('span');
      safeTitle.className = 'history-item-title';
      safeTitle.textContent = item.title || item.url;

      const safeUrl = document.createElement('span');
      safeUrl.className = 'history-item-url';
      safeUrl.textContent = item.url;

      const safeFavicon = item.favicon_url ? escapeHtml(item.favicon_url) : null;

      itemEl.innerHTML = `
        <div class="history-item-favicon">
          ${safeFavicon ? `<img src="${safeFavicon}" alt="icon" onerror="this.style.display='none'">` : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a9b1d6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>`}
        </div>
        <div class="history-item-info">
        </div>
      `;

      itemEl.querySelector('.history-item-info').appendChild(safeTitle);
      itemEl.querySelector('.history-item-info').appendChild(safeUrl);

      itemEl.addEventListener('click', () => {
        if (window.naptureAPI && window.naptureAPI.navigate) {
          const addressInput = document.getElementById('address-input');
          if (addressInput) addressInput.value = item.url;
          window.naptureAPI.navigate(item.url);
          document.getElementById('history-panel').classList.add('hidden');
        }
      });
      fragment.appendChild(itemEl);
    });
  };

  appendGroup('Today', grouped.today);
  appendGroup('Yesterday', grouped.yesterday);
  appendGroup('Older', grouped.older);

  listEl.appendChild(fragment);
}

const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyCloseBtn = document.getElementById('history-close-btn');
const historySearchInput = document.getElementById('history-search-input');

const btnFullHistory = document.getElementById('btn-full-history');
if (btnFullHistory) {
  btnFullHistory.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePanel(historyPanel);
    openInternalPage('napture://history', 'History');
  });
}

if (historyBtn) {
  historyBtn.addEventListener('click', (e) => {
    if (isToolbarCustomizing) return;
    e.stopPropagation();
    if (window.naptureAPI && window.naptureAPI.toggleOmnibarPopup) {
      toggleOmnibarHistoryPopup(historyBtn);
    } else if (historyPanel) {
      const willOpen = historyPanel.classList.contains('hidden') || historyPanel.classList.contains('closing');
      closeAllPopups(historyPanel);
      if (willOpen) {
        showPanel(historyPanel);
        if (historySearchInput) historySearchInput.value = '';
        updateHistoryUI();
        if (historySearchInput) historySearchInput.focus();
      } else {
        hidePanel(historyPanel);
      }
    }
  });

  if (historySearchInput) {
    //  Bolt: Added a 150ms debounce to the history panel search to prevent excessive IPC
    // calls to SQLite on every keystroke. Prevents main thread layout thrashing.
    let historySearchDebounce = null;
    historySearchInput.addEventListener('input', (e) => {
      clearTimeout(historySearchDebounce);
      historySearchDebounce = setTimeout(() => {
        updateHistoryUI(e.target.value);
      }, 150);
    });

    historySearchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    historySearchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (historySearchInput.value) {
          historySearchInput.value = '';
          updateHistoryUI();
        } else {
          hidePanel(historyPanel);
        }
      }
    });
  }
}

// Track active overlay panel height for precise tab truncation
const sidebarEl = document.getElementById('sidebar');
if (sidebarEl) {
  let _panelResizeRaf = null;
  const overlayPanels = [
    document.getElementById('downloads-panel'),
    document.getElementById('history-panel'),
    document.getElementById('quick-menu-panel')
  ].filter(Boolean);

  const panelObserver = new ResizeObserver(() => {
    if (_panelResizeRaf) cancelAnimationFrame(_panelResizeRaf);
    _panelResizeRaf = requestAnimationFrame(() => {
      _panelResizeRaf = null;
      let maxHeight = 0;
      overlayPanels.forEach(panel => {
        if (!panel.classList.contains('hidden')) {
          const height = panel.getBoundingClientRect().height;
          if (height > maxHeight) maxHeight = height;
        }
      });
      sidebarEl.style.setProperty('--overlay-panel-height', maxHeight + 'px');
      if (typeof updateActivityCardsVisibility === 'function') {
        updateActivityCardsVisibility();
      }
    });
  });
  overlayPanels.forEach(p => panelObserver.observe(p));

  // Double click sidebar shortcut
  sidebarEl.addEventListener('dblclick', (e) => {
    // Ignore double clicks that occur on tabs, bookmarks, shortcuts, buttons, inputs, panels, etc.
    if (e.target.closest('.tab, .bookmark-item, .shortcut-btn, button, input, textarea, select, .history-panel, .downloads-panel')) {
      return;
    }

    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const bookmarkTabIds = window.getBookmarkTabIds ? new Set(window.getBookmarkTabIds()) : new Set();
    const isPinnedOrBookmarked = activeTabId && (pinnedTabIds.has(activeTabId) || bookmarkTabIds.has(activeTabId));

    if (e.shiftKey) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && !isPinnedOrBookmarked) {
        activeTab.url = 'napture://welcome';
        activeTab.favicon = null;
        activeTab.title = 'New Tab';
        window.naptureAPI.navigate('napture://welcome');
        updateHeaderVisibility('napture://welcome');
        updateSecurityIcon('napture://welcome');
        updateAddressBarDisplay('napture://welcome', 'New Tab');
        renderTabs();
      } else {
        createTab('napture://welcome', true);
      }
    } else {
      createTab('napture://welcome', true);
    }
  });
}

// Debounce helper using requestAnimationFrame for high performance scroll masking
function debounceScroll(fn) {
  let ticking = false;
  return function(...args) {
    if (!ticking) {
      requestAnimationFrame(() => {
        fn.apply(this, args);
        ticking = false;
      });
      ticking = true;
    }
  };
}

// Dynamic scroll masking for lists
function updateScrollMask(el) {
  if (!el) return;
  const isScrollable = el.scrollHeight > el.clientHeight;
  const isScrolledTop = el.scrollTop > 0;
  const isScrolledBottom = Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight;

  if (isScrollable && isScrolledTop) {
    el.classList.add('can-scroll-up');
  } else {
    el.classList.remove('can-scroll-up');
  }

  if (isScrollable && isScrolledBottom) {
    el.classList.add('can-scroll-down');
  } else {
    el.classList.remove('can-scroll-down');
  }
}
window.updateScrollMask = updateScrollMask;

document.querySelectorAll('.downloads-list, .history-list, .quick-menu-list').forEach(list => {
  const debouncedUpdate = debounceScroll(() => updateScrollMask(list));
  list.addEventListener('scroll', debouncedUpdate, { passive: true });
  // Observe mutations to content to update mask dynamically
  new MutationObserver(debouncedUpdate).observe(list, { childList: true, subtree: true, attributes: true });
  // Initial check
  updateScrollMask(list);
});

// --- Activity Cards Controller ---
const activityCardsContainer = document.getElementById('activity-cards-container');
const defaultBrowserCard = document.getElementById('default-browser-card');
const updateCard = document.getElementById('update-card');
const mediaCard = document.getElementById('media-card');
const updateRestartBtn = document.getElementById('update-restart-btn');
const makeDefaultBtn = document.getElementById('make-default-btn');

// Close buttons
const defaultBrowserCloseBtn = document.getElementById('default-browser-close-btn');
const updateCloseBtn = document.getElementById('update-close-btn');
const mediaCloseBtn = document.getElementById('media-close-btn');
const mediaBtnPrev = document.getElementById('media-btn-prev');
const mediaBtnPlay = document.getElementById('media-btn-play');
const mediaBtnNext = document.getElementById('media-btn-next');
const mediaBtnVolume = document.getElementById('media-btn-volume');
const mediaArtworkImg = document.getElementById('media-artwork-img');
const mediaDefaultIcon = document.getElementById('media-default-icon');
const mediaVideoContainer = document.getElementById('media-video-container');
const mediaVideoPlayer = document.getElementById('media-video-player');
const mediaVideoMinimizeBtn = document.getElementById('media-video-minimize-btn');
const mediaVideoReturnBtn = document.getElementById('media-video-return-btn');
const mediaExpandVideoBtn = document.getElementById('media-expand-video-btn');
const mediaVolumeWrapper = document.getElementById('media-volume-wrapper');
const mediaVolumePopup = document.getElementById('media-volume-popup');
const mediaVolumeTrack = document.getElementById('media-volume-track');
const mediaVolumeFill = document.getElementById('media-volume-fill');
const mediaVolumeThumb = document.getElementById('media-volume-thumb');

let isDefaultBrowserCardActive = false;
let isUpdateAvailable = false;
let isMediaActive = false;
let lastMediaSourceTabId = null;
let currentMediaVolume = 1;
let isMediaMuted = false;
let volumePopupHideTimeout = null;

let isMediaVideoMinimized = false;
let currentMediaHasVideo = false;
let mediaPeerConnection = null;
let activeVideoStreamTabId = null;

function showVolumePopup() {
  if (!mediaVolumePopup) return;
  mediaVolumePopup.classList.add('visible');
  if (volumePopupHideTimeout) {
    clearTimeout(volumePopupHideTimeout);
  }
  volumePopupHideTimeout = setTimeout(() => {
    if (mediaVolumeWrapper && !mediaVolumeWrapper.matches(':hover')) {
      mediaVolumePopup.classList.remove('visible');
    }
  }, 1500);
}

function updateVolumeVisualizer(vol, muted) {
  if (typeof vol === 'number' && !isNaN(vol)) {
    currentMediaVolume = Math.max(0, Math.min(1, vol));
  }
  if (typeof muted === 'boolean') {
    isMediaMuted = muted;
  } else if (currentMediaVolume === 0) {
    isMediaMuted = true;
  }

  const pct = Math.round(currentMediaVolume * 100);
  if (mediaVolumeFill) {
    mediaVolumeFill.style.height = isMediaMuted ? '0%' : `${pct}%`;
  }
  if (mediaVolumeThumb) {
    mediaVolumeThumb.style.bottom = isMediaMuted ? '0%' : `${pct}%`;
  }
  if (mediaVolumePopup) {
    mediaVolumePopup.classList.toggle('is-muted', isMediaMuted);
  }

  // Update Volume Icon
  if (mediaBtnVolume) {
    const volSvg = mediaBtnVolume.querySelector('svg');
    if (volSvg) {
      if (isMediaMuted || currentMediaVolume === 0) {
        volSvg.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        mediaBtnVolume.title = 'Unmute (Click to unmute, scroll to adjust volume)';
        mediaBtnVolume.setAttribute('aria-label', 'Unmute');
      } else if (currentMediaVolume < 0.35) {
        volSvg.innerHTML = '<path d="M7 9v6h4l5 5V4l-5 5H7z"/>';
        mediaBtnVolume.title = `Volume: ${pct}% (Click to mute, scroll to adjust)`;
        mediaBtnVolume.setAttribute('aria-label', `Volume: ${pct}%`);
      } else if (currentMediaVolume < 0.7) {
        volSvg.innerHTML = '<path d="M5 9v6h4l5 5V4L9 9H5zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
        mediaBtnVolume.title = `Volume: ${pct}% (Click to mute, scroll to adjust)`;
        mediaBtnVolume.setAttribute('aria-label', `Volume: ${pct}%`);
      } else {
        volSvg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        mediaBtnVolume.title = `Volume: ${pct}% (Click to mute, scroll to adjust)`;
        mediaBtnVolume.setAttribute('aria-label', `Volume: ${pct}%`);
      }
    }
  }
}

function updateActivityCardsVisibility() {
  const container = document.getElementById('activity-cards-container');
  if (!container) return;
  const historyPanel = document.getElementById('history-panel');
  const downloadsPanel = document.getElementById('downloads-panel');

  const isAnyPanelOpen = (historyPanel && !historyPanel.classList.contains('hidden')) ||
                         (downloadsPanel && !downloadsPanel.classList.contains('hidden'));

  if (isAnyPanelOpen) {
    container.classList.add('hidden');
    return;
  }

  const hasVisibleCards = Array.from(container.querySelectorAll('.activity-card'))
    .some(card => !card.classList.contains('hidden') && !card.classList.contains('dismissed'));

  if (hasVisibleCards) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

// Widget Close Logic
if (defaultBrowserCloseBtn) {
  defaultBrowserCloseBtn.addEventListener('click', () => {
    isDefaultBrowserCardActive = false;
    defaultBrowserCard.classList.add('hidden');
    defaultBrowserCard.classList.add('dismissed');
    updateActivityCardsVisibility();
  });
}

if (updateCloseBtn) {
  updateCloseBtn.addEventListener('click', () => {
    isUpdateAvailable = false;
    updateCard.classList.add('hidden');
    updateCard.classList.add('dismissed');
    updateActivityCardsVisibility();
  });
}

if (mediaCloseBtn) {
  mediaCloseBtn.addEventListener('click', () => {
    isMediaActive = false;
    stopVideoStream();
    mediaCard.classList.add('hidden');
    mediaCard.classList.add('dismissed');
    mediaCard.classList.remove('has-video');
    if (mediaVideoContainer) mediaVideoContainer.classList.add('hidden');
    if (mediaExpandVideoBtn) mediaExpandVideoBtn.classList.add('hidden');
    updateActivityCardsVisibility();
  });
}

// Video Multimedia Stream Handlers
function startVideoStream(tabId) {
  if (!window.naptureAPI || !window.naptureAPI.startMediaVideoStream) return;
  if (!tabId) return;
  if (activeTabId && activeTabId === tabId) return;
  if (Array.isArray(tabs) && tabs.length > 0 && !tabs.some(t => t.id === tabId)) return;
  lastMediaSourceTabId = tabId;
  if (activeVideoStreamTabId === tabId) return;

  activeVideoStreamTabId = tabId;
  window.naptureAPI.startMediaVideoStream(tabId);
}

function stopVideoStream() {
  if (window.naptureAPI && window.naptureAPI.stopMediaVideoStream) {
    window.naptureAPI.stopMediaVideoStream(activeVideoStreamTabId || lastMediaSourceTabId);
  }
  activeVideoStreamTabId = null;
  if (mediaVideoPlayer) {
    mediaVideoPlayer.src = '';
  }
}

function returnVideoToPage() {
  const targetTabId = lastMediaSourceTabId;
  if (targetTabId && Array.isArray(tabs) && tabs.some(t => t.id === targetTabId)) {
    stopVideoStream();
    if (mediaCard) {
      mediaCard.classList.remove('has-video');
    }
    if (mediaVideoContainer) {
      mediaVideoContainer.classList.add('hidden');
    }
    if (typeof switchTab === 'function') {
      switchTab(targetTabId);
    }
  }
}

if (window.naptureAPI && window.naptureAPI.onMediaVideoFrame) {
  window.naptureAPI.onMediaVideoFrame((data) => {
    if (data && activeVideoStreamTabId && data.tabId === activeVideoStreamTabId && data.frame) {
      if (mediaVideoPlayer) {
        mediaVideoPlayer.src = data.frame;
      }
    }
  });
}

if (mediaVideoReturnBtn) {
  mediaVideoReturnBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    returnVideoToPage();
  });
}

if (mediaVideoContainer) {
  mediaVideoContainer.addEventListener('click', (e) => {
    if (e.target.closest('#media-video-minimize-btn') || e.target.closest('#media-video-return-btn')) return;
    returnVideoToPage();
  });
}

if (mediaArtworkImg) {
  mediaArtworkImg.addEventListener('click', (e) => {
    e.stopPropagation();
    returnVideoToPage();
  });
}

if (mediaVideoMinimizeBtn) {
  mediaVideoMinimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMediaVideoMinimized = true;
    refreshMediaInfo();
  });
}

if (mediaExpandVideoBtn) {
  mediaExpandVideoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMediaVideoMinimized = false;
    refreshMediaInfo();
  });
}

// 1. Default Browser Check
async function checkDefaultBrowser() {
  if (window.naptureAPI && window.naptureAPI.isDefaultBrowser && defaultBrowserCard) {
    try {
      const isDefault = await window.naptureAPI.isDefaultBrowser();
      if (!isDefault && !defaultBrowserCard.classList.contains('dismissed')) {
        isDefaultBrowserCardActive = true;
        defaultBrowserCard.classList.remove('hidden');
      } else {
        isDefaultBrowserCardActive = false;
        defaultBrowserCard.classList.add('hidden');
      }
      updateActivityCardsVisibility();
    } catch(e) {}
  }
}

if (makeDefaultBtn) {
  makeDefaultBtn.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.makeDefaultBrowser) {
      window.naptureAPI.makeDefaultBrowser().then(() => {
        isDefaultBrowserCardActive = false;
        defaultBrowserCard.classList.add('hidden');
        updateActivityCardsVisibility();
      });
    }
  });
}

setTimeout(checkDefaultBrowser, 2000); // Check shortly after startup

// 2. Version Update Integration
if (updateRestartBtn) {
  updateRestartBtn.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.installUpdate) {
      window.naptureAPI.installUpdate().catch(err => console.error(err));
    }
  });
}

function checkUpdates() {
  if (window.naptureAPI && window.naptureAPI.checkForUpdates) {
    window.naptureAPI.checkForUpdates().then(res => {
      if (res && res.updateAvailable) {
        isUpdateAvailable = true;
        if (updateCard) updateCard.classList.remove('hidden');
      } else {
        isUpdateAvailable = false;
        if (updateCard) updateCard.classList.add('hidden');
      }
      updateActivityCardsVisibility();
    }).catch(() => {
      isUpdateAvailable = false;
      if (updateCard) updateCard.classList.add('hidden');
      updateActivityCardsVisibility();
    });
  }
}

// Check for updates on startup and every 30 minutes
checkUpdates();
setInterval(checkUpdates, 30 * 60 * 1000);

// 3. Multimedia Controls & Artwork
function refreshMediaInfo(infoOverride) {
  const handleInfo = (info) => {
    // If info points to a tab that no longer exists, discard it
    if (info && info.tabId && Array.isArray(tabs) && tabs.length > 0 && !tabs.some(t => t.id === info.tabId)) {
      info = null;
    }

    if (info && (info.playing || info.artwork || info.hasVideo)) {
      // If the media source tab has changed, reset the dismissed and minimized states
      if (info.tabId && lastMediaSourceTabId !== info.tabId) {
        if (mediaCard) mediaCard.classList.remove('dismissed');
        lastMediaSourceTabId = info.tabId;
        isMediaVideoMinimized = false;
      }

      if (mediaCard && mediaCard.classList.contains('dismissed')) {
        isMediaActive = false;
        stopVideoStream();
      } else {
        isMediaActive = true;
        if (mediaCard) mediaCard.classList.remove('hidden');
      }

      currentMediaHasVideo = !!(info.hasVideo);

      // Check if currently viewing the tab where media is playing
      const isCurrentlyOnPlayingTab = !!(activeTabId && info.tabId && activeTabId === info.tabId);

      // Show video if available, on a different tab, not user-minimized, and media active
      const shouldShowVideo = currentMediaHasVideo && !isCurrentlyOnPlayingTab && !isMediaVideoMinimized && isMediaActive;

      if (shouldShowVideo) {
        if (mediaCard) mediaCard.classList.add('has-video');
        if (mediaVideoContainer) mediaVideoContainer.classList.remove('hidden');
        if (mediaExpandVideoBtn) mediaExpandVideoBtn.classList.add('hidden');
        startVideoStream(info.tabId);
      } else {
        if (mediaCard) mediaCard.classList.remove('has-video');
        if (mediaVideoContainer) mediaVideoContainer.classList.add('hidden');
        stopVideoStream();

        // On a different tab with video available but user-minimized: show up arrow on thumbnail hover
        const canExpandVideo = currentMediaHasVideo && !isCurrentlyOnPlayingTab && isMediaVideoMinimized && isMediaActive;
        if (mediaExpandVideoBtn) {
          if (canExpandVideo) {
            mediaExpandVideoBtn.classList.remove('hidden');
          } else {
            mediaExpandVideoBtn.classList.add('hidden');
          }
        }
      }

      // Update Play/Pause Icon: When playing -> show Pause button (||). When paused -> show Play button (>).
      if (mediaBtnPlay) {
        const isPlaying = !!info.playing;
        const playSvg = mediaBtnPlay.querySelector('svg');
        if (playSvg) {
          playSvg.innerHTML = isPlaying
            ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
            : '<path d="M8 5v14l11-7z"/>';
        }
        mediaBtnPlay.title = isPlaying ? 'Pause' : 'Play';
        mediaBtnPlay.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      }

      // Update Volume & Mute State
      const vol = typeof info.volume === 'number' ? info.volume : currentMediaVolume;
      const muted = (typeof info.muted === 'boolean') ? info.muted : isMediaMuted;
      updateVolumeVisualizer(vol, muted);

      // Update Thumbnail / Artwork
      if (info.artwork && mediaArtworkImg) {
        mediaArtworkImg.src = info.artwork;
        mediaArtworkImg.classList.remove('hidden');
        if (mediaDefaultIcon) mediaDefaultIcon.style.display = 'none';
      } else {
        if (mediaArtworkImg) mediaArtworkImg.classList.add('hidden');
        if (mediaDefaultIcon) mediaDefaultIcon.style.display = 'block';
      }
    } else {
      isMediaActive = false;
      stopVideoStream();
      if (mediaCard) {
        mediaCard.classList.add('hidden');
        mediaCard.classList.remove('has-video');
      }
      if (mediaVideoContainer) mediaVideoContainer.classList.add('hidden');
      if (mediaExpandVideoBtn) mediaExpandVideoBtn.classList.add('hidden');
      if (mediaArtworkImg) mediaArtworkImg.classList.add('hidden');
      if (mediaDefaultIcon) mediaDefaultIcon.style.display = 'block';
    }
    updateActivityCardsVisibility();
  };

  if (infoOverride) {
    handleInfo(infoOverride);
    return;
  }

  if (!window.naptureAPI || !window.naptureAPI.getActiveMediaInfo) return;

  window.naptureAPI.getActiveMediaInfo().then(info => {
    handleInfo(info);
  }).catch(() => {
    isMediaActive = false;
    stopVideoStream();
    if (mediaCard) {
      mediaCard.classList.add('hidden');
      mediaCard.classList.remove('has-video');
    }
    if (mediaVideoContainer) mediaVideoContainer.classList.add('hidden');
    if (mediaExpandVideoBtn) mediaExpandVideoBtn.classList.add('hidden');
    updateActivityCardsVisibility();
  });
}

// Media Control Event Listeners
if (mediaBtnPlay) {
  mediaBtnPlay.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.controlMedia) {
      window.naptureAPI.controlMedia('play-pause');
      // Invert icon optimistically for instant responsiveness
      const playSvg = mediaBtnPlay.querySelector('svg');
      if (playSvg) {
        const isCurrentlyPause = playSvg.innerHTML.includes('M6 19h4V5H6v14zm8-14v14h4V5h-4z');
        const willBePlaying = !isCurrentlyPause;
        playSvg.innerHTML = willBePlaying
          ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
          : '<path d="M8 5v14l11-7z"/>';
        mediaBtnPlay.title = willBePlaying ? 'Pause' : 'Play';
        mediaBtnPlay.setAttribute('aria-label', willBePlaying ? 'Pause' : 'Play');
      }
      setTimeout(refreshMediaInfo, 120);
    }
  });
}

if (mediaBtnNext) {
  mediaBtnNext.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.controlMedia) {
      window.naptureAPI.controlMedia('next');
      setTimeout(refreshMediaInfo, 200);
    }
  });
}

if (mediaBtnPrev) {
  mediaBtnPrev.addEventListener('click', () => {
    if (window.naptureAPI && window.naptureAPI.controlMedia) {
      window.naptureAPI.controlMedia('previous');
      setTimeout(refreshMediaInfo, 200);
    }
  });
}

function handleVolumeWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  if (window.naptureAPI && window.naptureAPI.controlMedia) {
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    if (isMediaMuted && delta > 0) {
      isMediaMuted = false;
    }
    currentMediaVolume = Math.max(0, Math.min(1, Math.round((currentMediaVolume + delta) * 100) / 100));
    if (currentMediaVolume === 0) {
      isMediaMuted = true;
    }
    updateVolumeVisualizer(currentMediaVolume, isMediaMuted);
    showVolumePopup();
    window.naptureAPI.controlMedia('volume', delta);
    setTimeout(refreshMediaInfo, 100);
  }
}

if (mediaBtnVolume) {
  // Click to toggle mute
  mediaBtnVolume.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.naptureAPI && window.naptureAPI.controlMedia) {
      window.naptureAPI.controlMedia('toggle-mute');
      isMediaMuted = !isMediaMuted;
      updateVolumeVisualizer(currentMediaVolume, isMediaMuted);
      showVolumePopup();
      setTimeout(refreshMediaInfo, 100);
    }
  });

  // Scroll wheel to adjust volume up / down
  mediaBtnVolume.addEventListener('wheel', handleVolumeWheel, { passive: false });
}

if (mediaVolumeWrapper) {
  mediaVolumeWrapper.addEventListener('wheel', handleVolumeWheel, { passive: false });
  mediaVolumeWrapper.addEventListener('mouseenter', () => {
    showVolumePopup();
  });
  mediaVolumeWrapper.addEventListener('mouseleave', () => {
    if (volumePopupHideTimeout) clearTimeout(volumePopupHideTimeout);
    volumePopupHideTimeout = setTimeout(() => {
      if (mediaVolumePopup) mediaVolumePopup.classList.remove('visible');
    }, 400);
  });
}

if (mediaVolumePopup) {
  const handlePopupClickOrDrag = (e) => {
    const target = mediaVolumeTrack || mediaVolumePopup;
    const rect = target.getBoundingClientRect();
    const clickY = e.clientY;
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, clickY));
    const ratio = (rect.bottom - clampedY) / rect.height;
    const newVol = Math.max(0, Math.min(1, Math.round(ratio * 100) / 100));
    currentMediaVolume = newVol;
    isMediaMuted = (newVol === 0);
    updateVolumeVisualizer(currentMediaVolume, isMediaMuted);
    showVolumePopup();
    if (window.naptureAPI && window.naptureAPI.controlMedia) {
      window.naptureAPI.controlMedia('set-volume', newVol);
    }
  };

  let isDraggingPopup = false;
  mediaVolumePopup.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    isDraggingPopup = true;
    handlePopupClickOrDrag(e);
    const onMouseMove = (moveEvent) => {
      if (isDraggingPopup) handlePopupClickOrDrag(moveEvent);
    };
    const onMouseUp = () => {
      isDraggingPopup = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// Listen for media state changes from main process
if (window.naptureAPI && window.naptureAPI.onMediaStateChanged) {
  window.naptureAPI.onMediaStateChanged((data) => {
    if (data && data.mediaInfo) {
      refreshMediaInfo(data.mediaInfo);
    } else {
      refreshMediaInfo();
    }
  });
}

if (window.naptureAPI && window.naptureAPI.onMediaVolumeUpdated) {
  window.naptureAPI.onMediaVolumeUpdated((data) => {
    if (data) {
      if (typeof data.volume === 'number') currentMediaVolume = data.volume;
      if (typeof data.muted === 'boolean') isMediaMuted = data.muted;
      updateVolumeVisualizer(currentMediaVolume, isMediaMuted);
    }
    refreshMediaInfo();
  });
}

// Listen for incoming sync updates for pinned sites
if (window.naptureAPI && window.naptureAPI.onBrowserDataImported) {
  window.naptureAPI.onBrowserDataImported((data) => {
    if (data && data.importedPinnedSites && Array.isArray(data.importedPinnedSites)) {
      try {
        const unique = [];
        const seen = new Set();
        for (const p of data.importedPinnedSites) {
          if (!p || !p.url) continue;
          const clean = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
          if (!seen.has(clean)) {
            seen.add(clean);
            unique.push({ title: p.title || 'Pinned Site', url: p.url, favicon: p.favicon || '' });
          }
        }

        const newSavedStr = JSON.stringify(unique);
        if (newSavedStr !== localStorage.getItem('pinned-sites')) {
          localStorage.setItem('pinned-sites', newSavedStr);
        }
        if (typeof loadPinnedSites === 'function') loadPinnedSites();
        if (typeof renderPinnedSites === 'function') renderPinnedSites();
        if (typeof renderTabsAnimated === 'function') renderTabsAnimated();
      } catch (e) {
        console.error('Error applying synced pinned sites:', e);
      }
    }

    if (data && data.deviceJoined) {
      const syncCard = document.getElementById('sync-card');
      const syncMsg = document.getElementById('sync-card-message');
      if (syncCard && syncMsg) {
        syncMsg.textContent = `${data.deviceJoined.deviceName || 'A device'} has been added to the group`;
        syncCard.classList.remove('hidden');
        if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
          syncCard.classList.add('hidden');
          if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
        }, 5000);
      }
    }

    if (data && data.deviceUnlinked) {
      const syncCard = document.getElementById('sync-card');
      const syncMsg = document.getElementById('sync-card-message');
      if (syncCard && syncMsg) {
        syncMsg.textContent = 'A device left the sync group';
        syncCard.classList.remove('hidden');
        if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
          syncCard.classList.add('hidden');
          if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
        }, 5000);
      }
    }
  });

  // Setup sync card close button
  const syncCloseBtn = document.getElementById('sync-close-btn');
  if (syncCloseBtn) {
    syncCloseBtn.addEventListener('click', () => {
      document.getElementById('sync-card').classList.add('hidden');
      if (typeof updateActivityCardsVisibility === 'function') updateActivityCardsVisibility();
    });
  }
}

// Initial check for active media status
setTimeout(refreshMediaInfo, 1000);

if (window.naptureAPI && window.naptureAPI.onResetAllCompleted) {
  window.naptureAPI.onResetAllCompleted(() => {
    try {
      localStorage.removeItem('pinned-sites');
      localStorage.removeItem('napture-bookmarks');
      pinnedSites = [];
      tabs = [];
      activeTabId = null;
      if (typeof window.customBookmarks !== 'undefined') {
        window.customBookmarks = [];
      }
      if (typeof renderPinnedSites === 'function') renderPinnedSites();
      if (typeof renderCustomBookmarks === 'function') renderCustomBookmarks();
      if (typeof createTab === 'function') {
        createTab('napture://welcome', true);
      }
    } catch (e) {
      console.error('Error handling reset-all-completed in renderer.js:', e);
    }
  });
}

if (window.naptureAPI && window.naptureAPI.onClosePopups) {
  window.naptureAPI.onClosePopups(() => {
    closeAllPopups();
    const contextMenu = document.getElementById('tab-context-menu');
    if (contextMenu) contextMenu.classList.add('hidden');
    if (typeof updateActivityCardsVisibility === 'function') {
      updateActivityCardsVisibility();
    }
  });
}

// ==========================================================================
// ==========================================================================
// Highly Customizable Toolbar Engine: Visual Customizer Sync, Clean Spacers, & Invariants
// ==========================================================================

// ==========================================================================
// Highly Customizable Toolbar Engine: Workspace Customizer, Invariants & Drag-and-Drop
// ==========================================================================

const CUSTOMIZER_PALETTE_CATALOG = [
  { id: 'back-btn', type: 'system', name: 'Back', desc: 'Navigate backward', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>' },
  { id: 'forward-btn', type: 'system', name: 'Forward', desc: 'Navigate forward', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>' },
  { id: 'reload-btn', type: 'system', name: 'Reload', desc: 'Refresh page', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>' },
  { id: 'home-btn', type: 'system', name: 'Home', desc: 'Open home page', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>' },
  { id: 'downloads-btn', type: 'system', name: 'Downloads', desc: 'Recent downloads popup', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
  { id: 'history-btn', type: 'system', name: 'History', desc: 'Browsing history popup', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' },
  { id: 'bookmarks-btn', type: 'system', name: 'Bookmarks', desc: 'Toggle bookmarks sidebar', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>' },
  { id: 'newtab-btn', type: 'system', name: 'New Tab', desc: 'Open new tab', icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' },
  { id: 'template-margin', type: 'margin', name: 'Flexible Space', desc: 'Expanding spacer block', isMultiple: true, icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline><polyline points="12 19 5 12 12 5"></polyline></svg>' },
  { id: 'template-separator', type: 'separator', name: 'Fixed Separator', desc: 'Divider line gap', isMultiple: true, icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="12" y1="4" x2="12" y2="20"></line></svg>' },
  { id: 'template-link', type: 'link', name: 'Custom Link', desc: 'Web shortcut button', isMultiple: true, isCustomLink: true, icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' }
];

let activeToolbarLayout = [];
let activeSidebarBottomLayout = [];
let isToolbarCustomizing = false;
let pendingCustomLinkZone = 'topbar';

const systemToolbarElements = {
  'back-btn': null,
  'forward-btn': null,
  'reload-btn': null,
  'home-btn': null,
  'address-container': null
};

function isMultipleAllowed(item) {
  if (!item) return false;
  const type = (item.type || '').toLowerCase();
  const id = item.id || '';
  if (type === 'margin' || type === 'spacer' || type === 'separator' || type === 'link') return true;
  if (id.startsWith('margin-') || id.startsWith('sep-') || id.startsWith('link-') || id.startsWith('template-')) return true;
  return false;
}

function getFaviconForUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('napture://') && !cleanUrl.startsWith('file://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=32`;
  } catch (e) {
    return null;
  }
}

function sanitizeToolbarLayout(layout) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS));
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
    let { id, type, name, url, favicon, width, enabled, children } = item;

    if (!id || typeof id !== 'string') continue;
    id = id.trim();
    if (!id) continue;

    type = typeof type === 'string' ? type.toLowerCase().trim() : 'system';
    if (!validTypes.has(type)) type = 'system';
    if (type === 'spacer') type = 'margin';

    // Deduplicate system items
    if (type === 'system' || knownSystemIds.has(id)) {
      if (seenIds.has(id)) continue;
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

    if (type === 'link') {
      if (url) cleanItem.url = String(url).trim();
      cleanItem.favicon = favicon || getFaviconForUrl(cleanItem.url);
    }
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
      sanitized.splice(Math.min(sanitized.length, 4), 0, addressItem);
    } else {
      sanitized.push(addressItem);
    }
  }

  return sanitized;
}

function sanitizeSidebarBottomLayout(layout) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_SIDEBAR_BOTTOM_LAYOUT));
  }

  const validTypes = new Set(['system', 'link', 'folder', 'margin', 'spacer', 'separator']);
  const seenIds = new Set();
  const sanitized = [];

  for (const item of layout) {
    if (sanitized.length >= 3) break; // Enforce strict limit of 3 buttons
    if (!item || typeof item !== 'object') continue;
    let { id, type, name, url, favicon, enabled } = item;

    if (!id || typeof id !== 'string') continue;
    id = id.trim();
    if (!id || id === 'address-container') continue; // Address bar not allowed in sidebar bottom

    type = typeof type === 'string' ? type.toLowerCase().trim() : 'system';
    if (!validTypes.has(type)) type = 'system';
    if (type === 'spacer') type = 'margin';

    if (!isMultipleAllowed({ id, type })) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    } else {
      if (seenIds.has(id)) {
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
      seenIds.add(id);
    }

    sanitized.push({
      id,
      type,
      name: typeof name === 'string' && name.trim() ? name.trim() : id,
      url: url ? String(url).trim() : undefined,
      favicon: favicon || (url ? getFaviconForUrl(url) : undefined),
      enabled: enabled !== false
    });
  }

  return sanitized.slice(0, 3);
}

function enforceSingleInstanceInvariants() {
  const seenUniqueIds = new Set();

  activeToolbarLayout.forEach(item => {
    if (item && !isMultipleAllowed(item)) {
      seenUniqueIds.add(item.id);
    }
  });

  activeSidebarBottomLayout = activeSidebarBottomLayout.filter(item => {
    if (!item) return false;
    if (isMultipleAllowed(item)) return true;
    return !seenUniqueIds.has(item.id);
  });
}

function initSystemToolbarElements() {
  if (!systemToolbarElements['back-btn']) systemToolbarElements['back-btn'] = document.getElementById('back-btn');
  if (!systemToolbarElements['forward-btn']) systemToolbarElements['forward-btn'] = document.getElementById('forward-btn');
  if (!systemToolbarElements['reload-btn']) systemToolbarElements['reload-btn'] = document.getElementById('reload-btn');
  if (!systemToolbarElements['home-btn']) systemToolbarElements['home-btn'] = document.getElementById('home-btn');
  if (!systemToolbarElements['address-container']) systemToolbarElements['address-container'] = document.getElementById('address-container');
}

function loadToolbarState() {
  try {
    let saved = null;
    if (currentSettings && currentSettings.toolbarLayout) {
      saved = typeof currentSettings.toolbarLayout === 'string' ? JSON.parse(currentSettings.toolbarLayout) : currentSettings.toolbarLayout;
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('napture-toolbar-layout');
      if (raw) saved = JSON.parse(raw);
    }
    activeToolbarLayout = sanitizeToolbarLayout(saved);
  } catch (e) {
    activeToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS));
  }
}

function saveToolbarState() {
  activeToolbarLayout = sanitizeToolbarLayout(activeToolbarLayout);
  enforceSingleInstanceInvariants();
  const jsonStr = JSON.stringify(activeToolbarLayout);
  if (currentSettings) {
    currentSettings.toolbarLayout = jsonStr;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('napture-toolbar-layout', jsonStr);
  }
  if (window.naptureAPI && window.naptureAPI.saveSetting) {
    window.naptureAPI.saveSetting('toolbarLayout', jsonStr);
  }
}

function loadSidebarBottomState() {
  try {
    let saved = null;
    if (currentSettings && currentSettings.sidebarBottomLayout) {
      saved = typeof currentSettings.sidebarBottomLayout === 'string' ? JSON.parse(currentSettings.sidebarBottomLayout) : currentSettings.sidebarBottomLayout;
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('napture-sidebar-bottom-layout');
      if (raw) saved = JSON.parse(raw);
    }
    activeSidebarBottomLayout = sanitizeSidebarBottomLayout(saved);
  } catch (e) {
    activeSidebarBottomLayout = JSON.parse(JSON.stringify(DEFAULT_SIDEBAR_BOTTOM_LAYOUT));
  }
  enforceSingleInstanceInvariants();
}

function saveSidebarBottomState() {
  enforceSingleInstanceInvariants();
  activeSidebarBottomLayout = sanitizeSidebarBottomLayout(activeSidebarBottomLayout);
  const jsonStr = JSON.stringify(activeSidebarBottomLayout);
  if (currentSettings) {
    currentSettings.sidebarBottomLayout = jsonStr;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('napture-sidebar-bottom-layout', jsonStr);
  }
  if (window.naptureAPI && window.naptureAPI.saveSetting) {
    window.naptureAPI.saveSetting('sidebarBottomLayout', jsonStr);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    saveToolbarState();
    saveSidebarBottomState();
  });
}

let pendingCustomLinkInsertIdx = -1;
let editingCustomLinkId = null;

function openCustomizerLinkDialog(targetIdx = -1, targetZone = 'topbar') {
  editingCustomLinkId = null;
  pendingCustomLinkInsertIdx = targetIdx;
  pendingCustomLinkZone = targetZone;
  const overlay = document.getElementById('customizer-dialog-overlay');
  const titleInput = document.getElementById('customizer-link-title');
  const urlInput = document.getElementById('customizer-link-url');
  const modalTitleSpan = overlay ? overlay.querySelector('.customizer-dialog-title span') : null;
  const saveBtn = document.getElementById('btn-customizer-save-link');

  if (titleInput) titleInput.value = '';
  if (urlInput) urlInput.value = '';
  if (modalTitleSpan) modalTitleSpan.textContent = 'Add Custom Link';
  if (saveBtn) saveBtn.textContent = 'Add Link';

  if (overlay) {
    overlay.classList.remove('hidden');
    if (urlInput) urlInput.focus();
  }
}

function openCustomizerEditLinkDialog(item) {
  if (!item) return;
  editingCustomLinkId = item.id;
  pendingCustomLinkInsertIdx = -1;
  const overlay = document.getElementById('customizer-dialog-overlay');
  const titleInput = document.getElementById('customizer-link-title');
  const urlInput = document.getElementById('customizer-link-url');
  const modalTitleSpan = overlay ? overlay.querySelector('.customizer-dialog-title span') : null;
  const saveBtn = document.getElementById('btn-customizer-save-link');

  if (titleInput) titleInput.value = item.name || '';
  if (urlInput) urlInput.value = item.url || '';
  if (modalTitleSpan) modalTitleSpan.textContent = 'Edit Custom Site';
  if (saveBtn) saveBtn.textContent = 'Save Changes';

  if (overlay) {
    overlay.classList.remove('hidden');
    if (urlInput) urlInput.focus();
  }
}

function closeCustomizerLinkDialog() {
  const overlay = document.getElementById('customizer-dialog-overlay');
  const modalTitleSpan = overlay ? overlay.querySelector('.customizer-dialog-title span') : null;
  const saveBtn = document.getElementById('btn-customizer-save-link');

  if (overlay) overlay.classList.add('hidden');
  pendingCustomLinkInsertIdx = -1;
  editingCustomLinkId = null;

  if (modalTitleSpan) modalTitleSpan.textContent = 'Add Custom Link';
  if (saveBtn) saveBtn.textContent = 'Add Link';
}

function insertPaletteItem(catalogItem, targetIdx = -1, targetZone = 'topbar') {
  if (catalogItem.isCustomLink) {
    openCustomizerLinkDialog(targetIdx, targetZone);
    return;
  }

  // Sidebar bottom can only hold 3 buttons maximum
  if (targetZone === 'sidebar' && activeSidebarBottomLayout.length >= 3) {
    return;
  }

  // Enforce single-instance: only 1 of each button except Flexible Space, Custom link, Fixed separator
  if (!isMultipleAllowed(catalogItem)) {
    activeToolbarLayout = activeToolbarLayout.filter(i => i.id !== catalogItem.id);
    activeSidebarBottomLayout = activeSidebarBottomLayout.filter(i => i.id !== catalogItem.id);
  }

  let newItem = null;
  if (catalogItem.type === 'margin') {
    newItem = { id: 'margin-' + Date.now(), type: 'margin', name: 'Flexible Space', enabled: true };
  } else if (catalogItem.type === 'separator') {
    newItem = { id: 'sep-' + Date.now(), type: 'separator', name: 'Fixed Separator', enabled: true };
  } else {
    newItem = { id: catalogItem.id, type: 'system', name: catalogItem.name, enabled: true };
  }

  if (newItem) {
    if (targetZone === 'sidebar') {
      if (activeSidebarBottomLayout.length < 3) {
        if (targetIdx < 0 || targetIdx > activeSidebarBottomLayout.length) {
          activeSidebarBottomLayout.push(newItem);
        } else {
          activeSidebarBottomLayout.splice(targetIdx, 0, newItem);
        }
      }
    } else {
      if (targetIdx < 0 || targetIdx > activeToolbarLayout.length) {
        activeToolbarLayout.push(newItem);
      } else {
        activeToolbarLayout.splice(targetIdx, 0, newItem);
      }
    }
    saveToolbarState();
    saveSidebarBottomState();
    renderToolbarCustomizable();
    renderSidebarBottom();
    renderCustomizerWorkspace();
  }
}

function handleToolbarInsert(targetIdx) {
  let modified = false;

  if (draggedTopBarIdx !== null) {
    const movedItem = activeToolbarLayout.splice(draggedTopBarIdx, 1)[0];
    if (movedItem) {
      let insertIdx = targetIdx;
      if (draggedTopBarIdx < targetIdx) {
        insertIdx = Math.max(0, targetIdx - 1);
      }
      activeToolbarLayout.splice(Math.min(activeToolbarLayout.length, Math.max(0, insertIdx)), 0, movedItem);
      modified = true;
    }
    draggedTopBarIdx = null;
  } else if (draggedSidebarIdx !== null) {
    const movedItem = activeSidebarBottomLayout.splice(draggedSidebarIdx, 1)[0];
    if (movedItem) {
      activeToolbarLayout.splice(Math.min(activeToolbarLayout.length, Math.max(0, targetIdx)), 0, movedItem);
      modified = true;
    }
    draggedSidebarIdx = null;
  } else if (draggedPaletteItem !== null) {
    const pItem = draggedPaletteItem;
    draggedPaletteItem = null;
    insertPaletteItem(pItem, targetIdx, 'topbar');
    return;
  }

  if (modified) {
    saveToolbarState();
    saveSidebarBottomState();
    renderToolbarCustomizable();
    renderSidebarBottom();
    renderCustomizerWorkspace();
  }
}

function handleSidebarBottomInsert(targetIdx) {
  let modified = false;

  if (draggedSidebarIdx !== null) {
    const movedItem = activeSidebarBottomLayout.splice(draggedSidebarIdx, 1)[0];
    if (movedItem) {
      let insertIdx = targetIdx;
      if (draggedSidebarIdx < targetIdx) {
        insertIdx = Math.max(0, targetIdx - 1);
      }
      activeSidebarBottomLayout.splice(Math.min(activeSidebarBottomLayout.length, Math.max(0, insertIdx)), 0, movedItem);
      modified = true;
    }
    draggedSidebarIdx = null;
  } else if (draggedTopBarIdx !== null) {
    if (activeSidebarBottomLayout.length < 3) {
      const movedItem = activeToolbarLayout.splice(draggedTopBarIdx, 1)[0];
      if (movedItem && movedItem.id !== 'address-container') {
        activeSidebarBottomLayout.splice(Math.min(activeSidebarBottomLayout.length, Math.max(0, targetIdx)), 0, movedItem);
        modified = true;
      }
    }
    draggedTopBarIdx = null;
  } else if (draggedPaletteItem !== null) {
    const pItem = draggedPaletteItem;
    draggedPaletteItem = null;
    if (activeSidebarBottomLayout.length < 3) {
      insertPaletteItem(pItem, targetIdx, 'sidebar');
      return;
    }
  }

  if (modified) {
    saveToolbarState();
    saveSidebarBottomState();
    renderToolbarCustomizable();
    renderSidebarBottom();
    renderCustomizerWorkspace();
  }
}

function ensureToolbarVisibility() {
  const headerBar = document.getElementById('header-bar');
  const headerCenter = document.querySelector('.header-center');
  if (!headerBar || !headerCenter) return;

  const headerLeft = document.querySelector('.header-left');
  const headerRight = document.querySelector('.header-right');

  const headerBarWidth = headerBar.clientWidth || window.innerWidth;
  const leftWidth = headerLeft ? headerLeft.offsetWidth : 0;
  const rightWidth = headerRight ? headerRight.offsetWidth : 0;
  // Available width for header-center (accounting for header padding 32px + buffer)
  const centerAvailableWidth = Math.max(0, headerBarWidth - leftWidth - rightWidth - 32);

  const wrappers = Array.from(headerCenter.querySelectorAll('.toolbar-item-wrapper'));
  const addressWrapper = headerCenter.querySelector('.toolbar-item-wrapper[data-id="address-container"], .toolbar-address-wrapper');
  const sysEl = document.getElementById('address-container');

  // Sum widths of all fixed items (buttons, separators, folders, links)
  let fixedItemsWidth = 0;
  const gapWidth = 8;
  let nonSpacerCount = 0;

  wrappers.forEach(w => {
    if (w === addressWrapper) return;
    const isSpacer = w.dataset.type === 'margin' || w.dataset.type === 'spacer';
    if (!isSpacer) {
      nonSpacerCount++;
      fixedItemsWidth += (w.offsetWidth > 0 ? w.offsetWidth : 32);
    }
  });

  const totalGaps = nonSpacerCount * gapWidth;
  const remainingForAddress = Math.max(0, centerAvailableWidth - fixedItemsWidth - totalGaps);

  // Address Bar handling: ensure it shrinks so it never pushes icons out
  if (addressWrapper) {
    const addressItem = Array.isArray(activeToolbarLayout) ? activeToolbarLayout.find(i => i && i.id === 'address-container') : null;
    const configuredWidth = addressItem && addressItem.width ? addressItem.width : null;

    if (configuredWidth) {
      const safeWidth = Math.min(configuredWidth, remainingForAddress);
      addressWrapper.style.maxWidth = `${Math.max(60, safeWidth)}px`;
      addressWrapper.style.flex = `1 1 ${Math.max(60, safeWidth)}px`;
      if (sysEl) {
        sysEl.style.maxWidth = `${Math.max(60, safeWidth)}px`;
        sysEl.style.flex = '1 1 auto';
        sysEl.style.minWidth = '0';
        sysEl.style.width = '100%';
      }
    } else {
      addressWrapper.style.maxWidth = remainingForAddress > 0 ? `${remainingForAddress}px` : '100%';
      addressWrapper.style.flex = '1 1 auto';
      if (sysEl) {
        sysEl.style.maxWidth = remainingForAddress > 0 ? `${remainingForAddress}px` : '100%';
        sysEl.style.flex = '1 1 auto';
        sysEl.style.minWidth = '0';
        sysEl.style.width = '100%';
      }
    }
  }

  // Spacers: collapse when space is constrained
  const spacers = headerCenter.querySelectorAll('.toolbar-item-wrapper[data-type="margin"], .toolbar-item-wrapper[data-type="spacer"]');
  if (remainingForAddress < 140) {
    spacers.forEach(s => {
      s.style.display = 'none';
    });
  } else {
    spacers.forEach(s => {
      s.style.display = '';
    });
  }
}

function renderToolbarCustomizable() {
  initSystemToolbarElements();
  const headerCenter = document.querySelector('.header-center');
  if (!headerCenter) return;

  // Detach primary system elements safely to preserve DOM state & listeners
  const tempFragment = document.createDocumentFragment();
  Object.keys(systemToolbarElements).forEach(id => {
    const el = systemToolbarElements[id];
    if (el && el.parentNode) {
      tempFragment.appendChild(el);
    }
  });

  headerCenter.innerHTML = '';

  if (isToolbarCustomizing) {
    headerCenter.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    headerCenter.ondrop = (e) => {
      if (e.target === headerCenter || !e.target.closest('.toolbar-item-wrapper')) {
        e.preventDefault();
        const wrappers = Array.from(headerCenter.querySelectorAll('.toolbar-item-wrapper'));
        let targetIdx = wrappers.length;
        for (let i = 0; i < wrappers.length; i++) {
          const rect = wrappers[i].getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) {
            targetIdx = i;
            break;
          }
        }
        handleToolbarInsert(targetIdx);
      }
    };
  } else {
    headerCenter.ondragover = null;
    headerCenter.ondrop = null;
  }

  activeToolbarLayout.forEach((item, index) => {
    if (item.enabled === false) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'toolbar-item-wrapper';
    wrapper.dataset.id = item.id;
    wrapper.dataset.type = item.type || 'system';
    wrapper.dataset.index = index;

    if (isToolbarCustomizing) {
      wrapper.setAttribute('draggable', 'true');
      wrapper.title = 'Drag to reorder or drag down to remove';

      wrapper.addEventListener('dragstart', (e) => {
        draggedTopBarIdx = index;
        draggedPaletteItem = null;
        wrapper.classList.add('dragging');
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'all';
      });

      wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
        draggedTopBarIdx = null;
        document.querySelectorAll('.toolbar-item-wrapper').forEach(w => {
          w.classList.remove('drop-target-left', 'drop-target-right');
        });
      });

      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        const rect = wrapper.getBoundingClientRect();
        const isLeft = (e.clientX - rect.left) < (rect.width / 2);
        wrapper.classList.toggle('drop-target-left', isLeft);
        wrapper.classList.toggle('drop-target-right', !isLeft);
      });

      wrapper.addEventListener('dragleave', () => {
        wrapper.classList.remove('drop-target-left', 'drop-target-right');
      });

      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = wrapper.getBoundingClientRect();
        const isLeft = (e.clientX - rect.left) < (rect.width / 2);
        wrapper.classList.remove('drop-target-left', 'drop-target-right');

        const targetIdx = isLeft ? index : index + 1;
        handleToolbarInsert(targetIdx);
      });
    }

    if (systemToolbarElements[item.id]) {
      const sysEl = systemToolbarElements[item.id];
      sysEl.classList.remove('hidden');

      if (item.id === 'address-container') {
        wrapper.classList.add('toolbar-address-wrapper');
        if (item.width) {
          wrapper.style.flex = '1 1 ' + item.width + 'px';
          wrapper.style.maxWidth = item.width + 'px';
          wrapper.style.minWidth = '0';
          wrapper.style.flexShrink = '1';

          sysEl.style.width = '100%';
          sysEl.style.maxWidth = item.width + 'px';
          sysEl.style.flex = '1 1 auto';
          sysEl.style.flexShrink = '1';
          sysEl.style.minWidth = '0';
        } else {
          wrapper.style.flex = '1 1 auto';
          wrapper.style.maxWidth = '';
          wrapper.style.minWidth = '0';
          wrapper.style.flexShrink = '1';

          sysEl.style.width = '100%';
          sysEl.style.maxWidth = '';
          sysEl.style.flex = '1 1 auto';
          sysEl.style.flexShrink = '1';
          sysEl.style.minWidth = '0';
        }

        if (isToolbarCustomizing) {
          const resizeHandle = document.createElement('div');
          resizeHandle.className = 'toolbar-resize-handle';
          resizeHandle.title = 'Drag to resize link bar width (Double-click to reset)';

          resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            wrapper.setAttribute('draggable', 'false');
            resizeHandle.classList.add('active');

            const startX = e.clientX;
            const startWidth = sysEl.offsetWidth;

            let resizeRaf = null;
            const onMouseMove = (moveEvent) => {
              moveEvent.preventDefault();
              const delta = moveEvent.clientX - startX;
              const headerCenterEl = document.querySelector('.header-center');
              const availableWidth = headerCenterEl ? Math.max(120, headerCenterEl.clientWidth - 40) : 1000;
              const maxAllowed = Math.min(1400, availableWidth);
              const newWidth = Math.max(120, Math.min(maxAllowed, Math.round(startWidth + delta)));
              item.width = newWidth;
              wrapper.style.flex = '1 1 ' + newWidth + 'px';
              wrapper.style.maxWidth = newWidth + 'px';
              wrapper.style.minWidth = '0';
              sysEl.style.width = '100%';
              sysEl.style.maxWidth = newWidth + 'px';
              sysEl.style.flex = '1 1 auto';
              sysEl.style.minWidth = '0';
              if (!resizeRaf) {
                resizeRaf = requestAnimationFrame(() => {
                  resizeRaf = null;
                  ensureToolbarVisibility();
                });
              }
            };

            const onMouseUp = () => {
              if (resizeRaf) {
                cancelAnimationFrame(resizeRaf);
                resizeRaf = null;
              }
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
              wrapper.setAttribute('draggable', 'true');
              resizeHandle.classList.remove('active');
              saveToolbarState();
              ensureToolbarVisibility();
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          });

          resizeHandle.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            delete item.width;
            wrapper.style.flex = '1 1 auto';
            wrapper.style.maxWidth = '';
            wrapper.style.minWidth = '0';
            sysEl.style.width = '100%';
            sysEl.style.flex = '1 1 auto';
            sysEl.style.maxWidth = '';
            sysEl.style.minWidth = '0';
            saveToolbarState();
            ensureToolbarVisibility();
          });

          wrapper.appendChild(resizeHandle);
        }
      }

      wrapper.appendChild(sysEl);
    } else if (item.id === 'downloads-btn') {
      const btn = document.createElement('button');
      btn.id = 'toolbar-downloads-btn';
      btn.className = 'nav-btn toolbar-system-btn';
      btn.title = 'Downloads';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        toggleOmnibarDownloadsPopup(btn);
      });
      wrapper.appendChild(btn);
    } else if (item.id === 'history-btn') {
      const btn = document.createElement('button');
      btn.id = 'toolbar-history-btn';
      btn.className = 'nav-btn toolbar-system-btn';
      btn.title = 'History';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        toggleOmnibarHistoryPopup(btn);
      });
      wrapper.appendChild(btn);
    } else if (item.id === 'bookmarks-btn') {
      const btn = document.createElement('button');
      btn.id = 'toolbar-bookmarks-btn';
      btn.className = 'nav-btn toolbar-system-btn';
      btn.title = 'Bookmarks';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
      });
      wrapper.appendChild(btn);
    } else if (item.id === 'newtab-btn') {
      const btn = document.createElement('button');
      btn.id = 'toolbar-newtab-btn';
      btn.className = 'nav-btn toolbar-system-btn';
      btn.title = 'New Tab';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        if (typeof createTab === 'function') createTab();
      });
      wrapper.appendChild(btn);
    } else if (item.type === 'link') {
      const linkBtn = document.createElement('button');
      linkBtn.className = 'nav-btn toolbar-custom-btn';
      linkBtn.title = (item.name || 'Link') + (item.url ? ' (' + item.url + ')' : '');

      const favUrl = item.favicon || getFaviconForUrl(item.url);
      if (favUrl) {
        linkBtn.innerHTML = `<img src="${escapeHtml(favUrl)}" class="toolbar-link-favicon" width="16" height="16" alt="" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.classList.remove('hidden');"><svg class="toolbar-link-fallback-icon hidden" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      } else {
        linkBtn.innerHTML = `<svg class="toolbar-link-fallback-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      }

      linkBtn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        if (typeof createTab === 'function') {
          createTab(item.url, true);
        } else if (window.naptureAPI && window.naptureAPI.navigate) {
          window.naptureAPI.navigate(item.url);
        }
      });
      wrapper.appendChild(linkBtn);
    } else if (item.type === 'folder') {
      const folderGroup = document.createElement('div');
      folderGroup.className = 'toolbar-folder-group';

      const folderBtn = document.createElement('button');
      folderBtn.className = 'toolbar-folder-btn';
      folderBtn.title = item.name || 'Tools';
      folderBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span class="folder-name-label">${escapeHtml(item.name || 'Tools')}</span><svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

      folderBtn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        const rect = folderBtn.getBoundingClientRect();
        if (window.naptureAPI && window.naptureAPI.showToolbarFolderMenu) {
          window.naptureAPI.showToolbarFolderMenu({
            x: Math.round(rect.left),
            y: Math.round(rect.bottom + 4),
            items: item.children || []
          });
        }
      });

      folderGroup.appendChild(folderBtn);
      wrapper.appendChild(folderGroup);
    } else if (item.type === 'margin' || item.type === 'spacer') {
      const spacerEl = document.createElement('div');
      spacerEl.className = 'toolbar-spacer';
      wrapper.appendChild(spacerEl);
    } else if (item.type === 'separator') {
      const sepEl = document.createElement('div');
      sepEl.className = 'toolbar-separator';
      sepEl.innerHTML = '<div class="toolbar-separator-line"></div>';
      wrapper.appendChild(sepEl);
    }

    headerCenter.appendChild(wrapper);
  });
  ensureToolbarVisibility();
}

function startToolbarCustomizing() {
  if (isToolbarCustomizing) return;
  isToolbarCustomizing = true;
  document.body.classList.add('toolbar-customizing');
  if (window.naptureAPI && window.naptureAPI.setToolbarCustomizing) {
    window.naptureAPI.setToolbarCustomizing(true);
  }

  const workspace = document.getElementById('toolbar-customizer-workspace');
  if (workspace) workspace.classList.remove('hidden');

  closeAllPopups();
  renderToolbarCustomizable();
  renderSidebarBottom();
  renderCustomizerWorkspace();
}

function stopToolbarCustomizing(saveChanges = true) {
  if (!isToolbarCustomizing) return;
  isToolbarCustomizing = false;
  document.body.classList.remove('toolbar-customizing');
  if (window.naptureAPI && window.naptureAPI.setToolbarCustomizing) {
    window.naptureAPI.setToolbarCustomizing(false);
  }

  const workspace = document.getElementById('toolbar-customizer-workspace');
  if (workspace) workspace.classList.add('hidden');

  closeCustomizerLinkDialog();

  if (saveChanges) {
    saveToolbarState();
    saveSidebarBottomState();
  }
  renderToolbarCustomizable();
  renderSidebarBottom();
}

function renderCustomizerWorkspace() {
  const paletteGrid = document.getElementById('customizer-palette-grid');
  if (!paletteGrid) return;
  paletteGrid.innerHTML = '';

  CUSTOMIZER_PALETTE_CATALOG.forEach(catalogItem => {
    const card = document.createElement('div');
    card.className = 'customizer-palette-card';

    const isSingleInstance = !catalogItem.isMultiple;
    const isAlreadyInUse = isSingleInstance && (
      activeToolbarLayout.some(i => i.id === catalogItem.id) ||
      activeSidebarBottomLayout.some(i => i.id === catalogItem.id)
    );

    if (isAlreadyInUse) {
      card.classList.add('in-use');
      card.title = `${catalogItem.name} (Already in use)`;
    } else {
      card.setAttribute('draggable', 'true');
      card.title = `${catalogItem.desc || catalogItem.name} (Drag to toolbar/sidebar or click to add)`;

      card.addEventListener('dragstart', (e) => {
        draggedPaletteItem = catalogItem;
        draggedTopBarIdx = null;
        draggedSidebarIdx = null;
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', catalogItem.id);
        e.dataTransfer.effectAllowed = 'all';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedPaletteItem = null;
      });

      // Also support single-click to add directly to toolbar!
      card.addEventListener('click', () => {
        insertPaletteItem(catalogItem, -1, 'topbar');
      });
    }

    const iconEl = document.createElement('div');
    iconEl.className = 'customizer-palette-icon';
    iconEl.innerHTML = catalogItem.icon;
    card.appendChild(iconEl);

    const nameEl = document.createElement('div');
    nameEl.className = 'customizer-palette-name';
    nameEl.textContent = catalogItem.name;
    card.appendChild(nameEl);

    if (!isAlreadyInUse) {
      const hintEl = document.createElement('div');
      hintEl.className = 'customizer-palette-add-hint';
      hintEl.textContent = '+ Add';
      card.appendChild(hintEl);
    }

    paletteGrid.appendChild(card);
  });
}

// Customizer Workspace Event Listeners
const workspaceEl = document.getElementById('toolbar-customizer-workspace');
if (workspaceEl) {
  // Allow dropping items back into the palette area to remove from toolbar
  workspaceEl.addEventListener('dragover', (e) => {
    if (draggedTopBarIdx !== null || draggedSidebarIdx !== null) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });

  workspaceEl.addEventListener('drop', (e) => {
    if (draggedTopBarIdx !== null && !e.target.closest('.header-center')) {
      e.preventDefault();
      const removed = activeToolbarLayout[draggedTopBarIdx];
      if (removed && removed.id !== 'address-container') {
        activeToolbarLayout.splice(draggedTopBarIdx, 1);
        draggedTopBarIdx = null;
        saveToolbarState();
        renderToolbarCustomizable();
        renderCustomizerWorkspace();
      }
    } else if (draggedSidebarIdx !== null && !e.target.closest('.sidebar-bottom')) {
      e.preventDefault();
      activeSidebarBottomLayout.splice(draggedSidebarIdx, 1);
      draggedSidebarIdx = null;
      saveSidebarBottomState();
      renderSidebarBottom();
      renderCustomizerWorkspace();
    }
  });
}

// Workspace Buttons
const btnDone = document.getElementById('btn-customizer-done');
if (btnDone) {
  btnDone.addEventListener('click', () => {
    stopToolbarCustomizing(true);
  });
}

const btnRestoreDefaults = document.getElementById('btn-customizer-restore-defaults');
if (btnRestoreDefaults) {
  btnRestoreDefaults.addEventListener('click', () => {
    activeToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS));
    activeSidebarBottomLayout = JSON.parse(JSON.stringify(DEFAULT_SIDEBAR_BOTTOM_LAYOUT));
    saveToolbarState();
    saveSidebarBottomState();
    renderToolbarCustomizable();
    renderSidebarBottom();
    renderCustomizerWorkspace();
  });
}

const dialogOverlay = document.getElementById('customizer-dialog-overlay');
const btnCloseDialog = document.getElementById('btn-customizer-close-dialog');
const btnSaveLink = document.getElementById('btn-customizer-save-link');
const btnCancelLink = document.getElementById('btn-customizer-cancel-link');
const linkTitleInput = document.getElementById('customizer-link-title');
const linkUrlInput = document.getElementById('customizer-link-url');

function submitAddLinkForm() {
  const title = linkTitleInput ? linkTitleInput.value.trim() : '';
  let url = linkUrlInput ? linkUrlInput.value.trim() : '';
  if (!url) {
    if (linkUrlInput) linkUrlInput.focus();
    return;
  }
  const lUrl = url.toLowerCase();
  if (!lUrl.startsWith('http://') && !lUrl.startsWith('https://') && !lUrl.startsWith('napture://') && !lUrl.startsWith('file://')) {
    url = 'https://' + url;
  }
  let finalTitle = title;
  if (!finalTitle) {
    try {
      finalTitle = new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      finalTitle = 'Link';
    }
  }
  const favicon = getFaviconForUrl(url);

  if (editingCustomLinkId) {
    const targetItem = activeToolbarLayout.find(i => i.id === editingCustomLinkId);
    if (targetItem) {
      targetItem.name = finalTitle;
      targetItem.url = url;
      targetItem.favicon = favicon;
    }
    const targetInSidebar = activeSidebarBottomLayout.find(i => i.id === editingCustomLinkId);
    if (targetInSidebar) {
      targetInSidebar.name = finalTitle;
      targetInSidebar.url = url;
      targetInSidebar.favicon = favicon;
    }
  } else {
    const newItem = { id: 'link-' + Date.now(), type: 'link', name: finalTitle, url: url, favicon: favicon, enabled: true };
    if (pendingCustomLinkZone === 'sidebar') {
      if (activeSidebarBottomLayout.length < 3) {
        if (pendingCustomLinkInsertIdx >= 0 && pendingCustomLinkInsertIdx <= activeSidebarBottomLayout.length) {
          activeSidebarBottomLayout.splice(pendingCustomLinkInsertIdx, 0, newItem);
        } else {
          activeSidebarBottomLayout.push(newItem);
        }
      }
    } else {
      if (pendingCustomLinkInsertIdx >= 0 && pendingCustomLinkInsertIdx <= activeToolbarLayout.length) {
        activeToolbarLayout.splice(pendingCustomLinkInsertIdx, 0, newItem);
      } else {
        activeToolbarLayout.push(newItem);
      }
    }
  }

  closeCustomizerLinkDialog();
  saveToolbarState();
  saveSidebarBottomState();
  renderToolbarCustomizable();
  renderSidebarBottom();
  if (isToolbarCustomizing) renderCustomizerWorkspace();
}

if (btnCloseDialog) {
  btnCloseDialog.addEventListener('click', () => {
    closeCustomizerLinkDialog();
  });
}

if (btnCancelLink) {
  btnCancelLink.addEventListener('click', () => {
    closeCustomizerLinkDialog();
  });
}

const customizerDialogCard = document.getElementById('customizer-dialog-card');
if (customizerDialogCard) {
  customizerDialogCard.addEventListener('mousedown', (e) => e.stopPropagation());
  customizerDialogCard.addEventListener('click', (e) => e.stopPropagation());
}

if (dialogOverlay) {
  dialogOverlay.addEventListener('mousedown', (e) => {
    if (e.target === dialogOverlay) {
      closeCustomizerLinkDialog();
    }
  });
}

if (btnSaveLink) {
  btnSaveLink.addEventListener('click', submitAddLinkForm);
}

[linkTitleInput, linkUrlInput].forEach(inp => {
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAddLinkForm();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeCustomizerLinkDialog();
      }
    });
  }
});

// Global escape key listener to close customization / dialog
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('customizer-dialog-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      closeCustomizerLinkDialog();
      return;
    }
    if (isToolbarCustomizing) {
      stopToolbarCustomizing(true);
    }
  }
});

// Right-click context menu on top toolbar
if (headerBarEl) {
  headerBarEl.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'INPUT') return;
    e.preventDefault();
    e.stopPropagation();

    const clickedWrapper = e.target.closest('.toolbar-item-wrapper');
    const itemId = clickedWrapper ? clickedWrapper.dataset.id : null;
    const itemData = itemId ? activeToolbarLayout.find(i => i.id === itemId) : null;

    const menuItems = [];

    if (itemData && itemData.type === 'link') {
      menuItems.push({
        label: 'Edit Custom Site...',
        action: 'edit-custom-site',
        payload: { itemId: itemData.id }
      });
    }

    menuItems.push({
      label: isToolbarCustomizing ? 'Exit Toolbar Customizing' : 'Customize Toolbar...',
      action: 'customize-toolbar'
    });

    if (itemData) {
      if (itemData.id !== 'address-container') {
        menuItems.push({
          label: 'Remove from Toolbar',
          action: 'remove-item',
          payload: { itemId: itemData.id }
        });
      }
    }

    menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Reset Toolbar to Default',
      action: 'reset-toolbar'
    });

    if (window.naptureAPI && window.naptureAPI.showTabContextMenu) {
      window.naptureAPI.showTabContextMenu(menuItems, { x: e.clientX, y: e.clientY });
      return;
    }

    const contextMenu = document.getElementById('tab-context-menu');
    if (!contextMenu) return;
    contextMenu.innerHTML = '';
    menuItems.forEach(item => {
      if (item.type === 'separator') {
        const div = document.createElement('div');
        div.className = 'menu-divider';
        contextMenu.appendChild(div);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      const span = document.createElement('span');
      span.textContent = item.label;
      btn.appendChild(span);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.action === 'edit-custom-site') {
          if (item.payload && item.payload.itemId) {
            const itemToEdit = activeToolbarLayout.find(i => i.id === item.payload.itemId);
            if (itemToEdit) openCustomizerEditLinkDialog(itemToEdit);
          }
        } else if (item.action === 'customize-toolbar') {
          if (isToolbarCustomizing) stopToolbarCustomizing(true);
          else startToolbarCustomizing();
        } else if (item.action === 'remove-item') {
          if (item.payload && item.payload.itemId) {
            activeToolbarLayout = activeToolbarLayout.filter(i => i.id !== item.payload.itemId);
            saveToolbarState();
            renderToolbarCustomizable();
            if (isToolbarCustomizing) renderCustomizerWorkspace();
          }
        } else if (item.action === 'reset-toolbar') {
          activeToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS));
          saveToolbarState();
          renderToolbarCustomizable();
          if (isToolbarCustomizing) renderCustomizerWorkspace();
        }
        contextMenu.classList.add('hidden');
      });
      contextMenu.appendChild(btn);
    });
    contextMenu.classList.remove('hidden');
    let x = e.clientX;
    let y = e.clientY;
    const rect = contextMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 10) x = Math.max(10, window.innerWidth - rect.width - 10);
    if (y + rect.height > window.innerHeight - 10) y = Math.max(10, window.innerHeight - rect.height - 10);
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
  });
}

// Global click to dismiss folder dropdowns
document.addEventListener('click', (e) => {
  if (!e.target.closest('.toolbar-folder-group')) {
    document.querySelectorAll('.toolbar-folder-dropdown').forEach(d => d.classList.add('hidden'));
  }
});

// Context menu action dispatch receiver
if (window.naptureAPI && window.naptureAPI.onTabContextMenuAction) {
  window.naptureAPI.onTabContextMenuAction((action, payload) => {
    if (action === 'edit-custom-site') {
      if (payload && payload.itemId) {
        const itemToEdit = activeToolbarLayout.find(i => i.id === payload.itemId);
        if (itemToEdit) openCustomizerEditLinkDialog(itemToEdit);
      }
    } else if (action === 'customize-toolbar') {
      if (isToolbarCustomizing) {
        stopToolbarCustomizing(true);
      } else {
        startToolbarCustomizing();
      }
    } else if (action === 'remove-item') {
      if (payload && payload.itemId) {
        activeToolbarLayout = activeToolbarLayout.filter(i => i.id !== payload.itemId);
        saveToolbarState();
        renderToolbarCustomizable();
        if (isToolbarCustomizing) renderCustomizerWorkspace();
      }
    } else if (action === 'reset-toolbar') {
      activeToolbarLayout = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_LAYOUT_ITEMS));
      saveToolbarState();
      renderToolbarCustomizable();
      if (isToolbarCustomizing) renderCustomizerWorkspace();
    }
  });
}

// IPC Listener to start toolbar customize from Settings or brand menu
if (window.naptureAPI && window.naptureAPI.onStartToolbarCustomize) {
  window.naptureAPI.onStartToolbarCustomize(() => {
    startToolbarCustomizing();
  });
}

// IPC Listener for toolbar folder dropdown items (renders over WebContentsViews)
if (window.naptureAPI && window.naptureAPI.onToolbarFolderItemClicked) {
  window.naptureAPI.onToolbarFolderItemClicked((child) => {
    if (!child || isToolbarCustomizing) return;
    if (child.url) {
      if (typeof createTab === 'function') createTab(child.url, true);
      else if (window.naptureAPI && window.naptureAPI.navigate) window.naptureAPI.navigate(child.url);
    } else if (child.id === 'back-btn') {
      if (window.naptureAPI && window.naptureAPI.goBack) window.naptureAPI.goBack();
    } else if (child.id === 'forward-btn') {
      if (window.naptureAPI && window.naptureAPI.goForward) window.naptureAPI.goForward();
    } else if (child.id === 'reload-btn') {
      if (window.naptureAPI && window.naptureAPI.reload) window.naptureAPI.reload();
    } else if (child.id === 'home-btn') {
      const homeUrl = (currentSettings && currentSettings.homeUrl) || 'napture://welcome';
      if (window.naptureAPI && window.naptureAPI.navigate) window.naptureAPI.navigate(homeUrl);
    }
  });
}

// Render and manage dynamic sidebar bottom buttons
function renderSidebarBottom() {
  const sidebarBottom = document.getElementById('sidebar-bottom');
  if (!sidebarBottom) return;

  sidebarBottom.innerHTML = '';

  if (isToolbarCustomizing) {
    sidebarBottom.classList.toggle('is-full', activeSidebarBottomLayout.length >= 3);

    sidebarBottom.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = (activeSidebarBottomLayout.length >= 3 && draggedSidebarIdx === null) ? 'none' : 'move';
    };

    sidebarBottom.ondrop = (e) => {
      if (e.target === sidebarBottom || !e.target.closest('.sidebar-bottom-item-wrapper')) {
        e.preventDefault();
        const wrappers = Array.from(sidebarBottom.querySelectorAll('.sidebar-bottom-item-wrapper'));
        let targetIdx = wrappers.length;
        for (let i = 0; i < wrappers.length; i++) {
          const rect = wrappers[i].getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) {
            targetIdx = i;
            break;
          }
        }
        handleSidebarBottomInsert(targetIdx);
      }
    };
  } else {
    sidebarBottom.ondragover = null;
    sidebarBottom.ondrop = null;
    sidebarBottom.classList.remove('is-full');
  }

  activeSidebarBottomLayout.forEach((item, index) => {
    if (item.enabled === false) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'sidebar-bottom-item-wrapper';
    wrapper.dataset.id = item.id;
    wrapper.dataset.type = item.type || 'system';
    wrapper.dataset.index = index;

    if (isToolbarCustomizing) {
      wrapper.setAttribute('draggable', 'true');
      wrapper.title = 'Drag to reorder, drag to top bar, or drag to palette to remove';

      wrapper.addEventListener('dragstart', (e) => {
        draggedSidebarIdx = index;
        draggedTopBarIdx = null;
        draggedPaletteItem = null;
        wrapper.classList.add('dragging');
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'all';
      });

      wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
        draggedSidebarIdx = null;
      });

      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      });

      wrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = wrapper.getBoundingClientRect();
        const isLeft = (e.clientX - rect.left) < (rect.width / 2);
        const targetIdx = isLeft ? index : index + 1;
        handleSidebarBottomInsert(targetIdx);
      });
    }

    const btn = document.createElement('button');
    btn.className = 'sidebar-action-btn';
    btn.id = item.id;
    btn.setAttribute('aria-label', item.name || item.id);

    if (item.id === 'downloads-btn') {
      btn.title = 'Recent Downloads';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      `;
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        toggleOmnibarDownloadsPopup(btn);
      });
    } else if (item.id === 'history-btn') {
      btn.title = 'Browsing History';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      `;
      btn.addEventListener('click', (e) => {
        if (isToolbarCustomizing) return;
        e.stopPropagation();
        toggleOmnibarHistoryPopup(btn);
      });
    } else if (item.id === 'newtab-btn' || item.id === 'new-tab-btn') {
      btn.id = 'new-tab-btn';
      btn.title = 'New Tab';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      `;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        if (typeof createTab === 'function') createTab('napture://welcome');
      });
    } else if (item.id === 'home-btn') {
      btn.title = 'Home';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        const homeUrl = (currentSettings && currentSettings.homeUrl) || 'napture://welcome';
        if (window.naptureAPI && window.naptureAPI.navigate) window.naptureAPI.navigate(homeUrl);
      });
    } else if (item.id === 'back-btn') {
      btn.title = 'Back';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        if (window.naptureAPI && window.naptureAPI.goBack) window.naptureAPI.goBack();
      });
    } else if (item.id === 'forward-btn') {
      btn.title = 'Forward';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        if (window.naptureAPI && window.naptureAPI.goForward) window.naptureAPI.goForward();
      });
    } else if (item.id === 'reload-btn') {
      btn.title = 'Reload';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        if (window.naptureAPI && window.naptureAPI.reload) window.naptureAPI.reload();
      });
    } else if (item.id === 'bookmarks-btn') {
      btn.title = 'Bookmarks';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
      });
    } else if (item.type === 'link') {
      btn.title = item.name || 'Link';
      const favUrl = item.favicon || getFaviconForUrl(item.url);
      if (favUrl) {
        btn.innerHTML = `<img src="${escapeHtml(favUrl)}" width="16" height="16" alt="" onerror="this.style.display='none';">`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      }
      btn.addEventListener('click', () => {
        if (isToolbarCustomizing) return;
        if (typeof createTab === 'function') createTab(item.url, true);
        else if (window.naptureAPI && window.naptureAPI.navigate) window.naptureAPI.navigate(item.url);
      });
    } else if (item.type === 'separator') {
      btn.className = 'sidebar-separator';
      btn.style.width = '1px';
      btn.style.height = '24px';
      btn.style.background = 'var(--border-subtle, rgba(255,255,255,0.1))';
      btn.style.margin = '0 4px';
    } else if (item.type === 'margin') {
      btn.className = 'sidebar-spacer';
      btn.style.flex = '1';
      btn.style.minWidth = '8px';
      btn.style.background = 'transparent';
      btn.style.border = 'none';
    }

    wrapper.appendChild(btn);
    sidebarBottom.appendChild(wrapper);
  });

  if (isToolbarCustomizing) {
    const emptyCount = 3 - activeSidebarBottomLayout.length;
    for (let i = 0; i < emptyCount; i++) {
      const slot = document.createElement('div');
      slot.className = 'sidebar-bottom-slot-empty';
      slot.title = 'Available sidebar button slot (max 3 buttons)';
      slot.innerHTML = '<span style="opacity: 0.5;">+</span>';

      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('dragover');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('dragover');
      });

      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('dragover');
        handleSidebarBottomInsert(activeSidebarBottomLayout.length);
      });

      sidebarBottom.appendChild(slot);
    }
  }
}

// Firefox-Style Omnibar Popups
function toggleOmnibarDownloadsPopup(btn) {
  let targetBtn = btn;
  if (!targetBtn || (targetBtn.getBoundingClientRect && targetBtn.getBoundingClientRect().width === 0)) {
    targetBtn = document.getElementById('toolbar-downloads-btn') || document.getElementById('downloads-btn') || btn;
  }
  if (window.naptureAPI && window.naptureAPI.toggleOmnibarPopup && targetBtn) {
    const rect = targetBtn.getBoundingClientRect();
    window.naptureAPI.toggleOmnibarPopup({
      type: 'downloads',
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      }
    });
    return;
  }
  const popup = document.getElementById('omnibar-downloads-popup');
  if (!popup) return;
  const isHidden = popup.classList.contains('hidden');
  closeAllPopups(popup);
  if (isHidden) {
    const activeBtn = targetBtn || btn;
    if (activeBtn) {
      const rect = activeBtn.getBoundingClientRect();
      popup.style.top = `${Math.round(rect.bottom + 6)}px`;
      const rightOffset = Math.max(8, window.innerWidth - rect.right);
      popup.style.right = `${Math.round(rightOffset)}px`;
      popup.style.left = 'auto';
    }
    popup.classList.remove('hidden');
    updateOmnibarDownloadsUI();
  } else {
    popup.classList.add('hidden');
  }
}

async function updateOmnibarDownloadsUI() {
  if (!window.naptureAPI || !window.naptureAPI.getRecentDownloads) return;
  const history = await window.naptureAPI.getRecentDownloads();
  renderOmnibarDownloadsList(history);
}

function renderOmnibarDownloadsList(items) {
  const listEl = document.getElementById('omnibar-downloads-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || items.length === 0) {
    listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #9ca3af; font-size: 12.5px;">No recent downloads</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'omnibar-download-item';

    const safeName = escapeHtml(item.name || 'download');

    let metaText = '';
    let metaClass = 'omnibar-download-meta';
    if (!item.completed && !item.cancelled) {
      metaText = item.timeStr || (item.progress !== undefined ? `${item.progress}%` : 'Downloading...');
    } else if (item.cancelled) {
      metaText = 'File moved or missing';
      metaClass += ' missing';
    } else {
      metaText = item.sizeStr ? `Completed — ${item.sizeStr}` : 'Completed';
    }

    let progressHtml = '';
    if (!item.completed && !item.cancelled && item.progress !== undefined) {
      progressHtml = `
        <div class="download-progress-bar" style="margin-top: 4px;">
          <div class="download-progress-fill" style="width: ${item.progress}%"></div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="omnibar-download-icon-badge" title="${safeName}">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <polyline points="9 15 12 18 15 15"></polyline>
        </svg>
      </div>
      <div class="omnibar-download-info">
        <div class="omnibar-download-name" title="${safeName}">${safeName}</div>
        <div class="${metaClass}">${escapeHtml(metaText)}</div>
        ${progressHtml}
      </div>
      <button class="omnibar-download-action-btn" title="Show in folder" aria-label="Show in folder">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
    `;

    const folderBtn = el.querySelector('.omnibar-download-action-btn');
    if (folderBtn) {
      folderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.naptureAPI && window.naptureAPI.showDownloadedFileInFolder) {
          window.naptureAPI.showDownloadedFileInFolder(item);
        } else if (window.naptureAPI && window.naptureAPI.openDownloadedFile) {
          window.naptureAPI.openDownloadedFile(item);
        }
      });
    }

    el.addEventListener('click', () => {
      const popup = document.getElementById('omnibar-downloads-popup');
      if (popup) popup.classList.add('hidden');
      if (window.naptureAPI && window.naptureAPI.openDownloadedFile) {
        window.naptureAPI.openDownloadedFile(item);
      }
    });

    fragment.appendChild(el);
  });

  listEl.appendChild(fragment);
}

function toggleOmnibarHistoryPopup(btn) {
  let targetBtn = btn;
  if (!targetBtn || (targetBtn.getBoundingClientRect && targetBtn.getBoundingClientRect().width === 0)) {
    targetBtn = document.getElementById('toolbar-history-btn') || document.getElementById('history-btn') || btn;
  }
  if (window.naptureAPI && window.naptureAPI.toggleOmnibarPopup && targetBtn) {
    const rect = targetBtn.getBoundingClientRect();
    window.naptureAPI.toggleOmnibarPopup({
      type: 'history',
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      }
    });
    return;
  }
  const popup = document.getElementById('omnibar-history-popup');
  if (!popup) return;
  const isHidden = popup.classList.contains('hidden');
  closeAllPopups(popup);
  if (isHidden) {
    const activeBtn = targetBtn || btn;
    if (activeBtn) {
      const rect = activeBtn.getBoundingClientRect();
      popup.style.top = `${Math.round(rect.bottom + 6)}px`;
      const rightOffset = Math.max(8, window.innerWidth - rect.right);
      popup.style.right = `${Math.round(rightOffset)}px`;
      popup.style.left = 'auto';
    }
    popup.classList.remove('hidden');
    const searchInput = document.getElementById('omnibar-history-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    updateOmnibarHistoryUI();
  } else {
    popup.classList.add('hidden');
  }
}

let allOmnibarHistory = [];

async function updateOmnibarHistoryUI() {
  if (!window.naptureAPI || !window.naptureAPI.getHistory) return;
  allOmnibarHistory = await window.naptureAPI.getHistory();
  renderOmnibarHistoryList(allOmnibarHistory);
}

function renderOmnibarHistoryList(items) {
  const listEl = document.getElementById('omnibar-history-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const recents = (items || []).slice(0, 15);
  if (recents.length === 0) {
    listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #9ca3af; font-size: 12.5px;">No browsing history</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  recents.forEach(item => {
    const el = document.createElement('div');
    el.className = 'omnibar-history-item';

    const safeTitle = escapeHtml(item.title || item.url || 'Untitled');
    const safeUrl = escapeHtml(item.url || '');
    const favUrl = item.favicon || getFaviconForUrl(item.url);

    let favHtml = '<svg class="omnibar-history-favicon" viewBox="0 0 24 24" width="16" height="16" stroke="#9ca3af" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    if (favUrl) {
      favHtml = `<img src="${escapeHtml(favUrl)}" class="omnibar-history-favicon" width="16" height="16" alt="" onerror="this.outerHTML='${escapeHtml(favHtml)}'">`;
    }

    let timeDisplay = '';
    if (item.timestamp) {
      try {
        const d = new Date(item.timestamp);
        timeDisplay = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }

    el.innerHTML = `
      ${favHtml}
      <div class="omnibar-history-title" title="${safeTitle} (${safeUrl})">${safeTitle}</div>
      ${timeDisplay ? `<span class="omnibar-history-time">${escapeHtml(timeDisplay)}</span>` : ''}
    `;

    el.addEventListener('click', () => {
      const popup = document.getElementById('omnibar-history-popup');
      if (popup) popup.classList.add('hidden');
      if (typeof createTab === 'function') {
        createTab(item.url, true);
      } else if (window.naptureAPI && window.naptureAPI.navigate) {
        window.naptureAPI.navigate(item.url);
      }
    });

    fragment.appendChild(el);
  });

  listEl.appendChild(fragment);
}

// Wire omnibar search & footer buttons
const omnibarHistorySearch = document.getElementById('omnibar-history-search-input');
if (omnibarHistorySearch) {
  omnibarHistorySearch.addEventListener('input', (e) => {
    const q = (e.target.value || '').toLowerCase().trim();
    if (!q) {
      renderOmnibarHistoryList(allOmnibarHistory);
      return;
    }
    const filtered = (allOmnibarHistory || []).filter(h => {
      return (h.title && h.title.toLowerCase().includes(q)) || (h.url && h.url.toLowerCase().includes(q));
    });
    renderOmnibarHistoryList(filtered);
  });
}

const omnibarDownloadsShowAll = document.getElementById('omnibar-downloads-show-all');
if (omnibarDownloadsShowAll) {
  omnibarDownloadsShowAll.addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = document.getElementById('omnibar-downloads-popup');
    if (popup) popup.classList.add('hidden');
    if (typeof openInternalPage === 'function') {
      openInternalPage('napture://downloads', 'Downloads');
    } else if (typeof createTab === 'function') {
      createTab('napture://downloads', true);
    }
  });
}

const omnibarHistoryShowAll = document.getElementById('omnibar-history-show-all');
if (omnibarHistoryShowAll) {
  omnibarHistoryShowAll.addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = document.getElementById('omnibar-history-popup');
    if (popup) popup.classList.add('hidden');
    if (typeof openInternalPage === 'function') {
      openInternalPage('napture://history', 'History');
    } else if (typeof createTab === 'function') {
      createTab('napture://history', true);
    }
  });
}

// Global click outside listener to dismiss omnibar popups
document.addEventListener('click', (e) => {
  if (window.naptureAPI && window.naptureAPI.hideOmnibarPopup) {
    if (!e.target.closest('#toolbar-downloads-btn') && !e.target.closest('#downloads-btn') && !e.target.closest('#toolbar-history-btn') && !e.target.closest('#history-btn')) {
      window.naptureAPI.hideOmnibarPopup();
    }
  }

  const omnibarDownloadsPopup = document.getElementById('omnibar-downloads-popup');
  const omnibarHistoryPopup = document.getElementById('omnibar-history-popup');

  if (omnibarDownloadsPopup && !omnibarDownloadsPopup.classList.contains('hidden')) {
    if (!e.target.closest('#omnibar-downloads-popup') && !e.target.closest('#toolbar-downloads-btn') && !e.target.closest('#downloads-btn')) {
      omnibarDownloadsPopup.classList.add('hidden');
    }
  }

  if (omnibarHistoryPopup && !omnibarHistoryPopup.classList.contains('hidden')) {
    if (!e.target.closest('#omnibar-history-popup') && !e.target.closest('#toolbar-history-btn') && !e.target.closest('#history-btn')) {
      omnibarHistoryPopup.classList.add('hidden');
    }
  }
});

// Handle actions dispatched from the native omnibar overlay popup
if (window.naptureAPI && window.naptureAPI.onOmnibarPopupAction) {
  window.naptureAPI.onOmnibarPopupAction(({ action, data }) => {
    if (action === 'open-url' && data && data.url) {
      if (data.url.startsWith('napture://') && typeof openInternalPage === 'function') {
        const pageName = data.url.replace('napture://', '');
        const title = pageName.charAt(0).toUpperCase() + pageName.slice(1);
        openInternalPage(data.url, title);
      } else if (typeof createTab === 'function') {
        createTab(data.url, true);
      } else if (window.naptureAPI.navigate) {
        window.naptureAPI.navigate(data.url);
      }
    } else if (action === 'open-file' && data) {
      if (window.naptureAPI.openDownloadedFile) {
        window.naptureAPI.openDownloadedFile(data);
      }
    } else if (action === 'show-in-folder' && data) {
      if (window.naptureAPI.showDownloadedFileInFolder) {
        window.naptureAPI.showDownloadedFileInFolder(data);
      } else if (window.naptureAPI.openDownloadedFile) {
        window.naptureAPI.openDownloadedFile(data);
      }
    }
  });
}

// Initialize toolbar and sidebar bottom on load
loadToolbarState();
loadSidebarBottomState();
renderToolbarCustomizable();
renderSidebarBottom();

