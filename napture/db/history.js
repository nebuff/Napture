const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const os = require('os');

let db = null;
let historyChangeListener = null;

function setHistoryChangeListener(fn) {
  historyChangeListener = fn;
}

function initDB() {
  recentVisits.clear();
  if (db) {
    try { db.close(); } catch (e) {}
  }
  const userDataPath = (app && typeof app.getPath === 'function') ? app.getPath('userData') : path.join(os.tmpdir(), 'napture-dev');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  const dbPath = path.join(userDataPath, 'history.db');
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      favicon_url TEXT,
      visit_count INTEGER DEFAULT 1,
      last_visited_timestamp INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT,
      title TEXT NOT NULL,
      date_added INTEGER,
      parent_id INTEGER DEFAULT 0,
      is_folder INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabId INTEGER,
      url TEXT,
      title TEXT,
      isPinned INTEGER DEFAULT 0,
      last_active INTEGER
    );
    -- Bolt: Add index on last_visited_timestamp to prevent O(N) full table scans
    -- during searchHistory() fetching. Significantly speeds up initial load of history panel.
    CREATE INDEX IF NOT EXISTS idx_history_last_visited ON history(last_visited_timestamp DESC);
  `);

  initSearchIndex();
}

// Keep track of recent visits to avoid duplicate visit_count increments on title/favicon updates
let recentVisits = new Map();

function addHistory(url, title, faviconUrl, forcedTimestamp = null) {
  if (!db) initDB();
  if (url === 'about:blank' || url.startsWith('napture://') || url.startsWith('ne://')) return;

  const now = forcedTimestamp || Date.now();

  // Throttle visit_count increment to once per 10 seconds per URL
  const lastVisitTime = recentVisits.get(url) || 0;
  let shouldIncrement = 0;
  if (now - lastVisitTime > 10000) {
    shouldIncrement = 1;
    recentVisits.set(url, now);
  }

  // Cleanup old recentVisits entries occasionally
  if (recentVisits.size > 100) {
    for (const [key, time] of recentVisits.entries()) {
      if (now - time > 60000) recentVisits.delete(key);
    }
  }

  const stmt = db.prepare(`
    INSERT INTO history (url, title, favicon_url, visit_count, last_visited_timestamp)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(url) DO UPDATE SET
      title = COALESCE(NULLIF(excluded.title, ''), history.title),
      favicon_url = COALESCE(NULLIF(excluded.favicon_url, ''), history.favicon_url),
      visit_count = history.visit_count + ?,
      last_visited_timestamp = CASE WHEN history.last_visited_timestamp > excluded.last_visited_timestamp THEN history.last_visited_timestamp ELSE excluded.last_visited_timestamp END
  `);
  stmt.run(url, title || '', faviconUrl || '', now, shouldIncrement);
  if (historyChangeListener && (shouldIncrement || forcedTimestamp)) {
    historyChangeListener();
  }
}

function searchHistory(query, limit = 50) {
  if (!db) initDB();

  if (query) {
    const stmt = db.prepare(`
      SELECT * FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY last_visited_timestamp DESC
      LIMIT ?
    `);
    const likeQuery = `%${query}%`;
    return stmt.all(likeQuery, likeQuery, limit);
  } else {
    const stmt = db.prepare(`
      SELECT * FROM history
      ORDER BY last_visited_timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
}

// --- Local full-text index (history, bookmarks and open tabs) ---
// FTS5 external-content tables are kept in sync with their source tables by
// triggers, so every write path (visits, imports, sync, bulk deletes) updates
// the index without extra bookkeeping. Everything stays in history.db.

const FTS_TABLES = ['history_fts', 'bookmarks_fts', 'sessions_fts'];

function initSearchIndex() {
  if (!db) return;

  let isNew = true;
  try {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('history_fts', 'bookmarks_fts', 'sessions_fts')"
    ).all();
    isNew = rows.length < FTS_TABLES.length;
  } catch (e) {
    isNew = true;
  }

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
        url, title, content='history', content_rowid='id', tokenize='porter unicode61'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
        url, title, content='bookmarks', content_rowid='id', tokenize='porter unicode61'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        url, title, content='sessions', content_rowid='id', tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS history_fts_insert AFTER INSERT ON history BEGIN
        INSERT INTO history_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;
      CREATE TRIGGER IF NOT EXISTS history_fts_delete AFTER DELETE ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
      END;
      CREATE TRIGGER IF NOT EXISTS history_fts_update AFTER UPDATE ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
        INSERT INTO history_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;

      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_insert AFTER INSERT ON bookmarks BEGIN
        INSERT INTO bookmarks_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;
      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_delete AFTER DELETE ON bookmarks BEGIN
        INSERT INTO bookmarks_fts(bookmarks_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
      END;
      CREATE TRIGGER IF NOT EXISTS bookmarks_fts_update AFTER UPDATE ON bookmarks BEGIN
        INSERT INTO bookmarks_fts(bookmarks_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
        INSERT INTO bookmarks_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_fts_insert AFTER INSERT ON sessions BEGIN
        INSERT INTO sessions_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;
      CREATE TRIGGER IF NOT EXISTS sessions_fts_delete AFTER DELETE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
      END;
      CREATE TRIGGER IF NOT EXISTS sessions_fts_update AFTER UPDATE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, url, title) VALUES ('delete', old.id, old.url, old.title);
        INSERT INTO sessions_fts(rowid, url, title) VALUES (new.id, new.url, new.title);
      END;
    `);

    // Backfill once, for databases that predate the index.
    if (isNew) {
      db.exec("INSERT INTO history_fts(history_fts) VALUES('rebuild')");
      db.exec("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
      db.exec("INSERT INTO sessions_fts(sessions_fts) VALUES('rebuild')");
    }
  } catch (e) {
    console.error('Error initializing search index:', e);
  }
}

// Turns free text into a safe FTS5 MATCH expression: every token becomes a
// quoted prefix term, so user input can never be parsed as FTS5 operators.
function sanitizeFtsQuery(query) {
  const tokens = String(query || '').toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return '';
  return tokens.map(token => '"' + token.replace(/"/g, '""') + '"*').join(' ');
}

const KIND_BOOST = { tab: 0.55, bookmark: 0.35, history: 0 };
const KIND_ORDER = { tab: 0, bookmark: 1, history: 2 };

function recencyBoost(timestamp) {
  if (!timestamp) return 0;
  const age = Date.now() - timestamp;
  if (age < 0) return 0;
  if (age < 86400000) return 0.3;
  if (age < 604800000) return 0.15;
  if (age < 2592000000) return 0.05;
  return 0;
}

function searchIndex(query, limit = 25) {
  if (!db) initDB();
  const match = sanitizeFtsQuery(query);
  if (!match) return [];

  const maxPerSource = Math.max(limit, 10);
  const collected = [];

  try {
    const rows = db.prepare(`
      SELECT h.url, h.title, h.favicon_url, h.visit_count, h.last_visited_timestamp AS ts,
             bm25(history_fts, 1.0, 5.0) AS bm,
             snippet(history_fts, 1, char(1), char(2), '…', 12) AS snip
      FROM history_fts
      JOIN history h ON h.id = history_fts.rowid
      WHERE history_fts MATCH ?
      ORDER BY bm
      LIMIT ?
    `).all(match, maxPerSource);

    for (const row of rows) {
      collected.push({
        kind: 'history',
        url: row.url,
        title: row.title || '',
        favicon_url: row.favicon_url || null,
        snippet: row.snip || '',
        timestamp: row.ts || null,
        score: -row.bm + KIND_BOOST.history + Math.min(row.visit_count || 0, 20) * 0.02 + recencyBoost(row.ts)
      });
    }
  } catch (e) {
    console.error('Search index history query failed:', e);
  }

  try {
    const rows = db.prepare(`
      SELECT b.url, b.title, b.date_added AS ts,
             bm25(bookmarks_fts, 1.0, 5.0) AS bm,
             snippet(bookmarks_fts, 1, char(1), char(2), '…', 12) AS snip
      FROM bookmarks_fts
      JOIN bookmarks b ON b.id = bookmarks_fts.rowid
      WHERE bookmarks_fts MATCH ? AND b.is_folder = 0 AND b.url IS NOT NULL AND b.url != ''
      ORDER BY bm
      LIMIT ?
    `).all(match, maxPerSource);

    for (const row of rows) {
      collected.push({
        kind: 'bookmark',
        url: row.url,
        title: row.title || '',
        favicon_url: null,
        snippet: row.snip || '',
        timestamp: row.ts || null,
        score: -row.bm + KIND_BOOST.bookmark
      });
    }
  } catch (e) {
    console.error('Search index bookmark query failed:', e);
  }

  try {
    const rows = db.prepare(`
      SELECT s.url, s.title, s.isPinned, s.last_active AS ts,
             bm25(sessions_fts, 1.0, 5.0) AS bm,
             snippet(sessions_fts, 1, char(1), char(2), '…', 12) AS snip
      FROM sessions_fts
      JOIN sessions s ON s.id = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
      ORDER BY bm
      LIMIT ?
    `).all(match, maxPerSource);

    for (const row of rows) {
      collected.push({
        kind: 'tab',
        url: row.url,
        title: row.title || '',
        favicon_url: null,
        snippet: row.snip || '',
        timestamp: row.ts || null,
        score: -row.bm + KIND_BOOST.tab + (row.isPinned ? 0.1 : 0) + recencyBoost(row.ts)
      });
    }
  } catch (e) {
    console.error('Search index tab query failed:', e);
  }

  // One row per URL, keeping the strongest match and every source it matched.
  const byUrl = new Map();
  for (const item of collected) {
    if (!item.url) continue;
    const key = String(item.url).trim().toLowerCase().replace(/\/+$/, '');
    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, Object.assign({}, item, { kinds: [item.kind] }));
      continue;
    }

    if (!existing.kinds.includes(item.kind)) {
      existing.kinds.push(item.kind);
      existing.kinds.sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]);
    }
    if (!existing.favicon_url && item.favicon_url) {
      existing.favicon_url = item.favicon_url;
    }
    if (!existing.snippet && item.snippet) {
      existing.snippet = item.snippet;
    }
    if (item.score > existing.score) {
      const kinds = existing.kinds;
      byUrl.set(key, Object.assign({}, item, { kinds }));
    }
  }

  return Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function closeDB() {
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }
  recentVisits.clear();
}

function getSetting(key, defaultValue = null) {
  if (!db) initDB();
  try {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    if (row && row.value !== undefined) {
      try { return JSON.parse(row.value); } catch (e) { return row.value; }
    }
  } catch (e) {
    console.error('Error reading setting:', key, e);
  }
  return defaultValue;
}

function setSetting(key, value) {
  if (!db) initDB();
  try {
    const serialized = JSON.stringify(value);
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, serialized);
    return true;
  } catch (e) {
    console.error('Error saving setting:', key, e);
    return false;
  }
}

function getAllSettings() {
  if (!db) initDB();
  const settings = {};
  try {
    const stmt = db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all();
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; }
    }
  } catch (e) {
    console.error('Error retrieving all settings:', e);
  }
  return settings;
}

function saveAllSettings(newSettings) {
  if (!db) initDB();
  if (!newSettings || typeof newSettings !== 'object') return false;
  try {
    const insert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const transaction = db.transaction((obj) => {
      for (const [k, v] of Object.entries(obj)) {
        insert.run(k, JSON.stringify(v));
      }
    });
    transaction(newSettings);
    return true;
  } catch (e) {
    console.error('Error saving all settings in transaction:', e);
    return false;
  }
}

function clearAllHistory() {
  if (!db) initDB();
  try {
    db.exec('DELETE FROM history;');
    if (historyChangeListener) historyChangeListener();
    return true;
  } catch (e) {
    console.error('Error clearing history:', e);
    return false;
  }
}

function deleteHistoryItem(id) {
  if (!db) initDB();
  try {
    const stmt = db.prepare('DELETE FROM history WHERE id = ?');
    stmt.run(id);
    if (historyChangeListener) historyChangeListener();
    return true;
  } catch (e) {
    console.error('Error deleting history item:', e);
    return false;
  }
}

function deleteHistoryItems(ids) {
  if (!db) initDB();
  if (!Array.isArray(ids) || ids.length === 0) return false;
  try {
    const stmt = db.prepare('DELETE FROM history WHERE id = ?');
    const transaction = db.transaction((idList) => {
      for (const id of idList) {
        stmt.run(id);
      }
    });
    transaction(ids);
    if (historyChangeListener) historyChangeListener();
    return true;
  } catch (e) {
    console.error('Error deleting history items:', e);
    return false;
  }
}

function resetAllSettings(defaultSettings = {}) {
  if (!db) initDB();
  try {
    db.exec('DELETE FROM settings;');
    if (Object.keys(defaultSettings).length > 0) {
      saveAllSettings(defaultSettings);
    }
    return true;
  } catch (e) {
    console.error('Error resetting settings:', e);
    return false;
  }
}

function clearAllBookmarks() {
  if (!db) initDB();
  try {
    db.exec('DELETE FROM bookmarks;');
    return true;
  } catch (e) {
    console.error('Error clearing bookmarks:', e);
    return false;
  }
}

function clearAllSessions() {
  if (!db) initDB();
  try {
    db.exec('DELETE FROM sessions;');
    return true;
  } catch (e) {
    console.error('Error clearing sessions:', e);
    return false;
  }
}

function resetAllData(defaultSettings = {}) {
  if (!db) initDB();
  try {
    const transaction = db.transaction(() => {
      db.exec('DELETE FROM history;');
      db.exec('DELETE FROM bookmarks;');
      db.exec('DELETE FROM sessions;');
      db.exec('DELETE FROM settings;');
      if (Object.keys(defaultSettings).length > 0) {
        const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(defaultSettings)) {
          const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
          insert.run(key, valStr);
        }
      }
    });
    transaction();
    try {
      db.exec('VACUUM;');
    } catch (ve) {}
    return true;
  } catch (e) {
    console.error('Error in resetAllData:', e);
    return false;
  }
}

// --- Bookmarks API ---

function addBookmark(title, url, parentId = 0, isFolder = 0) {
  if (!db) initDB();
  try {
    const stmt = db.prepare('INSERT INTO bookmarks (title, url, date_added, parent_id, is_folder) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(title, url || '', Date.now(), parentId, isFolder);
    return info.lastInsertRowid;
  } catch (e) {
    console.error('Error adding bookmark:', e);
    return null;
  }
}

function removeBookmark(id) {
  if (!db) initDB();
  try {
    // Delete bookmark and its children if it's a folder (basic recursion or flat delete by parent_id)
    const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ? OR parent_id = ?');
    stmt.run(id, id);
    return true;
  } catch (e) {
    console.error('Error removing bookmark:', e);
    return false;
  }
}

function getBookmarks() {
  if (!db) initDB();
  try {
    const stmt = db.prepare('SELECT * FROM bookmarks ORDER BY date_added ASC');
    return stmt.all();
  } catch (e) {
    console.error('Error getting bookmarks:', e);
    return [];
  }
}

function addBookmarksBatch(nodes, parentId = 0) {
  if (!db) initDB();
  if (!Array.isArray(nodes) || nodes.length === 0) return 0;

  let insertedCount = 0;
  const insertStmt = db.prepare('INSERT INTO bookmarks (title, url, date_added, parent_id, is_folder) VALUES (?, ?, ?, ?, ?)');

  const processBatch = db.transaction((items, pId) => {
    for (const item of items) {
      if (item.type === 'link' || (!item.children && item.url)) {
        insertStmt.run(item.title || 'Bookmark', item.url || '', item.dateAdded || Date.now(), pId, 0);
        insertedCount++;
      } else if (item.type === 'folder' || item.children) {
        const folderInfo = insertStmt.run(item.title || 'Folder', '', item.dateAdded || Date.now(), pId, 1);
        const folderDbId = folderInfo.lastInsertRowid;
        if (Array.isArray(item.children) && item.children.length > 0) {
          processBatch(item.children, folderDbId);
        }
      }
    }
  });

  try {
    processBatch(nodes, parentId);
  } catch (e) {
    console.error('Error in addBookmarksBatch:', e);
  }
  return insertedCount;
}

// --- Sessions API ---

function saveSession(tabs) {
  if (!db) initDB();
  try {
    const insert = db.prepare('INSERT INTO sessions (tabId, url, title, isPinned, last_active) VALUES (?, ?, ?, ?, ?)');
    const transaction = db.transaction((tabList) => {
      db.exec('DELETE FROM sessions'); // clear old session
      for (const t of tabList) {
        insert.run(t.id, t.url, t.title, t.isPinned ? 1 : 0, Date.now());
      }
    });
    transaction(tabs);
    return true;
  } catch (e) {
    console.error('Error saving session:', e);
    return false;
  }
}

function loadSession() {
  if (!db) initDB();
  try {
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY id ASC');
    return stmt.all();
  } catch (e) {
    console.error('Error loading session:', e);
    return [];
  }
}

function optimizeDatabase() {
  if (!db) initDB();
  try {
    db.exec('VACUUM;');
    return true;
  } catch (e) {
    console.error('Error optimizing database:', e);
    return false;
  }
}

module.exports = {
  initDB,
  closeDB,
  addHistory,
  searchHistory,
  searchIndex,
  sanitizeFtsQuery,
  getSetting,
  setSetting,
  getAllSettings,
  saveAllSettings,
  clearAllHistory,
  deleteHistoryItem,
  deleteHistoryItems,
  resetAllSettings,
  resetAllData,
  clearAllBookmarks,
  clearAllSessions,
  optimizeDatabase,
  addBookmark,
  addBookmarksBatch,
  removeBookmark,
  getBookmarks,
  saveSession,
  loadSession,
  setHistoryChangeListener,
  runInTransaction: (cb) => {
    if (!db) initDB();
    return db.transaction(cb)();
  }
};
