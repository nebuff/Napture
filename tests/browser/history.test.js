const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// Mock electron app before requiring history
let mockUserDataPath = path.join(os.tmpdir(), 'napture-hist-test-' + process.pid);
jest.mock('electron', () => {
  return {
    app: {
      getPath: jest.fn((name) => {
        if (name === 'userData') return mockUserDataPath;
        return '';
      })
    }
  };
});

const history = require('../../napture/db/history');

describe('History DB', () => {
  beforeEach(() => {
    mockUserDataPath = path.join(os.tmpdir(), 'napture-hist-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6));
    if (!fs.existsSync(mockUserDataPath)) {
      fs.mkdirSync(mockUserDataPath, { recursive: true });
    }
    history.initDB();
  });

  afterEach(() => {
    history.closeDB();
    try {
      if (mockUserDataPath && fs.existsSync(mockUserDataPath)) {
        fs.rmSync(mockUserDataPath, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  describe('Uninitialized DB handling', () => {
    it('should initialize db automatically when addHistory is called', () => {
      history.closeDB();
      // No initDB() called beforehand
      history.addHistory('https://auto-init.com', 'Auto Init', '');
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://auto-init.com');
    });

    it('should initialize db automatically when searchHistory is called', () => {
      history.closeDB();
      // No initDB() called beforehand
      const results = history.searchHistory('', 10);
      expect(results).toBeDefined();
    });
  });

  describe('initDB', () => {
    it('should create history.db file in userData path', () => {
      const dbPath = path.join(mockUserDataPath, 'history.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should create the history table with expected columns', () => {
      const dbPath = path.join(mockUserDataPath, 'history.db');
      const db = new Database(dbPath);
      const columnsInfo = db.pragma('table_info(history)');
      const columns = columnsInfo.map(col => col.name);

      expect(columns).toContain('id');
      expect(columns).toContain('url');
      expect(columns).toContain('title');
      expect(columns).toContain('favicon_url');
      expect(columns).toContain('visit_count');
      expect(columns).toContain('last_visited_timestamp');
      db.close();
    });
  });

  describe('addHistory', () => {
    it('should add a standard URL', () => {
      history.addHistory('https://example.com', 'Example', 'https://example.com/favicon.ico');
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://example.com');
      expect(results[0].title).toBe('Example');
      expect(results[0].favicon_url).toBe('https://example.com/favicon.ico');
      expect(results[0].visit_count).toBe(1);
    });

    it('should ignore about:blank', () => {
      history.addHistory('about:blank', 'Blank', '');
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(0);
    });

    it('should fallback to empty string when title and faviconUrl are omitted', () => {
      history.addHistory('https://notitle.com');
      const results = history.searchHistory('notitle.com', 10);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('');
      expect(results[0].favicon_url).toBe('');
    });

    it('should ignore ne:// protocol URLs', () => {
      history.addHistory('ne://welcome', 'Welcome', '');
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(0);
    });

    it('should increment visit_count on subsequent visits (when unthrottled)', () => {
      const t0 = 1000000;
      history.addHistory('https://example.com', 'Example', '', t0);
      let results = history.searchHistory('', 10);
      expect(results[0].visit_count).toBe(1);

      // Throttled visit within 10s
      history.addHistory('https://example.com', 'Example', '', t0 + 2000);
      results = history.searchHistory('', 10);
      expect(results[0].visit_count).toBe(1);

      // Unthrottled visit after 11s
      history.addHistory('https://example.com', 'Example', '', t0 + 13000);
      results = history.searchHistory('', 10);
      expect(results[0].visit_count).toBe(2);
    });

    it('should update title and favicon if provided on subsequent visit', () => {
      const t0 = 1000000;
      history.addHistory('https://example-update.com', 'Old Title', 'old.ico', t0);
      history.addHistory('https://example-update.com', 'New Title', 'new.ico', t0 + 11000);

      const results = history.searchHistory('', 10);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('New Title');
      expect(results[0].favicon_url).toBe('new.ico');
      expect(results[0].visit_count).toBe(2);
    });

    it('should cleanup old recentVisits entries when size exceeds 100', () => {
      const t0 = 1000000;
      for (let i = 0; i < 101; i++) {
        history.addHistory(`https://example${i}.com`, `Example ${i}`, '', t0);
      }

      history.addHistory('https://example-cleanup.com', 'Cleanup Trigger', '', t0 + 61000);

      const results = history.searchHistory('Cleanup Trigger', 1);
      expect(results.length).toBe(1);
    });
  });

  describe('removeBookmark', () => {
    it('should remove a bookmark by id', () => {
      const id = history.addBookmark('Test Bookmark', 'https://test.com');
      let bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(1);

      const result = history.removeBookmark(id);
      expect(result).toBe(true);

      bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(0);
    });

    it('should remove a folder and its immediate children', () => {
      const folderId = history.addBookmark('Test Folder', '', 0, 1);
      history.addBookmark('Child 1', 'https://child1.com', folderId, 0);
      history.addBookmark('Child 2', 'https://child2.com', folderId, 0);

      let bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(3);

      const result = history.removeBookmark(folderId);
      expect(result).toBe(true);

      bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(0);
    });

    it('should return true even when removing a non-existent id', () => {
      // In SQLite, DELETE without matching rows still succeeds
      const result = history.removeBookmark(999);
      expect(result).toBe(true);
    });

    it('should gracefully handle database errors', () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const dbPath = path.join(mockUserDataPath, 'history.db');
        const directDb = new Database(dbPath);
        directDb.exec('DROP TABLE bookmarks;');
        directDb.close();

        const result = history.removeBookmark(1);
        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith('Error removing bookmark:', expect.anything());
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('searchHistory', () => {
    beforeEach(() => {
      // Add sample data with ordered timestamps
      history.addHistory('https://apple.com', 'Apple', '', 1000000);
      history.addHistory('https://banana.com', 'Banana', '', 1011000);
      history.addHistory('https://cherry.com', 'Cherry', '', 1022000);
    });

    it('should return all history without query', () => {
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(3);
    });

    it('should respect the limit', () => {
      const results = history.searchHistory('', 2);
      expect(results.length).toBe(2);
    });

    it('should return matching results based on url query', () => {
      const results = history.searchHistory('banana', 10);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://banana.com');
    });

    it('should return matching results based on title query', () => {
      const results = history.searchHistory('Cherry', 10);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Cherry');
    });

    it('should fallback to default limit (50) when limit is omitted in searchHistory (no query)', () => {
      const results = history.searchHistory('');
      expect(results.length).toBe(3);
    });

    it('should fallback to default limit (50) when limit is omitted in searchHistory (with query)', () => {
      const results = history.searchHistory('Apple');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Apple');
    });

    it('should be ordered by last_visited_timestamp desc', () => {
      const results = history.searchHistory('', 10);
      expect(results.length).toBe(3);
      expect(results[0].title).toBe('Cherry');
      expect(results[1].title).toBe('Banana');
      expect(results[2].title).toBe('Apple');
    });
  });

  describe('deleteHistoryItems', () => {
    beforeEach(() => {
      history.addHistory('https://1.com', 'One');
      history.addHistory('https://2.com', 'Two');
      history.addHistory('https://3.com', 'Three');
    });

    it('should delete multiple history items by their IDs', () => {
      let results = history.searchHistory('', 10);
      expect(results.length).toBe(3);

      const idsToDelete = [results[0].id, results[1].id];
      const result = history.deleteHistoryItems(idsToDelete);
      expect(result).toBe(true);

      results = history.searchHistory('', 10);
      expect(results.length).toBe(1);
    });
  });

  describe('deleteHistoryItem', () => {
    beforeEach(() => {
      // Add sample data for testing deletion
      history.addHistory('https://apple.com', 'Apple', '');
      history.addHistory('https://banana.com', 'Banana', '');
    });

    it('should delete an existing history item by ID and return true', () => {
      let results = history.searchHistory('', 10);
      expect(results.length).toBe(2);

      const idToDelete = results[0].id;
      const result = history.deleteHistoryItem(idToDelete);

      expect(result).toBe(true);

      results = history.searchHistory('', 10);
      expect(results.length).toBe(1);
      expect(results.some(item => item.id === idToDelete)).toBe(false);
    });

    it('should return true and not delete anything if ID does not exist', () => {
      let results = history.searchHistory('', 10);
      expect(results.length).toBe(2);

      const result = history.deleteHistoryItem(9999);

      expect(result).toBe(true);

      results = history.searchHistory('', 10);
      expect(results.length).toBe(2);
    });

    it('should return false and catch error if database operation fails', () => {
      // Spy on console.error to avoid cluttering test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const dbPath = path.join(mockUserDataPath, 'history.db');
      const directDb = new Database(dbPath);
      directDb.exec('DROP TABLE history;');
      directDb.close();

      const result = history.deleteHistoryItem(1);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error deleting history item:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Bookmarks DB', () => {
    it('should return empty array when no bookmarks exist', () => {
      const results = history.getBookmarks();
      expect(results).toEqual([]);
    });

    it('should add and retrieve bookmarks', () => {
      history.addBookmark('Google', 'https://google.com');
      history.addBookmark('Folder', '', 0, 1); // A folder

      const results = history.getBookmarks();
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Google');
      expect(results[0].url).toBe('https://google.com');
      expect(results[0].is_folder).toBe(0);

      expect(results[1].title).toBe('Folder');
      expect(results[1].url).toBe('');
      expect(results[1].is_folder).toBe(1);
    });

    it('should retrieve bookmarks ordered by date_added ASC', () => {
      history.addBookmark('First', 'https://first.com');
      history.addBookmark('Second', 'https://second.com');
      history.addBookmark('Third', 'https://third.com');

      const results = history.getBookmarks();
      expect(results.length).toBe(3);
      expect(results[0].title).toBe('First');
      expect(results[1].title).toBe('Second');
      expect(results[2].title).toBe('Third');
    });

    it('should remove a bookmark', () => {
      const id = history.addBookmark('To Delete', 'https://delete.com');

      let results = history.getBookmarks();
      expect(results.find(b => b.id === id)).toBeDefined();

      history.removeBookmark(id);

      results = history.getBookmarks();
      expect(results.find(b => b.id === id)).toBeUndefined();
    });

    it('should remove a folder and its immediate children', () => {
      const folderId = history.addBookmark('Parent Folder', '', 0, 1);
      const childId = history.addBookmark('Child Bookmark', 'https://child.com', folderId, 0);

      let results = history.getBookmarks();
      expect(results.find(b => b.id === folderId)).toBeDefined();
      expect(results.find(b => b.id === childId)).toBeDefined();

      history.removeBookmark(folderId);

      results = history.getBookmarks();
      expect(results.find(b => b.id === folderId)).toBeUndefined();
      expect(results.find(b => b.id === childId)).toBeUndefined();
    });

    it('should add bookmarks batch recursively in a single transaction', () => {
      const tree = [
        { type: 'link', title: 'Link 1', url: 'https://link1.com' },
        {
          type: 'folder',
          title: 'Work Folder',
          children: [
            { type: 'link', title: 'Work 1', url: 'https://work1.com' },
            { type: 'link', title: 'Work 2', url: 'https://work2.com' }
          ]
        }
      ];

      const inserted = history.addBookmarksBatch(tree);
      expect(inserted).toBe(3);

      const all = history.getBookmarks();
      expect(all.length).toBe(4); // 3 links + 1 folder
      const folder = all.find(b => b.is_folder === 1);
      expect(folder).toBeDefined();
      expect(folder.title).toBe('Work Folder');

      const folderChildren = all.filter(b => b.parent_id === folder.id);
      expect(folderChildren.length).toBe(2);
    });
  });

  describe('clearAllHistory', () => {
    beforeEach(() => {
      history.addHistory('https://apple.com', 'Apple', '', 1000000);
      history.addHistory('https://banana.com', 'Banana', '', 1011000);
    });

    it('should delete all entries in the history table and return true on success', () => {
      // Ensure we have data
      let results = history.searchHistory('', 10);
      expect(results.length).toBe(2);

      const success = history.clearAllHistory();

      // Ensure the return value is true
      expect(success).toBe(true);

      // Verify history is empty
      results = history.searchHistory('', 10);
      expect(results.length).toBe(0);
    });

    it('should handle errors gracefully and return false on failure', () => {
      // Mock console.error to prevent polluting test output
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Drop history table to force SQL execution error
      const dbPath = path.join(mockUserDataPath, 'history.db');
      const directDb = new Database(dbPath);
      directDb.exec('DROP TABLE history;');
      directDb.close();

      const success = history.clearAllHistory();

      expect(success).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('Error clearing history:', expect.anything());

      errorSpy.mockRestore();
    });
  });

  describe('Settings DB', () => {
    it('should save and retrieve individual settings with type preservation', () => {
      expect(history.getSetting('theme', 'dark')).toBe('dark');
      history.setSetting('theme', 'nebula');
      expect(history.getSetting('theme')).toBe('nebula');

      history.setSetting('zoomLevel', 125);
      expect(history.getSetting('zoomLevel')).toBe(125);

      history.setSetting('features', { roundedCorners: true, memorySaver: 'aggressive' });
      expect(history.getSetting('features')).toEqual({ roundedCorners: true, memorySaver: 'aggressive' });
    });

    it('should retrieve all stored settings and perform transactional saves', () => {
      history.saveAllSettings({
        searchEngine: 'duckduckgo',
        httpsOnly: true,
        startupMode: 'welcome'
      });
      const all = history.getAllSettings();
      expect(all.searchEngine).toBe('duckduckgo');
      expect(all.httpsOnly).toBe(true);
      expect(all.startupMode).toBe('welcome');
    });

    describe('resetAllSettings', () => {
      it('should clear all settings if no default settings are provided', () => {
        history.setSetting('theme', 'dark');
        history.setSetting('zoomLevel', 125);
        expect(Object.keys(history.getAllSettings()).length).toBeGreaterThan(0);

        const result = history.resetAllSettings();
        expect(result).toBe(true);
        expect(history.getAllSettings()).toEqual({});
      });

      it('should clear all settings and set default settings if provided', () => {
        history.setSetting('theme', 'dark');
        const defaultSettings = { theme: 'light', showBookmarks: true };

        const result = history.resetAllSettings(defaultSettings);
        expect(result).toBe(true);
        expect(history.getAllSettings()).toEqual(defaultSettings);
      });

      it('should return false and log error if database execution fails', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Drop settings table to force SQL execution error
        const dbPath = path.join(mockUserDataPath, 'history.db');
        const directDb = new Database(dbPath);
        directDb.exec('DROP TABLE settings;');
        directDb.close();

        const result = history.resetAllSettings();

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error resetting settings:',
          expect.anything()
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Bookmarks API', () => {
    let consoleErrorMock;

    beforeEach(() => {
      consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorMock.mockRestore();
    });

    it('should auto-initialize the database when adding a bookmark', () => {
      history.closeDB();
      const id = history.addBookmark('Auto Init Bookmark', 'https://auto.com');
      expect(id).toBeDefined();
      const bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(1);
      expect(bookmarks[0].title).toBe('Auto Init Bookmark');
    });

    it('should successfully add a standard bookmark and return its ID', () => {
      const id = history.addBookmark('Example Bookmark', 'https://example.com');
      expect(id).toBeGreaterThan(0);

      const bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(1);
      expect(bookmarks[0].id).toBe(id);
      expect(bookmarks[0].title).toBe('Example Bookmark');
      expect(bookmarks[0].url).toBe('https://example.com');
      expect(bookmarks[0].parent_id).toBe(0);
      expect(bookmarks[0].is_folder).toBe(0);
      expect(bookmarks[0].date_added).toBeGreaterThan(0);
    });

    it('should store a folder bookmark with isFolder = 1', () => {
      const parentId = 1;
      const isFolder = 1;
      const id = history.addBookmark('Folder', null, parentId, isFolder);
      expect(id).toBeGreaterThan(0);

      const bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(1);
      expect(bookmarks[0].title).toBe('Folder');
      expect(bookmarks[0].url).toBe('');
      expect(bookmarks[0].parent_id).toBe(parentId);
      expect(bookmarks[0].is_folder).toBe(isFolder);
    });

    it('should handle omitted url by defaulting to empty string', () => {
      const id = history.addBookmark('No URL');
      expect(id).toBeGreaterThan(0);

      const bookmarks = history.getBookmarks();
      expect(bookmarks.length).toBe(1);
      expect(bookmarks[0].title).toBe('No URL');
      expect(bookmarks[0].url).toBe('');
    });

    it('should catch database errors, log them, and return null without crashing', () => {
      const dbPath = path.join(mockUserDataPath, 'history.db');
      const directDb = new Database(dbPath);
      directDb.exec('DROP TABLE bookmarks;');
      directDb.close();

      const id = history.addBookmark('Error Bookmark', 'https://error.com');
      expect(id).toBeNull();
      expect(consoleErrorMock).toHaveBeenCalled();
      expect(consoleErrorMock.mock.calls[0][0]).toBe('Error adding bookmark:');
    });
  });

  describe('Sessions API (Tab Persistence)', () => {
    it('should save and load tabs session accurately', () => {
      const tabs = [
        { id: 101, url: 'https://napture.io', title: 'Napture Browser', isPinned: 0 },
        { id: 102, url: 'https://github.com', title: 'GitHub', isPinned: 0 },
        { id: 103, url: 'https://en.wikipedia.org', title: 'Wikipedia', isPinned: 1 }
      ];

      const saved = history.saveSession(tabs);
      expect(saved).toBe(true);

      const loaded = history.loadSession();
      expect(loaded.length).toBe(3);
      expect(loaded[0].tabId).toBe(101);
      expect(loaded[0].url).toBe('https://napture.io');
      expect(loaded[0].title).toBe('Napture Browser');
      expect(loaded[0].isPinned).toBe(0);

      expect(loaded[1].tabId).toBe(102);
      expect(loaded[1].url).toBe('https://github.com');

      expect(loaded[2].tabId).toBe(103);
      expect(loaded[2].url).toBe('https://en.wikipedia.org');
      expect(loaded[2].isPinned).toBe(1);
    });

    it('should overwrite previous session with new session', () => {
      history.saveSession([
        { id: 1, url: 'https://initial.com', title: 'Initial', isPinned: 0 }
      ]);
      expect(history.loadSession().length).toBe(1);

      history.saveSession([
        { id: 2, url: 'https://updated.com', title: 'Updated', isPinned: 0 },
        { id: 3, url: 'https://second.com', title: 'Second', isPinned: 0 }
      ]);
      const loaded = history.loadSession();
      expect(loaded.length).toBe(2);
      expect(loaded[0].url).toBe('https://updated.com');
      expect(loaded[1].url).toBe('https://second.com');
    });

    it('should handle database errors gracefully and return false on save / [] on load', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const dbPath = path.join(mockUserDataPath, 'history.db');
      const directDb = new Database(dbPath);
      directDb.exec('DROP TABLE sessions;');
      directDb.close();

      const saved = history.saveSession([{ id: 1, url: 'https://fail.com', title: 'Fail' }]);
      expect(saved).toBe(false);

      const loaded = history.loadSession();
      expect(loaded).toEqual([]);

      errorSpy.mockRestore();
    });
  });
});
