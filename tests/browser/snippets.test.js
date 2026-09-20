jest.mock('better-sqlite3', () => function() {
  return { exec: jest.fn(), prepare: () => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() }) };
}, { virtual: true });

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

const { getDefaultSettings } = require('../../napture/settings-ui');
const i18n = require('../../napture/i18n');

describe('Quick Site Snippets Suite', () => {
  describe('Default Configuration & i18n', () => {
    it('should have an empty snippets array by default in getDefaultSettings()', () => {
      const defaults = getDefaultSettings();
      expect(defaults.snippets).toBeDefined();
      const parsed = JSON.parse(defaults.snippets);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(0);
    });

    it('should translate snippet labels in all supported locales', () => {
      ['en-US', 'en-CA', 'cute'].forEach(lang => {
        expect(i18n.t('nav_snippets', lang)).toBeTruthy();
        expect(i18n.t('sec_snippets', lang)).toBeTruthy();
        expect(i18n.t('add_snippet_btn', lang)).toBeTruthy();
        expect(i18n.t('snippet_label', lang)).toBeTruthy();
        expect(i18n.t('description_label', lang)).toBeTruthy();
        expect(i18n.t('url_label', lang)).toBeTruthy();
      });
    });
  });

  describe('Snippet Lookup and Redirection', () => {
    function resolveSnippetUrl(inputUrl, snippetsList) {
      if (!inputUrl) return null;
      if (!Array.isArray(snippetsList) || snippetsList.length === 0) return null;

      const rawKey = inputUrl.split(/\s*-\s*/)[0].trim().toLowerCase();
      const cleanInput = rawKey.startsWith('.') ? rawKey : '.' + rawKey;
      const matched = snippetsList.find(s => {
        if (!s || !s.snippet) return false;
        const key = '.' + String(s.snippet).trim().replace(/^\./, '').toLowerCase();
        return key === cleanInput;
      });

      if (matched && matched.url) {
        let targetUrl = String(matched.url).trim();
        if (targetUrl && !targetUrl.includes('://')) {
          targetUrl = 'https://' + targetUrl;
        }
        return targetUrl;
      }
      return null;
    }

    function sanitizeSnippetKey(inputVal) {
      return inputVal.trim().replace(/^\./, '');
    }

    const testSnippets = [
      { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
      { snippet: '.yt', description: 'Takes you to youtube', url: 'youtube.com' }
    ];

    it('should match .mail and return https://gmail.com', () => {
      const res = resolveSnippetUrl('.mail', testSnippets);
      expect(res).toBe('https://gmail.com');
    });

    it('should match .mail when description is included from in-line autocomplete', () => {
      const res = resolveSnippetUrl('.mail - Takes you to gmail', testSnippets);
      expect(res).toBe('https://gmail.com');
    });

    it('should match .mail when description has no surrounding spaces around dash', () => {
      const res = resolveSnippetUrl('.mail-Takes you to gmail', testSnippets);
      expect(res).toBe('https://gmail.com');
    });

    it('should correctly sanitize snippet key by stripping only leading dot without truncating key', () => {
      expect(sanitizeSnippetKey('mail')).toBe('mail');
      expect(sanitizeSnippetKey('.mail')).toBe('mail');
      expect(sanitizeSnippetKey('yt')).toBe('yt');
      expect(sanitizeSnippetKey('.yt')).toBe('yt');
    });

    it('should match .yt and prepend https:// if missing', () => {
      const res = resolveSnippetUrl('.yt', testSnippets);
      expect(res).toBe('https://youtube.com');
    });

    it('should return null for unmatched inputs', () => {
      const res = resolveSnippetUrl('.unknown', testSnippets);
      expect(res).toBeNull();
    });
  });

  describe('Snippet In-Line Search Suggestions', () => {
    function getSnippetSuggestions(query, snippetsList) {
      if (!query || !query.startsWith('.') || !Array.isArray(snippetsList)) return [];
      const valLower = query.toLowerCase();
      const snippetMatches = [];
      snippetsList.forEach(s => {
        if (!s || !s.snippet) return;
        const key = '.' + String(s.snippet).trim().replace(/^\./, '');
        if (key.toLowerCase().startsWith(valLower)) {
          const desc = s.description && String(s.description).trim() ? ' - ' + String(s.description).trim() : '';
          snippetMatches.push(`${key}${desc}`);
        }
      });
      return snippetMatches;
    }

    const testSnippets = [
      { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
      { snippet: 'maps', description: 'Google Maps', url: 'https://maps.google.com' },
      { snippet: 'yt', description: 'Takes you to youtube', url: 'https://youtube.com' }
    ];

    it('should match all snippets starting with dot prefix', () => {
      const res = getSnippetSuggestions('.', testSnippets);
      expect(res).toEqual([
        '.mail - Takes you to gmail',
        '.maps - Google Maps',
        '.yt - Takes you to youtube'
      ]);
    });

    it('should filter snippets matching .m', () => {
      const res = getSnippetSuggestions('.m', testSnippets);
      expect(res).toEqual([
        '.mail - Takes you to gmail',
        '.maps - Google Maps'
      ]);
    });

    it('should filter exact match .mail', () => {
      const res = getSnippetSuggestions('.mail', testSnippets);
      expect(res).toEqual([
        '.mail - Takes you to gmail'
      ]);
    });

    it('should return empty array when no snippets match query', () => {
      const res = getSnippetSuggestions('.x', testSnippets);
      expect(res).toEqual([]);
    });
  });
});
