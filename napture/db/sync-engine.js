const crypto = require('crypto');
const os = require('os');
const path = require('path');
const dns = require('dns');
const historyDb = require('./history');

// Ensure reliable DNS resolution via Cloudflare 1.1.1.1 and prefer IPv4
try {
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
  dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']);
} catch (e) {}

// Default public sync gateway URL
const DEFAULT_SERVER_URL = 'https://api.nebuff.xyz';

let activeWs = null;
let syncInterval = null;
let lastSyncedTimestamp = 0;

function getLastSyncedTimestamp() {
  try {
    return historyDb.getSetting('sync_last_pulled_timestamp', 0) || lastSyncedTimestamp;
  } catch (e) {
    return lastSyncedTimestamp;
  }
}

// --- Cryptographic Primitives (E2EE AES-256-GCM) ---

function generateKey() {
  return crypto.randomBytes(32).toString('hex'); // 256-bit AES key
}

function encryptPayload(data, keyHex) {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const jsonStr = JSON.stringify(data);
    let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag().toString('base64');
    
    return {
      iv: iv.toString('base64'),
      ciphertext: encrypted,
      tag: authTag
    };
  } catch (err) {
    console.error('Encryption error:', err);
    throw err;
  }
}

function decryptPayload(encryptedObj, keyHex) {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(encryptedObj.iv, 'base64');
    const authTag = Buffer.from(encryptedObj.tag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedObj.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Decryption error (possibly wrong key or corrupted payload):', err);
    return null;
  }
}

// --- Local Device & Sync Identity ---

function getOrCreateDeviceId() {
  let deviceId = historyDb.getSetting('sync_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    historyDb.setSetting('sync_device_id', deviceId);
  }
  return deviceId;
}

function getDeviceName() {
  const custom = historyDb.getSetting('sync_device_name');
  if (custom) return custom;
  
  const platform = process.platform;
  let osName = 'Desktop';
  if (platform === 'win32') osName = 'Windows';
  else if (platform === 'darwin') osName = 'Mac';
  else if (platform === 'linux') osName = 'Linux';
  
  return `${os.hostname() || 'Napture'} (${osName})`;
}

function getServerUrl() {
  return historyDb.getSetting('sync_server_url', DEFAULT_SERVER_URL).replace(/\/+$/, '');
}

async function safeFetch(url, options = {}, retries = 2) {
  let lastError = null;
  const timeoutMs = options.timeoutMs || 8000;
  const fetchOpts = { ...options };
  delete fetchOpts.timeoutMs;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        ...fetchOpts,
        signal: controller.signal
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  const causeMsg = lastError?.cause?.message || lastError?.message || 'Network request failed';
  const err = new Error(causeMsg);
  if (lastError?.name === 'AbortError' || causeMsg.includes('aborted')) {
    err.name = 'AbortError';
  }
  err.cause = lastError;
  throw err;
}

function getSyncOptions() {
  return historyDb.getSetting('sync_options', {
    syncBookmarks: true,
    syncPinnedTabs: true,
    syncHistory: true,
    syncCookies: true,
    syncSettings: true
  });
}

function setSyncOptions(options) {
  const current = getSyncOptions();
  const updated = { ...current, ...options };
  historyDb.setSetting('sync_options', updated);
  return updated;
}

// --- Status & Connected Devices API ---

async function getSyncStatus() {
  const deviceId = getOrCreateDeviceId();
  const deviceName = getDeviceName();
  const groupId = historyDb.getSetting('sync_group_id', null);
  const encryptionKey = historyDb.getSetting('sync_encryption_key', null);
  const serverUrl = getServerUrl();
  const syncOptions = getSyncOptions();
  const isLinked = !!(groupId && encryptionKey);

  let connectedDevices = [];
  if (isLinked) {
    try {
      const res = await safeFetch(`${serverUrl}/api/devices/${groupId}`, { timeoutMs: 4000 }, 1);
      if (res.ok) {
        const data = await res.json();
        connectedDevices = data.devices || [];
      } else if (res.status === 404) {
        leaveSyncGroup();
        return getSyncStatus();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Could not fetch connected devices list from server:', e.message);
      }
    }
  }

  return {
    isLinked,
    deviceId,
    deviceName,
    groupId,
    serverUrl,
    syncOptions,
    lastSyncedTimestamp,
    connectedDevices
  };
}

// --- Group Initialization & Pairing ---

async function initSyncGroup(customName) {
  const serverUrl = getServerUrl();
  const deviceId = getOrCreateDeviceId();
  if (customName) historyDb.setSetting('sync_device_name', customName);
  const deviceName = getDeviceName();

  const groupId = crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const encryptionKey = generateKey();

  // 1. Create group on server
  const createRes = await safeFetch(`${serverUrl}/api/group/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, salt, maxDevices: 5 })
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create sync group on server: ${createRes.status}`);
  }

  // 2. Register local device
  const regRes = await safeFetch(`${serverUrl}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId,
      deviceId,
      deviceName,
      platform: process.platform
    })
  });

  if (!regRes.ok) {
    const errData = await regRes.json();
    throw new Error(errData.error || 'Failed to register device');
  }

  // 3. Save locally
  historyDb.setSetting('sync_group_id', groupId);
  historyDb.setSetting('sync_encryption_key', encryptionKey);

  // Connect WebSocket & Trigger initial sync
  connectWebSocket();
  await syncData();

  return getSyncStatus();
}

async function generatePairingCode() {
  const groupId = historyDb.getSetting('sync_group_id');
  const encryptionKey = historyDb.getSetting('sync_encryption_key');
  const serverUrl = getServerUrl();

  if (!groupId || !encryptionKey) {
    throw new Error('This device is not part of a sync group yet');
  }

  // Payload with credentials, encrypted using key
  const rawPayload = JSON.stringify({ groupId, encryptionKey });
  const payloadCipher = encryptPayload(rawPayload, encryptionKey);
  const encryptedPayload = JSON.stringify({
    cipher: payloadCipher,
    keyHint: encryptionKey.slice(0, 8), // Verification hint
    fullKey: encryptionKey // Enclosed for direct exchange via code
  });

  const res = await safeFetch(`${serverUrl}/api/pair/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, encryptedPayload })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to generate pairing code');
  }

  const data = await res.json();
  return {
    code: data.code,
    expiresAt: data.expiresAt
  };
}

async function joinWithPairingCode(code, customName) {
  const serverUrl = getServerUrl();
  const deviceId = getOrCreateDeviceId();
  if (customName) historyDb.setSetting('sync_device_name', customName);
  const deviceName = getDeviceName();

  if (!code || typeof code !== 'string') {
    throw new Error('Please enter a valid pairing code');
  }

  // Robust code normalization (supports NAPT-1234-5678, 12345678, 1234-5678, lowercase, spaces)
  let formattedCode = code.toUpperCase().trim();
  const clean = formattedCode.replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('NAPT') && clean.length === 12) {
    const digits = clean.slice(4);
    formattedCode = `NAPT-${digits.slice(0, 4)}-${digits.slice(4)}`;
  } else if (clean.length === 8) {
    formattedCode = `NAPT-${clean.slice(0, 4)}-${clean.slice(4)}`;
  }

  // 1. Claim code on server
  let claimRes;
  try {
    claimRes = await safeFetch(`${serverUrl}/api/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: formattedCode })
    });
  } catch (netErr) {
    const detail = netErr?.cause?.message || netErr?.message || 'Network request failed';
    throw new Error(`Cannot reach sync server (${detail})`);
  }

  if (!claimRes.ok) {
    let errMsg = 'Invalid or expired pairing code';
    try {
      const err = await claimRes.json();
      if (err && err.error) errMsg = err.error;
    } catch (e) {}
    throw new Error(errMsg);
  }

  const data = await claimRes.json();
  let payloadObj;
  try {
    payloadObj = typeof data.encryptedPayload === 'string' ? JSON.parse(data.encryptedPayload) : data.encryptedPayload;
  } catch (e) {
    throw new Error('Corrupted pairing payload from server');
  }

  const groupId = data.groupId;
  const encryptionKey = payloadObj.fullKey;

  if (!groupId || !encryptionKey) {
    throw new Error('Invalid credentials in pairing response');
  }

  // 2. Register this device in the group
  const regRes = await safeFetch(`${serverUrl}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId,
      deviceId,
      deviceName,
      platform: process.platform
    })
  });

  if (!regRes.ok) {
    const err = await regRes.json();
    throw new Error(err.error || 'Failed to link device to group');
  }

  // 3. Save locally
  historyDb.setSetting('sync_group_id', groupId);
  historyDb.setSetting('sync_encryption_key', encryptionKey);

  // Connect WebSocket & pull initial state
  connectWebSocket();
  await syncData();

  return getSyncStatus();
}

async function unlinkDevice(targetDeviceId) {
  const groupId = historyDb.getSetting('sync_group_id');
  const serverUrl = getServerUrl();
  if (!groupId) return false;

  const res = await safeFetch(`${serverUrl}/api/devices/${groupId}/${targetDeviceId}`, {
    method: 'DELETE'
  });

  if (targetDeviceId === getOrCreateDeviceId()) {
    leaveSyncGroup();
  }

  return res.ok;
}

async function renameDevice(targetDeviceId, newName) {
  const groupId = historyDb.getSetting('sync_group_id');
  const serverUrl = getServerUrl();
  const currentDeviceId = getOrCreateDeviceId();

  if (!groupId) throw new Error('Not connected to a sync group');

  if (targetDeviceId === currentDeviceId) {
    historyDb.setSetting('sync_device_name', newName);
  }

  // 1. Attempt dedicated rename endpoint
  let res = await safeFetch(`${serverUrl}/api/devices/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId,
      deviceId: targetDeviceId,
      deviceName: newName
    })
  });

  // 2. Fallback to /api/devices/register if rename endpoint is not present on server (404)
  if (!res.ok && res.status === 404) {
    res = await safeFetch(`${serverUrl}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        deviceId: targetDeviceId,
        deviceName: newName,
        platform: process.platform
      })
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to rename device on server');
  }

  if (syncUpdateNotifier) {
    try { syncUpdateNotifier(); } catch (e) {}
  }

  return await getSyncStatus();
}

function leaveSyncGroup() {
  historyDb.setSetting('sync_group_id', null);
  historyDb.setSetting('sync_encryption_key', null);
  if (activeWs) {
    try { activeWs.close(); } catch (e) {}
    activeWs = null;
  }
  return true;
}

let syncUpdateNotifier = null;
let cookiesImporter = null;

function setSyncUpdateNotifier(fn) {
  syncUpdateNotifier = fn;
}

function setCookiesImporter(fn) {
  cookiesImporter = fn;
}

const EXCLUDED_SETTINGS_KEYS = new Set([
  'sync_group_id',
  'sync_encryption_key',
  'sync_device_id',
  'sync_device_name',
  'sync_options',
  'sync_last_pulled_timestamp',
  'bookmarks_tree',
  'bookmarks_last_modified',
  'pinned_sites_sync',
  'pinned_sites_last_modified',
  'pinnedSites',
  'last_synced_timestamp',
  'installed_version',
  'update_status',
  'downloadPath'
]);

function getChangedUserSettings() {
  const defaults = {
    dynamicBackground: true,
    defaultZoom: '100',
    folderHoverOpen: false,
    switchToExistingTab: true,
    showHomeBtn: true,
    homeUrl: 'napture://welcome',
    toolbarLayout: JSON.stringify([
      { id: 'home-btn', type: 'system', name: 'Home Button', enabled: true },
      { id: 'sep-1', type: 'separator', name: 'Fixed Separator', enabled: true },
      { id: 'back-btn', type: 'system', name: 'Back Button', enabled: true },
      { id: 'forward-btn', type: 'system', name: 'Forward Button', enabled: true },
      { id: 'reload-btn', type: 'system', name: 'Reload Button', enabled: true },
      { id: 'margin-1', type: 'margin', name: 'Flexible Space', enabled: true },
      { id: 'address-container', type: 'system', name: 'Address Bar & Search', enabled: true }
    ]),
    addressSuggestions: true,
    showFullUrl: false,
    searchEngine: 'napture',
    safeBrowsing: 'standard',
    blockCookies: 'incognito',
    doNotTrack: false,
    httpsOnly: false,
    secureDns: 'cloudflare',
    startupMode: 'restore_all',
    askSaveLocation: false,
    language: 'en-US',
    spellCheck: true,
    offerTranslate: true,
    memorySaver: false,
    memoryTarget: 700,
    batterySaver: false,
    performanceMode: 'balanced',
    hardwareAcceleration: true
  };

  const allStored = historyDb.getAllSettings();
  const changed = {};

  for (const [key, val] of Object.entries(allStored)) {
    if (EXCLUDED_SETTINGS_KEYS.has(key)) continue;
    // Only package settings that were explicitly configured or differ from default
    if (defaults.hasOwnProperty(key)) {
      if (JSON.stringify(val) !== JSON.stringify(defaults[key])) {
        changed[key] = val;
      }
    } else {
      changed[key] = val;
    }
  }
  return changed;
}

function sanitizeBookmarksTree(tree) {
  if (!Array.isArray(tree)) return [];
  return tree.map(item => {
    if (!item) return null;
    if (item.type === 'folder' || item.children) {
      return {
        id: item.id || ('b-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7)),
        type: 'folder',
        title: item.title || 'Folder',
        children: sanitizeBookmarksTree(item.children || [])
      };
    } else {
      return {
        id: item.id || ('b-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7)),
        type: 'link',
        title: item.title || 'Bookmark',
        url: item.url || '',
        favicon: item.favicon || null
      };
    }
  }).filter(Boolean);
}

function deduplicateBookmarksTree(tree) {
  if (!Array.isArray(tree)) return [];
  const merged = [];
  const seenIds = new Set();
  const seenUrls = new Set();

  for (const item of tree) {
    if (!item) continue;
    if (item.type === 'folder' || item.children) {
      const folderId = item.id || ('f-' + (item.title || 'Folder').trim().toLowerCase());
      if (seenIds.has(folderId)) continue;
      seenIds.add(folderId);

      const folderCopy = {
        id: item.id || ('b-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7)),
        type: 'folder',
        title: item.title || 'Folder',
        isOpen: item.isOpen !== undefined ? Boolean(item.isOpen) : false,
        children: deduplicateBookmarksTree(item.children || [])
      };
      merged.push(folderCopy);
    } else if (item.type === 'link' || item.url) {
      const cleanUrl = (item.url || '').trim().toLowerCase().replace(/\/+$/, '');
      if (!cleanUrl || !seenUrls.has(cleanUrl)) {
        if (cleanUrl) seenUrls.add(cleanUrl);
        merged.push({
          id: item.id || ('b-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7)),
          type: 'link',
          title: item.title || 'Bookmark',
          url: item.url || '',
          favicon: item.favicon || null
        });
      }
    }
  }
  return merged;
}

let lastPushedBookmarksHash = '';
let lastPushedPinnedHash = '';
let lastPushedHistoryTimestamp = 0;
let lastPushedCookiesHash = '';

function resetCookiesSyncState() {
  lastPushedCookiesHash = '';
}
let lastPushedSettingsHash = '';

// --- Data Synchronization (Push & Pull) ---

async function pullData() {
  const groupId = historyDb.getSetting('sync_group_id');
  const encryptionKey = historyDb.getSetting('sync_encryption_key');
  const serverUrl = getServerUrl();
  const deviceId = getOrCreateDeviceId();

  if (!groupId || !encryptionKey) return { synced: false, reason: 'Not linked' };

  try {
    const since = getLastSyncedTimestamp();
    const pullRes = await safeFetch(`${serverUrl}/api/sync/pull?groupId=${groupId}&since=${since}&excludeDeviceId=${deviceId}`);
    if (pullRes.ok) {
      const pullData = await pullRes.json();
      let hasLocalNewerConflict = false;

      if (Array.isArray(pullData.deltas) && pullData.deltas.length > 0) {
        // Deduplicate deltas by dataType to only process the newest snapshot
        // This prevents synchronous AES decryption from freezing the main thread if there are many historical deltas
        const latestDeltas = new Map();
        for (const delta of pullData.deltas) {
          const type = delta.data_type || delta.dataType;
          const ts = delta.created_at || delta.timestamp || 0;
          const existing = latestDeltas.get(type);
          if (!existing || ts > (existing.created_at || existing.timestamp || 0)) {
            latestDeltas.set(type, delta);
          }
        }

        historyDb.runInTransaction(() => {
          for (const remoteDelta of latestDeltas.values()) {
            const applied = applyRemoteDelta(remoteDelta, encryptionKey);
            if (applied === false) {
              // Local changes were strictly newer than remote delta
              hasLocalNewerConflict = true;
            }
          }
        });
      }
      lastSyncedTimestamp = pullData.serverTime || Date.now();
      try { historyDb.setSetting('sync_last_pulled_timestamp', lastSyncedTimestamp); } catch (e) {}

      // If local modifications were newer than incoming remote deltas, push local state to update the cluster
      if (hasLocalNewerConflict) {
        pushData(null, true).catch(() => {});
      }

      return { synced: true, count: pullData.deltas ? pullData.deltas.length : 0, timestamp: lastSyncedTimestamp };
    } else if (pullRes.status === 404) {
      leaveSyncGroup();
      return { synced: false, reason: 'Group not found' };
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      const isNetError = err.message && (err.message.includes('fetch failed') || err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED') || err.message.includes('Network request failed'));
      if (isNetError) {
        console.warn(`[Sync] Server unreachable (${err.cause?.code || err.message}), will retry next cycle`);
      } else {
        console.error('Error during pullData cycle:', err);
      }
    }
    return { synced: false, error: err.message };
  }
  return { synced: false };
}

async function pushData(cookiesGetter = null, forcePush = false) {
  const groupId = historyDb.getSetting('sync_group_id');
  const encryptionKey = historyDb.getSetting('sync_encryption_key');
  const serverUrl = getServerUrl();
  const deviceId = getOrCreateDeviceId();
  const options = getSyncOptions();

  if (!groupId || !encryptionKey) return { pushed: false, reason: 'Not linked' };

  try {
    const deltasToPush = [];
    const now = Date.now();
    let pendingBookmarksHash = null;
    let pendingPinnedHash = null;
    let pendingHistoryTimestamp = null;
    let pendingCookiesHash = null;
    let pendingSettingsHash = null;

    // 1. Prepare Bookmarks Delta (only if local tree changed)
    if (options.syncBookmarks) {
      let bookmarksTree = historyDb.getSetting('bookmarks_tree', null);
      if (Array.isArray(bookmarksTree)) {
        const sanitizedTree = sanitizeBookmarksTree(bookmarksTree);
        const cleanedTree = deduplicateBookmarksTree(sanitizedTree);
        const currentHash = crypto.createHash('sha256').update(JSON.stringify(cleanedTree)).digest('hex');
        if (forcePush || currentHash !== lastPushedBookmarksHash) {
          const lastModified = historyDb.getSetting('bookmarks_last_modified', 0) || now;
          const encryptedBookmarks = encryptPayload(cleanedTree, encryptionKey);
          deltasToPush.push({
            dataType: 'bookmarks',
            payload: encryptedBookmarks,
            version: 1,
            timestamp: lastModified
          });
          pendingBookmarksHash = currentHash;
        }
      }
    }

    // 2. Prepare Pinned Tabs Delta (only if local pinned sites changed)
    if (options.syncPinnedTabs !== false) {
      let pinnedSites = historyDb.getSetting('pinned_sites_sync', null);
      if (Array.isArray(pinnedSites)) {
        const uniquePinned = [];
        const seen = new Set();
        for (const p of pinnedSites) {
          if (!p || !p.url) continue;
          const clean = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
          if (!seen.has(clean)) {
            seen.add(clean);
            uniquePinned.push({
              title: p.title || 'New Tab',
              url: p.url,
              favicon: p.favicon || null
            });
          }
        }
        const currentHash = crypto.createHash('sha256').update(JSON.stringify(uniquePinned)).digest('hex');
        if (forcePush || currentHash !== lastPushedPinnedHash) {
          const lastModified = historyDb.getSetting('pinned_sites_last_modified', 0) || now;
          const encryptedPinned = encryptPayload(uniquePinned, encryptionKey);
          deltasToPush.push({
            dataType: 'pinned_tabs',
            payload: encryptedPinned,
            version: 1,
            timestamp: lastModified
          });
          pendingPinnedHash = currentHash;
        }
      }
    }

    // 3. Prepare History Delta (only if newer history items exist)
    if (options.syncHistory) {
      const historyItems = historyDb.searchHistory('', 500);
      if (Array.isArray(historyItems) && historyItems.length > 0) {
        const newestTimestamp = historyItems[0].last_visited_timestamp || 0;
        if (forcePush || newestTimestamp > lastPushedHistoryTimestamp) {
          const encryptedHistory = encryptPayload(historyItems, encryptionKey);
          deltasToPush.push({
            dataType: 'history',
            payload: encryptedHistory,
            version: 1,
            timestamp: newestTimestamp
          });
          pendingHistoryTimestamp = newestTimestamp;
        }
      }
    }

    // 4. Prepare Cookies Delta (if requested)
    if (options.syncCookies && typeof cookiesGetter === 'function') {
      try {
        const cookies = await cookiesGetter();
        if (Array.isArray(cookies) && cookies.length > 0) {
          const currentHash = crypto.createHash('sha256').update(JSON.stringify(cookies)).digest('hex');
          if (forcePush || currentHash !== lastPushedCookiesHash) {
            const encryptedCookies = encryptPayload(cookies, encryptionKey);
            deltasToPush.push({
              dataType: 'cookies',
              payload: encryptedCookies,
              version: 1,
              timestamp: now
            });
            pendingCookiesHash = currentHash;
          }
        }
      } catch (ce) {
        console.warn('Cookie sync fetch error:', ce);
      }
    }

    // 5. Prepare Settings Delta (prioritize actually changed user settings, not defaults)
    if (options.syncSettings !== false) {
      const changedSettings = getChangedUserSettings();
      if (Object.keys(changedSettings).length > 0) {
        const currentHash = crypto.createHash('sha256').update(JSON.stringify(changedSettings)).digest('hex');
        if (forcePush || currentHash !== lastPushedSettingsHash) {
          const lastModified = historyDb.getSetting('settings_last_modified', 0) || now;
          const encryptedSettings = encryptPayload(changedSettings, encryptionKey);
          deltasToPush.push({
            dataType: 'settings',
            payload: encryptedSettings,
            version: 1,
            timestamp: lastModified
          });
          pendingSettingsHash = currentHash;
        }
      }
    }

    // 6. Push only if there are dirty deltas
    if (deltasToPush.length > 0) {
      const res = await safeFetch(`${serverUrl}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          deviceId,
          deltas: deltasToPush
        })
      });
      if (res && res.ok) {
        if (pendingBookmarksHash) lastPushedBookmarksHash = pendingBookmarksHash;
        if (pendingPinnedHash) lastPushedPinnedHash = pendingPinnedHash;
        if (pendingHistoryTimestamp) lastPushedHistoryTimestamp = pendingHistoryTimestamp;
        if (pendingCookiesHash) lastPushedCookiesHash = pendingCookiesHash;
        if (pendingSettingsHash) lastPushedSettingsHash = pendingSettingsHash;
        lastSyncedTimestamp = now;
        try { historyDb.setSetting('sync_last_pulled_timestamp', lastSyncedTimestamp); } catch (e) {}
        return { pushed: true, count: deltasToPush.length };
      }
    }

    return { pushed: false, count: 0 };
  } catch (err) {
    if (err.name !== 'AbortError') {
      const isNetError = err.message && (err.message.includes('fetch failed') || err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED') || err.message.includes('Network request failed'));
      if (isNetError) {
        console.warn(`[Sync] Server unreachable (${err.cause?.code || err.message}), will retry next cycle`);
      } else {
        console.error('Error during pushData cycle:', err);
      }
    }
    return { pushed: false, error: err.message };
  }
}

async function syncData(cookiesGetter = null) {
  // First pull to fetch latest remote deltas, then push any remaining unpushed local changes
  const pullRes = await pullData();
  const pushRes = await pushData(cookiesGetter, false);
  return { pull: pullRes, push: pushRes };
}

function applyRemoteDelta(delta, encryptionKey) {
  try {
    const rawPayload = typeof delta.payload === 'string' ? JSON.parse(delta.payload) : delta.payload;
    const decrypted = decryptPayload(rawPayload, encryptionKey);
    if (!decrypted) return null;

    const dataType = delta.data_type || delta.dataType;
    const deltaTimestamp = delta.created_at || delta.timestamp || 0;

    if (dataType === 'bookmarks' && Array.isArray(decrypted)) {
      const localLastModified = historyDb.getSetting('bookmarks_last_modified', 0);

      // If local modifications are strictly newer than this remote delta, do NOT overwrite with stale remote data!
      if (localLastModified && deltaTimestamp && deltaTimestamp < localLastModified) {
        return false;
      }

      const cleanTree = deduplicateBookmarksTree(decrypted);
      // 1. Flatten and save to SQLite (clear previous to remove deleted bookmarks)
      historyDb.clearAllBookmarks();
      historyDb.addBookmarksBatch(cleanTree, 0);
      
      // 2. Save tree representation to settings
      historyDb.setSetting('bookmarks_tree', cleanTree);
      historyDb.setSetting('bookmarks_last_modified', deltaTimestamp || Date.now());

      // 3. Mark current hash as clean so local machine won't push it back
      lastPushedBookmarksHash = crypto.createHash('sha256').update(JSON.stringify(cleanTree)).digest('hex');

      // 4. Notify renderer windows to update UI
      if (typeof syncUpdateNotifier === 'function') {
        syncUpdateNotifier({ importedBookmarks: cleanTree });
      }
      return true;
    } else if (dataType === 'pinned_tabs' && Array.isArray(decrypted)) {
      const localLastModified = historyDb.getSetting('pinned_sites_last_modified', 0);

      if (localLastModified && deltaTimestamp && deltaTimestamp < localLastModified) {
        console.log(`[Sync] Ignoring stale remote pinned sites delta (remote: ${deltaTimestamp} < local: ${localLastModified})`);
        return false;
      }

      // Deduplicate pinned sites by clean URL
      const uniquePinned = [];
      const seen = new Set();
      for (const p of decrypted) {
        if (!p || !p.url) continue;
        const clean = (p.url || '').trim().toLowerCase().replace(/\/+$/, '');
        if (!seen.has(clean)) {
          seen.add(clean);
          uniquePinned.push({
            title: p.title || 'New Tab',
            url: p.url,
            favicon: p.favicon || null
          });
        }
      }

      // Save pinned sites to settings
      historyDb.setSetting('pinned_sites_sync', uniquePinned);
      historyDb.setSetting('pinned_sites_last_modified', deltaTimestamp || Date.now());

      // Mark current hash as clean
      lastPushedPinnedHash = crypto.createHash('sha256').update(JSON.stringify(uniquePinned)).digest('hex');

      // Notify renderer windows to apply new pinned sites
      if (typeof syncUpdateNotifier === 'function') {
        syncUpdateNotifier({ importedPinnedSites: uniquePinned });
      }
      return true;
    } else if (dataType === 'history' && Array.isArray(decrypted)) {
      // Merge remote history
      for (const h of decrypted) {
        if (h.url) {
          historyDb.addHistory(h.url, h.title, h.favicon_url, h.last_visited_timestamp);
        }
      }
      // Notify history UI to update
      if (typeof syncUpdateNotifier === 'function') {
        syncUpdateNotifier({ importedHistory: decrypted });
      }
      return true;
    } else if (dataType === 'cookies' && Array.isArray(decrypted)) {
      // Apply decrypted cookies into Electron session
      if (typeof cookiesImporter === 'function') {
        cookiesImporter(decrypted).catch(e => console.error('[Sync] Error applying remote cookies:', e));
      }
      lastPushedCookiesHash = crypto.createHash('sha256').update(JSON.stringify(decrypted)).digest('hex');
      if (typeof syncUpdateNotifier === 'function') {
        syncUpdateNotifier({ importedCookies: true, count: decrypted.length });
      }
      return true;
    } else if (dataType === 'settings' && decrypted && typeof decrypted === 'object') {
      const localLastModified = historyDb.getSetting('settings_last_modified', 0);

      if (localLastModified && deltaTimestamp && deltaTimestamp < localLastModified) {
        return false;
      }

      // Apply customized settings from remote device
      const applied = {};
      for (const [k, v] of Object.entries(decrypted)) {
        if (EXCLUDED_SETTINGS_KEYS.has(k)) continue;
        historyDb.setSetting(k, v);
        applied[k] = v;
      }
      historyDb.setSetting('settings_last_modified', deltaTimestamp || Date.now());
      lastPushedSettingsHash = crypto.createHash('sha256').update(JSON.stringify(decrypted)).digest('hex');
      if (typeof syncUpdateNotifier === 'function') {
        syncUpdateNotifier({ importedSettings: applied });
      }
      return true;
    }
  } catch (e) {
    console.error('Failed to apply remote delta:', e);
  }
  return null;
}

// --- Real-time WebSocket Connectivity & Auto Synchronization ---

function getWebSocketClient() {
  if (typeof globalThis.WebSocket !== 'undefined') {
    return globalThis.WebSocket;
  }
  try {
    return require('ws');
  } catch (e) {
    return null;
  }
}

function connectWebSocket() {
  const groupId = historyDb.getSetting('sync_group_id');
  const deviceId = getOrCreateDeviceId();
  const serverUrl = getServerUrl();

  if (!groupId || activeWs) return;

  const wsUrl = serverUrl.replace(/^http/, 'ws') + `/ws?groupId=${groupId}&deviceId=${deviceId}`;

  try {
    const WS = getWebSocketClient();
    if (!WS) {
      console.warn('No WebSocket implementation available.');
      return;
    }

    const ws = new WS(wsUrl);
    activeWs = ws;

    let pingTimer = null;

    const onOpen = () => {
      pullData().catch(() => {});
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (activeWs && (activeWs.readyState === 1 || (typeof activeWs.isOpen === 'function' && activeWs.isOpen()))) {
          try {
            activeWs.send(JSON.stringify({ type: 'ping', deviceId, timestamp: Date.now() }));
          } catch (e) {}
        }
      }, 25000);
    };

    const onMessage = (rawEventOrData) => {
      try {
        const raw = (rawEventOrData && typeof rawEventOrData === 'object' && 'data' in rawEventOrData)
          ? rawEventOrData.data
          : rawEventOrData;
        const text = typeof raw === 'string' ? raw : raw.toString();
        const msg = JSON.parse(text);

        if (msg.type === 'deltas-available' && msg.authorDeviceId !== deviceId) {
          console.log('[Sync] Incoming server change detected via WebSocket, pulling remote deltas...');
          pullData().catch(() => {});
        } else if (msg.type === 'device-presence') {
          if (typeof syncUpdateNotifier === 'function') {
            syncUpdateNotifier({
              devicePresence: {
                deviceId: msg.deviceId,
                isOnline: msg.isOnline,
                lastActive: msg.lastActive || Date.now()
              }
            });
          }
        } else if (msg.type === 'device-joined' && msg.device && msg.device.device_id !== deviceId) {
          if (typeof syncUpdateNotifier === 'function') {
            syncUpdateNotifier({ deviceJoined: { deviceName: msg.device.device_name || 'A new device' } });
          }
        } else if (msg.type === 'device-unlinked' && msg.deviceId !== deviceId) {
          if (typeof syncUpdateNotifier === 'function') {
            syncUpdateNotifier({ deviceUnlinked: true, deviceId: msg.deviceId });
          }
        } else if (msg.type === 'device-renamed') {
          if (typeof syncUpdateNotifier === 'function') {
            syncUpdateNotifier({ deviceRenamed: { deviceId: msg.deviceId, deviceName: msg.deviceName } });
          }
        } else if (msg.type === 'group-disbanded') {
          leaveSyncGroup();
          if (typeof syncUpdateNotifier === 'function') {
            syncUpdateNotifier({ groupDisbanded: true });
          }
        }
      } catch (e) {}
    };

    const onClose = () => {
      if (pingTimer) clearInterval(pingTimer);
      activeWs = null;
      // Auto reconnect after 5s if still linked
      if (historyDb.getSetting('sync_group_id')) {
        setTimeout(() => connectWebSocket(), 5000);
      }
    };

    const onError = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (activeWs) {
        try { activeWs.close(); } catch (e) {}
        activeWs = null;
      }
    };

    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onError);
    } else if (typeof ws.on === 'function') {
      ws.on('open', onOpen);
      ws.on('message', onMessage);
      ws.on('close', onClose);
      ws.on('error', onError);
    } else {
      ws.onopen = onOpen;
      ws.onmessage = onMessage;
      ws.onclose = onClose;
      ws.onerror = onError;
    }
  } catch (e) {
    console.warn('WebSocket client init failed:', e.message);
  }
}

function startBackgroundSync() {
  connectWebSocket();
  if (!syncInterval) {
    // Background pull fallback every 30 seconds
    syncInterval = setInterval(() => {
      const groupId = historyDb.getSetting('sync_group_id');
      if (groupId) {
        pullData();
      }
    }, 30 * 1000);
  }
}

module.exports = {
  getSyncStatus,
  initSyncGroup,
  generatePairingCode,
  joinWithPairingCode,
  unlinkDevice,
  renameDevice,
  leaveSyncGroup,
  syncData,
  pullData,
  pushData,
  applyRemoteDelta,
  deduplicateBookmarksTree,
  sanitizeBookmarksTree,
  getSyncOptions,
  setSyncOptions,
  startBackgroundSync,
  setSyncUpdateNotifier,
  setCookiesImporter,
  getChangedUserSettings,
  encryptPayload,
  decryptPayload,
  resetCookiesSyncState
};
