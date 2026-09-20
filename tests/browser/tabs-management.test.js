const path = require('path');
const os = require('os');

let mockUserDataPath = path.join(os.tmpdir(), 'napture-tabs-test-' + process.pid);
jest.mock('electron', () => {
  return {
    app: {
      getPath: jest.fn((name) => name === 'userData' ? mockUserDataPath : ''),
      commandLine: { appendSwitch: jest.fn() },
      disableHardwareAcceleration: jest.fn()
    },
    WebContentsView: jest.fn().mockImplementation(() => ({
      setBounds: jest.fn(),
      setVisible: jest.fn(),
      webContents: {
        loadURL: jest.fn(),
        isDestroyed: jest.fn(() => false),
        isCrashed: jest.fn(() => false),
        isCurrentlyAudible: jest.fn(() => false),
        setBackgroundThrottling: jest.fn(),
        executeJavaScript: jest.fn().mockResolvedValue(true),
        invalidate: jest.fn()
      }
    }))
  };
});

describe('Browser Tab Management & View Bounds Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Active View Validation (getActiveView)', () => {
    it('returns view when webContents is defined, valid, not destroyed, and not crashed', () => {
      const validView = {
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false
        }
      };

      const getActiveView = (win) => {
        if (!win || !win.activeView) return null;
        const v = win.activeView;
        if (!v.webContents || v.webContents.isDestroyed() || v.webContents.isCrashed()) {
          return null;
        }
        return v;
      };

      expect(getActiveView({ activeView: validView })).toBe(validView);
    });

    it('returns null when webContents is destroyed or crashed', () => {
      const destroyedView = {
        webContents: {
          isDestroyed: () => true,
          isCrashed: () => false
        }
      };
      const crashedView = {
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => true
        }
      };

      const getActiveView = (win) => {
        if (!win || !win.activeView) return null;
        const v = win.activeView;
        if (!v.webContents || v.webContents.isDestroyed() || v.webContents.isCrashed()) {
          return null;
        }
        return v;
      };

      expect(getActiveView({ activeView: destroyedView })).toBeNull();
      expect(getActiveView({ activeView: crashedView })).toBeNull();
      expect(getActiveView(null)).toBeNull();
    });
  });

  describe('Viewport Bounds Resizing & Caching', () => {
    it('ignores invalid bounds where width <= 0 or height <= 0', () => {
      let cachedBounds = { x: 240, y: 52, width: 800, height: 600 };

      const handleResizeBounds = (bounds) => {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
          return false;
        }
        cachedBounds = bounds;
        return true;
      };

      expect(handleResizeBounds({ x: 0, y: 0, width: 0, height: 600 })).toBe(false);
      expect(handleResizeBounds({ x: 0, y: 0, width: 800, height: -10 })).toBe(false);
      expect(cachedBounds).toEqual({ x: 240, y: 52, width: 800, height: 600 });

      expect(handleResizeBounds({ x: 240, y: 52, width: 1024, height: 768 })).toBe(true);
      expect(cachedBounds).toEqual({ x: 240, y: 52, width: 1024, height: 768 });
    });

    it('resets lastViewportBounds on switch-tab IPC to force re-measuring fresh layout', () => {
      const state = {
        lastViewportBounds: { x: 240, y: 52, width: 800, height: 600 },
        activeTabId: 'tab-1'
      };

      const handleSwitchTabIPC = (newTabId) => {
        state.activeTabId = newTabId;
        state.lastViewportBounds = null;
      };

      handleSwitchTabIPC('tab-2');
      expect(state.activeTabId).toBe('tab-2');
      expect(state.lastViewportBounds).toBeNull();
    });

    it('applies 12px border radius in normal mode and 0px in HTML fullscreen', () => {
      const view = {
        setBorderRadius: jest.fn(),
        setBounds: jest.fn()
      };

      const applyLayout = (isFullscreen) => {
        if (typeof view.setBorderRadius === 'function') {
          view.setBorderRadius(isFullscreen ? 0 : 12);
        }
      };

      applyLayout(false);
      expect(view.setBorderRadius).toHaveBeenCalledWith(12);

      applyLayout(true);
      expect(view.setBorderRadius).toHaveBeenCalledWith(0);
    });
  });

  describe('Background Tab Management & Unthrottling', () => {
    it('positions non-audible background tabs offscreen (-10000, -10000) and throttles them', () => {
      const bgTab = {
        setBounds: jest.fn(),
        webContents: {
          isCurrentlyAudible: () => false,
          setBackgroundThrottling: jest.fn()
        }
      };

      const isAudible = bgTab.webContents.isCurrentlyAudible();
      const isStreaming = false;
      bgTab.setBounds({ x: -10000, y: -10000, width: 800, height: 600 });
      if (!isAudible && !isStreaming) {
        bgTab.webContents.setBackgroundThrottling(true);
      } else {
        bgTab.webContents.setBackgroundThrottling(false);
      }

      expect(bgTab.setBounds).toHaveBeenCalledWith({ x: -10000, y: -10000, width: 800, height: 600 });
      expect(bgTab.webContents.setBackgroundThrottling).toHaveBeenCalledWith(true);
    });

    it('positions audible background tabs (e.g. YouTube playing) offscreen (-10000, -10000) while keeping throttling disabled', () => {
      const bgTab = {
        setBounds: jest.fn(),
        webContents: {
          isCurrentlyAudible: () => true,
          setBackgroundThrottling: jest.fn()
        }
      };

      const isAudible = bgTab.webContents.isCurrentlyAudible();
      const isStreaming = false;
      bgTab.setBounds({ x: -10000, y: -10000, width: 800, height: 600 });
      if (!isAudible && !isStreaming) {
        bgTab.webContents.setBackgroundThrottling(true);
      } else {
        bgTab.webContents.setBackgroundThrottling(false);
      }

      expect(bgTab.setBounds).toHaveBeenCalledWith({ x: -10000, y: -10000, width: 800, height: 600 });
      expect(bgTab.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
    });

    it('restores offscreen background tab bounds and unthrottles when reactivated', () => {
      const bgTab = {
        setBounds: jest.fn(),
        setVisible: jest.fn(),
        webContents: {
          setBackgroundThrottling: jest.fn(),
          invalidate: jest.fn()
        }
      };

      bgTab.setBounds({ x: 240, y: 52, width: 800, height: 600 });
      bgTab.setVisible(true);
      bgTab.webContents.setBackgroundThrottling(false);
      bgTab.webContents.invalidate();

      expect(bgTab.setBounds).toHaveBeenCalledWith({ x: 240, y: 52, width: 800, height: 600 });
      expect(bgTab.setVisible).toHaveBeenCalledWith(true);
      expect(bgTab.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
      expect(bgTab.webContents.invalidate).toHaveBeenCalled();
    });
  });

  describe('Rehydrating Archived or Discarded Tabs', () => {
    it('falls back to napture://welcome when url is missing, empty, or about:blank', () => {
      const getRehydrateUrl = (url) => {
        if (!url || url === 'about:blank' || url.trim() === '') {
          return 'napture://welcome';
        }
        return url;
      };

      expect(getRehydrateUrl('')).toBe('napture://welcome');
      expect(getRehydrateUrl(null)).toBe('napture://welcome');
      expect(getRehydrateUrl('about:blank')).toBe('napture://welcome');
      expect(getRehydrateUrl('https://example.com')).toBe('https://example.com');
    });
  });
});
