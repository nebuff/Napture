const {
  parseBingRss,
  parseWikipedia,
  mergeResults,
  normalizeResultUrl,
  searchWeb,
  resetWebSearchCache
} = require('../../napture/web-search');

const BING_XML = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel>
  <title>Bing: sqlite fts5</title>
  <item>
    <title>SQLite Home Page</title>
    <link>https://sqlite.org/index.html</link>
    <description><![CDATA[SQLite is a C-language library that implements a small, fast SQL database engine.]]></description>
  </item>
  <item>
    <title>FTS5 &amp; full-text search</title>
    <link>https://sqlite.org/fts5.html</link>
    <description>FTS5 is an SQLite &lt;b&gt;virtual table&lt;/b&gt; module.</description>
  </item>
</channel></rss>`;

const WIKI_JSON = JSON.stringify({
  query: {
    search: [
      { title: 'SQLite', snippet: '<span class="searchmatch">SQLite</span> is a database engine.' },
      { title: 'Full-text search', snippet: 'Text search over documents.' }
    ]
  }
});

describe('web search providers', () => {
  describe('parseBingRss', () => {
    it('extracts titles, links and decoded snippets', () => {
      const items = parseBingRss(BING_XML);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        title: 'SQLite Home Page',
        url: 'https://sqlite.org/index.html',
        source: 'bing'
      });
      expect(items[0].snippet).toContain('small, fast SQL database engine');
      expect(items[1].title).toBe('FTS5 & full-text search');
      expect(items[1].snippet).toBe('FTS5 is an SQLite virtual table module.');
    });

    it('returns nothing for empty or malformed input', () => {
      expect(parseBingRss('')).toEqual([]);
      expect(parseBingRss('<rss></rss>')).toEqual([]);
      expect(parseBingRss(null)).toEqual([]);
    });
  });

  describe('parseWikipedia', () => {
    it('builds encoded article urls and strips snippet markup', () => {
      const items = parseWikipedia(JSON.parse(WIKI_JSON));
      expect(items).toHaveLength(2);
      expect(items[0].url).toBe('https://en.wikipedia.org/wiki/SQLite');
      expect(items[0].snippet).toBe('SQLite is a database engine.');
      expect(items[1].url).toBe('https://en.wikipedia.org/wiki/Full-text_search');
      expect(items[0].sourceLabel).toBe('Wikipedia');
    });

    it('tolerates a missing query payload', () => {
      expect(parseWikipedia({})).toEqual([]);
      expect(parseWikipedia(null)).toEqual([]);
    });
  });

  describe('normalizeResultUrl', () => {
    it('keeps http(s) urls and strips fragments', () => {
      expect(normalizeResultUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('unwraps duckduckgo redirect links', () => {
      const wrapped = 'https://duckduckgo.com/l/?uddg=' + encodeURIComponent('https://example.com/a') + '&rut=1';
      expect(normalizeResultUrl(wrapped)).toBe('https://example.com/a');
    });

    it('rejects non-web schemes and garbage', () => {
      expect(normalizeResultUrl('javascript:alert(1)')).toBeNull();
      expect(normalizeResultUrl('not a url')).toBeNull();
      expect(normalizeResultUrl('')).toBeNull();
    });
  });

  describe('mergeResults', () => {
    it('round-robins providers and deduplicates by url', () => {
      const merged = mergeResults([
        [
          { title: 'A', url: 'https://a.example/1' },
          { title: 'B', url: 'https://b.example/2' }
        ],
        [
          { title: 'A wiki', url: 'https://a.example/1' },
          { title: 'C', url: 'https://c.example/3' }
        ]
      ], 10);

      // The duplicate url from the second provider is dropped, the rest interleave.
      expect(merged.map(item => item.title)).toEqual(['A', 'B', 'C']);
      expect(merged).toHaveLength(3);
      expect(merged[0].url).toBe('https://a.example/1');
    });

    it('respects the limit and ignores unsafe urls', () => {
      const merged = mergeResults([
        [{ title: 'bad', url: 'javascript:alert(1)' }, { title: 'ok', url: 'https://ok.example/' }]
      ], 5);
      expect(merged).toHaveLength(1);
      expect(merged[0].title).toBe('ok');
    });
  });

  describe('searchWeb', () => {
    const realFetch = global.fetch;

    beforeEach(() => {
      resetWebSearchCache();
    });

    afterEach(() => {
      global.fetch = realFetch;
    });

    it('merges both providers and reports their status', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url).includes('bing.com')) {
          return { ok: true, text: async () => BING_XML };
        }
        return { ok: true, text: async () => WIKI_JSON };
      });

      const result = await searchWeb('sqlite fts5');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.providers).toEqual([
        { id: 'bing', label: 'Bing', ok: true, count: 2 },
        { id: 'wikipedia', label: 'Wikipedia', ok: true, count: 2 }
      ]);
    });

    it('returns partial results when one provider fails', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url).includes('bing.com')) throw new Error('blocked');
        return { ok: true, text: async () => WIKI_JSON };
      });

      const result = await searchWeb('sqlite');
      expect(result.results).toHaveLength(2);
      expect(result.providers.find(p => p.id === 'bing')).toMatchObject({ ok: false, count: 0 });
      expect(result.providers.find(p => p.id === 'wikipedia')).toMatchObject({ ok: true });
    });

    it('caches repeated queries', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url).includes('bing.com')) return { ok: true, text: async () => BING_XML };
        return { ok: true, text: async () => WIKI_JSON };
      });

      await searchWeb('sqlite');
      const callsAfterFirst = global.fetch.mock.calls.length;
      await searchWeb('SQLite');
      expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
    });

    it('short-circuits an empty query without touching the network', async () => {
      global.fetch = jest.fn();
      expect(await searchWeb('   ')).toEqual({ results: [], providers: [] });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
