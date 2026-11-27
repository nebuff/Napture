// Napture Chrome extension host
// Installs unpacked MV3 extensions from the Chrome Web Store and keeps them
// loaded in the default session so content scripts can run in BrowserWindow tabs.

const { app, session } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const STORE_ID_PATTERN = /^[a-p]{32}$/;
const EXTENSIONS_DIR_NAME = 'extensions';

// id -> { id, dir, name, version, manifest, popupPath, iconDataUrl, hasAction }
const installed = new Map();

function getExtensionsRoot() {
  return path.join(app.getPath('userData'), EXTENSIONS_DIR_NAME);
}

function normalizeStoreId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (STORE_ID_PATTERN.test(raw)) return raw;
  const match = raw.match(/[a-p]{32}/);
  return match ? match[0] : null;
}

function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36' }
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(fetchBuffer(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (status >= 400) {
        res.resume();
        reject(new Error('Chrome Web Store returned HTTP ' + status));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Extension download timed out')));
    request.on('error', reject);
  });
}

function idFromBytes(bytes) {
  let id = '';
  for (let i = 0; i < 16 && i < bytes.length; i++) {
    id += String.fromCharCode(97 + (bytes[i] >> 4)) + String.fromCharCode(97 + (bytes[i] & 0x0f));
  }
  return id;
}

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  let byte;
  while (offset < buffer.length && shift < 64) {
    byte = buffer[offset++];
    result += (byte & 0x7f) * Math.pow(2, shift);
    if (!(byte & 0x80)) return { value: result, offset };
    shift += 7;
  }
  return null;
}

// Minimal protobuf reader: returns { fieldNumber: [values] } for a message body.
function parseProtoFields(buffer) {
  const fields = {};
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    if (!tag) break;
    offset = tag.offset;
    const wireType = tag.value & 0x07;
    const fieldNumber = tag.value >>> 3;
    if (wireType === 2) {
      const length = readVarint(buffer, offset);
      if (!length) break;
      offset = length.offset;
      const value = buffer.slice(offset, offset + length.value);
      offset += length.value;
      (fields[fieldNumber] = fields[fieldNumber] || []).push(value);
    } else if (wireType === 0) {
      const value = readVarint(buffer, offset);
      if (!value) break;
      offset = value.offset;
      (fields[fieldNumber] = fields[fieldNumber] || []).push(value.value);
    } else {
      break;
    }
  }
  return fields;
}

// CRX3 headers carry the signing public key (the same key Chrome hashes into the
// extension ID). Store CRXs often ship a manifest without "key", and Chromium
// then derives the ID from the install path instead of the store ID.
function readCrxSigningKey(crxBuffer, expectedId) {
  const headerVersion = crxBuffer.readUInt32LE(4);
  if (headerVersion === 3) {
    const headerLength = crxBuffer.readUInt32LE(8);
    const header = crxBuffer.slice(12, 12 + headerLength);
    const top = parseProtoFields(header);
    const crypto = require('crypto');
    const keys = [];
    for (const proof of top[2] || []) {
      const fields = parseProtoFields(proof);
      if (fields[1] && fields[1][0]) {
        const publicKey = fields[1][0];
        const digest = crypto.createHash('sha256').update(publicKey).digest();
        keys.push({ publicKey, id: idFromBytes(digest) });
      }
    }
    let crxId = null;
    const signedHeader = top[10000] && top[10000][0];
    if (signedHeader) {
      const fields = parseProtoFields(signedHeader);
      if (fields[1] && fields[1][0]) crxId = idFromBytes(fields[1][0]);
    }
    // CRXs can carry several proofs (e.g. an old publisher key); pick the one
    // whose key hashes to the requested store ID.
    const match = keys.find((entry) => entry.id === expectedId) || keys.find((entry) => entry.id === crxId) || keys[0];
    return { publicKey: match ? match.publicKey : null, crxId };
  }
  if (headerVersion === 2) {
    const publicKeyLength = crxBuffer.readUInt32LE(8);
    const publicKey = crxBuffer.slice(16, 16 + publicKeyLength);
    const digest = require('crypto').createHash('sha256').update(publicKey).digest();
    return { publicKey, crxId: idFromBytes(digest) };
  }
  return { publicKey: null, crxId: null };
}

function unzipCrx(crxBuffer) {
  if (crxBuffer.slice(0, 4).toString('ascii') !== 'Cr24') {
    const body = crxBuffer.slice(0, 64).toString('utf8');
    if (body.trim().startsWith('<')) {
      throw new Error('No extension with that ID was found on the Chrome Web Store');
    }
    if (!crxBuffer.length) {
      throw new Error('The Chrome Web Store returned no package for that ID (it may be unpublished, or still Manifest V2, which is no longer served)');
    }
    throw new Error('Downloaded file is not a CRX package');
  }
  const version = crxBuffer.readUInt32LE(4);
  const zipOffset = version === 3
    ? 12 + crxBuffer.readUInt32LE(8)
    : 16 + crxBuffer.readUInt32LE(8) + crxBuffer.readUInt32LE(12);
  return crxBuffer.slice(zipOffset);
}

function pickIconPath(manifest) {
  const action = manifest.action || manifest.browser_action || {};
  const candidates = [];
  const collect = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      candidates.push(value);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach((v) => { if (typeof v === 'string') candidates.push(v); });
    }
  };
  collect(action.default_icon);
  collect(manifest.icons);
  return candidates[0] || null;
}

function toDataUrl(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp'
          : 'image/png';
    return 'data:' + mime + ';base64,' + buffer.toString('base64');
  } catch (e) {
    return null;
  }
}

function describe(extension, dir) {
  const manifest = extension.manifest || {};
  const action = manifest.action || manifest.browser_action || null;
  const popup = action && typeof action.default_popup === 'string' ? action.default_popup.replace(/^\//, '') : null;
  const iconRel = pickIconPath(manifest);
  return {
    id: extension.id,
    name: extension.name || manifest.name || extension.id,
    version: extension.version || manifest.version || '',
    description: manifest.description || '',
    hasAction: Boolean(action),
    popupPath: popup,
    iconDataUrl: iconRel ? toDataUrl(path.join(dir, iconRel)) : null
  };
}

async function loadFromDir(dir, expectedId) {
  const ext = await session.defaultSession.extensions.loadExtension(dir, { allowFileAccess: false });
  const descriptor = describe(ext, dir);
  if (expectedId && descriptor.id !== expectedId) {
    throw new Error('Extension ID mismatch: expected ' + expectedId + ', loaded ' + descriptor.id);
  }
  installed.set(descriptor.id, descriptor);
  return descriptor;
}

async function init() {
  const root = getExtensionsRoot();
  fs.mkdirSync(root, { recursive: true });
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return list();
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
    try {
      // Stored folders are named after the store ID.
      await loadFromDir(dir, STORE_ID_PATTERN.test(entry.name) ? entry.name : null);
    } catch (e) {
      console.error('Failed to load extension from ' + dir + ':', e && e.message);
    }
  }
  return list();
}

function list() {
  return Array.from(installed.values()).map((ext) => ({ ...ext }));
}

function getDescriptor(id) {
  return installed.get(id) || null;
}

async function installFromStore(input) {
  const id = normalizeStoreId(input);
  if (!id) {
    throw new Error('Enter a Chrome Web Store link or a 32-character extension ID');
  }

  const root = getExtensionsRoot();
  fs.mkdirSync(root, { recursive: true });
  const targetDir = path.join(root, id);

  if (installed.has(id)) {
    return getDescriptor(id);
  }

  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx2,crx3&x=id%3D' + id + '%26uc';
  const crx = await fetchBuffer(url);
  const zipBuffer = unzipCrx(crx);
  const signingKey = readCrxSigningKey(crx, id);
  if (signingKey.crxId && signingKey.crxId !== id) {
    throw new Error('Chrome Web Store returned a different extension (' + signingKey.crxId + ')');
  }

  const tmpDir = targetDir + '.tmp';
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tmpDir, true);
    const manifestPath = path.join(tmpDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Downloaded package has no manifest.json');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Without "key" Chromium derives the extension ID from the folder path, which
    // would not match the store ID. Restore the signing key from the CRX header.
    if (!manifest.key && signingKey.publicKey) {
      manifest.key = signingKey.publicKey.toString('base64');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(tmpDir, targetDir);
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }

  try {
    return await loadFromDir(targetDir, id);
  } catch (err) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw err;
  }
}

async function remove(id) {
  const dir = path.join(getExtensionsRoot(), id);
  try {
    session.defaultSession.extensions.removeExtension(id);
  } catch (e) {}
  installed.delete(id);
  fs.rmSync(dir, { recursive: true, force: true });
  return list();
}

function getPopupUrl(id) {
  const ext = installed.get(id);
  if (!ext || !ext.popupPath) return null;
  return 'chrome-extension://' + id + '/' + ext.popupPath;
}

module.exports = {
  init,
  list,
  installFromStore,
  remove,
  getDescriptor,
  getPopupUrl,
  normalizeStoreId,
  getExtensionsRoot
};
