const Database = require('better-sqlite3');
const { parseFirefoxPlacesTree } = require('../../napture/bookmark-parser');

describe('Firefox Import & SQLite Places Parser', () => {
  let db;

  beforeEach(() => {
    // In-memory sqlite db mimicking Firefox places.sqlite schema
    db = new Database(':memory:');

    db.exec(`
      CREATE TABLE moz_places (
        id INTEGER PRIMARY KEY,
        url TEXT,
        title TEXT,
        rev_host TEXT,
        visit_count INTEGER DEFAULT 0,
        hidden INTEGER DEFAULT 0,
        typed INTEGER DEFAULT 0,
        favicon_id INTEGER,
        frecency INTEGER DEFAULT -1,
        last_visit_date INTEGER,
        guid TEXT,
        foreign_count INTEGER DEFAULT 0,
        url_hash INTEGER DEFAULT 0,
        description TEXT,
        preview_image_url TEXT,
        site_name TEXT
      );

      CREATE TABLE moz_bookmarks (
        id INTEGER PRIMARY KEY,
        type INTEGER,
        fk INTEGER,
        parent INTEGER,
        position INTEGER,
        title TEXT,
        keyword_id INTEGER,
        folder_type TEXT,
        dateAdded INTEGER,
        lastModified INTEGER,
        guid TEXT,
        syncStatus INTEGER DEFAULT 0,
        syncChangeCounter INTEGER DEFAULT 1
      );
    `);

    // Standard root folders
    db.exec(`
      INSERT INTO moz_bookmarks (id, type, parent, position, title, guid) VALUES
        (1, 2, 0, 0, 'root', 'root________'),
        (2, 2, 1, 0, 'menu', 'menu________'),
        (3, 2, 1, 1, 'toolbar', 'toolbar_____'),
        (4, 2, 1, 2, 'tags', 'tags________'),
        (5, 2, 1, 3, 'unfiled', 'unfiled_____'),
        (6, 2, 1, 4, 'mobile', 'mobile______');
    `);
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should parse bookmarks and nested folder hierarchy correctly', () => {
    // Insert places
    db.exec(`
      INSERT INTO moz_places (id, url, title, visit_count, last_visit_date) VALUES
        (10, 'https://example.com/docs', 'Example Docs', 5, 1787250000000000),
        (11, 'https://github.com/myrepo', 'My Project', 12, 1787251000000000),
        (12, 'https://news.ycombinator.com', 'Hacker News', 2, 1787252000000000);
    `);

    // Insert user folder in toolbar (id 3)
    db.exec(`
      INSERT INTO moz_bookmarks (id, type, parent, position, title, guid) VALUES
        (20, 2, 3, 0, 'Dev Tools', 'guid_folder1');
    `);

    // Insert links under toolbar and under folder
    db.exec(`
      INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid) VALUES
        (21, 1, 10, 3, 1, 'Example Docs', 'guid_bm1'),
        (22, 1, 11, 20, 0, 'My Project', 'guid_bm2'),
        (23, 1, 12, 5, 0, 'Hacker News', 'guid_bm3');
    `);

    const result = parseFirefoxPlacesTree(db);
    expect(result).toBeDefined();
    expect(result.bookmarkNodes.length).toBe(3); // Dev Tools folder, Example Docs link, Hacker News link

    const devFolder = result.bookmarkNodes.find(n => n.title === 'Dev Tools');
    expect(devFolder).toBeDefined();
    expect(devFolder.type).toBe('folder');
    expect(devFolder.children.length).toBe(1);
    expect(devFolder.children[0].title).toBe('My Project');
    expect(devFolder.children[0].url).toBe('https://github.com/myrepo');

    const topDoc = result.bookmarkNodes.find(n => n.title === 'Example Docs');
    expect(topDoc).toBeDefined();
    expect(topDoc.type).toBe('link');
    expect(topDoc.url).toBe('https://example.com/docs');

    const unfiled = result.bookmarkNodes.find(n => n.title === 'Hacker News');
    expect(unfiled).toBeDefined();
    expect(unfiled.url).toBe('https://news.ycombinator.com');
  });

  it('should ignore tag entries, internal place: URIs, and about: urls', () => {
    db.exec(`
      INSERT INTO moz_places (id, url, title, visit_count, last_visit_date) VALUES
        (30, 'place:sort=8&maxResults=10', 'Most Visited', 0, 0),
        (31, 'about:config', 'About Config', 1, 1787250000000000),
        (32, 'https://valid-site.com', 'Valid Site', 1, 1787250000000000);

      -- Add tag subfolder under tags (id 4)
      INSERT INTO moz_bookmarks (id, type, parent, position, title, guid) VALUES
        (40, 2, 4, 0, 'mytag', 'guid_tag1');

      -- Add tag item and smart bookmark
      INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid) VALUES
        (41, 1, 30, 3, 0, 'Most Visited', 'guid_smart'),
        (42, 1, 31, 3, 1, 'About Config', 'guid_about'),
        (43, 1, 32, 40, 0, 'Tagged Item', 'guid_tagged'),
        (44, 1, 32, 3, 2, 'Valid Site', 'guid_valid');
    `);

    const result = parseFirefoxPlacesTree(db);
    // Only 'Valid Site' should be in bookmarks
    expect(result.bookmarkNodes.length).toBe(1);
    expect(result.bookmarkNodes[0].title).toBe('Valid Site');
    expect(result.bookmarkNodes[0].url).toBe('https://valid-site.com');
  });

  it('should extract visit history with milliseconds timestamp conversion', () => {
    const microsecTime = 1787254872919000;
    const millisTime = 1787254872919;

    db.exec(`
      INSERT INTO moz_places (id, url, title, visit_count, last_visit_date) VALUES
        (50, 'https://google.com/search?q=test', 'Google Search', 3, ${microsecTime}),
        (51, 'place:type=6', 'Smart Place', 1, ${microsecTime});
    `);

    const result = parseFirefoxPlacesTree(db);
    expect(result.historyRows.length).toBe(1);
    expect(result.historyRows[0].url).toBe('https://google.com/search?q=test');
    expect(result.historyRows[0].title).toBe('Google Search');
    expect(result.historyRows[0].visitCount).toBe(3);
    expect(result.historyRows[0].lastVisitTime).toBe(millisTime);
  });

  it('should handle empty database gracefully without injecting mock data', () => {
    const result = parseFirefoxPlacesTree(db);
    expect(result.bookmarkNodes).toEqual([]);
    expect(result.historyRows).toEqual([]);
  });
});
