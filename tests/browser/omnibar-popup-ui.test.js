/**
 * @jest-environment jsdom
 */
// Renderer UI tests: the omnibar downloads/history overlay runs against a real
// jsdom document and a mocked window.naptureAPI bridge.

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let api;
let container;
let onDownloadUpdated;

beforeAll(() => {
  window.requestAnimationFrame = (cb) => { cb(0); return 0; };
  api = {
    omnibarPopupAction: jest.fn(),
    setOmnibarPopupHeight: jest.fn(),
    getRecentDownloads: jest.fn().mockResolvedValue([]),
    getHistory: jest.fn().mockResolvedValue([]),
    hideOmnibarPopup: jest.fn(),
    onDownloadUpdated: jest.fn()
  };
  window.naptureAPI = api;
  require('../../napture/renderer/omnibar-popup.js');
  onDownloadUpdated = api.onDownloadUpdated.mock.calls[0][0];
});

beforeEach(() => {
  jest.clearAllMocks();
  api.getRecentDownloads.mockResolvedValue([]);
  api.getHistory.mockResolvedValue([]);
  document.body.className = '';
  document.body.innerHTML = '<div id="popup-container"></div>';
  container = document.getElementById('popup-container');
  window.hidePopup();
});

describe('Omnibar popup overlay UI', () => {
  describe('content rendering', () => {
    it('injects markup, applies theme colors and reports the clamped height', () => {
      window.updateContent(
        '<button class="menu-item">One</button>',
        'rgb(10, 20, 30)',
        'rgb(40, 50, 60)',
        '0 1px 2px #000',
        '#ffffff',
        '#111111',
        '#222222',
        true
      );

      expect(document.body.className).toBe('light-theme');
      expect(container.innerHTML).toContain('One');
      expect(container.style.background).toBe('rgb(10, 20, 30)');
      expect(container.style.borderColor).toBe('rgb(40, 50, 60)');
      expect(container.style.boxShadow).toBe('0 1px 2px #000');
      // jsdom has no layout, so this exercises the 60px minimum clamp.
      expect(api.setOmnibarPopupHeight).toHaveBeenCalledWith(60);
    });

    it('caps the reported height at 460px', () => {
      Object.defineProperty(container, 'scrollHeight', { value: 900, configurable: true });

      window.updateContent('<div>tall</div>', null, null, null, '#fff', '#000', '#111', false);

      expect(document.body.className).toBe('dark-theme');
      expect(api.setOmnibarPopupHeight).toHaveBeenCalledWith(460);
    });

    it('clears the overlay on hidePopup', () => {
      window.updateContent('<span>visible</span>', null, null, null, '#fff', '#000', '#111', false);
      expect(container.innerHTML).toContain('visible');

      window.hidePopup();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('downloads view', () => {
    const downloads = [
      { id: 'd1', path: '/tmp/report.pdf', name: 'report.pdf', completed: true, sizeStr: '2.1 MB' },
      { id: 'd2', name: 'movie.mp4', completed: false, progress: 42 },
      { id: 'd3', name: 'cancelled.zip', cancelled: true },
      { id: 'd4', name: 'linux.iso', completed: false, timeStr: '3 min left' },
      { id: 'd5', name: 'five.bin' },
      { id: 'd6', name: 'six.bin' }
    ];

    it('renders at most five recent downloads with their status text', async () => {
      api.getRecentDownloads.mockResolvedValue(downloads);

      window.showPopup('downloads', false);
      await flush();

      expect(document.body.className).toBe('dark-theme');
      expect(container.querySelectorAll('#omnibar-downloads-list .menu-item')).toHaveLength(5);
      expect(container.textContent).toContain('report.pdf');
      expect(container.textContent).toContain('2.1 MB');
      expect(container.textContent).toContain('42%');
      expect(container.textContent).toContain('Cancelled');
      expect(container.textContent).toContain('3 min left');
      expect(container.textContent).not.toContain('six.bin');
    });

    it('opens a download item through the popup action bridge', async () => {
      api.getRecentDownloads.mockResolvedValue(downloads);

      window.showPopup('downloads', false);
      await flush();
      container.querySelector('#omnibar-downloads-list .menu-item').click();

      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-download', {
        id: 'd1',
        path: '/tmp/report.pdf',
        name: 'report.pdf'
      });
    });

    it('offers a "show all downloads" shortcut', async () => {
      window.showPopup('downloads', false);
      await flush();

      document.getElementById('omnibar-downloads-show-all').click();

      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-url', {
        url: 'napture://downloads',
        newTab: true
      });
    });

    it('shows an empty state when there are no downloads', async () => {
      window.showPopup('downloads', false);
      await flush();

      expect(container.textContent).toContain('No recent downloads');
    });

    it('refreshes while the downloads view is open and ignores updates once hidden', async () => {
      expect(typeof onDownloadUpdated).toBe('function');
      window.showPopup('downloads', false);
      await flush();
      expect(api.getRecentDownloads).toHaveBeenCalledTimes(1);

      onDownloadUpdated();
      await flush();
      expect(api.getRecentDownloads).toHaveBeenCalledTimes(2);

      window.hidePopup();
      api.getRecentDownloads.mockClear();
      onDownloadUpdated();
      await flush();
      expect(api.getRecentDownloads).not.toHaveBeenCalled();
    });
  });

  describe('history view', () => {
    const history = [
      { title: 'Hacker News', url: 'https://news.ycombinator.com', timestamp: Date.now() },
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Wikipedia', url: 'https://wikipedia.org' },
      { title: 'MDN', url: 'https://developer.mozilla.org' },
      { title: 'Example', url: 'https://example.com' },
      { title: 'Extra', url: 'https://extra.example' }
    ];

    it('renders five recent history entries and opens one in the active tab', async () => {
      api.getHistory.mockResolvedValue(history);

      window.showPopup('history', true);
      await flush();

      expect(document.body.className).toBe('light-theme');
      expect(container.querySelectorAll('#omnibar-history-list .menu-item')).toHaveLength(5);
      expect(container.textContent).not.toContain('Extra');

      container.querySelector('#omnibar-history-list .menu-item').click();

      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-url', {
        url: 'https://news.ycombinator.com',
        newTab: false
      });
    });

    it('wires the "show all" and "clear" actions', async () => {
      window.showPopup('history', false);
      await flush();

      document.getElementById('omnibar-history-show-all').click();
      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-url', {
        url: 'napture://history',
        newTab: true
      });

      document.getElementById('omnibar-history-clear').click();
      expect(api.omnibarPopupAction).toHaveBeenCalledWith('clear-history');
    });

    it('escapes page titles instead of injecting them as HTML', async () => {
      api.getHistory.mockResolvedValue([
        { title: '<img src=x onerror="window.__xss=1">', url: 'https://evil.example' }
      ]);

      window.showPopup('history', false);
      await flush();

      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('<img src=x');
      expect(window.__xss).toBeUndefined();
    });

    it('shows an empty state when there is no history', async () => {
      window.showPopup('history', false);
      await flush();

      expect(container.textContent).toContain('No recent history');
    });
  });

  describe('event bridge', () => {
    it('dispatches data-action buttons with decoded JSON payloads', () => {
      const payload = encodeURIComponent(JSON.stringify({ url: 'https://payload.example' }));
      container.innerHTML = `<button data-action="open-url" data-payload="${payload}">Go</button>`;

      container.querySelector('button').click();

      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-url', {
        url: 'https://payload.example'
      });
    });

    it('logs malformed payloads and dispatches the action with null data', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      container.innerHTML = '<button data-action="open-url" data-payload="%E0%A4%A">Bad</button>';

      container.querySelector('button').click();

      expect(errorSpy).toHaveBeenCalledWith('Failed to parse item payload', expect.anything());
      expect(api.omnibarPopupAction).toHaveBeenCalledWith('open-url', null);
      errorSpy.mockRestore();
    });

    it('closes the overlay on Escape', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(api.hideOmnibarPopup).toHaveBeenCalled();
    });
  });
});
