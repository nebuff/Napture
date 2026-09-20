const path = require('path');
const os = require('os');
let mockUserDataPath = path.join(os.tmpdir(), 'napture-sync-test-' + process.pid);
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => name === 'userData' ? mockUserDataPath : '')
  }
}));
const { encryptPayload, decryptPayload } = require('../../napture/db/sync-engine');
const crypto = require('crypto');

describe('Napture Zero-Knowledge Sync Engine (E2EE)', () => {
  const testKey = crypto.randomBytes(32).toString('hex');

  test('encrypts and decrypts bookmarks data with folder hierarchies and positions', () => {
    const sampleBookmarks = [
      { id: 1, title: 'Napture Browser', url: 'https://napture.nebuff.xyz', parent_id: 0, is_folder: 0, date_added: 1700000000 },
      { id: 2, title: 'Dev Tools', url: '', parent_id: 0, is_folder: 1, date_added: 1700000100 },
      { id: 3, title: 'GitHub Repo', url: 'https://github.com/nebuff/NaptureDEV', parent_id: 2, is_folder: 0, date_added: 1700000200 }
    ];

    const encrypted = encryptPayload(sampleBookmarks, testKey);

    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('tag');
    expect(typeof encrypted.ciphertext).toBe('string');
    expect(encrypted.ciphertext).not.toContain('Napture Browser');

    const decrypted = decryptPayload(encrypted, testKey);
    expect(decrypted).toEqual(sampleBookmarks);
    expect(decrypted[0].title).toBe('Napture Browser');
    expect(decrypted[2].parent_id).toBe(2);
  });

  test('encrypts and decrypts browsing history and session cookies', () => {
    const sampleHistory = [
      { url: 'https://news.ycombinator.com', title: 'Hacker News', favicon_url: '', visit_count: 5, last_visited_timestamp: Date.now() }
    ];
    const sampleCookies = [
      { name: 'session_token', value: 'secret_abc123', domain: 'example.com', path: '/', secure: true }
    ];

    const encHistory = encryptPayload(sampleHistory, testKey);
    const decHistory = decryptPayload(encHistory, testKey);
    expect(decHistory).toEqual(sampleHistory);

    const encCookies = encryptPayload(sampleCookies, testKey);
    const decCookies = decryptPayload(encCookies, testKey);
    expect(decCookies).toEqual(sampleCookies);
  });

  test('encrypts and decrypts browser settings prioritizing changed preferences', () => {
    const { getChangedUserSettings } = require('../../napture/db/sync-engine');
    const sampleSettings = {
      searchEngine: 'duckduckgo',
      defaultZoom: '125',
      httpsOnly: true,
      customTheme: 'nord'
    };

    const encSettings = encryptPayload(sampleSettings, testKey);
    expect(encSettings).toHaveProperty('ciphertext');
    expect(encSettings.ciphertext).not.toContain('duckduckgo');

    const decSettings = decryptPayload(encSettings, testKey);
    expect(decSettings).toEqual(sampleSettings);
    expect(decSettings.searchEngine).toBe('duckduckgo');
    expect(decSettings.httpsOnly).toBe(true);
  });

  test('fails gracefully when decrypting with incorrect key or tampered ciphertext', () => {
    const wrongKey = crypto.randomBytes(32).toString('hex');
    const encrypted = encryptPayload({ secret: 'data' }, testKey);

    // Wrong key returns null (no crash)
    const resultWithWrongKey = decryptPayload(encrypted, wrongKey);
    expect(resultWithWrongKey).toBeNull();

    // Tampered ciphertext returns null
    const tampered = { ...encrypted, ciphertext: 'AAAA' + encrypted.ciphertext.slice(4) };
    const resultWithTampered = decryptPayload(tampered, testKey);
    expect(resultWithTampered).toBeNull();
  });

  test('sanitizes bookmarks tree by stripping runtime/transient fields', () => {
    const { sanitizeBookmarksTree } = require('../../napture/db/sync-engine');
    const dirtyTree = [
      {
        id: 'b-1',
        type: 'folder',
        title: 'Work',
        isOpen: true,
        _pendingRename: true,
        children: [
          {
            id: 'b-2',
            type: 'link',
            title: 'Docs',
            url: 'https://docs.google.com',
            favicon: 'https://docs.google.com/favicon.ico',
            tabId: 'tab-12345',
            _pendingRename: true
          }
        ]
      }
    ];

    const cleanTree = sanitizeBookmarksTree(dirtyTree);
    expect(cleanTree).toEqual([
      {
        id: 'b-1',
        type: 'folder',
        title: 'Work',
        children: [
          {
            id: 'b-2',
            type: 'link',
            title: 'Docs',
            url: 'https://docs.google.com',
            favicon: 'https://docs.google.com/favicon.ico'
          }
        ]
      }
    ]);
    expect(cleanTree[0].isOpen).toBeUndefined();
    expect(cleanTree[0]._pendingRename).toBeUndefined();
    expect(cleanTree[0].children[0].tabId).toBeUndefined();
    expect(cleanTree[0].children[0]._pendingRename).toBeUndefined();
  });

  test('deduplicates bookmark links by clean URL while preserving distinct folders', () => {
    const { deduplicateBookmarksTree } = require('../../napture/db/sync-engine');
    const inputTree = [
      { id: 'f-1', type: 'folder', title: 'Work', children: [] },
      { id: 'f-2', type: 'folder', title: 'Work', children: [] }, // Distinct folder id
      { id: 'b-1', type: 'link', title: 'Google', url: 'https://google.com/' },
      { id: 'b-2', type: 'link', title: 'Google Duplicate', url: 'https://google.com' } // Duplicate clean URL
    ];

    const deduplicated = deduplicateBookmarksTree(inputTree);
    expect(deduplicated.length).toBe(3); // 2 distinct folders + 1 unique link
    expect(deduplicated[0].id).toBe('f-1');
    expect(deduplicated[1].id).toBe('f-2');
    expect(deduplicated[2].url).toBe('https://google.com/');
  });

  test('enforces Last-Write-Wins conflict resolution: ignores stale remote deltas and applies newer ones', () => {
    const { applyRemoteDelta } = require('../../napture/db/sync-engine');
    const historyDb = require('../../napture/db/history');

    // Mock historyDb getSetting and setSetting for isolated test
    const storedSettings = {
      bookmarks_last_modified: 1000,
      pinned_sites_last_modified: 1000,
      settings_last_modified: 1000
    };

    const origGetSetting = historyDb.getSetting;
    const origSetSetting = historyDb.setSetting;
    const origClearAllBookmarks = historyDb.clearAllBookmarks;
    const origAddBookmarksBatch = historyDb.addBookmarksBatch;

    historyDb.getSetting = jest.fn((key, def) => storedSettings[key] !== undefined ? storedSettings[key] : def);
    historyDb.setSetting = jest.fn((key, val) => { storedSettings[key] = val; return true; });
    historyDb.clearAllBookmarks = jest.fn();
    historyDb.addBookmarksBatch = jest.fn();

    try {
      // 1. Stale remote delta (timestamp = 800 < local 1000) -> Must be rejected (returns false)
      const stalePayload = encryptPayload([{ id: 'b-old', type: 'link', title: 'Old', url: 'https://old.com' }], testKey);
      const staleDelta = {
        dataType: 'bookmarks',
        payload: stalePayload,
        timestamp: 800
      };
      const staleResult = applyRemoteDelta(staleDelta, testKey);
      expect(staleResult).toBe(false);
      expect(storedSettings.bookmarks_last_modified).toBe(1000); // Unchanged

      // 2. Newer remote delta (timestamp = 1200 >= local 1000) -> Must be applied (returns true)
      const newerPayload = encryptPayload([{ id: 'b-new', type: 'link', title: 'New', url: 'https://new.com' }], testKey);
      const newerDelta = {
        dataType: 'bookmarks',
        payload: newerPayload,
        timestamp: 1200
      };
      const newerResult = applyRemoteDelta(newerDelta, testKey);
      expect(newerResult).toBe(true);
      expect(storedSettings.bookmarks_last_modified).toBe(1200); // Updated to newer remote timestamp

      // 3. Pinned sites stale vs newer conflict resolution
      const stalePinnedPayload = encryptPayload([{ title: 'Old Pin', url: 'https://oldpin.com' }], testKey);
      const stalePinnedResult = applyRemoteDelta({ dataType: 'pinned_tabs', payload: stalePinnedPayload, timestamp: 900 }, testKey);
      expect(stalePinnedResult).toBe(false);

      const newerPinnedPayload = encryptPayload([{ title: 'New Pin', url: 'https://newpin.com' }], testKey);
      const newerPinnedResult = applyRemoteDelta({ dataType: 'pinned_tabs', payload: newerPinnedPayload, timestamp: 1500 }, testKey);
      expect(newerPinnedResult).toBe(true);
      expect(storedSettings.pinned_sites_last_modified).toBe(1500);

      // 4. Settings stale vs newer conflict resolution
      const staleSettingsPayload = encryptPayload({ searchEngine: 'bing' }, testKey);
      const staleSettingsResult = applyRemoteDelta({ dataType: 'settings', payload: staleSettingsPayload, timestamp: 700 }, testKey);
      expect(staleSettingsResult).toBe(false);

      const newerSettingsPayload = encryptPayload({ searchEngine: 'duckduckgo' }, testKey);
      const newerSettingsResult = applyRemoteDelta({ dataType: 'settings', payload: newerSettingsPayload, timestamp: 1600 }, testKey);
      expect(newerSettingsResult).toBe(true);
      expect(storedSettings.settings_last_modified).toBe(1600);
      expect(storedSettings.searchEngine).toBe('duckduckgo');
    } finally {
      historyDb.getSetting = origGetSetting;
      historyDb.setSetting = origSetSetting;
      historyDb.clearAllBookmarks = origClearAllBookmarks;
      historyDb.addBookmarksBatch = origAddBookmarksBatch;
    }
  });
});
