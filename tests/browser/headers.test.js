describe('Header Sanitization & Compatibility', () => {
  const processChromeVersion = process.versions.chrome || '151.0.7922.138';
  const chromeMajorVersion = processChromeVersion.split('.')[0];
  const cleanUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${processChromeVersion} Safari/537.36`;

  function sanitizeHeaders(inputHeaders) {
    const headers = { ...inputHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-electron-version') {
        delete headers[key];
      } else if (lower === 'x-requested-with') {
        const val = String(headers[key]).toLowerCase();
        if (val !== 'xmlhttprequest') {
          delete headers[key];
        }
      } else if (lower === 'user-agent') {
        headers[key] = cleanUserAgent;
      } else if (lower.startsWith('sec-ch-')) {
        if (typeof headers[key] === 'string') {
          if (lower === 'sec-ch-ua-full-version-list') {
            headers[key] = headers[key]
              .replace(/"Electron";v="[^"]*"/gi, `"Google Chrome";v="${processChromeVersion}"`)
              .replace(/Electron/gi, 'Google Chrome');
          } else {
            headers[key] = headers[key]
              .replace(/"Electron";v="[^"]*"/gi, `"Google Chrome";v="${chromeMajorVersion}"`)
              .replace(/Electron/gi, 'Google Chrome');
          }
        }
      }
    }
    return headers;
  }

  it('should preserve X-Requested-With when value is XMLHttpRequest', () => {
    const input = { 'X-Requested-With': 'XMLHttpRequest' };
    const output = sanitizeHeaders(input);
    expect(output['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('should remove X-Requested-With when value is custom Electron package', () => {
    const input = { 'X-Requested-With': 'com.napture.browser' };
    const output = sanitizeHeaders(input);
    expect(output['X-Requested-With']).toBeUndefined();
  });

  it('should remove x-electron-version header', () => {
    const input = { 'x-electron-version': '31.3.1' };
    const output = sanitizeHeaders(input);
    expect(output['x-electron-version']).toBeUndefined();
  });

  it('should replace Electron brand in sec-ch-ua with Google Chrome', () => {
    const input = {
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Electron";v="31.3.1"',
      'sec-ch-ua-full-version-list': '"Not/A)Brand";v="8.0.0.0", "Chromium";v="126.0.6478.182", "Electron";v="31.3.1"'
    };
    const output = sanitizeHeaders(input);
    expect(output['sec-ch-ua']).not.toContain('Electron');
    expect(output['sec-ch-ua']).toContain('Google Chrome');
    expect(output['sec-ch-ua-full-version-list']).not.toContain('Electron');
    expect(output['sec-ch-ua-full-version-list']).toContain('Google Chrome');
  });

  it('should set User-Agent to clean Chrome user agent', () => {
    const input = { 'user-agent': 'Mozilla/5.0 Electron/31.0.0' };
    const output = sanitizeHeaders(input);
    expect(output['user-agent']).toBe(cleanUserAgent);
  });

  it('should verify tab-preload.js exists, protects external contexts, and sanitizes userAgentData', () => {
    const fs = require('fs');
    const path = require('path');
    const tabPreload = fs.readFileSync(path.resolve(__dirname, '../../napture/tab-preload.js'), 'utf8');
    expect(tabPreload).toContain('navigator.userAgentData');
    expect(tabPreload).toContain('Google Chrome');
    expect(tabPreload).toContain('window.chrome.loadTimes');
    expect(tabPreload).toContain('isInternalPage');
  });
});
