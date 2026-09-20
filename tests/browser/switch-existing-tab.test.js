const path = require('path');
const i18n = require('../../napture/i18n');
const { buildSettingsPage, getDefaultSettings } = require('../../napture/settings-ui');
const { findBookmarkByUrl } = require('../../napture/renderer/bookmarks');

describe('Switch to Existing Tab or Bookmark - Settings & i18n', () => {
  it('includes switchToExistingTab: true in getDefaultSettings()', () => {
    const defaults = getDefaultSettings();
    expect(defaults.switchToExistingTab).toBe(true);
  });

  it('renders the toggle switch in Appearance & Features settings section', () => {
    const html = buildSettingsPage();
    expect(html).toContain('id="setting-switchToExistingTab"');
    expect(html).toContain('Switch to existing tab or bookmark');
    expect(html).toContain('Automatically switch to an open tab or bookmark');

    // Ensure it is inside the sec-appearance section
    const appearanceSection = html.substring(html.indexOf('id="sec-appearance"'), html.indexOf('id="sec-snippets"'));
    expect(appearanceSection).toContain('id="setting-switchToExistingTab"');
  });

  it('provides translations for switchToExistingTab across all languages', () => {
    expect(i18n.t('switch_to_existing_tab_label', 'en-US')).toBe('Switch to existing tab or bookmark');
    expect(i18n.t('switch_to_existing_tab_desc', 'en-US')).toContain('Automatically switch');

    expect(i18n.t('switch_to_existing_tab_label', 'en-CA')).toBe('Switch to existing tab or bookmark');
    expect(i18n.t('switch_to_existing_tab_desc', 'en-CA')).toContain('eh?');

    expect(i18n.t('switch_to_existing_tab_label', 'cute')).toBe('Switch to existing tab ow bookmawk');
    expect(i18n.t('switch_to_existing_tab_desc', 'cute')).toContain('(｡♥‿♥｡)');
  });
});

describe('findBookmarkByUrl in bookmarks tree', () => {
  const tree = [
    { id: 'b1', type: 'link', title: 'Example', url: 'https://example.com/' },
    {
      id: 'f1',
      type: 'folder',
      title: 'Dev',
      isOpen: true,
      children: [
        { id: 'b2', type: 'link', title: 'GitHub', url: 'https://github.com/repo' }
      ]
    }
  ];

  it('finds root level bookmark by exact or normalized URL', () => {
    const res1 = findBookmarkByUrl(tree, 'https://example.com');
    expect(res1).not.toBeNull();
    expect(res1.item.id).toBe('b1');

    const res2 = findBookmarkByUrl(tree, 'HTTPS://EXAMPLE.COM///');
    expect(res2).not.toBeNull();
    expect(res2.item.id).toBe('b1');
  });

  it('finds nested bookmark inside folders', () => {
    const res = findBookmarkByUrl(tree, 'https://github.com/repo/');
    expect(res).not.toBeNull();
    expect(res.item.id).toBe('b2');
  });

  it('returns null when bookmark is not found', () => {
    const res = findBookmarkByUrl(tree, 'https://notfound.org');
    expect(res).toBeNull();
  });
});

describe('Tab creation and duplicate handling logic', () => {
  let tabs;
  let activeTabId;
  let customBookmarks;
  let currentSettings;
  let switchedTabId;
  let createdTabs;

  function switchTab(id) {
    switchedTabId = id;
    activeTabId = id;
  }

  function createTab(url = 'napture://welcome', switchTo = true, customTabId = null) {
    const isWelcome = url === 'napture://welcome' || url === 'napture://newtab';

    // If switch to existing tab/bookmark is enabled, check if the non-welcome URL is already open or bookmarked
    if (!customTabId && url && !isWelcome && (!currentSettings || currentSettings.switchToExistingTab !== false)) {
      const cleanTarget = String(url).trim().toLowerCase().replace(/\/+$/, '');
      if (cleanTarget) {
        // 1. Check open tabs
        const existingTab = tabs.find(t => t && t.url && t.url !== 'napture://welcome' && String(t.url).trim().toLowerCase().replace(/\/+$/, '') === cleanTarget);
        if (existingTab) {
          switchTab(existingTab.id);
          return existingTab.id;
        }

        // 2. Check bookmarks
        const foundBm = findBookmarkByUrl(customBookmarks, url);
        if (foundBm && foundBm.item) {
          const bm = foundBm.item;
          if (bm.tabId && tabs.some(t => t.id === bm.tabId)) {
            switchTab(bm.tabId);
            return bm.tabId;
          } else {
            const newId = bm.tabId || ('tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
            bm.tabId = newId;
            const createdTabId = createTab(bm.url || url, true, newId);
            return createdTabId;
          }
        }
      }
    }

    const tabId = customTabId || ('tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    const newTab = { id: tabId, url };
    tabs.push(newTab);
    createdTabs.push(newTab);

    if (switchTo) {
      switchTab(tabId);
    }
    return tabId;
  }

  beforeEach(() => {
    tabs = [
      { id: 'tab-1', url: 'https://news.ycombinator.com' },
      { id: 'tab-2', url: 'https://docs.github.com' }
    ];
    activeTabId = 'tab-1';
    switchedTabId = null;
    createdTabs = [];
    customBookmarks = [
      { id: 'bm-1', type: 'link', title: 'Reddit', url: 'https://reddit.com', tabId: null },
      { id: 'bm-2', type: 'link', title: 'GitHub Docs', url: 'https://docs.github.com', tabId: 'tab-2' }
    ];
    currentSettings = {
      switchToExistingTab: true
    };
  });

  it('switches to already open tab instead of creating duplicate when toggle is ON', () => {
    const resultId = createTab('https://news.ycombinator.com');
    expect(resultId).toBe('tab-1');
    expect(switchedTabId).toBe('tab-1');
    expect(tabs.length).toBe(2);
    expect(createdTabs.length).toBe(0);
  });

  it('switches to open bookmark tab instead of creating duplicate when toggle is ON', () => {
    const resultId = createTab('https://docs.github.com/');
    expect(resultId).toBe('tab-2');
    expect(switchedTabId).toBe('tab-2');
    expect(tabs.length).toBe(2);
  });

  it('activates bookmark tab when creating tab for bookmarked URL without active tab when toggle is ON', () => {
    const resultId = createTab('https://reddit.com');
    expect(resultId).toBeDefined();
    expect(customBookmarks[0].tabId).toBe(resultId);
    expect(switchedTabId).toBe(resultId);
    expect(tabs.length).toBe(3);
  });

  it('creates a new duplicate tab when switchToExistingTab is toggled OFF', () => {
    currentSettings.switchToExistingTab = false;
    const resultId = createTab('https://news.ycombinator.com');
    expect(resultId).not.toBe('tab-1');
    expect(tabs.length).toBe(3);
    expect(createdTabs.length).toBe(1);
    expect(createdTabs[0].url).toBe('https://news.ycombinator.com');
  });

  it('always creates a new tab when opening welcome/blank tabs', () => {
    const resultId = createTab('napture://welcome');
    expect(resultId).toBeDefined();
    expect(tabs.length).toBe(3);
  });
});
