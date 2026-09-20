const {
  parseBookmarkHtml,
  parseBookmarkJson,
  parseBookmarkFile,
  decodeHTMLEntities
} = require('../../napture/bookmark-parser');

describe('Bookmark Parser', () => {
  describe('decodeHTMLEntities', () => {
    it('should decode standard HTML entities', () => {
      expect(decodeHTMLEntities('&amp; &lt; &gt; &quot; &#39;')).toBe('& < > " \'');
    });

    it('should handle empty or falsy text', () => {
      expect(decodeHTMLEntities('')).toBe('');
      expect(decodeHTMLEntities(null)).toBe('');
    });
  });

  describe('parseBookmarkHtml', () => {
    it('should parse Netscape HTML bookmark format correctly', () => {
      const sampleHtml = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
        <TITLE>Bookmarks</TITLE>
        <H1>Bookmarks</H1>
        <DL><p>
            <DT><H3 ADD_DATE="1620000000">Development</H3>
            <DL><p>
                <DT><A HREF="https://github.com" ADD_DATE="1620000000" ICON="data:image/png;base64,123">GitHub</A>
                <DT><A HREF="https://stackoverflow.com">Stack Overflow &amp; Q&amp;A</A>
            </DL><p>
            <DT><A HREF="https://google.com">Google</A>
        </DL><p>
      `;

      const nodes = parseBookmarkHtml(sampleHtml);
      expect(nodes.length).toBe(2); // Development folder & Google link

      const folder = nodes.find(n => n.type === 'folder');
      expect(folder).toBeDefined();
      expect(folder.title).toBe('Development');
      expect(folder.children.length).toBe(2);

      const github = folder.children.find(c => c.title === 'GitHub');
      expect(github).toBeDefined();
      expect(github.url).toBe('https://github.com');
      expect(github.favicon).toBe('data:image/png;base64,123');

      const stackOverflow = folder.children.find(c => c.url === 'https://stackoverflow.com');
      expect(stackOverflow.title).toBe('Stack Overflow & Q&A');

      const google = nodes.find(n => n.type === 'link');
      expect(google).toBeDefined();
      expect(google.title).toBe('Google');
      expect(google.url).toBe('https://google.com');
    });

    it('should filter out internal browser URLs like chrome:// or edge://', () => {
      const sampleHtml = `
        <DL><p>
          <DT><A HREF="chrome://settings">Settings</A>
          <DT><A HREF="https://napture.app">Napture</A>
        </DL><p>
      `;
      const nodes = parseBookmarkHtml(sampleHtml);
      expect(nodes.length).toBe(1);
      expect(nodes[0].url).toBe('https://napture.app');
    });

    it('should handle invalid/empty HTML gracefully', () => {
      expect(parseBookmarkHtml('')).toEqual([]);
      expect(parseBookmarkHtml(null)).toEqual([]);
      expect(parseBookmarkHtml('<html><body>No bookmarks here</body></html>')).toEqual([]);
    });
  });

  describe('parseBookmarkJson', () => {
    it('should parse Chrome exported roots structure', () => {
      const chromeJson = {
        roots: {
          bookmark_bar: {
            children: [
              { type: 'url', name: 'Reddit', url: 'https://reddit.com' },
              {
                type: 'folder',
                name: 'News',
                children: [
                  { type: 'url', name: 'BBC', url: 'https://bbc.com' }
                ]
              }
            ]
          }
        }
      };

      const nodes = parseBookmarkJson(chromeJson);
      expect(nodes.length).toBe(2);

      const reddit = nodes.find(n => n.title === 'Reddit');
      expect(reddit.url).toBe('https://reddit.com');

      const news = nodes.find(n => n.type === 'folder');
      expect(news.title).toBe('News');
      expect(news.children.length).toBe(1);
      expect(news.children[0].url).toBe('https://bbc.com');
    });

    it('should parse simple list of bookmark objects', () => {
      const simpleList = [
        { title: 'Wikipedia', url: 'https://wikipedia.org' },
        { title: 'MDN', url: 'https://developer.mozilla.org' }
      ];

      const nodes = parseBookmarkJson(simpleList);
      expect(nodes.length).toBe(2);
      expect(nodes[0].title).toBe('Wikipedia');
      expect(nodes[1].title).toBe('MDN');
    });

    it('should handle invalid JSON input gracefully', () => {
      expect(parseBookmarkJson('invalid json string')).toEqual([]);
      expect(parseBookmarkJson(null)).toEqual([]);
    });
  });

  describe('parseBookmarkFile', () => {
    it('should auto-detect JSON format', () => {
      const jsonStr = JSON.stringify([{ title: 'Auto JSON', url: 'https://autojson.com' }]);
      const nodes = parseBookmarkFile(jsonStr);
      expect(nodes.length).toBe(1);
      expect(nodes[0].title).toBe('Auto JSON');
    });

    it('should auto-detect HTML format', () => {
      const htmlStr = '<DL><p><DT><A HREF="https://autohtml.com">Auto HTML</A></DL><p>';
      const nodes = parseBookmarkFile(htmlStr);
      expect(nodes.length).toBe(1);
      expect(nodes[0].title).toBe('Auto HTML');
    });
  });
});
