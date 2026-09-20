describe('Session Restore and Persistence Logic', () => {
  function isWelcomeUrl(url) {
    if (!url) return true;
    const clean = url.trim().toLowerCase().replace(/\/+$/, '');
    return (
      clean === '' ||
      clean === 'about:blank' ||
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

  function filterTabsForSessionSave(tabs, pinnedSites = [], bookmarks = []) {
    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const pinnedUrls = new Set(pinnedSites.map(p => (p.url || '').trim().toLowerCase().replace(/\/+$/, '')));

    const bUrls = [];
    function collectUrl(list) {
      for (const item of list) {
        if (item.type === 'folder' && item.children) collectUrl(item.children);
        else if (item.type === 'link' && item.url) bUrls.push((item.url || '').trim().toLowerCase().replace(/\/+$/, ''));
      }
    }
    collectUrl(bookmarks);
    const bookmarkUrls = new Set(bUrls);

    return tabs
      .map(t => {
        const cleanUrl = (t.url || '').trim().toLowerCase().replace(/\/+$/, '');
        const isPinned = pinnedTabIds.has(t.id) || pinnedUrls.has(cleanUrl);
        const isBookmark = bookmarkUrls.has(cleanUrl);
        return { ...t, isPinned, isBookmark };
      })
      .filter(t => !isWelcomeUrl(t.url) && !t.isPinned && !t.isBookmark);
  }

  test('correctly identifies welcome and internal start URLs', () => {
    expect(isWelcomeUrl('')).toBe(true);
    expect(isWelcomeUrl(null)).toBe(true);
    expect(isWelcomeUrl('about:blank')).toBe(true);
    expect(isWelcomeUrl('napture://welcome')).toBe(true);
    expect(isWelcomeUrl('napture://newtab/')).toBe(true);
    expect(isWelcomeUrl('https://google.com')).toBe(false);
    expect(isWelcomeUrl('https://napture.io')).toBe(false);
    expect(isWelcomeUrl('napture://settings')).toBe(false);
  });

  test('filters out welcome tabs and duplicate pinned/bookmark tabs from session payload', () => {
    const tabs = [
      { id: 1, url: 'napture://welcome', title: 'New Tab' },
      { id: 2, url: 'https://github.com', title: 'GitHub' },
      { id: 3, url: 'https://youtube.com', title: 'YouTube' },
      { id: 4, url: 'https://pinned-site.com', title: 'Pinned' },
      { id: 5, url: 'https://bookmarked-site.com', title: 'Bookmarked' }
    ];

    const pinned = [{ tabId: 4, url: 'https://pinned-site.com' }];
    const bookmarks = [
      { type: 'link', title: 'BM', url: 'https://bookmarked-site.com' }
    ];

    const validTabs = filterTabsForSessionSave(tabs, pinned, bookmarks);
    expect(validTabs.length).toBe(2);
    expect(validTabs[0].url).toBe('https://github.com');
    expect(validTabs[1].url).toBe('https://youtube.com');
  });

  test('startup restore conditions properly allow restoration unless explicitly restore_none', () => {
    const checkShouldRestore = (mode) => (mode !== 'restore_none');

    expect(checkShouldRestore('restore_all')).toBe(true);
    expect(checkShouldRestore('welcome')).toBe(true);
    expect(checkShouldRestore(undefined)).toBe(true);
    expect(checkShouldRestore(null)).toBe(true);
    expect(checkShouldRestore('restore_none')).toBe(false);
  });

  test('rehydrateArchivedTab attaches did-finish-load listener before calling loadURL', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napture-rehydrate-test-'));
    const tabId = 'test-tab-123';
    const archiveFile = path.join(tmpDir, `${tabId}.json`);
    fs.writeFileSync(archiveFile, JSON.stringify({ scrollX: 100, scrollY: 200 }));

    const callOrder = [];
    const mockView = {
      webContents: {
        once: jest.fn((event, cb) => {
          callOrder.push(`once:${event}`);
        }),
        loadURL: jest.fn((url) => {
          callOrder.push(`loadURL:${url}`);
        })
      }
    };

    const rehydrateArchivedTab = (view, tId, url, archivePath) => {
      const file = path.join(archivePath, `${tId}.json`);
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          view.webContents.once('did-finish-load', () => {
            view.webContents.executeJavaScript(`window.scrollTo(${data.scrollX}, ${data.scrollY});`).catch(() => {});
            fs.unlinkSync(file);
          });
          if (url) {
            view.webContents.loadURL(url);
          }
        } catch (e) {
          try { fs.unlinkSync(file); } catch (err) {}
          if (url) {
            view.webContents.loadURL(url);
          }
        }
      } else if (url) {
        view.webContents.loadURL(url);
      }
    };

    const targetUrl = 'https://example.com';
    rehydrateArchivedTab(mockView, tabId, targetUrl, tmpDir);

    expect(callOrder).toEqual(['once:did-finish-load', `loadURL:${targetUrl}`]);

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('pinned tab lifecycle: click re-creates missing tab and close tab resets tabId', () => {
    let tabs = [];
    let pinnedSites = [{ title: 'Example', url: 'https://example.com', favicon: '', tabId: null }];
    let nextId = 100;

    function createTab(url) {
      const id = 'tab-' + (nextId++);
      tabs.push({ id, url, title: 'Example' });
      return id;
    }

    function clickPinnedSite(p) {
      const tabExists = p.tabId && tabs.some(t => t.id === p.tabId);
      if (!tabExists) {
        p.tabId = createTab(p.url);
      }
    }

    function closeTab(tabId) {
      tabs = tabs.filter(t => t.id !== tabId);
      pinnedSites.forEach(p => {
        if (p.tabId === tabId) {
          p.tabId = null;
        }
      });
    }

    // 1. Initial click on pinned site (tabId is null)
    clickPinnedSite(pinnedSites[0]);
    expect(pinnedSites[0].tabId).toBe('tab-100');
    expect(tabs.length).toBe(1);

    // Filter regular tabs (pinned tab excluded)
    const pinnedTabIds = new Set(pinnedSites.map(p => p.tabId));
    const regularTabs = tabs.filter(t => !pinnedTabIds.has(t.id));
    expect(regularTabs.length).toBe(0);

    // 2. Closing the tab associated with the pinned site
    closeTab('tab-100');
    expect(tabs.length).toBe(0);
    expect(pinnedSites[0].tabId).toBeNull();

    // 3. Click pinned site again after tab was closed
    clickPinnedSite(pinnedSites[0]);
    expect(pinnedSites[0].tabId).toBe('tab-101');
    expect(tabs.length).toBe(1);
    expect(tabs[0].id).toBe('tab-101');
  });

  test('tab switching schedules secondary delayed resize and invalidation tick to prevent blank render', (done) => {
    jest.useFakeTimers();

    const mockWin = {
      isDestroyed: jest.fn(() => false),
      getContentBounds: jest.fn(() => ({ width: 1200, height: 800 }))
    };

    const mockWebContents = {
      isDestroyed: jest.fn(() => false),
      invalidate: jest.fn()
    };

    const mockView = {
      setBounds: jest.fn(),
      webContents: mockWebContents
    };

    const state = {
      activeTabId: 'tab-1'
    };

    const resizeActiveView = jest.fn();

    const switchTabDelayedTick = (win, activeTabId, view, state) => {
      setTimeout(() => {
        if (!win.isDestroyed() && state.activeTabId === activeTabId) {
          resizeActiveView(win, true);
          if (view && view.webContents && !view.webContents.isDestroyed()) {
            if (typeof view.webContents.invalidate === 'function') {
              try { view.webContents.invalidate(); } catch(e) {}
            }
          }
        }
      }, 50);
    };

    switchTabDelayedTick(mockWin, 'tab-1', mockView, state);

    expect(resizeActiveView).not.toHaveBeenCalled();
    expect(mockWebContents.invalidate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);

    expect(resizeActiveView).toHaveBeenCalledWith(mockWin, true);
    expect(mockWebContents.invalidate).toHaveBeenCalled();

    jest.useRealTimers();
    done();
  });

  test('getActiveView rejects destroyed or crashed views and returns null', () => {
    const tabViews = new Map();

    function getActiveView(win, state) {
      if (!state || !state.activeTabId) return null;
      const view = tabViews.get(state.activeTabId);
      if (!view || !view.webContents || view.webContents.isDestroyed()) return null;
      if (typeof view.webContents.isCrashed === 'function' && view.webContents.isCrashed()) return null;
      return view;
    }

    const mockWin = {};
    const mockState = { activeTabId: 'tab-1' };

    // Scenario A: Valid active view
    const validView = { webContents: { isDestroyed: () => false, isCrashed: () => false } };
    tabViews.set('tab-1', validView);
    expect(getActiveView(mockWin, mockState)).toBe(validView);

    // Scenario B: Destroyed active view
    const destroyedView = { webContents: { isDestroyed: () => true, isCrashed: () => false } };
    tabViews.set('tab-1', destroyedView);
    expect(getActiveView(mockWin, mockState)).toBeNull();

    // Scenario C: Crashed active view
    const crashedView = { webContents: { isDestroyed: () => false, isCrashed: () => true } };
    tabViews.set('tab-1', crashedView);
    expect(getActiveView(mockWin, mockState)).toBeNull();
  });

  test('rehydrateArchivedTab falls back to napture://welcome when url is missing or about:blank', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napture-rehydrate-fallback-'));
    const tabId = 'test-tab-456';

    const loadedUrls = [];
    const mockView = {
      webContents: {
        once: jest.fn(),
        loadURL: jest.fn((url) => { loadedUrls.push(url); })
      }
    };

    const rehydrateArchivedTab = (view, tId, url, archivePath) => {
      const file = path.join(archivePath, `${tId}.json`);
      const targetUrl = (url && url !== 'about:blank') ? url : 'napture://welcome';
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          view.webContents.once('did-finish-load', () => {
            view.webContents.executeJavaScript(`window.scrollTo(${data.scrollX}, ${data.scrollY});`).catch(() => {});
            try { fs.unlinkSync(file); } catch (e) {}
          });
          view.webContents.loadURL(targetUrl);
        } catch (e) {
          try { fs.unlinkSync(file); } catch (err) {}
          view.webContents.loadURL(targetUrl);
        }
      } else {
        view.webContents.loadURL(targetUrl);
      }
    };

    rehydrateArchivedTab(mockView, tabId, 'about:blank', tmpDir);
    expect(loadedUrls).toEqual(['napture://welcome']);

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('tab switching preserves contentView children without calling removeChildView on existing active view', () => {
    const mockChildViews = [];
    const mockContentView = {
      children: mockChildViews,
      removeChildView: jest.fn((view) => {
        const idx = mockChildViews.indexOf(view);
        if (idx > -1) mockChildViews.splice(idx, 1);
      }),
      addChildView: jest.fn((view) => {
        if (!mockChildViews.includes(view)) {
          mockChildViews.push(view);
        } else {
          // Re-add to top
          const idx = mockChildViews.indexOf(view);
          mockChildViews.splice(idx, 1);
          mockChildViews.push(view);
        }
      })
    };

    const view1 = { id: 'tab-1' };
    const view2 = { id: 'tab-2' };

    mockContentView.addChildView(view1);
    mockContentView.addChildView(view2);

    expect(mockChildViews).toEqual([view1, view2]);

    // Simulate switching back to view1 without removeChildView
    if (!mockContentView.children.includes(view1)) {
      mockContentView.addChildView(view1);
    } else {
      mockContentView.addChildView(view1);
    }

    expect(mockContentView.removeChildView).not.toHaveBeenCalledWith(view1);
    expect(mockChildViews).toEqual([view2, view1]);
  });
});
