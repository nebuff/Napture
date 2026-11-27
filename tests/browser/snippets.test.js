jest.mock('better-sqlite3', () => function() {
  return { exec: jest.fn(), prepare: () => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() }) };
}, { virtual: true });

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

const fs = require('fs');
const path = require('path');
const { getDefaultSettings } = require('../../napture/settings-ui');
const i18n = require('../../napture/i18n');
const snippets = require('../../napture/snippets-core');

describe('Quick Site Snippets Suite', () => {
  describe('Default Configuration & i18n', () => {
    it('ships an empty snippets list by default', () => {
      const defaults = getDefaultSettings();
      expect(snippets.parseList(defaults.snippets)).toEqual([]);
    });

    it('translates snippet labels in all supported locales', () => {
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

  describe('parseList', () => {
    const stored = [
      { snippet: '.mail', description: ' Takes you to gmail ', url: 'gmail.com' },
      { snippet: 'yt', description: '', url: 'https://youtube.com' },
      { snippet: '', description: 'missing key', url: 'https://example.com' },
      { snippet: 'blank', description: 'missing url', url: 'https://' },
      { snippet: 'MAIL', description: 'duplicate', url: 'https://other.com' }
    ];

    it('accepts the stored JSON string form', () => {
      const list = snippets.parseList(JSON.stringify(stored));
      expect(list).toEqual([
        { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
        { snippet: 'yt', description: '', url: 'https://youtube.com' }
      ]);
    });

    it('accepts an already-parsed array', () => {
      expect(snippets.parseList(stored)).toHaveLength(2);
    });

    it('tolerates a JSON string of a JSON string', () => {
      expect(snippets.parseList(JSON.stringify(JSON.stringify(stored)))).toHaveLength(2);
    });

    it('returns an empty list for missing or malformed values', () => {
      expect(snippets.parseList(undefined)).toEqual([]);
      expect(snippets.parseList('')).toEqual([]);
      expect(snippets.parseList('not json')).toEqual([]);
      expect(snippets.parseList({})).toEqual([]);
    });

    it('normalizes keys and URLs', () => {
      expect(snippets.normalizeKey('  .My  Site ')).toBe('MySite');
      expect(snippets.normalizeUrl(' youtube.com ')).toBe('https://youtube.com');
      expect(snippets.normalizeUrl('https://')).toBe('');
      expect(snippets.normalizeUrl('ne://example.ne')).toBe('ne://example.ne');
    });
  });

  describe('resolve', () => {
    const list = snippets.parseList([
      { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
      { snippet: '.yt', description: 'Takes you to youtube', url: 'youtube.com' },
      { snippet: 'my-site', description: 'dashed key', url: 'https://mysite.example' }
    ]);

    it('matches .mail and returns https://gmail.com', () => {
      expect(snippets.resolve('.mail', list)).toBe('https://gmail.com');
    });

    it('is case insensitive', () => {
      expect(snippets.resolve('.MAIL', list)).toBe('https://gmail.com');
    });

    it('matches when the description is included from in-line autocomplete', () => {
      expect(snippets.resolve('.mail - Takes you to gmail', list)).toBe('https://gmail.com');
      expect(snippets.resolve('.mail-Takes you to gmail', list)).toBe('https://gmail.com');
    });

    it('prepends https:// when the stored URL has no scheme', () => {
      expect(snippets.resolve('.yt', list)).toBe('https://youtube.com');
    });

    it('prefers the longest key so dashed snippets work', () => {
      expect(snippets.resolve('.my-site', list)).toBe('https://mysite.example');
    });

    it('returns null for unmatched input or empty lists', () => {
      expect(snippets.resolve('.unknown', list)).toBeNull();
      expect(snippets.resolve('.mail', [])).toBeNull();
      expect(snippets.resolve('', list)).toBeNull();
    });
  });

  describe('suggestions', () => {
    const list = snippets.parseList([
      { snippet: 'mail', description: 'Takes you to gmail', url: 'https://gmail.com' },
      { snippet: 'maps', description: 'Google Maps', url: 'https://maps.google.com' },
      { snippet: 'yt', description: 'Takes you to youtube', url: 'https://youtube.com' }
    ]);

    it('lists every snippet for a bare dot', () => {
      expect(snippets.suggestions('.', list)).toEqual([
        '.mail - Takes you to gmail',
        '.maps - Google Maps',
        '.yt - Takes you to youtube'
      ]);
    });

    it('filters by prefix', () => {
      expect(snippets.suggestions('.m', list)).toEqual([
        '.mail - Takes you to gmail',
        '.maps - Google Maps'
      ]);
      expect(snippets.suggestions('.mail', list)).toEqual(['.mail - Takes you to gmail']);
    });

    it('returns nothing without the dot prefix or on a miss', () => {
      expect(snippets.suggestions('mail', list)).toEqual([]);
      expect(snippets.suggestions('.x', list)).toEqual([]);
    });
  });

  describe('Settings page wiring', () => {
    it('keeps the snippet key sanitation regex escaped in the generated script', () => {
      const { buildSettingsPage } = require('../../napture/settings-ui');
      const html = buildSettingsPage();
      // A single escaped dot would turn into /^./ after template interpolation and
      // silently delete the first character of every snippet key.
      expect(html).toContain(".replace(/^\\./, '')");
      expect(html).not.toContain(".replace(/^./, '')");
    });
  });

  describe('Renderer wiring', () => {
    it('loads the shared snippets module before the renderer', () => {
      const html = fs.readFileSync(path.join(__dirname, '../../napture/renderer/index.html'), 'utf8');
      const core = html.indexOf('src="snippets-core.js"');
      expect(core).toBeGreaterThan(-1);
      expect(core).toBeLessThan(html.indexOf('src="renderer.js"'));
    });

    it('resolves snippets through the shared module in the address bar', () => {
      const renderer = fs.readFileSync(path.join(__dirname, '../../napture/renderer/renderer.js'), 'utf8');
      expect(renderer).toContain('window.NaptureSnippets');
      expect(renderer).toContain('resolveSnippetInput(url)');
      expect(renderer).toContain('function navigateToQuery(');
    });
  });
});
