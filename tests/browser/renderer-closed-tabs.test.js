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
  setRendererSetting('switchToExistingTab', true);
});

describe('Renderer closed tabs', () => {
  describe('closeTab', () => {
    it('closes the tab, notifies the main process and records it for reopening', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      const pageId = renderer.createTab('https://example.com/article', true);

      renderer.closeTab(pageId);

      expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(pageId);
      expect(window.tabs.map((tab) => tab.id)).toEqual([welcomeId]);
      expect(window.activeTabId).toBe(welcomeId);
      expect(renderer.closedTabsHistory).toEqual([
        { url: 'https://example.com/article', title: 'example.com' }
      ]);
    });

    it('activates the next tab when the active tab is closed', () => {
      const firstId = renderer.createTab('https://one.example', true);
      const secondId = renderer.createTab('https://two.example', true);
      const thirdId = renderer.createTab('https://three.example', true);
      // No opener, so neighbour selection must pick the next tab.
      window.tabs.find((tab) => tab.id === secondId).openerTabId = null;

      renderer.switchTab(secondId);
      renderer.closeTab(secondId);

      expect(window.activeTabId).toBe(thirdId);
      expect(window.tabs.map((tab) => tab.id)).toEqual([firstId, thirdId]);
    });

    it('activates the previous tab when the last tab is closed', () => {
      renderer.createTab('https://one.example', true);
      const secondId = renderer.createTab('https://two.example', true);
      const thirdId = renderer.createTab('https://three.example', true);
      // No opener, so neighbour selection must pick the previous tab.
      window.tabs.find((tab) => tab.id === thirdId).openerTabId = null;

      renderer.switchTab(thirdId);
      renderer.closeTab(thirdId);

      expect(window.activeTabId).toBe(secondId);
    });

    it('prefers the opener tab over the neighbouring tab', () => {
      const openerId = renderer.createTab('https://opener.example', true);
      const childId = renderer.createTab('https://child.example', true);
      renderer.createTab('https://sibling.example', true);

      renderer.switchTab(childId);
      renderer.closeTab(childId);

      expect(window.activeTabId).toBe(openerId);
    });

    it('leaves the active tab alone when a background tab is closed', () => {
      const backgroundId = renderer.createTab('https://background.example', true);
      const activeId = renderer.createTab('https://active.example', true);

      renderer.closeTab(backgroundId);

      expect(window.activeTabId).toBe(activeId);
      expect(window.tabs.map((tab) => tab.id)).toEqual([activeId]);
      expect(renderer.closedTabsHistory.map((entry) => entry.url)).toEqual([
        'https://background.example'
      ]);
    });

    it('does not record welcome tabs for reopening', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      renderer.createTab('https://example.com', true);

      renderer.closeTab(welcomeId);

      expect(renderer.closedTabsHistory).toEqual([]);
      expect(window.tabs.some((tab) => tab.id === welcomeId)).toBe(false);
    });

    it('replaces the last remaining tab with a fresh welcome tab', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      window.naptureAPI.createTab.mockClear();

      renderer.closeTab(welcomeId);

      expect(window.tabs).toHaveLength(1);
      expect(window.tabs[0].id).not.toBe(welcomeId);
      expect(window.tabs[0].url).toBe('napture://welcome');
      expect(window.activeTabId).toBe(window.tabs[0].id);
      expect(window.naptureAPI.createTab).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an unknown tab id', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);

      renderer.closeTab('tab-does-not-exist');

      expect(window.naptureAPI.closeTab).not.toHaveBeenCalled();
      expect(window.tabs.map((tab) => tab.id)).toEqual([welcomeId]);
    });

    it('stops the click event from reaching the tab strip', () => {
      const backgroundId = renderer.createTab('https://background.example', true);
      renderer.createTab('https://active.example', true);
      const event = { stopPropagation: jest.fn() };

      renderer.closeTab(backgroundId, event);

      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    });
  });

  describe('reopening via the reopen-tab shortcut', () => {
    it('reopens closed tabs most-recent-first and consumes each entry once', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      const firstId = renderer.createTab('https://one.example', true);
      const secondId = renderer.createTab('https://two.example', true);

      renderer.closeTab(firstId);
      renderer.closeTab(secondId);
      expect(window.activeTabId).toBe(welcomeId);
      expect(renderer.closedTabsHistory.map((entry) => entry.url)).toEqual([
        'https://one.example',
        'https://two.example'
      ]);

      sendShortcutAction('reopen-tab');

      expect(activeTab().url).toBe('https://two.example');
      expect(activeTab().title).toBe('two.example');
      expect(activeTab().id).not.toBe(secondId);
      expect(renderer.closedTabsHistory).toHaveLength(1);

      sendShortcutAction('reopen-tab');

      expect(activeTab().url).toBe('https://one.example');
      expect(activeTab().title).toBe('one.example');
      expect(renderer.closedTabsHistory).toHaveLength(0);

      sendShortcutAction('reopen-tab');
      expect(window.tabs).toHaveLength(3);
    });

    it('does nothing when there are no closed tabs', () => {
      renderer.createTab('napture://welcome', true);
      window.naptureAPI.createTab.mockClear();

      sendShortcutAction('reopen-tab');

      expect(window.naptureAPI.createTab).not.toHaveBeenCalled();
      expect(window.tabs).toHaveLength(1);
    });

    it('cannot reopen a closed welcome tab', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      renderer.closeTab(welcomeId);
      expect(window.tabs).toHaveLength(1);

      sendShortcutAction('reopen-tab');

      expect(window.tabs).toHaveLength(1);
    });

    it('closes the active tab through the close-tab shortcut', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      const pageId = renderer.createTab('https://example.com', true);

      sendShortcutAction('close-tab');

      expect(window.naptureAPI.closeTab).toHaveBeenCalledWith(pageId);
      expect(window.activeTabId).toBe(welcomeId);
    });
  });
});
