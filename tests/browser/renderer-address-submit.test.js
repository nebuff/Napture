/**
 * @jest-environment jsdom
 */
const { loadRendererFixture, setRendererSetting } = require('./helpers/renderer-fixture');

let renderer;
let addressInput;
let navigate;

const makeTab = (overrides = {}) => ({
  id: 'tab-test',
  url: 'napture://welcome',
  title: 'New Tab',
  isLoading: false,
  favicon: null,
  canGoBack: false,
  canGoForward: false,
  themeColor: null,
  openerTabId: null,
  ...overrides
});

function resetTabs(tabs = [makeTab()], activeId = 'tab-test') {
  window.tabs = tabs;
  window.activeTabId = activeId;
}

function submit(value) {
  addressInput.value = value;
  renderer.handleAddressSubmit();
}

beforeAll(async () => {
  jest.useFakeTimers();
  renderer = loadRendererFixture();
  // Let the async startup block create its welcome tab.
  await Promise.resolve();
  await Promise.resolve();
  addressInput = document.getElementById('address-input');
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  resetTabs();
  navigate = jest.fn();
  window.naptureAPI.navigate = navigate;
  window.naptureAPI.createTab = jest.fn();
  window.naptureAPI.closeTab = jest.fn();
  window.naptureAPI.hideOmnibarPopup = jest.fn();
  addressInput.value = '';
  setRendererSetting('searchEngine', 'duckduckgo');
  setRendererSetting('neProtocolEnabled', true);
  setRendererSetting('switchToExistingTab', true);
});

describe('Address bar submit decisions', () => {
  describe('inputs that navigate as URLs', () => {
    it.each([
      ['example.com', 'https://example.com'],
      ['github.com/nebuff/Napture', 'https://github.com/nebuff/Napture'],
      ['example.com:8080', 'https://example.com:8080'],
      ['example.com:8080/docs?lang=en', 'https://example.com:8080/docs?lang=en'],
      ['example.com?q=napture', 'https://example.com?q=napture'],
      ['example.com#section', 'https://example.com#section'],
      ['localhost:3000', 'https://localhost:3000'],
      ['localhost:3000?debug=1', 'https://localhost:3000?debug=1'],
      ['192.168.1.5:8080/admin', 'https://192.168.1.5:8080/admin'],
      ['192.168.1.5?probe=1', 'https://192.168.1.5?probe=1'],
      ['https://example.com/path?q=1', 'https://example.com/path?q=1'],
      ['http://example.com', 'http://example.com'],
      ['file:///tmp/notes.txt', 'file:///tmp/notes.txt'],
      ['ftp://example.com/file.zip', 'ftp://example.com/file.zip'],
      ['napture://downloads', 'napture://downloads']
    ])('navigates %s without searching', (input, expected) => {
      submit(input);

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(expected);
    });

    it('adds the ne:// scheme to Neweb domains', () => {
      submit('neflare.ne');
      expect(navigate).toHaveBeenCalledWith('ne://neflare.ne');
    });

    it('keeps explicit ne:// URLs as typed', () => {
      submit('ne://example.ne/blog/post');
      expect(navigate).toHaveBeenCalledWith('ne://example.ne/blog/post');
    });

    it('falls back to https for ne domains when the protocol is disabled', () => {
      setRendererSetting('neProtocolEnabled', false);

      submit('neflare.ne/path');

      expect(navigate).toHaveBeenCalledWith('https://neflare.ne/path');
    });

    it('updates the active tab URL and title for the loaded page', () => {
      submit('example.com/docs');

      expect(window.tabs[0].url).toBe('https://example.com/docs');
      expect(window.tabs[0].title).toBe('example.com');
      expect(window.tabs[0].isLoading).toBe(true);
    });
  });

  describe('inputs that become searches', () => {
    it('searches plain text with the configured engine', () => {
      submit('how to test a browser');

      expect(navigate).toHaveBeenCalledWith(
        'https://duckduckgo.com/?q=how%20to%20test%20a%20browser'
      );
    });

    it('uses the selected search engine', () => {
      setRendererSetting('searchEngine', 'google');

      submit('napture browser');

      expect(navigate).toHaveBeenCalledWith(
        'https://google.com/search?q=napture%20browser'
      );
    });

    it('percent-encodes special characters', () => {
      submit('c++ & rust');

      expect(navigate).toHaveBeenCalledWith(
        'https://duckduckgo.com/?q=c%2B%2B%20%26%20rust'
      );
    });

    it('still searches when a colon is not followed by a numeric port', () => {
      submit('example.com:abc');

      expect(navigate).toHaveBeenCalledWith(
        'https://duckduckgo.com/?q=example.com%3Aabc'
      );
    });

    it('does nothing for an empty or whitespace-only submission', () => {
      submit('   ');

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('internal page shortcuts', () => {
    it.each([
      ['settings', 'napture://settings/', 'Settings'],
      ['shortcuts', 'napture://keyboard/', 'Keyboard Shortcuts'],
      ['about', 'napture://about/', 'About Napture'],
      ['history', 'napture://history', 'History']
    ])('opens %s in the current welcome tab', (input, expectedUrl, title) => {
      submit(input);

      expect(navigate).toHaveBeenCalledWith(expectedUrl);
      expect(window.tabs).toHaveLength(1);
      expect(window.tabs[0].url).toBe(expectedUrl);
      expect(window.tabs[0].title).toBe(title);
    });

    it('opens a new tab for an internal page when the active tab is a website', () => {
      resetTabs([makeTab({ url: 'https://example.com', title: 'Example' })]);

      submit('settings');

      expect(window.naptureAPI.createTab).toHaveBeenCalledWith(
        expect.any(String),
        'napture://settings/'
      );
      expect(window.tabs.map((tab) => tab.url).sort()).toEqual([
        'https://example.com',
        'napture://settings/'
      ]);
    });
  });

  describe('duplicate tab handling', () => {
    it('switches to an existing tab and closes the welcome tab instead of navigating', () => {
      resetTabs([
        makeTab(),
        makeTab({ id: 'tab-open', url: 'https://example.com', title: 'Example' })
      ]);

      submit('example.com');

      expect(navigate).not.toHaveBeenCalled();
      expect(window.activeTabId).toBe('tab-open');
      expect(window.tabs.map((tab) => tab.id)).toEqual(['tab-open']);
      expect(window.naptureAPI.closeTab).toHaveBeenCalled();
    });

    it('navigates in place when switching to existing tabs is disabled', () => {
      setRendererSetting('switchToExistingTab', false);
      resetTabs([
        makeTab(),
        makeTab({ id: 'tab-open', url: 'https://example.com', title: 'Example' })
      ]);

      submit('example.com');

      expect(navigate).toHaveBeenCalledWith('https://example.com');
      expect(window.activeTabId).toBe('tab-test');
      expect(window.tabs).toHaveLength(2);
    });
  });
});
