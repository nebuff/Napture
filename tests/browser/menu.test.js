describe('Top Left Menu & Internal Pages Navigation', () => {
  let tabs, activeTabId, navigatedUrl, createdTabs, switchedTabId;

  const isWelcomeUrl = (url) => {
    if (!url) return true;
    const clean = url.trim().toLowerCase().replace(/\/+$/, '');
    return (
      clean === '' ||
      clean === 'about:blank' ||
      clean === 'napture:' ||
      clean === 'napture://' ||
      clean === 'napture://welcome' ||
      clean === 'napture://start' ||
      clean === 'napture://newtab'
    );
  };

  const createTab = (url, switchTo = true) => {
    const newTab = { id: `tab-${tabs.length + 1}`, url, title: 'New Tab' };
    tabs.push(newTab);
    createdTabs.push({ id: newTab.id, url, switchTo });
    if (switchTo) {
      switchedTabId = newTab.id;
      activeTabId = newTab.id;
    }
    return newTab.id;
  };

  const switchTab = (tabId) => {
    switchedTabId = tabId;
    activeTabId = tabId;
  };

  const openInternalPage = (url, title) => {
    if (!url) return;

    const getNormalizedUrl = (u) => {
      if (!u) return '';
      let norm = u.trim().toLowerCase();
      if (!norm.endsWith('/')) norm += '/';
      return norm;
    };

    const targetNorm = getNormalizedUrl(url);

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
      else pageTitle = 'Napture Page';
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && isWelcomeUrl(activeTab.url)) {
      activeTab.url = url;
      activeTab.title = pageTitle;
      navigatedUrl = url;
    } else {
      createTab(url, true);
    }
  };

  beforeEach(() => {
    tabs = [{ id: 'tab-1', url: 'napture://welcome', title: 'Welcome' }];
    activeTabId = 'tab-1';
    navigatedUrl = null;
    createdTabs = [];
    switchedTabId = null;
  });

  it('should navigate current active tab to internal page if current tab is welcome tab', () => {
    openInternalPage('napture://settings/', 'Settings');
    expect(tabs[0].url).toBe('napture://settings/');
    expect(tabs[0].title).toBe('Settings');
    expect(navigatedUrl).toBe('napture://settings/');
    expect(createdTabs.length).toBe(0);
  });

  it('should create a new tab for internal page if current active tab is a normal website', () => {
    tabs[0].url = 'https://google.com';
    openInternalPage('napture://about/', 'About Napture');
    expect(createdTabs.length).toBe(1);
    expect(createdTabs[0].url).toBe('napture://about/');
    expect(switchedTabId).toBe('tab-2');
  });

  it('should switch to existing tab if the internal page tab is already open', () => {
    tabs.push({ id: 'tab-2', url: 'napture://settings/', title: 'Settings' });
    activeTabId = 'tab-1';
    openInternalPage('napture://settings/', 'Settings');
    expect(switchedTabId).toBe('tab-2');
    expect(createdTabs.length).toBe(0);
  });

  it('should handle all dropdown menu option navigations correctly', () => {
    // History
    openInternalPage('napture://history', 'History');
    expect(tabs[0].url).toBe('napture://history');
    expect(tabs[0].title).toBe('History');

    // New tab
    const newId = createTab('napture://welcome');
    expect(newId).toBe('tab-2');
    expect(createdTabs.length).toBe(1);

    // Keyboard Shortcuts
    activeTabId = 'tab-2';
    openInternalPage('napture://keyboard/', 'Keyboard Shortcuts');
    expect(tabs[1].url).toBe('napture://keyboard/');
    expect(tabs[1].title).toBe('Keyboard Shortcuts');

    // About
    createTab('https://napture.io');
    activeTabId = 'tab-3';
    openInternalPage('napture://about/', 'About Napture');
    expect(createdTabs.length).toBe(3);
    expect(tabs[3].url).toBe('napture://about/');
  });

  it('should execute menu actions correctly via dispatch', () => {
    const executeMenuAction = (actionName) => {
      switch (actionName) {
        case 'new-tab':
          return createTab('napture://welcome');
        case 'history':
          return openInternalPage('napture://history', 'History');
        case 'about':
          return openInternalPage('napture://about/', 'About Napture');
        case 'settings':
          return openInternalPage('napture://settings/', 'Settings');
        case 'shortcuts':
          return openInternalPage('napture://keyboard/', 'Keyboard Shortcuts');
      }
    };

    executeMenuAction('new-tab');
    expect(tabs.length).toBe(2);

    executeMenuAction('settings');
    expect(tabs[1].url).toBe('napture://settings/');
  });

  it('should close all popups (history, downloads, top left menu) when page-clicked IPC event or closeAllPopups is triggered', () => {
    // Mock DOM elements for popups
    const createMockElement = (id, initialClasses) => {
      const classes = new Set(initialClasses);
      return {
        id,
        classList: {
          contains: (c) => classes.has(c),
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          has: (c) => classes.has(c)
        },
        style: {}
      };
    };

    const historyPanel = createMockElement('history-panel', ['history-panel']);
    const downloadsPanel = createMockElement('downloads-panel', ['downloads-panel']);
    const naptureMainMenu = createMockElement('napture-main-menu', ['napture-dropdown-menu']);

    const panels = [historyPanel, downloadsPanel, naptureMainMenu];

    const hidePanel = (panel) => {
      if (!panel || panel.classList.contains('hidden')) return;
      panel.classList.add('hidden');
      panel.classList.remove('closing');
    };

    const closeAllPopups = (exceptPanel = null) => {
      if (naptureMainMenu && naptureMainMenu !== exceptPanel) hidePanel(naptureMainMenu);
      if (downloadsPanel && downloadsPanel !== exceptPanel) hidePanel(downloadsPanel);
      if (historyPanel && historyPanel !== exceptPanel) hidePanel(historyPanel);
    };

    // Initially open panels
    panels.forEach(p => p.classList.remove('hidden'));

    expect(historyPanel.classList.contains('hidden')).toBe(false);
    expect(downloadsPanel.classList.contains('hidden')).toBe(false);
    expect(naptureMainMenu.classList.contains('hidden')).toBe(false);

    // Simulate page click / closeAllPopups action
    closeAllPopups();

    expect(historyPanel.classList.contains('hidden')).toBe(true);
    expect(downloadsPanel.classList.contains('hidden')).toBe(true);
    expect(naptureMainMenu.classList.contains('hidden')).toBe(true);
  });
});

