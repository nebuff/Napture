// Test suite for media playback, picture-in-picture, and audio controls

const fs = require('fs');
const path = require('path');

describe('Video Multimedia Activity Widget', () => {
  describe('HTML Markup & DOM Elements', () => {
    let html;

    beforeAll(() => {
      html = fs.readFileSync(path.resolve(__dirname, '../../napture/renderer/index.html'), 'utf8');
    });

    it('should include the video container and player elements inside #media-card', () => {
      expect(html).toContain('id="media-video-container"');
      expect(html).toContain('id="media-video-player"');
      expect(html).toContain('id="media-video-minimize-btn"');
      expect(html).toContain('id="media-expand-video-btn"');
      expect(html).toContain('id="media-source-icon"');
      expect(html).toContain('id="media-controls"');
      expect(html).toContain('id="media-bottom-row"');
    });

    it('should have video player element properly configured in media-video-container', () => {
      expect(html).toMatch(/<img[^>]*id="media-video-player"/);
      expect(html).toMatch(/<img[^>]*class="[^"]*media-video-player[^"]*"/);
    });

    it('should contain the minimize drop-down button and summon up-arrow button', () => {
      expect(html).toContain('id="media-video-minimize-btn"');
      expect(html).toContain('title="Minimize video"');
      expect(html).toContain('id="media-expand-video-btn"');
      expect(html).toContain('title="Expand video"');
    });

    it('should contain the back to tab button in media-video-overlay', () => {
      expect(html).toContain('id="media-video-return-btn"');
      expect(html).toContain('title="Back to tab"');
    });
  });

  describe('CSS Styling Verification', () => {
    let css;

    beforeAll(() => {
      css = fs.readFileSync(path.resolve(__dirname, '../../napture/newebx/chrome/userChrome.css'), 'utf8');
    });

    it('should define styles for .media-card.has-video', () => {
      expect(css).toContain('.media-card.has-video');
      expect(css).toContain('.media-video-container');
      expect(css).toContain('.media-video-player');
      expect(css).toContain('.media-video-overlay');
      expect(css).toContain('.media-video-minimize-btn');
      expect(css).toContain('.media-expand-video-btn');
    });

    it('should define styles for .media-video-return-btn and cursor on .media-video-container', () => {
      expect(css).toContain('.media-video-return-btn');
      expect(css).toMatch(/\.media-video-container\s*\{[^}]*cursor:\s*pointer/);
    });

    it('should hide thumbnail and center controls when .has-video is active', () => {
      expect(css).toMatch(/\.media-card\.has-video\s+\.media-source-icon\s*\{[^}]*display:\s*none/);
      expect(css).toMatch(/\.media-card\.has-video\s+\.media-controls\s*\{[^}]*justify-content:\s*center/);
    });
  });

  describe('Video Multimedia State & Interaction Logic', () => {
    let activeTabId;
    let lastMediaSourceTabId;
    let isMediaVideoMinimized;
    let currentMediaHasVideo;
    let isMediaActive;
    let startedVideoStreamTabId;
    let stoppedVideoStreamTabId;
    let tabs;
    let switchedToTabId;

    // Simulated DOM elements
    let mediaCard;
    let mediaVideoContainer;
    let mediaExpandVideoBtn;
    let mediaArtworkImg;
    let mediaDefaultIcon;
    let mediaBtnPlay;

    beforeEach(() => {
      activeTabId = 'tab-2';
      lastMediaSourceTabId = 'tab-1';
      isMediaVideoMinimized = false;
      currentMediaHasVideo = false;
      isMediaActive = false;
      startedVideoStreamTabId = null;
      stoppedVideoStreamTabId = null;
      switchedToTabId = null;
      tabs = [
        { id: 'tab-1', url: 'https://youtube.com' },
        { id: 'tab-2', url: 'https://google.com' },
        { id: 'tab-3', url: 'https://wikipedia.org' },
        { id: 'tab-4', url: 'https://twitch.tv' }
      ];

      mediaCard = {
        classList: {
          classes: new Set(['activity-card', 'media-card', 'hidden']),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        }
      };

      mediaVideoContainer = {
        classList: {
          classes: new Set(['media-video-container', 'hidden']),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        }
      };

      mediaExpandVideoBtn = {
        classList: {
          classes: new Set(['media-expand-video-btn', 'hidden']),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        }
      };

      mediaArtworkImg = {
        src: '',
        classList: {
          classes: new Set(['media-artwork-img', 'hidden']),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        }
      };

      mediaDefaultIcon = {
        style: { display: 'block' }
      };

      mediaBtnPlay = {
        title: '',
        setAttribute: jest.fn(),
        querySelector: () => ({ innerHTML: '' })
      };
    });

    const startVideoStream = (tabId) => {
      if (Array.isArray(tabs) && tabs.length > 0 && !tabs.some(t => t.id === tabId)) return;
      startedVideoStreamTabId = tabId;
      stoppedVideoStreamTabId = null;
    };

    const stopVideoStream = () => {
      stoppedVideoStreamTabId = startedVideoStreamTabId || lastMediaSourceTabId;
      startedVideoStreamTabId = null;
    };

    const switchTab = (tabId) => {
      switchedToTabId = tabId;
      activeTabId = tabId;
      if (tabId === lastMediaSourceTabId) {
        stopVideoStream();
        mediaCard.classList.remove('has-video');
        mediaVideoContainer.classList.add('hidden');
      }
    };

    const returnVideoToPage = () => {
      const targetTabId = lastMediaSourceTabId;
      if (targetTabId && Array.isArray(tabs) && tabs.some(t => t.id === targetTabId)) {
        stopVideoStream();
        mediaCard.classList.remove('has-video');
        mediaVideoContainer.classList.add('hidden');
        switchTab(targetTabId);
      }
    };

    const closeTab = (tabId) => {
      if (lastMediaSourceTabId === tabId) {
        lastMediaSourceTabId = null;
        isMediaActive = false;
        stopVideoStream();
        mediaCard.classList.add('hidden');
        mediaCard.classList.remove('has-video');
        mediaVideoContainer.classList.add('hidden');
        mediaExpandVideoBtn.classList.add('hidden');
      }
      tabs = tabs.filter(t => t.id !== tabId);
    };

    const handleMediaInfo = (info) => {
      if (info && info.tabId && Array.isArray(tabs) && tabs.length > 0 && !tabs.some(t => t.id === info.tabId)) {
        info = null;
      }

      if (info && (info.playing || info.artwork || info.hasVideo)) {
        if (info.tabId && lastMediaSourceTabId !== info.tabId) {
          mediaCard.classList.remove('dismissed');
          lastMediaSourceTabId = info.tabId;
          isMediaVideoMinimized = false;
        }

        if (mediaCard.classList.contains('dismissed')) {
          isMediaActive = false;
          stopVideoStream();
        } else {
          isMediaActive = true;
          mediaCard.classList.remove('hidden');
        }

        currentMediaHasVideo = !!(info.hasVideo);

        const isCurrentlyOnPlayingTab = !!(activeTabId && info.tabId && activeTabId === info.tabId);
        const shouldShowVideo = currentMediaHasVideo && !isCurrentlyOnPlayingTab && !isMediaVideoMinimized && isMediaActive;

        if (shouldShowVideo) {
          mediaCard.classList.add('has-video');
          mediaVideoContainer.classList.remove('hidden');
          mediaExpandVideoBtn.classList.add('hidden');
          startVideoStream(info.tabId);
        } else {
          mediaCard.classList.remove('has-video');
          mediaVideoContainer.classList.add('hidden');
          stopVideoStream();

          const canExpandVideo = currentMediaHasVideo && !isCurrentlyOnPlayingTab && isMediaVideoMinimized && isMediaActive;
          if (canExpandVideo) {
            mediaExpandVideoBtn.classList.remove('hidden');
          } else {
            mediaExpandVideoBtn.classList.add('hidden');
          }
        }
      } else {
        isMediaActive = false;
        stopVideoStream();
        mediaCard.classList.add('hidden');
        mediaCard.classList.remove('has-video');
        mediaVideoContainer.classList.add('hidden');
        mediaExpandVideoBtn.classList.add('hidden');
      }
    };

    it('should expand video and start stream when video is playing on a background tab', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true,
        title: 'Cool YouTube Video',
        artwork: 'https://img.youtube.com/vi/123/default.jpg'
      };

      handleMediaInfo(info);

      expect(isMediaActive).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(false);
      expect(mediaExpandVideoBtn.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBe('tab-1');
    });

    it('should activate video container when hasVideo is true even without artwork', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true,
        title: 'HTML5 Video Stream'
      };

      handleMediaInfo(info);

      expect(isMediaActive).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(false);
      expect(startedVideoStreamTabId).toBe('tab-1');
    });

    it('should minimize video and show thumbnail up arrow when user clicks minimize', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true,
        title: 'Cool YouTube Video'
      };

      // 1. Initial expanded state
      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(true);

      // 2. User clicks minimize drop-down button
      isMediaVideoMinimized = true;
      handleMediaInfo(info);

      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(mediaExpandVideoBtn.classList.contains('hidden')).toBe(false);
      expect(startedVideoStreamTabId).toBeNull();
    });

    it('should re-summon video when user clicks expand button on thumbnail', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true
      };

      // Minimized state
      isMediaVideoMinimized = true;
      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(false);

      // User clicks up arrow on thumbnail
      isMediaVideoMinimized = false;
      handleMediaInfo(info);

      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(false);
      expect(mediaExpandVideoBtn.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBe('tab-1');
    });

    it('should automatically minimize into the basic multimedia controls area when viewing the playing tab', () => {
      // User is ON tab-1 (the tab playing the video)
      activeTabId = 'tab-1';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true
      };

      handleMediaInfo(info);

      expect(isMediaActive).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(mediaExpandVideoBtn.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBeNull();
    });

    it('should automatically re-expand video when switching away from playing tab to another tab', () => {
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true
      };

      // User on playing tab: minimized
      activeTabId = 'tab-1';
      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(false);

      // User switches to tab-3: automatically expands
      activeTabId = 'tab-3';
      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(false);
      expect(startedVideoStreamTabId).toBe('tab-1');
    });

    it('should reset minimized state when media begins on a new tab', () => {
      isMediaVideoMinimized = true;
      lastMediaSourceTabId = 'tab-1';

      const newInfo = {
        tabId: 'tab-4',
        playing: true,
        hasVideo: true
      };

      activeTabId = 'tab-2';
      handleMediaInfo(newInfo);

      expect(isMediaVideoMinimized).toBe(false);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(startedVideoStreamTabId).toBe('tab-4');
    });

    it('should clean up video container and stream when media stops', () => {
      handleMediaInfo(null);

      expect(isMediaActive).toBe(false);
      expect(mediaCard.classList.contains('hidden')).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(mediaExpandVideoBtn.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBeNull();
    });

    it('should not activate media widget when info is null or dormant (e.g., e-commerce / eBay non-playing previews)', () => {
      const dormantInfo = null;

      handleMediaInfo(dormantInfo);

      expect(isMediaActive).toBe(false);
      expect(mediaCard.classList.contains('hidden')).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(false);
    });

    it('should return video to the page playing the video and stop stream when returnVideoToPage is called', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true,
        title: 'Playing YouTube Video'
      };

      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(startedVideoStreamTabId).toBe('tab-1');

      // User clicks "Back to tab" / clicks video container
      returnVideoToPage();

      expect(switchedToTabId).toBe('tab-1');
      expect(activeTabId).toBe('tab-1');
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBeNull();
      expect(stoppedVideoStreamTabId).toBe('tab-1');
    });

    it('should immediately stop streaming and remove has-video when user switches back to the media source tab', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true
      };

      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(true);

      switchTab('tab-1');

      expect(activeTabId).toBe('tab-1');
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBeNull();
    });

    it('should clean up media card and stop video stream when the media source tab is closed', () => {
      activeTabId = 'tab-2';
      const info = {
        tabId: 'tab-1',
        playing: true,
        hasVideo: true
      };

      handleMediaInfo(info);
      expect(mediaCard.classList.contains('has-video')).toBe(true);
      expect(startedVideoStreamTabId).toBe('tab-1');

      // Close tab-1
      closeTab('tab-1');

      expect(lastMediaSourceTabId).toBeNull();
      expect(isMediaActive).toBe(false);
      expect(mediaCard.classList.contains('hidden')).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(mediaVideoContainer.classList.contains('hidden')).toBe(true);
      expect(startedVideoStreamTabId).toBeNull();
    });

    it('should discard media info and not activate widget when info belongs to a non-existent closed tab', () => {
      activeTabId = 'tab-2';
      const ghostInfo = {
        tabId: 'tab-999-dead',
        playing: true,
        hasVideo: true,
        title: 'Ghost video from closed tab'
      };

      handleMediaInfo(ghostInfo);

      expect(isMediaActive).toBe(false);
      expect(mediaCard.classList.contains('hidden')).toBe(true);
      expect(mediaCard.classList.contains('has-video')).toBe(false);
      expect(startedVideoStreamTabId).toBeNull();
    });
  });

  describe('Main Process & Video Restoration Architecture', () => {
    let mainJs;
    let rendererJs;

    beforeAll(() => {
      mainJs = fs.readFileSync(path.resolve(__dirname, '../../napture/main.js'), 'utf8');
      rendererJs = fs.readFileSync(path.resolve(__dirname, '../../napture/renderer/renderer.js'), 'utf8');
    });

    it('should define restoreTabVideoDisplay in main.js to restore video stream to YouTube and HTML5 players', () => {
      expect(mainJs).toContain('function restoreTabVideoDisplay(targetTabId)');
      expect(mainJs).toContain('window.__naptureCanvas = null');
      expect(mainJs).toContain('window.__naptureCtx = null');
      expect(mainJs).toContain('translateZ(0)');
      expect(mainJs).toMatch(/#movie_player,\s*\.html5-video-player/);
      expect(mainJs).toContain('wakeUpControls');
      expect(mainJs).toContain('setInternalSize');
    });

    it('should invoke restoreTabVideoDisplay and invalidate views on tab switch and stream stop', () => {
      expect(mainJs).toMatch(/stopMediaVideoStream\s*\([\s\S]*?restoreTabVideoDisplay\(targetTabId\)/);
      expect(mainJs).toMatch(/ipcMain\.on\('switch-tab'[\s\S]*?restoreTabVideoDisplay\(tabId\)/);
      expect(mainJs).toMatch(/resizeActiveView[\s\S]*?activeView\.webContents\.invalidate\(\)/);
    });

    it('should guard startMediaVideoStream against streaming the currently active tab', () => {
      expect(mainJs).toMatch(/startMediaVideoStream[\s\S]*?state\.activeTabId === tabId[\s\S]*?stopMediaVideoStream\(tabId\)/);
      expect(rendererJs).toMatch(/function startVideoStream\(tabId\)[\s\S]*?activeTabId && activeTabId === tabId[\s\S]*?return;/);
    });
  });
});

