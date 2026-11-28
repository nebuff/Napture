/**
 * @jest-environment jsdom
 */
const {
  loadRendererFixture,
  setRendererSetting,
  sendShortcutAction
} = require('./helpers/renderer-fixture');

let renderer;

const activeTab = () => window.tabs.find((tab) => tab.id === window.activeTabId);

beforeAll(async () => {
  jest.useFakeTimers();
  renderer = loadRendererFixture();
  await Promise.resolve();
  await Promise.resolve();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  window.tabs = [];
  window.activeTabId = null;
  renderer.closedTabsHistory.length = 0;
  window.naptureAPI.createTab = jest.fn();
  window.naptureAPI.switchTab = jest.fn();
  window.naptureAPI.closeTab = jest.fn();
  window.naptureAPI.setToolbarCustomizing = jest.fn();
  setRendererSetting('switchToExistingTab', true);
});

afterEach(() => {
  renderer.stopToolbarCustomizing(false);
});

describe('Toolbar customizing lock', () => {
  it('enters the real customizing mode and tells the main process once', () => {
    renderer.startToolbarCustomizing();

    expect(document.body.classList.contains('toolbar-customizing')).toBe(true);
    expect(document.getElementById('toolbar-customizer-workspace').classList.contains('hidden')).toBe(false);
    expect(window.naptureAPI.setToolbarCustomizing).toHaveBeenCalledWith(true);

    renderer.startToolbarCustomizing();
    expect(window.naptureAPI.setToolbarCustomizing).toHaveBeenCalledTimes(1);
  });

  it('blocks closing a tab directly', () => {
    renderer.createTab('napture://welcome', true);
    const pageId = renderer.createTab('https://example.com', true);
    renderer.startToolbarCustomizing();

    renderer.closeTab(pageId);

    expect(window.naptureAPI.closeTab).not.toHaveBeenCalled();
    expect(window.activeTabId).toBe(pageId);
    expect(window.tabs).toHaveLength(2);
    expect(renderer.closedTabsHistory).toEqual([]);
  });

  it('blocks the close-tab shortcut', () => {
    renderer.createTab('napture://welcome', true);
    const pageId = renderer.createTab('https://example.com', true);
    renderer.startToolbarCustomizing();

    sendShortcutAction('close-tab');

    expect(window.naptureAPI.closeTab).not.toHaveBeenCalled();
    expect(activeTab().id).toBe(pageId);
    expect(window.tabs).toHaveLength(2);
  });

  it('blocks the new-tab shortcut', () => {
    renderer.createTab('napture://welcome', true);
    renderer.startToolbarCustomizing();
    window.naptureAPI.createTab.mockClear();

    sendShortcutAction('new-tab');

    expect(window.naptureAPI.createTab).not.toHaveBeenCalled();
    expect(window.tabs).toHaveLength(1);
  });

  it('blocks the sidebar New Tab button', () => {
    renderer.createTab('napture://welcome', true);
    renderer.startToolbarCustomizing();
    window.naptureAPI.createTab.mockClear();
    const newTabButton = document.getElementById('new-tab-btn');

    expect(newTabButton).not.toBeNull();
    newTabButton.click();

    expect(window.naptureAPI.createTab).not.toHaveBeenCalled();
    expect(window.tabs).toHaveLength(1);
  });

  it('blocks reopening a closed tab and keeps it in history', () => {
    renderer.createTab('napture://welcome', true);
    const pageId = renderer.createTab('https://closed.example', true);
    renderer.closeTab(pageId);
    expect(renderer.closedTabsHistory).toHaveLength(1);
    renderer.startToolbarCustomizing();
    window.naptureAPI.createTab.mockClear();

    sendShortcutAction('reopen-tab');

    expect(window.naptureAPI.createTab).not.toHaveBeenCalled();
    expect(window.tabs).toHaveLength(1);
    expect(renderer.closedTabsHistory).toEqual([
      { url: 'https://closed.example', title: 'closed.example' }
    ]);
  });

  it('allows reopening the preserved tab after exiting customizing', () => {
    renderer.createTab('napture://welcome', true);
    const pageId = renderer.createTab('https://closed.example', true);
    renderer.closeTab(pageId);
    renderer.startToolbarCustomizing();
    sendShortcutAction('reopen-tab');
    renderer.stopToolbarCustomizing(false);

    sendShortcutAction('reopen-tab');

    expect(activeTab().url).toBe('https://closed.example');
    expect(activeTab().title).toBe('closed.example');
    expect(renderer.closedTabsHistory).toHaveLength(0);
  });

  it('allows creating and closing tabs again after exiting customizing', () => {
    renderer.createTab('napture://welcome', true);
    const pageId = renderer.createTab('https://example.com', true);
    renderer.startToolbarCustomizing();
    renderer.stopToolbarCustomizing(false);
    window.naptureAPI.createTab.mockClear();

    document.getElementById('new-tab-btn').click();
    expect(window.naptureAPI.createTab).toHaveBeenCalledTimes(1);
    expect(window.tabs).toHaveLength(3);

    renderer.closeTab(pageId);
    expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(pageId);
    expect(window.tabs).toHaveLength(2);
  });
});
