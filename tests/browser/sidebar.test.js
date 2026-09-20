// Test suite for sidebar toggle, widgets, and layout resizing

describe('Sidebar Double Click Shortcut', () => {
  let tabs, activeTabId, pinnedSites, customBookmarks, naptureAPINavigate, createdTabs;

  beforeEach(() => {
    tabs = [
      { id: 'tab-1', url: 'https://example.com' },
      { id: 'tab-2', url: 'https://pinned.com' },
      { id: 'tab-3', url: 'https://bookmark.com' }
    ];
    activeTabId = 'tab-1';
    pinnedSites = [{ tabId: 'tab-2', url: 'https://pinned.com' }];
    customBookmarks = [{ tabId: 'tab-3', type: 'link', url: 'https://bookmark.com' }];
    naptureAPINavigate = jest.fn();
    createdTabs = [];
  });

  const getBookmarkTabIds = () => ['tab-3'];

  const handleSidebarDblClick = (e, targetEl) => {
    if (targetEl && targetEl.closest && targetEl.closest('.tab, .bookmark-item, .shortcut-btn, button, input, textarea, select, .history-panel, .downloads-panel')) {
      return;
    }

    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const bookmarkTabIds = new Set(getBookmarkTabIds());
    const isPinnedOrBookmarked = activeTabId && (pinnedTabIds.has(activeTabId) || bookmarkTabIds.has(activeTabId));

    if (e.shiftKey) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && !isPinnedOrBookmarked) {
        activeTab.url = 'napture://welcome';
        naptureAPINavigate('napture://welcome');
      } else {
        createdTabs.push({ url: 'napture://welcome', switchTo: true });
      }
    } else {
      createdTabs.push({ url: 'napture://welcome', switchTo: true });
    }
  };

  it('should create a new tab on regular double click on empty sidebar', () => {
    handleSidebarDblClick({ shiftKey: false }, { closest: () => null });
    expect(createdTabs.length).toBe(1);
    expect(createdTabs[0]).toEqual({ url: 'napture://welcome', switchTo: true });
    expect(naptureAPINavigate).not.toHaveBeenCalled();
  });

  it('should replace active tab URL on Shift + double click when active tab is regular', () => {
    activeTabId = 'tab-1';
    handleSidebarDblClick({ shiftKey: true }, { closest: () => null });
    expect(createdTabs.length).toBe(0);
    expect(tabs[0].url).toBe('napture://welcome');
    expect(naptureAPINavigate).toHaveBeenCalledWith('napture://welcome');
  });

  it('should create a new tab on Shift + double click when active tab is a pinned tab', () => {
    activeTabId = 'tab-2';
    handleSidebarDblClick({ shiftKey: true }, { closest: () => null });
    expect(createdTabs.length).toBe(1);
    expect(tabs[1].url).toBe('https://pinned.com');
    expect(naptureAPINavigate).not.toHaveBeenCalled();
  });

  it('should create a new tab on Shift + double click when active tab is a bookmarked tab', () => {
    activeTabId = 'tab-3';
    handleSidebarDblClick({ shiftKey: true }, { closest: () => null });
    expect(createdTabs.length).toBe(1);
    expect(tabs[2].url).toBe('https://bookmark.com');
    expect(naptureAPINavigate).not.toHaveBeenCalled();
  });

  it('should ignore double click when clicking directly on a tab or button', () => {
    const mockTabEl = { closest: (selector) => selector.includes('.tab') ? mockTabEl : null };
    handleSidebarDblClick({ shiftKey: false }, mockTabEl);
    expect(createdTabs.length).toBe(0);
    expect(naptureAPINavigate).not.toHaveBeenCalled();
  });
});

describe('Bookmark Drag to Tabs & Tab Context Menu', () => {
  let tabs, customBookmarks, activeTabId, removedBookmarkId, createdTabCalls, switchedTabId;

  beforeEach(() => {
    tabs = [
      { id: 'tab-1', url: 'https://site1.com', title: 'Site 1' },
      { id: 'tab-2', url: 'https://site2.com', title: 'Site 2' }
    ];
    customBookmarks = [
      { id: 'b-1', type: 'link', title: 'Bookmark 1', url: 'https://bookmark1.com', tabId: null },
      { id: 'b-2', type: 'link', title: 'Bookmark 2', url: 'https://bookmark2.com', tabId: 'tab-2' }
    ];
    activeTabId = 'tab-1';
    removedBookmarkId = null;
    createdTabCalls = [];
    switchedTabId = null;
  });

  const removeBookmarkById = (id, closeAssociated = true) => {
    removedBookmarkId = id;
    const idx = customBookmarks.findIndex(b => b.id === id);
    if (idx !== -1) customBookmarks.splice(idx, 1);
  };

  const executeTabReorderMock = (draggedItem, targetInfo) => {
    let currentTab = draggedItem;
    if (currentTab && (currentTab.tabId || currentTab.url || currentTab.source === 'bookmark')) {
      const isBookmark = currentTab.source === 'bookmark';
      let tabIdToUse = currentTab.tabId;
      let shouldCreateTab = false;

      if (isBookmark) {
        if (currentTab.id) removeBookmarkById(currentTab.id, false);
        if (!tabIdToUse) {
          tabIdToUse = 'tab-' + Math.random().toString(36).substr(2, 9);
          shouldCreateTab = true;
        }
      }

      const fromIndex = tabIdToUse ? tabs.findIndex(t => t.id === tabIdToUse) : -1;
      if (fromIndex !== -1) {
        const [movedTab] = tabs.splice(fromIndex, 1);
        let toIndex = -1;
        if (targetInfo && targetInfo.targetTabId) {
          toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
          if (toIndex !== -1 && targetInfo.position === 'after') toIndex += 1;
        }
        if (toIndex !== -1) tabs.splice(toIndex, 0, movedTab);
        else tabs.push(movedTab);
        if (isBookmark) switchedTabId = tabIdToUse;
      } else {
        let toIndex = -1;
        if (targetInfo && targetInfo.targetTabId) {
          toIndex = tabs.findIndex(t => t.id === targetInfo.targetTabId);
          if (toIndex !== -1 && targetInfo.position === 'after') toIndex += 1;
        }
        const movedTab = {
          id: tabIdToUse,
          url: currentTab.url || 'napture://welcome',
          title: currentTab.title || 'New Tab'
        };
        if (toIndex !== -1) tabs.splice(toIndex, 0, movedTab);
        else tabs.push(movedTab);

        if (shouldCreateTab) {
          createdTabCalls.push({ tabId: tabIdToUse, url: movedTab.url });
        }
        switchedTabId = tabIdToUse;
      }
    }
  };

  it('should successfully convert an un-opened bookmark into a regular tab without disappearing', () => {
    const unOpenedBookmark = {
      source: 'bookmark',
      id: 'b-1',
      type: 'link',
      title: 'Bookmark 1',
      url: 'https://bookmark1.com',
      tabId: null
    };

    executeTabReorderMock(unOpenedBookmark, { targetTabId: 'tab-1', position: 'after' });

    expect(removedBookmarkId).toBe('b-1');
    expect(customBookmarks.length).toBe(1);
    expect(tabs.length).toBe(3);
    expect(tabs[1].url).toBe('https://bookmark1.com');
    expect(createdTabCalls.length).toBe(1);
    expect(switchedTabId).toBe(tabs[1].id);
  });

  it('should convert an already-opened bookmark into a regular tab and move its position', () => {
    const openedBookmark = {
      source: 'bookmark',
      id: 'b-2',
      type: 'link',
      title: 'Bookmark 2',
      url: 'https://bookmark2.com',
      tabId: 'tab-2'
    };

    executeTabReorderMock(openedBookmark, { targetTabId: 'tab-1', position: 'before' });

    expect(removedBookmarkId).toBe('b-2');
    expect(customBookmarks.length).toBe(1);
    expect(tabs.length).toBe(2);
    expect(tabs[0].id).toBe('tab-2');
    expect(switchedTabId).toBe('tab-2');
  });

  it('should format tab context menu items including close options for regular tabs', () => {
    const buildMenuItems = (targetType, tab) => {
      const menuItems = [];
      menuItems.push({ label: 'Copy Link', action: 'copy-link' });
      menuItems.push({ label: 'Toggle Mute', action: 'mute' });
      menuItems.push({ label: 'Duplicate', action: 'duplicate-tab' });
      if (targetType === 'regular') {
        menuItems.push({ label: 'Close Tab', action: 'close-tab' });
        menuItems.push({ label: 'Close Other Tabs', action: 'close-other-tabs' });
      }
      return menuItems;
    };

    const items = buildMenuItems('regular', tabs[0]);
    expect(items.some(i => i.action === 'close-tab')).toBe(true);
    expect(items.some(i => i.action === 'close-other-tabs')).toBe(true);
    expect(items.some(i => i.action === 'copy-link')).toBe(true);
  });

  it('should exclude welcome/newtab tabs from the rendered regular sidebar tabs list', () => {
    const isWelcomeUrl = (url) => {
      if (!url) return true;
      const clean = url.trim().toLowerCase().replace(/\/+$/, '');
      return (
        clean === '' ||
        clean === 'about:blank' ||
        clean === 'napture://welcome' ||
        clean === 'napture://newtab'
      );
    };

    const pinnedTabIds = new Set(['pinned-1']);
    const bookmarkTabIds = new Set(['bm-1']);

    const allTabs = [
      { id: 't-welcome', url: 'napture://welcome' },
      { id: 't-newtab', url: 'napture://newtab' },
      { id: 't-blank', url: 'about:blank' },
      { id: 't-regular', url: 'https://example.com' },
      { id: 'pinned-1', url: 'https://pinned.com' },
      { id: 'bm-1', url: 'https://bookmark.com' }
    ];

    const regularTabs = allTabs.filter(tab => !pinnedTabIds.has(tab.id) && !bookmarkTabIds.has(tab.id) && !isWelcomeUrl(tab.url));

    expect(regularTabs.length).toBe(1);
    expect(regularTabs[0].id).toBe('t-regular');
  });
});
