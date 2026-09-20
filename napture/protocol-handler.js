// Custom URI protocol handler for napture:// and ne:// scheme routing

const { protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { buildSettingsPage } = require('./settings-ui');
const { buildHistoryPage } = require('./history-ui');
const { buildDownloadsPage } = require('./downloads-ui');
const { getSetting } = require('./db/history');
const i18n = require('./i18n');

const { getLogoDataUrl, getAppVersions, isNeProtocolSupported } = require('./shared-utils');
const { resolveNeDomain } = require('./ne-resolver');
const http = require('http');
const https = require('https');

function registerCustomProtocols() {
  try {
    const privilegedSchemes = [
      {
        scheme: 'napture',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
          bypassCSP: true
        }
      }
    ];

    if (isNeProtocolSupported()) {
      privilegedSchemes.push({
        scheme: 'ne',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
          bypassCSP: true
        }
      });
    }

    protocol.registerSchemesAsPrivileged(privilegedSchemes);
  } catch (e) {
    console.error('Failed to register custom schemes:', e);
  }
}

function getRouteFromUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const host = (url.hostname || url.host || '').toLowerCase();
    const pathParts = (url.pathname || '').split('/').filter(Boolean).map(p => p.toLowerCase());

    const candidates = [];
    if (host && host !== 'napture' && host !== 'ne') candidates.push(host);
    candidates.push(...pathParts);

    for (const c of candidates) {
      if (['welcome', 'newtab', 'start'].includes(c)) return 'welcome';
      if (['downloads', 'download'].includes(c)) return 'downloads';
      if (['about'].includes(c)) return 'about';
      if (['settings'].includes(c)) return 'settings';
      if (['history'].includes(c)) return 'history';
      if (['keyboard', 'shortcuts'].includes(c)) return 'keyboard';
      if (['update-force', 'force-update', 'updateforce'].includes(c)) return 'update-force';
      if (['logo', 'logo.png'].includes(c)) return 'logo';
      if (['suggest'].includes(c)) return 'suggest';
      if (['assets'].includes(c)) return 'assets';
      if (['error'].includes(c)) return 'error';
    }
  } catch (e) {}

  return 'welcome';
}

function handleCustomProtocolRequest(request) {
  try {
    const rawUrl = request.url || '';
    let decodedUrl = rawUrl;
    try { decodedUrl = decodeURIComponent(rawUrl); } catch (e) {}

    if (rawUrl.includes('..') || decodedUrl.includes('..') || rawUrl.includes('\\') || decodedUrl.includes('\\')) {
      return new Response('Access Denied: Path Traversal Prohibited', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const route = getRouteFromUrl(request.url);
    const url = new URL(request.url);

    if (route === 'logo') {
      const logoPath = path.join(__dirname, 'logo.png');
      if (fs.existsSync(logoPath)) {
        const buffer = fs.readFileSync(logoPath);
        return new Response(buffer, {
          headers: { 'Content-Type': 'image/png' }
        });
      }
    }

    if (route === 'assets' || request.url.includes('sw.js')) {
      const safeBase = path.resolve(__dirname, 'renderer');
      let assetPath = '';
      if (request.url.includes('sw.js')) {
        assetPath = path.join(safeBase, 'sw.js');
      } else {
        let p = decodeURIComponent(url.pathname || '').replace(/^\/+/, '');
        if (p.startsWith('assets/')) p = p.slice(7);
        assetPath = path.resolve(safeBase, p);
      }

      const rel = path.relative(safeBase, assetPath);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !assetPath.startsWith(safeBase)) {
        return new Response('Access Denied: Path Traversal Prohibited', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
        const buffer = fs.readFileSync(assetPath);
        const ext = path.extname(assetPath).toLowerCase();
        const mimeTypes = {
          '.js': 'application/javascript',
          '.html': 'text/html',
          '.css': 'text/css',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.json': 'application/json',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
          '.ttf': 'font/ttf'
        };
        const mime = mimeTypes[ext] || 'application/octet-stream';
        return new Response(buffer, {
          headers: {
            'Content-Type': mime,
            'X-Content-Type-Options': 'nosniff'
          }
        });
      } else {
        return new Response('Asset Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    if (route === 'suggest') {
      const query = url.searchParams.get('q') || '';
      if (!query) {
        return new Response(JSON.stringify(['', []]), { headers: { 'Content-Type': 'application/json' } });
      }
      return fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }))
        .catch(() => new Response(JSON.stringify([query, []]), {
          headers: { 'Content-Type': 'application/json' }
        }));
    }

    if (route === 'about') {
      const html = buildAboutPage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'settings') {
      const html = buildSettingsPage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'history') {
      const html = buildHistoryPage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'downloads') {
      const html = buildDownloadsPage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'keyboard') {
      const html = buildKeyboardPage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'update-force') {
      const html = buildForceUpdatePage();
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    if (route === 'error') {
      const targetUrl = url.searchParams.get('url') || '';
      const code = url.searchParams.get('code') || '';
      const desc = url.searchParams.get('desc') || '';
      const html = buildWebErrorPage({ url: targetUrl, code, desc });
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    // Default welcome / new tab page
    const html = buildWelcomePage();
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

  } catch (e) {
    console.error('Protocol handler error:', e);
    return new Response('Error: ' + e.message, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

function proxyHttpRequest(targetUrl, request, customHost) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = {};
      if (request.headers) {
        if (typeof request.headers.entries === 'function') {
          for (const [key, value] of request.headers.entries()) {
            const lower = key.toLowerCase();
            if (!['host', 'connection', 'content-length'].includes(lower)) {
              headers[key] = value;
            }
          }
        } else if (typeof request.headers === 'object') {
          for (const [key, value] of Object.entries(request.headers)) {
            const lower = key.toLowerCase();
            if (!['host', 'connection', 'content-length'].includes(lower)) {
              headers[key] = value;
            }
          }
        }
      }
      headers['host'] = customHost;
      headers['x-forwarded-proto'] = 'ne';

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: request.method || 'GET',
        headers: headers,
        timeout: 10000
      };

      const req = client.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              v.forEach(val => responseHeaders.append(k, val));
            } else if (v) {
              responseHeaders.set(k, v);
            }
          }
          if (!responseHeaders.has('content-security-policy')) {
            responseHeaders.set('content-security-policy', "default-src 'self' 'unsafe-inline' ne: data: blob: http: https:;");
          }
          resolve(new Response(buffer, {
            status: res.statusCode || 200,
            statusText: res.statusMessage || 'OK',
            headers: responseHeaders
          }));
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out to ' + targetUrl));
      });

      if (request.body && !['GET', 'HEAD'].includes(request.method)) {
        if (typeof request.arrayBuffer === 'function') {
          request.arrayBuffer().then(buf => {
            req.write(Buffer.from(buf));
            req.end();
          }).catch(() => req.end());
        } else {
          req.end();
        }
      } else {
        req.end();
      }
    } catch (e) {
      reject(e);
    }
  });
}

async function handleNeProtocolRequest(request) {
  if (!isNeProtocolSupported()) {
    return new Response('ne:// protocol is disabled in this build.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  try {
    const url = new URL(request.url);
    const host = (url.hostname || url.host || '').toLowerCase();

    // Check if internal route
    if (!host || host === 'ne' || ['welcome', 'newtab', 'start', 'settings', 'about', 'history', 'keyboard', 'logo', 'suggest'].includes(host)) {
      return handleCustomProtocolRequest(request);
    }

    // Resolve authoritative Neweb domain
    try {
      const resolved = await resolveNeDomain(host);
      const targetUrl = `http://${resolved.target}:${resolved.port}${url.pathname}${url.search}`;
      const response = await proxyHttpRequest(targetUrl, request, host);
      return response;
    } catch (resolveErr) {
      console.warn(`[ne://] Resolution error for ${request.url}:`, resolveErr.message);
      const errorHtml = buildNeErrorPage(host, resolveErr.message);
      return new Response(errorHtml, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  } catch (err) {
    console.error('ne protocol handler error:', err);
    return new Response('ne:// protocol error: ' + err.message, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

function buildWebErrorPage({ url: targetUrl, code, desc }) {
  let domain = 'Unknown Target';
  try {
    if (targetUrl) {
      const parsed = new URL(targetUrl);
      domain = parsed.hostname || targetUrl;
    }
  } catch (e) {
    domain = targetUrl || 'Unknown Target';
  }

  let title = 'Could not resolve server';
  let message = 'Napture was unable to reach or resolve the server for this address.';

  const codeStr = String(code || '');
  const descStr = String(desc || '');

  if (codeStr === '-105' || descStr.includes('ERR_NAME_NOT_RESOLVED')) {
    title = 'Could not resolve server';
    message = 'The server IP address could not be found. Check your DNS configuration or internet connection.';
  } else if (codeStr === '-102' || descStr.includes('ERR_CONNECTION_REFUSED')) {
    title = 'Connection Refused';
    message = 'The target server actively refused the connection. The server may be offline or unreachable on this port.';
  } else if (codeStr === '-118' || codeStr === '-7' || descStr.includes('TIMED_OUT')) {
    title = 'Connection Timed Out';
    message = 'The server took too long to respond. The website might be experiencing issues or high traffic.';
  } else if (codeStr === '-106' || descStr.includes('INTERNET_DISCONNECTED')) {
    title = 'No Internet Connection';
    message = 'Your computer appears to be offline. Verify your network cables, Wi-Fi, or router settings.';
  } else if (codeStr === '-101' || descStr.includes('CONNECTION_RESET')) {
    title = 'Connection Reset';
    message = 'The connection was unexpectedly terminated by the remote host or intermediate gateway.';
  } else if (codeStr === '-109' || descStr.includes('ADDRESS_UNREACHABLE')) {
    title = 'Address Unreachable';
    message = 'The network address is unreachable from your current routing path.';
  } else if (codeStr.startsWith('-20') || descStr.includes('CERT_') || descStr.includes('SSL_')) {
    title = 'Security Certificate Error';
    message = 'A secure SSL/TLS connection could not be established with this server.';
  } else if (descStr) {
    message = `The connection failed: ${descStr}`;
  }

  const safeTargetUrl = (targetUrl || '').replace(/"/g, '&quot;');
  const safeDomain = domain.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeCode = (code || desc ? `${desc || ''} ${code ? `(${code})` : ''}`.trim() : 'ERR_NAME_NOT_RESOLVED (-105)').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>${safeDomain} — ${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0a0b10;
      color: #ffffff;
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .error-card {
      background: rgba(18, 19, 26, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    }
    .icon-wrap {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      border-radius: 12px;
      background: rgba(247, 118, 142, 0.1);
      border: 1px solid rgba(247, 118, 142, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f7768e;
    }
    h1 { font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #a9b1d6; font-size: 0.95rem; margin-bottom: 20px; line-height: 1.5; }
    .domain-badge {
      display: inline-block;
      background: rgba(127, 140, 255, 0.1);
      color: #7f8cff;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 16px;
      border: 1px solid rgba(127, 140, 255, 0.2);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reason-box {
      background: #101118;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #565f89;
      margin-bottom: 24px;
      text-align: left;
      word-break: break-all;
    }
    .btn-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      padding: 9px 16px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: #7f8cff; color: #fff; }
    .btn-primary:hover { background: #6c7af7; }
    .btn-warning {
      background: rgba(247, 118, 142, 0.15);
      color: #f7768e;
      border-color: rgba(247, 118, 142, 0.3);
    }
    .btn-warning:hover {
      background: rgba(247, 118, 142, 0.25);
      color: #ff8b9e;
      border-color: rgba(247, 118, 142, 0.5);
    }
    .btn-secondary { background: #1c1d28; color: #a9b1d6; border-color: rgba(255,255,255,0.08); }
    .btn-secondary:hover { color: #fff; background: #252636; }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="icon-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <div class="domain-badge">${safeDomain}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="reason-box">${safeCode}</div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="retry()">Retry Connection</button>
      <button class="btn btn-warning" onclick="continueAnyway()">Continue anyway</button>
      <a href="napture://welcome" class="btn btn-secondary">Go to Home</a>
    </div>
  </div>
  <script>
    function retry() {
      const target = "${safeTargetUrl}";
      if (target) {
        window.location.href = target;
      } else {
        window.location.reload();
      }
    }

    async function continueAnyway() {
      const target = "${safeTargetUrl}";
      if (!target) return;
      if (window.naptureAPI && typeof window.naptureAPI.allowCertificateError === 'function') {
        try {
          await window.naptureAPI.allowCertificateError(target);
        } catch (e) {}
      }
      window.location.href = target;
    }
  </script>
</body>
</html>`;
}

function buildNeErrorPage(domain, reason) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>ne://${domain} — Site Unreachable</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0a0b10;
      color: #ffffff;
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .error-card {
      background: rgba(18, 19, 26, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    }
    .icon-wrap {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      border-radius: 12px;
      background: rgba(247, 118, 142, 0.1);
      border: 1px solid rgba(247, 118, 142, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f7768e;
    }
    h1 { font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #a9b1d6; font-size: 0.95rem; margin-bottom: 20px; }
    .domain-badge {
      display: inline-block;
      background: rgba(127, 140, 255, 0.1);
      color: #7f8cff;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 16px;
      border: 1px solid rgba(127, 140, 255, 0.2);
    }
    .reason-box {
      background: #101118;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #565f89;
      margin-bottom: 24px;
      text-align: left;
      word-break: break-all;
    }
    .btn-group { display: flex; gap: 12px; justify-content: center; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      padding: 9px 16px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: #7f8cff; color: #fff; }
    .btn-primary:hover { background: #6c7af7; }
    .btn-secondary { background: #1c1d28; color: #a9b1d6; border-color: rgba(255,255,255,0.08); }
    .btn-secondary:hover { color: #fff; background: #252636; }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="icon-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <div class="domain-badge">ne://${domain}</div>
    <h1>Site Unreachable</h1>
    <p>Napture was unable to resolve this domain across the authoritative Neweb (ne://) DNS cluster.</p>
    <div class="reason-box">${reason}</div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="window.location.reload()">Retry Connection</button>
      <a href="napture://welcome" class="btn btn-secondary">Go to Home</a>
    </div>
  </div>
</body>
</html>`;
}

function setupProtocolHandlers() {
  try {
    protocol.handle('napture', handleCustomProtocolRequest);
  } catch (e) {
    console.error('Error setting napture protocol handler:', e);
  }
  if (isNeProtocolSupported()) {
    try {
      protocol.handle('ne', handleNeProtocolRequest);
    } catch (e) {
      console.error('Error setting ne protocol handler:', e);
    }
  }
}

function buildWelcomePage() {
  let searchEngine = 'napture';
  try {
    searchEngine = getSetting('searchEngine', 'napture');
  } catch (e) {
    console.error('Error fetching search engine setting for welcome page:', e);
  }

  const engineUrls = {
    napture: 'https://search.nebuff.xyz/search',
    google: 'https://google.com/search',
    duckduckgo: 'https://duckduckgo.com/',
    bing: 'https://www.bing.com/search',
    brave: 'https://search.brave.com/search',
    ecosia: 'https://www.ecosia.org/search'
  };
  const searchBase = engineUrls[searchEngine] || engineUrls.napture;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' ne: file:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com data:; img-src \'self\' data: blob: http: https: ne: file:; connect-src \'self\' http: https: ws: wss:;">',
    '<title>New Tab</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">',
    '<style>',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  background: transparent;',
    '  color: #ffffff;',
    '  min-height: 100vh;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  user-select: none;',
    '  overflow: hidden;',
    '}',
    '.page {',
    '  width: 100%;',
    '  max-width: 560px;',
    '  padding: 0 1.5rem;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  gap: 20px;',
    '  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '.search-container {',
    '  position: relative;',
    '  width: 100%;',
    '  will-change: transform, opacity;',
    '  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;',
    '}',
    '.search-box {',
    '  width: 100%;',
    '  display: flex;',
    '  align-items: center;',
    '  background: rgba(18, 19, 26, 0.6);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 12px;',
    '  padding: 0 18px;',
    '  height: 52px;',
    '  gap: 14px;',
    '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);',
    '  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '.search-box:focus-within {',
    '  border-color: #7f8cff;',
    '  box-shadow: 0 0 12px rgba(127, 140, 255, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35);',
    '}',
    '.search-box svg {',
    '  width: 18px;',
    '  height: 18px;',
    '  stroke: #a9b1d6;',
    '  flex-shrink: 0;',
    '}',
    '.search-box input {',
    '  flex: 1;',
    '  background: none;',
    '  border: none;',
    '  outline: none;',
    '  color: #ffffff;',
    '  font-size: 1rem;',
    '  font-family: inherit;',
    '}',
    '.search-box input::placeholder { color: #565f89; }',
    '.search-container.fly-up {',
    '  transform: translateY(-220px) scale(0.92);',
    '  opacity: 0.1;',
    '}',
    '.page.exiting {',
    '  opacity: 0;',
    '  transform: translateY(-30px) scale(0.98);',
    '}',
    '.suggestions-box {',
    '  position: absolute;',
    '  top: calc(100% + 8px);',
    '  left: 0;',
    '  right: 0;',
    '  background: rgba(0, 0, 0, 0.7);',
    '  backdrop-filter: blur(20px);',
    '  -webkit-backdrop-filter: blur(20px);',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '  border-radius: 12px;',
    '  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);',
    '  overflow: hidden;',
    '  z-index: 100;',
    '}',
    '.suggestions-box.hidden { display: none; }',
    '.sug-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 12px;',
    '  padding: 11px 18px;',
    '  font-size: 0.95rem;',
    '  color: #a9b1d6;',
    '  cursor: pointer;',
    '  transition: background 0.15s ease, color 0.15s ease;',
    '}',
    '.sug-item:hover, .sug-item.selected {',
    '  background: #20212a;',
    '  color: #ffffff;',
    '}',
    '.sug-item svg {',
    '  width: 14px;',
    '  height: 14px;',
    '  stroke: #565f89;',
    '  flex-shrink: 0;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="page" id="page">',
    '  <div class="search-container" id="sc">',
    `    <form action="${searchBase}" method="GET" class="search-box" id="sf">`,
    '      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    '        <circle cx="11" cy="11" r="8"></circle>',
    '        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    '      </svg>',
    '      <input type="text" name="q" id="si" placeholder="Search or type a URL..." autofocus autocomplete="off" spellcheck="false">',
    '    </form>',
    '    <div id="suggestions" class="suggestions-box hidden"></div>',
    '  </div>',
    '</main>',
    '<script>',
    'var input = document.getElementById("si");',
    'var form = document.getElementById("sf");',
    'var sugBox = document.getElementById("suggestions");',
    'var page = document.getElementById("page");',
    'var sc = document.getElementById("sc");',
    'var selectedIndex = -1;',
    'var currentSuggestions = [];',
    'var isSubmitting = false;',
    'function submitQuery(q) {',
    '  if (!q || isSubmitting) return;',
    '  isSubmitting = true;',
    '  var targetUrl = q;',
    '  if (/^[a-zA-Z0-9+-.]+:\\/\\//.test(q)) {',
    '    targetUrl = q;',
    '  } else if (/^(about|settings|keyboard|shortcuts|welcome|start|newtab)$/i.test(q)) {',
    '    targetUrl = "napture://" + q + "/";',
    '  } else if (/^([\\w-]+\\.)+[\\w-]+([\\/].*)?$/i.test(q) && q.indexOf(" ") === -1) {',
    '    targetUrl = "https://" + q;',
    '  } else {',
    `    var searchBaseUrl = "${searchBase === 'https://duckduckgo.com/' ? 'https://duckduckgo.com/?q=' : searchBase + '?q='}";`,
    '    targetUrl = searchBaseUrl + encodeURIComponent(q);',
    '  }',
    '  if (sugBox) sugBox.classList.add("hidden");',
    '  if (sc) sc.classList.add("fly-up");',
    '  if (page) page.classList.add("exiting");',
    '  setTimeout(function() {',
    '    window.location.href = targetUrl;',
    '  }, 200);',
    '}',
    'form.addEventListener("submit", function(e) {',
    '  e.preventDefault();',
    '  if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {',
    '    submitQuery(currentSuggestions[selectedIndex]);',
    '  } else {',
    '    submitQuery(input.value.trim());',
    '  }',
    '});',
    'var debounceTimer;',
    'input.addEventListener("input", function() {',
    '  clearTimeout(debounceTimer);',
    '  var val = input.value.trim();',
    '  if (!val || val.indexOf("://") !== -1 || val.indexOf("napture://") === 0 || val.indexOf("http://") === 0 || val.indexOf("https://") === 0 || /^(about|settings|keyboard|shortcuts|welcome|start|newtab)$/i.test(val)) {',
    '    sugBox.innerHTML = "";',
    '    sugBox.classList.add("hidden");',
    '    currentSuggestions = [];',
    '    selectedIndex = -1;',
    '    return;',
    '  }',
    '  debounceTimer = setTimeout(function() {',
    '    fetch("napture://suggest?q=" + encodeURIComponent(val))',
    '      .then(function(res) { return res.json(); })',
    '      .then(function(data) {',
    '        currentSuggestions = (data && data[1]) ? data[1].slice(0, 7) : [];',
    '        renderSuggestions();',
    '      })',
    '      .catch(function() {});',
    '  }, 120);',
    '});',
    'function renderSuggestions() {',
    '  if (currentSuggestions.length === 0) {',
    '    sugBox.innerHTML = "";',
    '    sugBox.classList.add("hidden");',
    '    selectedIndex = -1;',
    '    return;',
    '  }',
    '  sugBox.innerHTML = "";',
    '  currentSuggestions.forEach(function(sug, idx) {',
    '    var item = document.createElement("div");',
    '    item.className = "sug-item" + (idx === selectedIndex ? " selected" : "");',
    '    item.innerHTML = \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>\' + escapeHtml(sug) + \'</span>\';',
    '    item.addEventListener("mousedown", function(e) {',
    '      e.preventDefault();',
    '      input.value = sug;',
    '      submitQuery(sug);',
    '    });',
    '    sugBox.appendChild(item);',
    '  });',
    '  sugBox.classList.remove("hidden");',
    '}',
    'function escapeHtml(str) {',
    '  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#039;");',
    '}',
    'input.addEventListener("keydown", function(e) {',
    '  if (e.key === "ArrowDown") {',
    '    if (currentSuggestions.length > 0) {',
    '      e.preventDefault();',
    '      selectedIndex = (selectedIndex + 1) % currentSuggestions.length;',
    '      input.value = currentSuggestions[selectedIndex];',
    '      renderSuggestions();',
    '    }',
    '  } else if (e.key === "ArrowUp") {',
    '    if (currentSuggestions.length > 0) {',
    '      e.preventDefault();',
    '      selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;',
    '      input.value = currentSuggestions[selectedIndex];',
    '      renderSuggestions();',
    '    }',
    '  } else if (e.key === "Escape") {',
    '    sugBox.classList.add("hidden");',
    '  }',
    '});',
    'document.addEventListener("click", function(e) {',
    '  if (!form.contains(e.target) && !sugBox.contains(e.target)) {',
    '    sugBox.classList.add("hidden");',
    '  }',
    '});',
    'window.addEventListener("pageshow", function(e) {',
    '  isSubmitting = false;',
    '  if (sc) sc.classList.remove("fly-up");',
    '  if (page) page.classList.remove("exiting");',
    '  if (input) {',
    '    input.value = "";',
    '    input.focus();',
    '  }',
    '});',
    'window.__naptureResume = function() {',
    '  if (input) {',
    '    input.focus();',
    '  }',
    '};',
    '</script>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildAboutPage() {
  const { naptureVersion, newebChromiumVersion } = getAppVersions();
  const logoDataUrl = getLogoDataUrl();
  const logoImgSrc = logoDataUrl || 'napture://logo';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' ne: file:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com data:; img-src \'self\' data: blob: http: https: ne: file:; connect-src \'self\' http: https: ws: wss:;">',
    '<title>About Napture</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">',
    '<style>',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  background: transparent;',
    '  color: #ffffff;',
    '  min-height: 100vh;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  user-select: none;',
    '  padding: 1.5rem;',
    '}',
    '.about-card {',
    '  background: rgba(18, 19, 26, 0.6);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 20px;',
    '  padding: 2.5rem;',
    '  width: 100%;',
    '  max-width: 480px;',
    '  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);',
    '  text-align: center;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  transition: border-color 0.25s ease, box-shadow 0.25s ease;',
    '}',
    '.app-logo {',
    '  width: 80px;',
    '  height: 80px;',
    '  margin-bottom: 1.25rem;',
    '  object-fit: contain;',
    '  filter: drop-shadow(0 4px 12px rgba(127, 140, 255, 0.3));',
    '  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    '.app-logo:hover {',
    '  transform: scale(1.05);',
    '}',
    '.app-name {',
    '  font-size: 1.8rem;',
    '  font-weight: 700;',
    '  color: #ffffff;',
    '  margin-bottom: 0.25rem;',
    '  letter-spacing: -0.5px;',
    '}',
    '.app-subtitle {',
    '  color: #565f89;',
    '  font-size: 0.95rem;',
    '  margin-bottom: 1.75rem;',
    '}',
    '.version-list {',
    '  width: 100%;',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 12px;',
    '  margin-bottom: 1.75rem;',
    '}',
    '.version-item {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  background: transparent;',
    '  border: 1px solid rgba(255, 255, 255, 0.05);',
    '  padding: 12px 18px;',
    '  border-radius: 12px;',
    '  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;',
    '}',
    '.version-item:hover {',
    '  background: rgba(255, 255, 255, 0.03);',
    '  border-color: rgba(127, 140, 255, 0.25);',
    '  transform: translateY(-1px);',
    '}',
    '.version-label {',
    '  font-size: 0.9rem;',
    '  color: #a9b1d6;',
    '  font-weight: 500;',
    '}',
    '.version-value {',
    '  font-size: 0.95rem;',
    '  color: #7f8cff;',
    '  font-weight: 600;',
    '  font-family: monospace, inherit;',
    '  background: rgba(127, 140, 255, 0.1);',
    '  padding: 4px 10px;',
    '  border-radius: 6px;',
    '}',
    '.btn-tech-details {',
    '  background: #242633;',
    '  color: #ffffff;',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '  border-radius: 10px;',
    '  padding: 9px 18px;',
    '  font-family: inherit;',
    '  font-size: 0.88rem;',
    '  font-weight: 500;',
    '  cursor: pointer;',
    '  margin-bottom: 1.5rem;',
    '  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;',
    '}',
    '.btn-tech-details:hover {',
    '  background: #2c2f3e;',
    '  border-color: #7f8cff;',
    '  color: #7f8cff;',
    '  box-shadow: 0 2px 10px rgba(127, 140, 255, 0.2);',
    '  transform: translateY(-1px);',
    '}',
    '.btn-tech-details:active {',
    '  transform: scale(0.97);',
    '}',
    '.footer-text {',
    '  color: #565f89;',
    '  font-size: 0.8rem;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="about-card">',
    '  <img src="' + logoImgSrc + '" alt="Napture Logo" class="app-logo">',
    '  <h1 class="app-name">Napture</h1>',
    '  <p class="app-subtitle"></p>',
    '  <div class="version-list">',
    '    <div class="version-item">',
    '      <span class="version-label">Napture Version</span>',
    '      <span class="version-value">v' + naptureVersion.replace(/^v/, '') + '</span>',
    '    </div>',
    '    <div class="version-item">',
    '      <span class="version-label">Neweb-Chromium</span>',
    '      <span class="version-value">' + newebChromiumVersion + '</span>',
    '    </div>',
    '  </div>',
    '  <button class="btn-tech-details" onclick="window.location.href=\'napture://settings#about\'">Technical Details</button>',
    '  <p class="footer-text">&copy; Nebuff, Asumi Hoshino</p>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildKeyboardPage() {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Keyboard Shortcuts</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">',
    '<style>',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  background: transparent;',
    '  color: #ffffff;',
    '  min-height: 100vh;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  user-select: none;',
    '  padding: 1.5rem;',
    '}',
    '@keyframes cardFadeIn {',
    '  from { opacity: 0; transform: translateY(8px) scale(0.98); }',
    '  to { opacity: 1; transform: translateY(0) scale(1); }',
    '}',
    '.shortcuts-card {',
    '  background: rgba(18, 19, 26, 0.6);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 20px;',
    '  padding: 2.5rem;',
    '  width: 100%;',
    '  max-width: 520px;',
    '  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 1.5rem;',
    '  animation: cardFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;',
    '}',
    '.title-section {',
    '  text-align: center;',
    '}',
    '.shortcuts-title {',
    '  font-size: 1.6rem;',
    '  font-weight: 700;',
    '  color: #ffffff;',
    '  margin-bottom: 0.25rem;',
    '}',
    '.shortcuts-subtitle {',
    '  color: #565f89;',
    '  font-size: 0.9rem;',
    '}',
    '.section-header {',
    '  font-size: 0.85rem;',
    '  font-weight: 700;',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.08em;',
    '  color: #7f8cff;',
    '  margin-bottom: 0.5rem;',
    '}',
    '.shortcut-list {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 8px;',
    '}',
    '.shortcut-item {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  background: transparent;',
    '  border: 1px solid rgba(255, 255, 255, 0.05);',
    '  padding: 10px 14px;',
    '  border-radius: 10px;',
    '  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;',
    '}',
    '.shortcut-item:hover {',
    '  background: rgba(255, 255, 255, 0.03);',
    '  border-color: rgba(127, 140, 255, 0.2);',
    '  transform: translateX(3px);',
    '}',
    '.shortcut-label {',
    '  font-size: 0.9rem;',
    '  color: #a9b1d6;',
    '}',
    '.shortcut-keys {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 4px;',
    '}',
    'kbd {',
    '  background: #24283b;',
    '  border: 1px solid rgba(255, 255, 255, 0.12);',
    '  border-radius: 5px;',
    '  padding: 3px 8px;',
    '  font-family: inherit;',
    '  font-size: 0.8rem;',
    '  color: #bb9af7;',
    '  font-weight: 600;',
    '  transition: border-color 0.15s ease, background-color 0.15s ease;',
    '}',
    '.shortcut-item:hover kbd {',
    '  border-color: rgba(127, 140, 255, 0.3);',
    '  background: #282c42;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="shortcuts-card">',
    '  <div class="title-section">',
    '    <h1 class="shortcuts-title">Keyboard Shortcuts</h1>',
    '    <p class="shortcuts-subtitle">Napture navigation & control hotkeys</p>',
    '  </div>',
    '  <div>',
    '    <div class="section-header">Navigation</div>',
    '    <div class="shortcut-list">',
    '      <div class="shortcut-item"><span class="shortcut-label">Focus Address Bar</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>L</kbd></div></div>',
    '      <div class="shortcut-item"><span class="shortcut-label">Reload Page</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>R</kbd></div></div>',
    '      <div class="shortcut-item"><span class="shortcut-label">Go Back / Forward</span><div class="shortcut-keys"><kbd>Alt</kbd><span>+</span><kbd>←</kbd><span>/</span><kbd>→</kbd></div></div>',
    '    </div>',
    '  </div>',
    '  <div>',
    '    <div class="section-header">Tab Management</div>',
    '    <div class="shortcut-list">',
    '      <div class="shortcut-item"><span class="shortcut-label">New Tab</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>T</kbd></div></div>',
    '      <div class="shortcut-item"><span class="shortcut-label">Close Active Tab</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>W</kbd></div></div>',
    '      <div class="shortcut-item"><span class="shortcut-label">Reopen Closed Tab</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>T</kbd></div></div>',
    '      <div class="shortcut-item"><span class="shortcut-label">Next / Previous Tab</span><div class="shortcut-keys"><kbd>Ctrl</kbd><span>+</span><kbd>Tab</kbd></div></div>',
    '    </div>',
    '  </div>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildForceUpdatePage() {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Napture Force Update</title>',
    '<style>',
    'body {',
    '  font-family: sans-serif;',
    '  background: #0f0f14;',
    '  color: #ffffff;',
    '  padding: 2rem;',
    '  margin: 0;',
    '}',
    '#status {',
    '  font-size: 16px;',
    '  line-height: 1.5;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '  <div id="status">Checking for updates...</div>',
    '  <script>',
    '    (function() {',
    '      const statusEl = document.getElementById("status");',
    '',
    '      async function runForceUpdate() {',
    '        if (!window.naptureAPI || !window.naptureAPI.checkForUpdates) {',
    '          if (statusEl) statusEl.textContent = "Updater API not available.";',
    '          return;',
    '        }',
    '',
    '        try {',
    '          const res = await window.naptureAPI.checkForUpdates();',
    '          if (res && res.updateAvailable) {',
    '            if (statusEl) statusEl.textContent = "Update found (v" + (res.version || "new") + "). Installing update...";',
    '            if (window.naptureAPI.installUpdate) {',
    '              await window.naptureAPI.installUpdate();',
    '            }',
    '          } else if (res && res.error) {',
    '            if (statusEl) statusEl.textContent = "Unable to check for updates: " + res.error;',
    '          } else {',
    '            if (statusEl) statusEl.textContent = "Napture is up to date";',
    '          }',
    '        } catch (err) {',
    '          if (statusEl) statusEl.textContent = "Update error: " + (err && err.message ? err.message : "Unknown error");',
    '        }',
    '      }',
    '',
    '      if (document.readyState === "loading") {',
    '        document.addEventListener("DOMContentLoaded", runForceUpdate);',
    '      } else {',
    '        runForceUpdate();',
    '      }',
    '    })();',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

module.exports = {
  registerCustomProtocols,
  setupProtocolHandlers,
  buildWebErrorPage,
  buildForceUpdatePage,
  getRouteFromUrl,
  handleCustomProtocolRequest
};
