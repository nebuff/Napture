/**
 * @jest-environment jsdom
 */
const { loadRendererFixture, setRendererSetting } = require('./helpers/renderer-fixture');

let renderer;
let addressInput;
let addressDisplay;
let securityBadge;

beforeAll(() => {
  jest.useFakeTimers();
  renderer = loadRendererFixture();
  addressInput = document.getElementById('address-input');
  addressDisplay = document.getElementById('address-display');
  securityBadge = document.getElementById('security-badge');
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  addressInput.classList.remove('hidden');
  addressInput.value = '';
  addressInput.blur();
  addressDisplay.innerHTML = '';
  securityBadge.style.color = '';
  securityBadge.title = '';
});

describe('Renderer address display', () => {
  describe('formatUrlDisplay', () => {
    it('splits an https URL into a host and the last path segment', () => {
      expect(renderer.formatUrlDisplay('https://example.com/docs/getting-started?ref=nav#top', 'Docs')).toEqual({
        domain: 'example.com/',
        name: 'getting-started'
      });
    });

    it('uses the query value when there is no path', () => {
      expect(renderer.formatUrlDisplay('https://duckduckgo.com/?q=kittens', 'DuckDuckGo')).toEqual({
        domain: 'duckduckgo.com/',
        name: 'kittens'
      });
    });

    it('falls back to the page title, then the hostname', () => {
      expect(renderer.formatUrlDisplay('https://example.com/', 'Example Domain').name).toBe('Example Domain');
      expect(renderer.formatUrlDisplay('https://example.com/', 'example.com').name).toBe('example.com');
    });

    it('treats internal pages as internal addresses', () => {
      expect(renderer.formatUrlDisplay('napture://welcome', '')).toEqual({
        domain: 'napture://',
        name: 'welcome'
      });
      expect(renderer.formatUrlDisplay('napture://settings', 'Settings')).toEqual({
        domain: 'napture://',
        name: 'settings'
      });
      expect(renderer.formatUrlDisplay('about:blank', '')).toEqual({
        domain: '',
        name: 'about:blank'
      });
    });

    it('formats ne:// websites differently from ne:// system pages', () => {
      expect(renderer.formatUrlDisplay('ne://example.ne/blog/post', 'Post')).toEqual({
        domain: 'example.ne/',
        name: 'post'
      });
      expect(renderer.formatUrlDisplay('ne://settings', 'Settings')).toEqual({
        domain: 'ne://',
        name: 'settings'
      });
    });

    it('decodes file names and percent-encoded path segments', () => {
      expect(renderer.formatUrlDisplay('file:///tmp/My%20Notes.txt', '')).toEqual({
        domain: 'file://',
        name: 'My Notes.txt'
      });
      expect(renderer.formatUrlDisplay('https://example.com/caf%C3%A9', 'Café')).toEqual({
        domain: 'example.com/',
        name: 'café'
      });
    });

    it('accepts a bare host without a scheme', () => {
      expect(renderer.formatUrlDisplay('example.com/path', '')).toEqual({
        domain: 'example.com/',
        name: 'path'
      });
    });

    it('honours the showFullUrl setting', () => {
      setRendererSetting('showFullUrl', true);
      try {
        expect(renderer.formatUrlDisplay('https://example.com/docs', 'Docs')).toEqual({
          domain: 'https://example.com/docs',
          name: ''
        });
      } finally {
        setRendererSetting('showFullUrl', false);
      }
    });
  });

  describe('updateAddressBarDisplay', () => {
    it('fills the input and renders escaped domain and page name spans', () => {
      renderer.updateAddressBarDisplay('https://example.com/a<b>', 'A <b> title');

      expect(addressInput.value).toBe('https://example.com/a<b>');
      expect(addressDisplay.querySelector('.url-domain').textContent).toBe('example.com/');
      expect(addressDisplay.querySelector('.url-name').textContent).toBe('a<b>');
      expect(addressDisplay.querySelector('b')).toBeNull();
    });

    it('shows the welcome address for the new tab page', () => {
      renderer.updateAddressBarDisplay('napture://welcome', 'New Tab');

      expect(addressInput.value).toBe('napture://welcome');
      expect(addressDisplay.textContent).toBe('napture://welcome');
    });

    it('does not overwrite the input while the user is editing it', () => {
      addressInput.focus();
      addressInput.value = 'typing a query';

      renderer.updateAddressBarDisplay('https://example.com/', 'Example');

      expect(addressInput.value).toBe('typing a query');
      expect(addressDisplay.querySelector('.url-domain').textContent).toBe('example.com/');
    });
  });

  describe('security badge', () => {
    it('describes https connections as secure', () => {
      renderer.updateSecurityIcon('https://example.com/');

      expect(securityBadge.title).toBe('Connection is secure (HTTPS)');
      expect(securityBadge.style.color).toBe('rgb(16, 185, 129)');
    });

    it.each([
      ['napture://settings', 'Napture System Page', 'rgb(127, 140, 255)'],
      ['ne://example.ne/', 'Authoritative Neweb Protocol (ne://)', 'rgb(115, 218, 202)'],
      ['file:///tmp/notes.txt', 'Local System File', 'rgb(59, 130, 246)'],
      ['http://example.com/', 'Connection is not secure (HTTP)', 'rgb(245, 158, 11)'],
      ['ftp://example.com/', 'Connection is not secure (HTTP)', 'rgb(245, 158, 11)']
    ])('describes %s with the right badge', (url, title, color) => {
      renderer.updateSecurityIcon(url);

      expect(securityBadge.title).toBe(title);
      expect(securityBadge.style.color).toBe(color);
    });
  });

  describe('isInternalUrl', () => {
    it('classifies system pages and ne:// hosts correctly', () => {
      expect(renderer.isInternalUrl('napture://settings')).toBe(true);
      expect(renderer.isInternalUrl('ne://welcome')).toBe(true);
      expect(renderer.isInternalUrl('ne://history')).toBe(true);
      expect(renderer.isInternalUrl('ne://example.ne/blog')).toBe(false);
      expect(renderer.isInternalUrl('https://example.com')).toBe(false);
      expect(renderer.isInternalUrl('')).toBe(false);
      expect(renderer.isInternalUrl(null)).toBe(false);
    });
  });
});
