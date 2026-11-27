// Exercises pure helpers that live inside the main process (napture/main.js).
// main.js boots Electron at module scope, so the functions are lifted out of the
// source by name and run in a vm sandbox with the globals they touch stubbed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const mainJsPath = path.resolve(__dirname, '../../napture/main.js');

let mainSource = null;

// Read lazily: some suites build their sandbox while the file is being collected.
function getMainSource() {
  if (mainSource === null) mainSource = fs.readFileSync(mainJsPath, 'utf8');
  return mainSource;
}

// Returns the full `function name(...) { ... }` text, using brace matching that
// skips string, template, regex and comment bodies so `${...}`, "/" and "'" are
// not counted or mistaken for quote delimiters.
function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in main.js`);

  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    const ch = source[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') j++;
        j++;
      }
      i = j;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === '/') {
      // A regex literal can only follow an operator, opening bracket or keyword.
      const before = source.slice(0, i).replace(/\s+$/, '');
      const prevCh = before[before.length - 1];
      const regexAllowed = prevCh === undefined || '(,=:[!&|?{};+-*%<>~^'.includes(prevCh);
      if (regexAllowed) {
        let inClass = false;
        let j = i + 1;
        for (; j < source.length; j++) {
          const c = source[j];
          if (c === '\\') { j++; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) break;
        }
        while (j + 1 < source.length && /[a-z]/i.test(source[j + 1])) j++;
        i = j;
        continue;
      }
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`unbalanced braces while extracting ${name}`);
}

function loadFunctions(names, globals = {}) {
  const code = names.map((name) => extractFunction(getMainSource(), name)).join('\n\n');
  const context = vm.createContext(
    Object.assign({ Buffer, Math, JSON, Date, console, require, process }, globals)
  );
  const members = names.map((name) => `${name}: ${name}`).join(', ');
  return vm.runInContext(`${code}\n;({ ${members} });`, context);
}

function settingsStub(store) {
  return (key, fallback) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback);
}

describe('main.js escapeHtml', () => {
  test('escapes every HTML-sensitive character', () => {
    const { escapeHtml } = loadFunctions(['escapeHtml']);

    expect(escapeHtml(`<b>a & "b" 'c'</b>`)).toBe(
      '&lt;b&gt;a &amp; &quot;b&quot; &#039;c&#039;&lt;/b&gt;'
    );
  });

  test('leaves plain text untouched and stringifies non-strings', () => {
    const { escapeHtml } = loadFunctions(['escapeHtml']);

    expect(escapeHtml('plain text')).toBe('plain text');
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });
});

describe('main.js isWelcomeUrl', () => {
  const { isWelcomeUrl } = loadFunctions(['isWelcomeUrl']);

  test('treats empty input as the welcome page', () => {
    expect(isWelcomeUrl(null)).toBe(true);
    expect(isWelcomeUrl(undefined)).toBe(true);
    expect(isWelcomeUrl('')).toBe(true);
    expect(isWelcomeUrl('   ')).toBe(true);
  });

  test('matches every bare new-tab alias, ignoring case and trailing slashes', () => {
    for (const url of [
      'about:blank',
      'napture:',
      'napture://',
      'napture://welcome',
      'napture://start',
      'napture://newtab',
      'ne:',
      'ne://',
      'ne://welcome',
      'ne://start',
      'ne://newtab',
      'about:welcome',
      'about:start',
      'about:newtab'
    ]) {
      expect(isWelcomeUrl(url)).toBe(true);
      expect(isWelcomeUrl(url.toUpperCase())).toBe(true);
      expect(isWelcomeUrl(`  ${url}//  `)).toBe(true);
    }
  });

  test('rejects real pages and non-welcome internal pages', () => {
    expect(isWelcomeUrl('https://example.com')).toBe(false);
    expect(isWelcomeUrl('napture://settings')).toBe(false);
    expect(isWelcomeUrl('napture://history')).toBe(false);
    expect(isWelcomeUrl('ne://about')).toBe(false);
  });
});

describe('main.js calculateRemainingTimeStr', () => {
  const NOW = 1000000000;
  const { calculateRemainingTimeStr } = loadFunctions(['calculateRemainingTimeStr'], {
    Date: { now: () => NOW }
  });

  test('reports nothing usable as Calculating...', () => {
    expect(calculateRemainingTimeStr(0, 1000, NOW - 1000)).toBe('Calculating...');
    expect(calculateRemainingTimeStr(100, 0, NOW - 1000)).toBe('Calculating...');
    expect(calculateRemainingTimeStr(100, -5, NOW - 1000)).toBe('Calculating...');
    // Start time in the future means elapsed time is not positive yet.
    expect(calculateRemainingTimeStr(100, 1000, NOW + 1000)).toBe('Calculating...');
  });

  test('reports a completed download as Finishing...', () => {
    expect(calculateRemainingTimeStr(1000, 1000, NOW - 1000)).toBe('Finishing...');
    expect(calculateRemainingTimeStr(1500, 1000, NOW - 1000)).toBe('Finishing...');
  });

  test('formats seconds, minutes and hours', () => {
    // 500 of 1000 bytes in 1s -> 500 B/s -> 500 bytes left -> 1s.
    expect(calculateRemainingTimeStr(500, 1000, NOW - 1000)).toBe('1s left');
    // 600 of 1000 bytes in 2s -> 300 B/s -> 400 left -> ceil(1.33) = 2s.
    expect(calculateRemainingTimeStr(600, 1000, NOW - 2000)).toBe('2s left');
    // 50 of 1000 bytes in 10s -> 5 B/s -> 950 left -> 190s.
    expect(calculateRemainingTimeStr(50, 1000, NOW - 10000)).toBe('3m 10s left');
    // 1 of 7201 bytes in 1s -> 1 B/s -> 7200s left.
    expect(calculateRemainingTimeStr(1, 7201, NOW - 1000)).toBe('2h 0m left');
  });
});

describe('main.js performance mode and frame rate', () => {
  function loadPerformance(store) {
    return loadFunctions(['getActivePerformanceMode', 'getFrameRateForState'], {
      getSetting: settingsStub(store)
    });
  }

  test('an explicit performanceMode wins over the battery saver toggle', () => {
    expect(loadPerformance({ performanceMode: 'performance', batterySaver: true }).getActivePerformanceMode())
      .toBe('performance');
    expect(loadPerformance({ performanceMode: 'battery_saver', batterySaver: false }).getActivePerformanceMode())
      .toBe('battery_saver');
  });

  test('battery saver falls back to balanced when the toggle is off or unset', () => {
    expect(loadPerformance({ batterySaver: true }).getActivePerformanceMode()).toBe('battery_saver');
    expect(loadPerformance({ batterySaver: false }).getActivePerformanceMode()).toBe('balanced');
    expect(loadPerformance({}).getActivePerformanceMode()).toBe('balanced');
    expect(loadPerformance({ performanceMode: '' }).getActivePerformanceMode()).toBe('balanced');
  });

  test('balanced mode throttles unfocused and background tabs to 30fps', () => {
    const { getFrameRateForState } = loadPerformance({});

    expect(getFrameRateForState(true, true)).toBe(60);
    expect(getFrameRateForState()).toBe(60);
    expect(getFrameRateForState(false, true)).toBe(30);
    expect(getFrameRateForState(true, false)).toBe(30);
    expect(getFrameRateForState(false, false)).toBe(30);
  });

  test('battery saver throttles to 15fps unless the tab is focused and active', () => {
    const { getFrameRateForState } = loadPerformance({ batterySaver: true });

    expect(getFrameRateForState(true, true)).toBe(30);
    expect(getFrameRateForState(false, true)).toBe(15);
    expect(getFrameRateForState(true, false)).toBe(15);
  });

  test('performance mode allows 144fps and never drops a focused window below 60', () => {
    const { getFrameRateForState } = loadPerformance({ performanceMode: 'performance' });

    expect(getFrameRateForState(true, true)).toBe(144);
    expect(getFrameRateForState(false, true)).toBe(60);
    expect(getFrameRateForState(true, false)).toBe(30);
  });

  test('an unknown mode falls back to the balanced table', () => {
    const { getFrameRateForState } = loadPerformance({ performanceMode: 'turbo' });

    expect(getFrameRateForState(true, true)).toBe(60);
    expect(getFrameRateForState(false, true)).toBe(30);
  });
});

describe('main.js isWindows11', () => {
  test('is always false off Windows', () => {
    const { isWindows11 } = loadFunctions(['isWindows11'], {
      process: { platform: 'linux' },
      os: { release: () => '10.0.22631' }
    });

    expect(isWindows11()).toBe(false);
  });

  test('detects Windows 11 by build number', () => {
    const win = (release) => loadFunctions(['isWindows11'], {
      process: { platform: 'win32' },
      os: { release: () => release }
    }).isWindows11();

    expect(win('10.0.22621')).toBe(true);
    expect(win('10.0.22000')).toBe(true);
    expect(win('10.0.19045')).toBe(false);
    expect(win('6.1.7601')).toBe(false);
    expect(win('11.0.0')).toBe(true);
  });
});

describe('main.js decryptChromiumCookieValue', () => {
  const linux = () => loadFunctions(['decryptChromiumCookieValue'], {
    process: { platform: 'linux' }
  }).decryptChromiumCookieValue;

  function encryptV10(plain, hostKey) {
    const key = crypto.pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
    const iv = Buffer.alloc(16, ' ');
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const hostHash = crypto.createHash('sha256').update(hostKey).digest();
    const body = Buffer.concat([hostHash, Buffer.from(plain, 'utf8')]);
    return Buffer.concat([Buffer.from('v10', 'latin1'), cipher.update(body), cipher.final()]);
  }

  test('unwraps v10 blobs and strips the Chrome 80+ host hash prefix', () => {
    const decrypt = linux();

    expect(decrypt(encryptV10('session=abc123', '.example.com'), '.example.com')).toBe('session=abc123');
    expect(decrypt(encryptV10('session=abc123', ''), '')).toBe('session=abc123');
  });

  test('handles v11 blobs and short values without a host hash', () => {
    const decrypt = linux();
    const blob = encryptV10('short', '.example.com');
    blob.write('v11', 0, 'latin1');

    expect(decrypt(blob, '.example.com')).toBe('short');

    const bare = Buffer.from('plainvalue', 'utf8');
    expect(decrypt(bare, '.example.com')).toBe('plainvalue');
  });

  test('returns an empty string for empty or undecryptable input', () => {
    const decrypt = linux();

    expect(decrypt(Buffer.alloc(0), '.example.com')).toBe('');
    expect(decrypt(Buffer.from('v10garbage', 'latin1'), '.example.com')).toBe('');
  });

  test('does not guess at Windows DPAPI or macOS Keychain blobs', () => {
    for (const platform of ['win32', 'darwin']) {
      const decrypt = loadFunctions(['decryptChromiumCookieValue'], {
        process: { platform }
      }).decryptChromiumCookieValue;

      expect(decrypt(Buffer.from('encrypted-blob', 'utf8'), '.example.com')).toBe('');
    }
  });
});

describe('main.js resolveDownloadItemPath', () => {
  const DOWNLOADS = '/home/user/Downloads';

  function loadResolve({ configuredDir, existingDirs = [], settings = {} }) {
    const { resolveDownloadItemPath } = loadFunctions(['resolveDownloadItemPath'], {
      app: { getPath: (name) => (name === 'downloads' ? DOWNLOADS : `/home/user/${name}`) },
      fs: { existsSync: (target) => existingDirs.includes(target) },
      path,
      getSetting: settingsStub({ downloadPath: configuredDir, ...settings })
    });

    return resolveDownloadItemPath;
  }

  test('uses the configured download folder when it exists', () => {
    const resolve = loadResolve({ configuredDir: '/data/dl', existingDirs: ['/data/dl'] });

    expect(resolve(null)).toEqual({ targetPath: null, fallbackDir: '/data/dl' });
  });

  test('falls back to the OS downloads folder when the configured one is missing', () => {
    const resolve = loadResolve({ configuredDir: '/data/missing', existingDirs: [] });

    expect(resolve(undefined)).toEqual({ targetPath: null, fallbackDir: DOWNLOADS });
  });

  test('accepts a plain path string', () => {
    const resolve = loadResolve({ configuredDir: '/data/dl', existingDirs: ['/data/dl'] });

    expect(resolve('/data/dl/file.zip').targetPath).toBe('/data/dl/file.zip');
  });

  test('prefers itemData.path over the stored name', () => {
    const resolve = loadResolve({ configuredDir: '/data/dl', existingDirs: ['/data/dl'] });

    expect(resolve({ name: 'file.zip', path: '/other/file.zip' }).targetPath).toBe('/other/file.zip');
  });

  test('rebuilds a missing path from the file name inside the fallback folder', () => {
    const resolve = loadResolve({ configuredDir: '/data/dl', existingDirs: ['/data/dl'] });

    expect(resolve({ name: 'report.pdf' }).targetPath).toBe(path.join('/data/dl', 'report.pdf'));
    expect(resolve({}).targetPath).toBeUndefined();
  });
});
