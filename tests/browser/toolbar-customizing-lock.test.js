// Test suite for toolbar customization locking and UI edit modes
const fs = require('fs');
const path = require('path');

describe('Toolbar Customization Interaction Locking', () => {
  let isToolbarCustomizing;
  let mockNaptureAPI;
  let tabs;
  let activeTabId;
  let closedTabsHistory;
  let addressInputShown;

  beforeEach(() => {
    isToolbarCustomizing = true;
    tabs = [
      { id: 'tab-1', url: 'https://site1.com', title: 'Site 1' },
      { id: 'tab-2', url: 'https://site2.com', title: 'Site 2' }
    ];
    activeTabId = 'tab-1';
    closedTabsHistory = [];
    addressInputShown = false;

    mockNaptureAPI = {
      goBack: jest.fn(),
      goForward: jest.fn(),
      reload: jest.fn(),
      navigate: jest.fn(),
      switchTab: jest.fn(),
      closeTab: jest.fn(),
      createTab: jest.fn()
    };
  });

  function handleBackClick() {
    if (isToolbarCustomizing) return;
    mockNaptureAPI.goBack();
  }

  function handleForwardClick() {
    if (isToolbarCustomizing) return;
    mockNaptureAPI.goForward();
  }

  function handleReloadClick() {
    if (isToolbarCustomizing) return;
    mockNaptureAPI.reload();
  }

  function handleHomeClick(homeUrl = 'napture://welcome') {
    if (isToolbarCustomizing) return;
    mockNaptureAPI.navigate(homeUrl);
  }

  function handleBrandMenuClick(showPanelFn) {
    if (isToolbarCustomizing) return;
    showPanelFn();
  }

  function handleDownloadsClick(showPanelFn) {
    if (isToolbarCustomizing) return;
    showPanelFn();
  }

  function handleHistoryClick(showPanelFn) {
    if (isToolbarCustomizing) return;
    showPanelFn();
  }

  function handleNewTabClick(createTabFn) {
    if (isToolbarCustomizing) return;
    createTabFn('napture://welcome');
  }

  function showAddressInput() {
    if (isToolbarCustomizing) return;
    addressInputShown = true;
  }

  function switchTab(tabId) {
    if (isToolbarCustomizing) return;
    activeTabId = tabId;
    mockNaptureAPI.switchTab({ tabId });
  }

  function closeTab(tabId) {
    if (isToolbarCustomizing) return;
    mockNaptureAPI.closeTab(tabId);
    tabs = tabs.filter(t => t.id !== tabId);
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
        mockNaptureAPI.createTab('napture://welcome');
        break;
      case 'go-back':
        mockNaptureAPI.goBack();
        break;
      case 'go-forward':
        mockNaptureAPI.goForward();
        break;
      case 'reload':
        mockNaptureAPI.reload();
        break;
      case 'close-tab':
        closeTab(activeTabId);
        break;
      case 'next-tab':
        switchTab('tab-2');
        break;
    }
  }

  describe('Navigation Buttons during Customizing', () => {
    it('should NOT trigger goBack, goForward, reload, or navigate when customizing', () => {
      isToolbarCustomizing = true;
      handleBackClick();
      handleForwardClick();
      handleReloadClick();
      handleHomeClick();

      expect(mockNaptureAPI.goBack).not.toHaveBeenCalled();
      expect(mockNaptureAPI.goForward).not.toHaveBeenCalled();
      expect(mockNaptureAPI.reload).not.toHaveBeenCalled();
      expect(mockNaptureAPI.navigate).not.toHaveBeenCalled();
    });

    it('should trigger goBack, goForward, reload, and navigate when NOT customizing', () => {
      isToolbarCustomizing = false;
      handleBackClick();
      handleForwardClick();
      handleReloadClick();
      handleHomeClick('https://custom-home.com');

      expect(mockNaptureAPI.goBack).toHaveBeenCalledTimes(1);
      expect(mockNaptureAPI.goForward).toHaveBeenCalledTimes(1);
      expect(mockNaptureAPI.reload).toHaveBeenCalledTimes(1);
      expect(mockNaptureAPI.navigate).toHaveBeenCalledWith('https://custom-home.com');
    });
  });

  describe('Napture / Brand Menu during Customizing', () => {
    it('should NOT open brand menu when customizing', () => {
      isToolbarCustomizing = true;
      const showPanel = jest.fn();
      handleBrandMenuClick(showPanel);
      expect(showPanel).not.toHaveBeenCalled();
    });

    it('should open brand menu when NOT customizing', () => {
      isToolbarCustomizing = false;
      const showPanel = jest.fn();
      handleBrandMenuClick(showPanel);
      expect(showPanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tabs and Sidebar during Customizing', () => {
    it('should NOT switch tab, close tab, or create new tab when customizing', () => {
      isToolbarCustomizing = true;
      switchTab('tab-2');
      expect(activeTabId).toBe('tab-1');
      expect(mockNaptureAPI.switchTab).not.toHaveBeenCalled();

      closeTab('tab-1');
      expect(tabs.length).toBe(2);
      expect(mockNaptureAPI.closeTab).not.toHaveBeenCalled();

      const createTabFn = jest.fn();
      handleNewTabClick(createTabFn);
      expect(createTabFn).not.toHaveBeenCalled();

      const showPanelFn = jest.fn();
      handleDownloadsClick(showPanelFn);
      handleHistoryClick(showPanelFn);
      expect(showPanelFn).not.toHaveBeenCalled();
    });

    it('should switch and close tabs when NOT customizing', () => {
      isToolbarCustomizing = false;
      switchTab('tab-2');
      expect(activeTabId).toBe('tab-2');
      expect(mockNaptureAPI.switchTab).toHaveBeenCalledWith({ tabId: 'tab-2' });

      closeTab('tab-1');
      expect(tabs.length).toBe(1);
      expect(mockNaptureAPI.closeTab).toHaveBeenCalledWith('tab-1');
    });
  });

  describe('Address Input during Customizing', () => {
    it('should NOT show address input when customizing', () => {
      isToolbarCustomizing = true;
      showAddressInput();
      expect(addressInputShown).toBe(false);
    });

    it('should show address input when NOT customizing', () => {
      isToolbarCustomizing = false;
      showAddressInput();
      expect(addressInputShown).toBe(true);
    });
  });

  describe('Keyboard Shortcuts during Customizing', () => {
    it('should block navigation and tab shortcuts when customizing', () => {
      isToolbarCustomizing = true;
      handleShortcutAction('new-tab');
      handleShortcutAction('go-back');
      handleShortcutAction('go-forward');
      handleShortcutAction('reload');
      handleShortcutAction('close-tab');
      handleShortcutAction('next-tab');

      expect(mockNaptureAPI.createTab).not.toHaveBeenCalled();
      expect(mockNaptureAPI.goBack).not.toHaveBeenCalled();
      expect(mockNaptureAPI.goForward).not.toHaveBeenCalled();
      expect(mockNaptureAPI.reload).not.toHaveBeenCalled();
      expect(mockNaptureAPI.closeTab).not.toHaveBeenCalled();
      expect(mockNaptureAPI.switchTab).not.toHaveBeenCalled();
    });

    it('should allow shortcuts when NOT customizing', () => {
      isToolbarCustomizing = false;
      handleShortcutAction('new-tab');
      handleShortcutAction('go-back');
      handleShortcutAction('reload');

      expect(mockNaptureAPI.createTab).toHaveBeenCalledWith('napture://welcome');
      expect(mockNaptureAPI.goBack).toHaveBeenCalledTimes(1);
      expect(mockNaptureAPI.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('CSS Rules Verification', () => {
    it('should contain pointer-events: none and opacity styling for sidebar top and brand menu under .toolbar-customizing', () => {
      const cssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(cssContent).toMatch(/\.toolbar-customizing\s+.*#sidebar/);
      expect(cssContent).toMatch(/\.toolbar-customizing\s+.*\.brand-menu-btn/);
      expect(cssContent).toMatch(/pointer-events:\s*none\s*!important/);
    });

    it('should NOT grey out bottom toolbar buttons (.sidebar-bottom) under .toolbar-customizing', () => {
      const cssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // The entire #sidebar must not be faded out to prevent child .sidebar-bottom from being permanently greyed out
      expect(cssContent).not.toMatch(/\.toolbar-customizing\s+#sidebar\s*\{[^}]*opacity:\s*0\.45/);
      expect(cssContent).toContain('.toolbar-customizing #sidebar .sidebar-bottom');
      expect(cssContent).toContain('opacity: 1 !important;');
      expect(cssContent).toContain('pointer-events: auto !important;');
      expect(cssContent).toContain('.toolbar-customizing .sidebar-bottom-item-wrapper .sidebar-action-btn');
    });

    it('should avoid using universal * selector on -webkit-app-region under .toolbar-customizing to prevent lag', () => {
      const cssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(cssContent).not.toContain('.toolbar-customizing .toolbar-customizer-workspace *');
      expect(cssContent).not.toContain('.toolbar-customizing #header-bar *');
    });
  });
});
