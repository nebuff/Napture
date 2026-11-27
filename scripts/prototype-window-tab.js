// Napture prototype: a tab rendered as a child BrowserWindow.
//
// Electron only injects Chrome extension content scripts into BrowserWindow
// webContents, not into the WebContentsView tabs Napture uses today. This
// prototype proves the alternative layout: the browser chrome lives in a main
// window and the tab is a frameless child window positioned beneath it.
//
// Run with: npx electron scripts/prototype-window-tab.js --ozone-platform=headless

const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const EXTENSION_ID = 'ghmbeldphafepmbegfdlkpapadhbakde';
const TOOLBAR_HEIGHT = 56;
const OUT_DIR = path.join(__dirname, '..', 'dist', 'prototype');
const PROFILE_DIR = path.join(OUT_DIR, 'profile');
const EXTENSIONS_DIR = path.join(PROFILE_DIR, 'extensions');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.setPath('userData', PROFILE_DIR);

const TEST_PAGE = `<!doctype html>
<html><head><title>Autofill test</title>
<style>
  body { font-family: sans-serif; background: #101118; color: #e8e8ea; display: flex; justify-content: center; padding-top: 80px; }
  form { background: #1b1c26; padding: 28px; border-radius: 12px; width: 340px; }
  input { width: 100%; box-sizing: border-box; margin: 6px 0 14px; padding: 10px; border-radius: 8px; border: 1px solid #33344a; background: #12131a; color: #fff; }
  button { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #8a6eff; color: #fff; font-weight: 600; }
</style></head>
<body>
  <form onsubmit="event.preventDefault()">
    <h2>Sign in to Example</h2>
    <label for="user">Email</label>
    <input id="user" type="text" name="username" autocomplete="username">
    <label for="pass">Password</label>
    <input id="pass" type="password" name="password" autocomplete="current-password">
    <button type="submit">Log in</button>
  </form>
</body></html>`;

function fetchBuffer(url, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0 Chrome/140.0.0.0' } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(fetchBuffer(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
      }
      if (status >= 400) {
        res.resume();
        return reject(new Error('Chrome Web Store returned HTTP ' + status));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => request.destroy(new Error('Store download timed out')));
    request.on('error', reject);
  });
}

function extractZipFromCrx(buffer) {
  if (buffer.slice(0, 4).toString('ascii') !== 'Cr24') throw new Error('Not a CRX package');
  const version = buffer.readUInt32LE(4);
  const offset = version === 3 ? 12 + buffer.readUInt32LE(8) : 16 + buffer.readUInt32LE(8) + buffer.readUInt32LE(12);
  return buffer.slice(offset);
}

async function ensureProtonPass() {
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  const existing = fs.readdirSync(EXTENSIONS_DIR).find((name) => {
    const manifestPath = path.join(EXTENSIONS_DIR, name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return false;
    try { return /proton pass/i.test(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).name || ''); } catch (e) { return false; }
  });
  if (existing) return path.join(EXTENSIONS_DIR, existing);

  console.log('Downloading Proton Pass from the Chrome Web Store...');
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx2,crx3&x=id%3D' + EXTENSION_ID + '%26uc';
  const crx = await fetchBuffer(url);
  const zip = new AdmZip(extractZipFromCrx(crx));
  const target = path.join(EXTENSIONS_DIR, 'proton-pass');
  zip.extractAllTo(target, true);
  return target;
}

function buildToolbarHtml(url) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; background: #0e0f14; color: #c8cad6; font-family: system-ui, sans-serif; overflow: hidden; }
    .bar { display: flex; align-items: center; gap: 10px; height: ${TOOLBAR_HEIGHT}px; padding: 0 12px; box-sizing: border-box; border-bottom: 1px solid #23252f; }
    .dot { width: 22px; height: 22px; border-radius: 6px; background: #8a6eff; }
    .title { font-size: 12px; font-weight: 600; color: #fff; }
    .url { flex: 1; background: #171922; border: 1px solid #262838; border-radius: 8px; padding: 7px 10px; font-size: 12px; color: #9ea3b8; }
    .hint { font-size: 10px; color: #6f7488; }
  </style></head><body><div class="bar">
    <div class="dot"></div>
    <div><div class="title">Napture prototype</div><div class="hint">BrowserWindow-backed tab</div></div>
    <div class="url">${url}</div>
  </div></body></html>`;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const extensionPath = await ensureProtonPass();
  const extension = await session.defaultSession.extensions.loadExtension(extensionPath, { allowFileAccess: false });
  console.log('EXTENSION_LOADED', extension.id, extension.manifest.version);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TEST_PAGE);
  });
  await new Promise((resolve) => server.listen(8123, '127.0.0.1', resolve));
  const pageUrl = 'http://127.0.0.1:8123/';

  const mainWin = new BrowserWindow({
    width: 1180,
    height: 820,
    show: false,
    title: 'Napture prototype',
    backgroundColor: '#0e0f14',
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  await mainWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildToolbarHtml(pageUrl)));
  mainWin.show();

  const bounds = mainWin.getContentBounds();
  const tabWin = new BrowserWindow({
    parent: mainWin,
    frame: false,
    show: false,
    x: bounds.x,
    y: bounds.y + TOOLBAR_HEIGHT,
    width: bounds.width,
    height: bounds.height - TOOLBAR_HEIGHT,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });

  const layout = () => {
    if (!mainWin || mainWin.isDestroyed() || !tabWin || tabWin.isDestroyed()) return;
    const b = mainWin.getContentBounds();
    tabWin.setBounds({ x: b.x, y: b.y + TOOLBAR_HEIGHT, width: b.width, height: Math.max(100, b.height - TOOLBAR_HEIGHT) });
  };
  mainWin.on('resize', layout);
  mainWin.on('move', layout);

  await tabWin.loadURL(pageUrl);
  tabWin.show();
  layout();

  await sleep(9000);

  const injected = await tabWin.webContents.executeJavaScript(`(() => {
    const roots = Array.from(document.querySelectorAll('*')).filter((el) => /PROTONPASS-ROOT/i.test(el.tagName));
    return { url: location.href, injectedRoots: roots.length, frames: document.querySelectorAll('iframe').length };
  })()`);
  console.log('TAB_INJECTION', JSON.stringify(injected));

  // Focus the password field so the extension's in-page UI has a reason to mount.
  await tabWin.webContents.executeJavaScript(`(() => {
    const pass = document.getElementById('pass');
    if (pass) { pass.focus(); pass.dispatchEvent(new Event('input', { bubbles: true })); }
    return true;
  })()`);
  await sleep(5000);
  const focused = await tabWin.webContents.executeJavaScript(`(() => {
    const roots = Array.from(document.querySelectorAll('*')).filter((el) => /PROTONPASS-ROOT/i.test(el.tagName));
    const frames = Array.from(document.querySelectorAll('iframe')).map((f) => f.src).filter(Boolean);
    const shadowChildren = roots.map((r) => (r.shadowRoot ? r.shadowRoot.querySelectorAll('*').length : 0));
    return { roots: roots.length, shadowChildren, frames, active: document.activeElement ? document.activeElement.id : '' };
  })()`);
  console.log('TAB_FIELD_UI', JSON.stringify(focused));

  const tabShot = await tabWin.webContents.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, 'tab.png'), tabShot.toPNG());

  const popupWin = new BrowserWindow({
    parent: mainWin,
    width: 420,
    height: 620,
    show: false,
    title: 'Proton Pass',
    backgroundColor: '#171720',
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  await popupWin.loadURL('chrome-extension://' + extension.id + '/popup.html');
  popupWin.show();
  await sleep(6000);
  const popupShot = await popupWin.webContents.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, 'popup.png'), popupShot.toPNG());
  console.log('POPUP_CAPTURED', true);

  console.log('ARTIFACTS', OUT_DIR);
  if (process.env.PROTOTYPE_KEEP_ALIVE) {
    mainWin.setPosition(40, 40);
    layout();
    console.log('KEEPING_OPEN');
    await sleep(15000);
  }
  server.close();
  app.quit();
}).catch((err) => {
  console.error('PROTOTYPE_FAILED', err && err.stack);
  app.quit();
});
