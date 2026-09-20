const { getUpdaterHtml } = require('../../napture/updater-ui');
const vm = require('vm');
const fs = require('fs');

describe('Updater UI (getUpdaterHtml)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders valid updater HTML document', () => {
    const html = getUpdaterHtml();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Napture updating');
    expect(html).toContain('progress-bar');
    expect(html).toContain('status-title');
    expect(html).toContain('status-subtitle');
  });

  it('embeds logo image tag when logoBase64 parameter is supplied', () => {
    const fakeLogo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = getUpdaterHtml(fakeLogo);

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain(fakeLogo);
  });

  it('replaces LOGO_PLACEHOLDER with empty string when logoBase64 is omitted', () => {
    const html = getUpdaterHtml();

    expect(html).not.toContain('{{LOGO_PLACEHOLDER}}');
  });

  it('contains embedded client script that parses syntax cleanly', () => {
    const html = getUpdaterHtml();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

    expect(scriptMatch).toBeTruthy();
    const scriptCode = scriptMatch[1];

    expect(() => {
      new vm.Script(scriptCode);
    }).not.toThrow();
  });

  it('reads updater-ui.html from disk if it exists', () => {
    const customHtml = '<html><body>Custom Updater {{LOGO_PLACEHOLDER}}</body></html>';
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(customHtml);

    const fakeLogo = 'iVBORw0KGgo=';
    const html = getUpdaterHtml(fakeLogo);

    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalled();
    expect(html).toContain('Custom Updater');
    expect(html).toContain('class="brand-logo"');
    expect(html).not.toContain('{{LOGO_PLACEHOLDER}}');
  });

  it('uses FALLBACK_HTML if updater-ui.html does not exist on disk', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'readFileSync');

    const html = getUpdaterHtml();

    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Napture updating');
    expect(html).toContain('progress-bar');
  });

  it('handles fs errors gracefully, logging to console.error and returning fallback html', () => {
    jest.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('Fake FS error');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const html = getUpdaterHtml();

    expect(errorSpy).toHaveBeenCalledWith('Failed to read updater-ui.html for updater:', expect.any(Error));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Napture updating');
    expect(html).toContain('progress-bar');
  });
});

describe('Force Updater (buildForceUpdatePage & napture://update-force)', () => {
  const { buildForceUpdatePage } = require('../../napture/protocol-handler');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders valid force update HTML document with basic text and no icons or fancy fonts', () => {
    const html = buildForceUpdatePage();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Napture Force Update');
    expect(html).toContain('id="status"');
    expect(html).toContain('Checking for updates...');
    expect(html).toContain('Napture is up to date');
    // Ensure no external fancy font stylesheets or image/icon tags
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).toContain('font-family: sans-serif;');
  });

  it('contains embedded client script that parses cleanly into vm.Script without syntax errors', () => {
    const html = buildForceUpdatePage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

    expect(scriptMatch).toBeTruthy();
    const scriptCode = scriptMatch[1];

    expect(() => {
      new vm.Script(scriptCode);
    }).not.toThrow();
  });

  it('automatically triggers installUpdate when an update is available', async () => {
    const html = buildForceUpdatePage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptCode = scriptMatch[1];

    const mockStatusEl = { textContent: '' };

    let checkCalled = false;
    let installCalled = false;

    const mockContext = {
      document: {
        getElementById: (id) => (id === 'status' ? mockStatusEl : null),
        readyState: 'complete',
        addEventListener: jest.fn()
      },
      window: {
        naptureAPI: {
          checkForUpdates: jest.fn().mockImplementation(async () => {
            checkCalled = true;
            return { updateAvailable: true, version: '1.2.0', download_url: '/updates/v1.2.0.zip' };
          }),
          installUpdate: jest.fn().mockImplementation(async () => {
            installCalled = true;
            return { success: true };
          })
        }
      },
      setTimeout: (fn) => fn()
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    // Allow async execution to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(checkCalled).toBe(true);
    expect(installCalled).toBe(true);
    expect(mockStatusEl.textContent).toContain('Update found (v1.2.0). Installing update...');
  });

  it('displays basic text "Napture is up to date" and does NOT call installUpdate when on latest version', async () => {
    const html = buildForceUpdatePage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptCode = scriptMatch[1];

    const mockStatusEl = { textContent: '' };

    let checkCalled = false;
    let installCalled = false;

    const mockContext = {
      document: {
        getElementById: (id) => (id === 'status' ? mockStatusEl : null),
        readyState: 'complete',
        addEventListener: jest.fn()
      },
      window: {
        naptureAPI: {
          checkForUpdates: jest.fn().mockImplementation(async () => {
            checkCalled = true;
            return { updateAvailable: false };
          }),
          installUpdate: jest.fn().mockImplementation(async () => {
            installCalled = true;
            return { success: true };
          })
        }
      },
      setTimeout: (fn) => fn()
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    await new Promise((r) => setTimeout(r, 50));

    expect(checkCalled).toBe(true);
    expect(installCalled).toBe(false);
    expect(mockStatusEl.textContent).toBe('Napture is up to date');
  });

  it('displays basic error text when update check encounters an error', async () => {
    const html = buildForceUpdatePage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptCode = scriptMatch[1];

    const mockStatusEl = { textContent: '' };

    const mockContext = {
      document: {
        getElementById: (id) => (id === 'status' ? mockStatusEl : null),
        readyState: 'complete',
        addEventListener: jest.fn()
      },
      window: {
        naptureAPI: {
          checkForUpdates: jest.fn().mockResolvedValue({ error: 'Connection refused by server' }),
          installUpdate: jest.fn()
        }
      },
      setTimeout: (fn) => fn()
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockStatusEl.textContent).toContain('Unable to check for updates: Connection refused by server');
  });

  it('gracefully handles missing naptureAPI', async () => {
    const html = buildForceUpdatePage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptCode = scriptMatch[1];

    const mockStatusEl = { textContent: '' };

    const mockContext = {
      document: {
        getElementById: (id) => (id === 'status' ? mockStatusEl : null),
        readyState: 'complete',
        addEventListener: jest.fn()
      },
      window: {},
      setTimeout: (fn) => fn()
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockStatusEl.textContent).toBe('Updater API not available.');
  });
});
