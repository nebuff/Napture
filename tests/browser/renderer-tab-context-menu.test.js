/**
 * @jest-environment jsdom
 */
const path = require('path');
const {
  loadRendererFixture,
  setRendererSetting,
  sendTabContextMenuAction
} = require('./helpers/renderer-fixture');

const BOOKMARKS_PATH = path.join(__dirname, '..', '..', 'napture', 'renderer', 'bookmarks.js');

let renderer;
let bookmarks;
let clipboardWriteText;

function openMenu(targetType, targetId, targetData) {
  const menuItems = [];
  window.naptureAPI.showTabContextMenu = jest.fn((items) => menuItems.push(...items));
  bookmarks.showTabContextMenu(
    { clientX: 40, clientY: 60, preventDefault: jest.fn(), stopPropagation: jest.fn() },
    targetType,
    targetId,
    targetData
  );
  return menuItems;
}

function openMenuFor(tabId) {
  return openMenu('regular', tabId, window.tabs.find((item) => item.id === tabId));
}

function menuAction(menuItems, action) {
  return menuItems.find((item) => item.action === action);
}

beforeAll(async () => {
  jest.useFakeTimers();
  renderer = loadRendererFixture();
  await Promise.resolve();
  await Promise.resolve();
  // bookmarks.js calls these as browser globals; expose the live renderer
  // implementations before loading it.
  globalThis.createTab = renderer.createTab;
  globalThis.closeTab = renderer.closeTab;
  bookmarks = require(BOOKMARKS_PATH);
});

afterAll(() => {
  jest.useRealTimers();
  delete globalThis.createTab;
  delete globalThis.closeTab;
});

beforeEach(() => {
  window.tabs = [];
  window.activeTabId = null;
  renderer.closedTabsHistory.length = 0;
  window.naptureAPI.createTab = jest.fn();
  window.naptureAPI.switchTab = jest.fn();
  window.naptureAPI.closeTab = jest.fn();
  window.naptureAPI.toggleMuteTab = jest.fn();
  window.customBookmarks = [];
  clipboardWriteText = jest.fn(() => Promise.resolve());
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardWriteText },
    configurable: true
  });
  setRendererSetting('switchToExistingTab', true);
});

describe('Tab context menu actions', () => {
  it('exposes duplicate, mute and close-others for a regular tab', () => {
    renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://target.example', true);

    const menuItems = openMenuFor(targetId);

    expect(menuAction(menuItems, 'duplicate-tab')).toBeDefined();
    expect(menuAction(menuItems, 'mute')).toBeDefined();
    expect(menuAction(menuItems, 'close-other-tabs')).toBeDefined();
  });

  it('duplicates the tab in the background without changing the active tab', () => {
    renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://duplicate.example/page', true);
    const duplicateItem = menuAction(openMenuFor(targetId), 'duplicate-tab');

    sendTabContextMenuAction('duplicate-tab', duplicateItem.payload);

    expect(window.tabs).toHaveLength(3);
    const duplicated = window.tabs.find(
      (tab) => tab.id !== targetId && tab.url === 'https://duplicate.example/page'
    );
    expect(duplicated).toBeDefined();
    expect(duplicated.id).not.toBe(targetId);
    expect(window.activeTabId).toBe(targetId);
    expect(window.naptureAPI.createTab).toHaveBeenCalledWith(
      duplicated.id,
      'https://duplicate.example/page'
    );
  });

  it('toggles mute for the tab through the preload bridge', () => {
    renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://mute.example', true);
    const muteItem = menuAction(openMenuFor(targetId), 'mute');

    sendTabContextMenuAction('mute', muteItem.payload);

    expect(window.naptureAPI.toggleMuteTab).toHaveBeenCalledTimes(1);
    expect(window.naptureAPI.toggleMuteTab).toHaveBeenCalledWith(targetId);
  });

  it('copies the tab URL to the clipboard', () => {
    renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://copy.example/page?x=1', true);
    const copyItem = menuAction(openMenuFor(targetId), 'copy-link');

    sendTabContextMenuAction('copy-link', copyItem.payload);

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith('https://copy.example/page?x=1');
  });

  it('closes the target tab and activates its neighbour', () => {
    const welcomeId = renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://close.example', true);
    const siblingId = renderer.createTab('https://sibling.example', true);
    renderer.switchTab(targetId);
    // No opener, so the active tab moves to its neighbour rather than back to welcome.
    window.tabs.find((tab) => tab.id === targetId).openerTabId = null;
    const closeItem = menuAction(openMenuFor(targetId), 'close-tab');

    sendTabContextMenuAction('close-tab', closeItem.payload);

    expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(targetId);
    expect(window.tabs.map((tab) => tab.id)).toEqual([welcomeId, siblingId]);
    expect(window.activeTabId).toBe(siblingId);
    expect(renderer.closedTabsHistory).toEqual([
      { url: 'https://close.example', title: 'close.example' }
    ]);
  });

  it('copies a pinned site URL to the clipboard', () => {
    renderer.createTab('napture://welcome', true);
    const pinnedTab = { title: 'Pinned', url: 'https://pinned.example/page', favicon: null, tabId: 'tab-pinned-target' };
    const copyItem = menuAction(openMenu('pinned', 0, pinnedTab), 'copy-link');

    sendTabContextMenuAction('copy-link', copyItem.payload);

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith('https://pinned.example/page');
  });

  it('copies a bookmark link URL to the clipboard', () => {
    renderer.createTab('napture://welcome', true);
    const bookmark = {
      id: 'b-copy',
      type: 'link',
      title: 'Bookmark',
      url: 'https://bookmark.example/page',
      tabId: 'tab-bookmark-target'
    };
    const copyItem = menuAction(openMenu('bookmark-link', bookmark.id, bookmark), 'copy-link');

    sendTabContextMenuAction('copy-link', copyItem.payload);

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith('https://bookmark.example/page');
  });

  it('does not touch the clipboard when the target has no URL', () => {
    renderer.createTab('napture://welcome', true);
    const pinnedTab = { title: 'No URL', url: '', favicon: null, tabId: 'tab-no-url' };
    const copyItem = menuAction(openMenu('pinned', 0, pinnedTab), 'copy-link');

    sendTabContextMenuAction('copy-link', copyItem.payload);

    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('handles a rejected clipboard write', () => {
    renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://copy.example/page', true);
    const rejectedWrite = Promise.reject(new Error('clipboard denied'));
    const catchSpy = jest.spyOn(rejectedWrite, 'catch');
    clipboardWriteText.mockReturnValue(rejectedWrite);
    const copyItem = menuAction(openMenuFor(targetId), 'copy-link');

    sendTabContextMenuAction('copy-link', copyItem.payload);

    expect(clipboardWriteText).toHaveBeenCalledWith('https://copy.example/page');
    expect(catchSpy).toHaveBeenCalledTimes(1);
    catchSpy.mockRestore();
  });

  it('toggles mute for a pinned site by its open tab id', () => {
    renderer.createTab('napture://welcome', true);
    const pinnedTab = { title: 'Pinned', url: 'https://pinned.example', favicon: null, tabId: 'tab-pinned-target' };
    const muteItem = menuAction(openMenu('pinned', 0, pinnedTab), 'mute');

    sendTabContextMenuAction('mute', muteItem.payload);

    expect(window.naptureAPI.toggleMuteTab).toHaveBeenCalledWith('tab-pinned-target');
  });

  it('duplicates a pinned site in a background tab', () => {
    renderer.createTab('napture://welcome', true);
    const pinnedTab = { title: 'Pinned', url: 'https://pinned.example/start', favicon: null, tabId: 'tab-pinned-target' };
    const duplicateItem = menuAction(openMenu('pinned', 0, pinnedTab), 'duplicate-tab');

    sendTabContextMenuAction('duplicate-tab', duplicateItem.payload);

    expect(window.tabs).toHaveLength(2);
    expect(window.tabs[1]).toMatchObject({
      url: 'https://pinned.example/start',
      title: 'pinned.example',
      isLoading: true
    });
    expect(window.activeTabId).toBe(window.tabs[0].id);
  });

  it('toggles mute for a bookmark link by its open tab id', () => {
    renderer.createTab('napture://welcome', true);
    const bookmark = {
      id: 'b-mute',
      type: 'link',
      title: 'Bookmark',
      url: 'https://bookmark.example',
      tabId: 'tab-bookmark-target'
    };
    const muteItem = menuAction(openMenu('bookmark-link', bookmark.id, bookmark), 'mute');

    sendTabContextMenuAction('mute', muteItem.payload);

    expect(window.naptureAPI.toggleMuteTab).toHaveBeenCalledWith('tab-bookmark-target');
  });

  it('duplicates a bookmark link into the bookmarks tree', () => {
    renderer.createTab('napture://welcome', true);
    const bookmark = {
      id: 'b-duplicate',
      type: 'link',
      title: 'Bookmark',
      url: 'https://bookmark.example/page',
      tabId: 'tab-bookmark-target'
    };
    window.customBookmarks = [bookmark];
    const duplicateItem = menuAction(openMenu('bookmark-link', bookmark.id, bookmark), 'duplicate-tab');

    sendTabContextMenuAction('duplicate-tab', duplicateItem.payload);

    expect(window.customBookmarks).toHaveLength(2);
    expect(window.customBookmarks[1]).toMatchObject({
      type: 'link',
      title: 'Bookmark',
      url: 'https://bookmark.example/page'
    });
    expect(window.customBookmarks[1].id).not.toBe(bookmark.id);
    expect(window.customBookmarks[1].tabId).not.toBe(bookmark.tabId);
  });

  it('closes every other tab and keeps the target active', () => {
    const welcomeId = renderer.createTab('napture://welcome', true);
    const targetId = renderer.createTab('https://target.example', true);
    const firstOtherId = renderer.createTab('https://one.example', true);
    const secondOtherId = renderer.createTab('https://two.example', true);
    renderer.switchTab(targetId);
    const closeOthersItem = menuAction(openMenuFor(targetId), 'close-other-tabs');

    sendTabContextMenuAction('close-other-tabs', closeOthersItem.payload);

    expect(window.tabs.map((tab) => tab.id)).toEqual([targetId]);
    expect(window.activeTabId).toBe(targetId);
    expect(window.naptureAPI.closeTab).toHaveBeenCalledTimes(3);
    expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(welcomeId);
    expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(firstOtherId);
    expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(secondOtherId);
  });
});
