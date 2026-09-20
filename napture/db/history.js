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
