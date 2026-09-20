// telemetryCrypto.js – client side cryptography for Napture telemetry

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Public RSA-4096 key (PEM) matching telemetry server
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAltvH7v0tGp/6C1AB1O33
98dCYYR7pzuLoFxAz1g9f/KFlcragrQfx0sXA4rGASoTLWjbAmY23YaxXkym7LhX
tALZ2aMNoNtmbP7AsR1VHNtfzdMRWKrSjxrs5ozDmDnQM3LWpAEDNvy7nxgvdHba
3RQhDbgGfpeVXSObyanMM3XsNqFq9F8HcvH+xO4QHefMuGymGfz9iTMSxeatGQir
/fvAPZcrb0qfM7vDU4AveU8+t88fK9LZSBG8Ugkr3HJKYel0/xXzA3mo7etn8Elo
3AC+LwQMUIEUE1XpqUosWRbG5kRlfvqBf4XyFlNc8hWCQ3fLEgtspfNi2tzZMuNu
GAHSGQYWgGiC0r+/Bwa5sbIj0jgvn0khenrPyiob6/4Gpn1VNW6V7/ifqJXB/uDm
oHkJoDo7ec+BlcevEh9pgePjG+BNC56qO76em5TwudaZ9E6Gh/O/Tu/E/EzHKSqV
jaTR09stK6ZW/tsPcXqJXu611fnqfd5OWo0dVyeYQ19NW7iHRNf6hUjdBUuxSO+H
0UxdL5LH27U2eWptvHV1iNGHqYBKMnDHfnPzwDuWUkUGcTxw9+0pKDF/Lpcue7BT
xwbHm1+A7jIjWbUEVxIjU9rRgyI+Yn255YIUUDZnXQMZT6vxnge6xL0ICOLPkeR/
5yTZW/7SzwPW9Pkamc2SfmcCAwEAAQ==
-----END PUBLIC KEY-----`;

function getUserDataDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (e) {}
  return path.join(os.homedir(), '.napture');
}

function getTelemetryConfigPath() {
  const dir = getUserDataDir();
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
  return path.join(dir, 'telemetry.json');
}

let cachedConfig = null;
function readTelemetryConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const p = getTelemetryConfigPath();
    if (fs.existsSync(p)) {
      cachedConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
      return cachedConfig;
    }
  } catch (e) {}
  cachedConfig = {};
  return cachedConfig;
}

function writeTelemetryConfig(cfg) {
  cachedConfig = cfg;
  try {
    const p = getTelemetryConfigPath();
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Initialise or retrieve the client secret (32-byte hex string).
 */
function getClientSecret() {
  const cfg = readTelemetryConfig();
  if (!cfg.clientSecret) {
    cfg.clientSecret = crypto.randomBytes(32).toString('hex');
    writeTelemetryConfig(cfg);
  }
  return cfg.clientSecret;
}

/**
 * Derive the daily token using HMAC-SHA256(secret, "YYYY-MM-DD").
 * Returns a hex string.
 */
function getDailyToken(dateStr) {
  const secret = getClientSecret();
  const date = dateStr || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
  hmac.update(date);
  return hmac.digest('hex');
}

/**
 * Encrypt a JSON payload with hybrid RSA-OAEP + AES-256-GCM envelope.
 * Returns an object { envelope: <base64>, tokenHash: <hex>, dailyToken: <hex> }.
 */
function encryptPayload(payloadObj, customPublicKeyPem) {
  const pubKey = customPublicKeyPem || PUBLIC_KEY_PEM;
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8');

  // 1. Generate random 32-byte symmetric key + 12-byte IV for GCM
  const symKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // 2. AES-256-GCM encrypt the payload
  const cipher = crypto.createCipheriv('aes-256-gcm', symKey, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. RSA-OAEP encrypt the symmetric key
  const encryptedKey = crypto.publicEncrypt(
    {
      key: pubKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    symKey
  );

  // 4. Assemble envelope JSON
  const envelope = {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };

  // 5. Compute hash of the daily token
  const token = getDailyToken();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return {
    envelope: Buffer.from(JSON.stringify(envelope)).toString('base64'),
    tokenHash,
    dailyToken: token,
  };
}

/**
 * Decrypt envelope using private key (used for testing and server verification).
 */
function decryptEnvelope(envelopeBase64, privateKeyPem) {
  const envelope = JSON.parse(Buffer.from(envelopeBase64, 'base64').toString('utf8'));
  const encryptedKey = Buffer.from(envelope.encryptedKey, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const symKey = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedKey
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', symKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

const MAX_OFFLINE_QUEUE = 10;
const OFFLINE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Get pending offline reports, pruning expired entries (>48h)
 */
function getOfflineQueue() {
  const cfg = readTelemetryConfig();
  const queue = Array.isArray(cfg.offlineQueue) ? cfg.offlineQueue : [];
  const now = Date.now();
  const valid = queue.filter(item => (now - (item.createdAt || 0)) < OFFLINE_TTL_MS);
  if (valid.length !== queue.length) {
    cfg.offlineQueue = valid;
    writeTelemetryConfig(cfg);
  }
  return valid;
}

/**
 * Enqueue report to offline buffer (capped at max 10 entries, oldest dropped)
 */
function enqueueOfflineReport(payloadObj) {
  const cfg = readTelemetryConfig();
  const queue = getOfflineQueue();
  queue.push({
    id: crypto.randomBytes(8).toString('hex'),
    payload: payloadObj,
    createdAt: Date.now(),
  });
  // Keep only newest MAX_OFFLINE_QUEUE items
  if (queue.length > MAX_OFFLINE_QUEUE) {
    queue.splice(0, queue.length - MAX_OFFLINE_QUEUE);
  }
  cfg.offlineQueue = queue;
  writeTelemetryConfig(cfg);
  return queue;
}

/**
 * Remove an item from the offline queue by ID
 */
function removeOfflineReport(id) {
  const cfg = readTelemetryConfig();
  const queue = getOfflineQueue();
  const filtered = queue.filter(item => item.id !== id);
  cfg.offlineQueue = filtered;
  writeTelemetryConfig(cfg);
  return filtered;
}

module.exports = {
  PUBLIC_KEY_PEM,
  getClientSecret,
  getDailyToken,
  encryptPayload,
  decryptEnvelope,
  readTelemetryConfig,
  writeTelemetryConfig,
  MAX_OFFLINE_QUEUE,
  OFFLINE_TTL_MS,
  getOfflineQueue,
  enqueueOfflineReport,
  removeOfflineReport,
};

