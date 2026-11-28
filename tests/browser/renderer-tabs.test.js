/**
 * @jest-environment jsdom
 */
const { loadRendererFixture, setRendererSetting } = require('./helpers/renderer-fixture');

let renderer;
let tabsContainer;
let backBtn;
let forwardBtn;
let addressInput;
let securityBadge;
let headerBar;

beforeAll(async () => {
  jest.useFakeTimers();
  renderer = loadRendererFixture();
  await Promise.resolve();
  await Promise.resolve();

  tabsContainer = document.getElementById('tabs-container');
  backBtn = document.getElementById('back-btn');
  forwardBtn = document.getElementById('forward-btn');
  addressInput = document.getElementById('address-input');
  securityBadge = document.getElementById('security-badge');
  headerBar = document.getElementById('header-bar');
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  window.tabs = [];
  window.activeTabId = null;
  window.naptureAPI.createTab = jest.fn();
  window.naptureAPI.switchTab = jest.fn();
  window.naptureAPI.navigate = jest.fn();
  addressInput.blur();
  setRendererSetting('switchToExistingTab', true);
});

describe('Renderer tab management', () => {
  describe('createTab', () => {
    it('creates and activates a tab with URL-derived state', () => {
      const id = renderer.createTab('https://example.com/docs');

      expect(typeof id).toBe('string');
      expect(window.activeTabId).toBe(id);
      expect(window.tabs).toHaveLength(1);
      expect(window.tabs[0]).toMatchObject({
        id,
        url: 'https://example.com/docs',
        title: 'example.com',
        isLoading: true,
        canGoBack: false,
        canGoForward: false
      });
      expect(window.naptureAPI.createTab).toHaveBeenCalledWith(id, 'https://example.com/docs');
    });

    it('defaults to the welcome page without a loading state', () => {
      const id = renderer.createTab();

      expect(window.tabs[0]).toMatchObject({
        id,
        url: 'napture://welcome',
        title: 'New Tab',
        isLoading: false
      });
      expect(tabsContainer.querySelector('.tabs-empty')).not.toBeNull();
    });

    it('derives titles for internal pages', () => {
      const id = renderer.createTab('napture://settings');

      expect(window.tabs.find((tab) => tab.id === id).title).toBe('Settings');
    });

    it('can create a background tab without changing the active tab', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      window.naptureAPI.switchTab.mockClear();

      const backgroundId = renderer.createTab('https://background.example', false);

      expect(window.activeTabId).toBe(welcomeId);
      expect(window.tabs.map((tab) => tab.id)).toEqual([welcomeId, backgroundId]);
      expect(window.naptureAPI.switchTab).not.toHaveBeenCalled();
    });

    it('uses a supplied custom tab id', () => {
      const id = renderer.createTab('https://custom.example', false, 'tab-custom-1');

      expect(id).toBe('tab-custom-1');
      expect(window.naptureAPI.createTab).toHaveBeenCalledWith('tab-custom-1', 'https://custom.example');
    });

    it('reuses an already open tab instead of duplicating it', () => {
      const firstId = renderer.createTab('https://duplicate.example', true);
      renderer.createTab('napture://welcome', true);
      window.naptureAPI.createTab.mockClear();

      const result = renderer.createTab('https://duplicate.example', true);

      expect(result).toBe(firstId);
      expect(window.tabs).toHaveLength(2);
      expect(window.activeTabId).toBe(firstId);
      expect(window.naptureAPI.createTab).not.toHaveBeenCalled();
    });

    it('allows duplicate URLs when switchToExistingTab is disabled', () => {
      setRendererSetting('switchToExistingTab', false);
      const firstId = renderer.createTab('https://duplicate.example', true);
      renderer.createTab('napture://welcome', true);

      const secondId = renderer.createTab('https://duplicate.example', true);

      expect(secondId).not.toBe(firstId);
      expect(window.tabs).toHaveLength(3);
      expect(window.activeTabId).toBe(secondId);
    });
  });

  describe('switchTab', () => {
    it('activates the tab, updates the address bar and notifies the main process', () => {
      const firstId = renderer.createTab('https://one.example', true);
      const secondId = renderer.createTab('https://two.example', true);

      renderer.switchTab(firstId);

      expect(window.activeTabId).toBe(firstId);
      expect(addressInput.value).toBe('https://one.example');
      expect(document.querySelector('#address-display .url-domain').textContent).toBe('one.example/');
      expect(securityBadge.title).toBe('Connection is secure (HTTPS)');
      expect(window.naptureAPI.switchTab).toHaveBeenLastCalledWith({
        tabId: firstId,
        url: 'https://one.example'
      });

      renderer.switchTab(secondId);
      expect(window.activeTabId).toBe(secondId);
      expect(window.naptureAPI.switchTab).toHaveBeenLastCalledWith({
        tabId: secondId,
        url: 'https://two.example'
      });
    });

    it('drives the back and forward buttons from the active tab history flags', () => {
      const backOnlyId = renderer.createTab('https://back.example', true);
      const forwardOnlyId = renderer.createTab('https://forward.example', true);
      const backOnly = window.tabs.find((tab) => tab.id === backOnlyId);
      const forwardOnly = window.tabs.find((tab) => tab.id === forwardOnlyId);
      backOnly.canGoBack = true;
      backOnly.canGoForward = false;
      forwardOnly.canGoBack = false;
      forwardOnly.canGoForward = true;

      renderer.switchTab(backOnlyId);
      expect(backBtn.disabled).toBe(false);
      expect(forwardBtn.disabled).toBe(true);

      renderer.switchTab(forwardOnlyId);
      expect(backBtn.disabled).toBe(true);
      expect(forwardBtn.disabled).toBe(false);
    });

    it('marks the active tab in the tab strip', () => {
      const firstId = renderer.createTab('https://one.example', true);
      renderer.createTab('https://two.example', true);

      renderer.switchTab(firstId);

      const active = tabsContainer.querySelector('.tab.active');
      expect(active).not.toBeNull();
      expect(active.dataset.tabId).toBe(firstId);
      expect(tabsContainer.querySelectorAll('.tab')).toHaveLength(2);
    });

    it('shows the welcome chrome when switching to the welcome tab', () => {
      const welcomeId = renderer.createTab('napture://welcome', true);
      renderer.createTab('https://example.com', true);

      renderer.switchTab(welcomeId);

      expect(headerBar.classList.contains('is-welcome-tab')).toBe(true);
      expect(document.body.classList.contains('is-welcome-tab')).toBe(true);
      expect(securityBadge.title).toBe('Napture System Page');
      expect(addressInput.value).toBe('napture://welcome');
      expect(backBtn.disabled).toBe(true);
      expect(forwardBtn.disabled).toBe(true);
    });

    it('leaves welcome mode again when switching back to a website', () => {
      renderer.createTab('napture://welcome', true);
      const websiteId = renderer.createTab('https://example.com', true);

      renderer.switchTab(websiteId);

      expect(headerBar.classList.contains('is-welcome-tab')).toBe(false);
      expect(document.body.classList.contains('is-welcome-tab')).toBe(false);
      expect(securityBadge.title).toBe('Connection is secure (HTTPS)');
    });
  });

  describe('updateNavButtons', () => {
    it('enables and disables both navigation buttons independently', () => {
      renderer.updateNavButtons(true, false);
      expect(backBtn.disabled).toBe(false);
      expect(forwardBtn.disabled).toBe(true);

      renderer.updateNavButtons(false, true);
      expect(backBtn.disabled).toBe(true);
      expect(forwardBtn.disabled).toBe(false);

      renderer.updateNavButtons(false, false);
      expect(backBtn.disabled).toBe(true);
      expect(forwardBtn.disabled).toBe(true);

      renderer.updateNavButtons(true, true);
      expect(backBtn.disabled).toBe(false);
      expect(forwardBtn.disabled).toBe(false);
    });
  });
});
