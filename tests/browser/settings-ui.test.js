const path = require('path');
const os = require('os');
const vm = require('vm');

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

jest.mock('../../napture/db/history', () => ({
  getSetting: jest.fn(() => null),
  setSetting: jest.fn(),
  getAllSettings: jest.fn(() => ({})),
  saveAllSettings: jest.fn()
}));

describe('Settings UI Protocol Tab Visibility', () => {
  const versionsPath = path.resolve(__dirname, '../../napture/versions.json');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete require.cache[versionsPath];
  });

  afterEach(() => {
    if (originalEnv.DISABLE_NE_PROTOCOL !== undefined) {
      process.env.DISABLE_NE_PROTOCOL = originalEnv.DISABLE_NE_PROTOCOL;
    } else {
      delete process.env.DISABLE_NE_PROTOCOL;
    }
    if (originalEnv.ENABLE_NE_PROTOCOL !== undefined) {
      process.env.ENABLE_NE_PROTOCOL = originalEnv.ENABLE_NE_PROTOCOL;
    } else {
      delete process.env.ENABLE_NE_PROTOCOL;
    }
  });

  it('includes the Protocols tab and section when ne:// protocol is enabled', () => {
    delete process.env.DISABLE_NE_PROTOCOL;
    process.env.ENABLE_NE_PROTOCOL = 'true';

    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('data-target="protocols"');
    expect(html).toContain('id="sec-protocols"');
    expect(html).toContain('Enable Neweb (ne://) Protocol');
  });

  it('omits the Protocols tab and section when ne:// protocol is disabled via env var', () => {
    process.env.DISABLE_NE_PROTOCOL = 'true';

    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain('data-target="protocols"');
    expect(html).not.toContain('id="sec-protocols"');
    expect(html).not.toContain('Enable Neweb (ne://) Protocol');
  });

  it('omits the Protocols tab and section when enableNeProtocol is false in versions.json', () => {
    jest.doMock(versionsPath, () => ({
      enableNeProtocol: false
    }), { virtual: true });

    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain('data-target="protocols"');
    expect(html).not.toContain('id="sec-protocols"');
    expect(html).not.toContain('Enable Neweb (ne://) Protocol');
  });
});

describe('Settings UI Languages and Options', () => {
  const versionsPath = path.resolve(__dirname, '../../napture/versions.json');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete require.cache[versionsPath];
  });

  afterEach(() => {
    if (originalEnv.DISABLE_NE_PROTOCOL !== undefined) {
      process.env.DISABLE_NE_PROTOCOL = originalEnv.DISABLE_NE_PROTOCOL;
    } else {
      delete process.env.DISABLE_NE_PROTOCOL;
    }
    if (originalEnv.ENABLE_NE_PROTOCOL !== undefined) {
      process.env.ENABLE_NE_PROTOCOL = originalEnv.ENABLE_NE_PROTOCOL;
    } else {
      delete process.env.ENABLE_NE_PROTOCOL;
    }
  });

  it('removes the Optimize Database option', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain('id="btn-optimize-db"');
    expect(html).not.toContain('Optimize Database Storage');
  });

  it('removes Multilingual Spell Checking and Offer to Translate Foreign Pages', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain('id="setting-spellCheck"');
    expect(html).not.toContain('Multilingual Spell Checking');
    expect(html).not.toContain('id="setting-offerTranslate"');
    expect(html).not.toContain('Offer to Translate Foreign Pages');
  });

  it('only includes en-US, en-CA, and cute in Interface Language dropdown', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('value="en-US"');
    expect(html).toContain('English (United States)');
    expect(html).toContain('value="en-CA"');
    expect(html).toContain('English (Canadian)');
    expect(html).toContain('value="cute"');
    expect(html).toContain('Cute Engwish');

    // Make sure obsolete locales are removed
    expect(html).not.toContain('value="en-GB"');
    expect(html).not.toContain('value="es-ES"');
    expect(html).not.toContain('value="fr-FR"');
    expect(html).not.toContain('value="de-DE"');
    expect(html).not.toContain('value="ja-JP"');
  });

  it('does not include the feedback note in the languages section', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain("Don't see your language");
    expect(html).not.toContain("Don't see ur wanguwage");
  });

  it('renders authentic Canadian English when language is en-CA', () => {
    const hist = require('../../napture/db/history');
    hist.getAllSettings.mockReturnValue({ language: 'en-CA' });

    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('Appearance & Features');
    expect(html).toContain('Toolbar Preferences');
    expect(html).toContain('About Napture, eh?');
    expect(html).toContain('Downloads (sorry!)');
  });

  it('renders Cute Engwish across sections when language is cute', () => {
    const hist = require('../../napture/db/history');
    hist.getAllSettings.mockReturnValue({ language: 'cute' });

    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('Appeawance & Featwwes');
    expect(html).toContain('Wanguage');
    expect(html).toContain('Settingws');
    expect(html).toContain('D-Downwoads & Fowdews');
    expect(html).toContain('Pwivacy & Secwwity');
  });

  it('renders the Hover to Open Folders toggle setting in Appearance section', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('id="setting-folderHoverOpen"');
    expect(html).toContain('Hover to Open Folders');
  });

  it('renders Customize Toolbar button and visual builder modal in the Toolbar settings section', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('id="btn-customize-toolbar"');
    expect(html).toContain('Customize Toolbar');
    expect(html).toContain('id="modal-toolbar-customizer"');
    expect(html).toContain('id="toolbar-visual-view"');
    expect(html).toContain('id="toolbar-live-preview"');
    expect(html).toContain('id="toolbar-items-list"');
    expect(html).toContain('id="toolbar-available-tray"');
    expect(html).toContain('id="active-toolbar-count-badge"');
    expect(html).toContain('id="customizer-context-menu"');
    expect(html).toContain('id="toolbar-code-editor"');
    expect(html).toContain('id="btn-reset-toolbar-defaults"');
  });

  it('renders Alpha badge next to Battery Saver and Memory Saver in settings UI', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('class="alpha-badge"');
    expect(html).toContain('Battery Saver <span class="alpha-badge">Alpha</span>');
    expect(html).toContain('Memory Saver <span class="alpha-badge">Alpha</span>');
  });

  it('removes the Show Home Button toggle switch while retaining custom home URL field', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).not.toContain('id="setting-showHomeBtn"');
    expect(html).toContain('id="setting-homeUrl"');
    expect(html).not.toContain('display:none');
  });
});

describe('Toolbar Layout Validation and Invariants', () => {
  const { validateToolbarLayout, DEFAULT_TOOLBAR_LAYOUT, getDefaultSettings } = require('../../napture/settings-ui');

  it('provides standard default toolbar layout with address-container and correct order', () => {
    expect(Array.isArray(DEFAULT_TOOLBAR_LAYOUT)).toBe(true);
    expect(DEFAULT_TOOLBAR_LAYOUT.map(i => i.id)).toEqual([
      'home-btn',
      'sep-1',
      'back-btn',
      'forward-btn',
      'reload-btn',
      'margin-1',
      'address-container'
    ]);
    const defaults = getDefaultSettings();
    expect(defaults.dynamicBackground).toBe(true);
    expect(defaults.memorySaver).toBe(false);
  });

  it('re-inserts address-container if missing from custom layout', () => {
    const customLayout = [
      { id: 'back-btn', type: 'system', name: 'Back Button' },
      { id: 'forward-btn', type: 'system', name: 'Forward Button' }
    ];
    const validated = validateToolbarLayout(customLayout);
    const hasAddress = validated.some(i => i.id === 'address-container');
    expect(hasAddress).toBe(true);
    expect(validated.length).toBe(3);
  });

  it('deduplicates address-container and system buttons', () => {
    const duplicateLayout = [
      { id: 'address-container', type: 'system' },
      { id: 'back-btn', type: 'system' },
      { id: 'back-btn', type: 'system' },
      { id: 'address-container', type: 'system' }
    ];
    const validated = validateToolbarLayout(duplicateLayout);
    const addressCount = validated.filter(i => i.id === 'address-container').length;
    const backCount = validated.filter(i => i.id === 'back-btn').length;
    expect(addressCount).toBe(1);
    expect(backCount).toBe(1);
  });

  it('normalizes spacer type to margin and preserves custom links and separators', () => {
    const layout = [
      { id: 'spacer-1', type: 'spacer', name: 'Spacer' },
      { id: 'address-container', type: 'system', name: 'Address Bar' },
      { id: 'link-1', type: 'link', name: 'GitHub', url: 'https://github.com' },
      { id: 'sep-1', type: 'separator', name: 'Separator' }
    ];
    const validated = validateToolbarLayout(layout);
    expect(validated[0].type).toBe('margin');
    expect(validated[1].id).toBe('address-container');
    expect(validated[2].url).toBe('https://github.com');
    expect(validated[3].type).toBe('separator');
  });

  it('assigns unique IDs to colliding non-system item IDs', () => {
    const layout = [
      { id: 'custom-link', type: 'link', name: 'Link 1', url: 'https://1.com' },
      { id: 'custom-link', type: 'link', name: 'Link 2', url: 'https://2.com' },
      { id: 'address-container', type: 'system' }
    ];
    const validated = validateToolbarLayout(layout);
    expect(validated[0].id).toBe('custom-link');
    expect(validated[1].id).not.toBe('custom-link');
    expect(validated[1].id.startsWith('link-')).toBe(true);
  });

  it('returns default layout on invalid or empty input', () => {
    expect(validateToolbarLayout(null)).toEqual(DEFAULT_TOOLBAR_LAYOUT);
    expect(validateToolbarLayout(undefined)).toEqual(DEFAULT_TOOLBAR_LAYOUT);
    expect(validateToolbarLayout([])).toEqual(DEFAULT_TOOLBAR_LAYOUT);
    expect(validateToolbarLayout('not an array')).toEqual(DEFAULT_TOOLBAR_LAYOUT);
  });
});

describe('Settings UI Client Script Validation', () => {
  it('generates client-side script with zero syntax errors and valid AST', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    const scriptMatches = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatches).toBeTruthy();

    const scriptCode = scriptMatches[1];
    expect(() => {
      new vm.Script(scriptCode);
    }).not.toThrow();
  });

  it('does not contain un-interpolated t(...) token calls in generated client script', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    const scriptMatches = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatches).toBeTruthy();

    const scriptCode = scriptMatches[1];
    expect(scriptCode).not.toContain("t('snippet_label')");
    expect(scriptCode).not.toContain("t('description_label')");
    expect(scriptCode).not.toContain("t('url_label')");
  });

  it('renders No snippets set! when snippets list is empty', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('No snippets set!');
  });
});

describe('Memory Saver Migration Logic', () => {
  it('disables memory saver and sets migration flag on unmigrated profiles', () => {
    const store = new Map();
    const getSetting = (k, def) => store.has(k) ? store.get(k) : def;
    const setSetting = (k, v) => store.set(k, v);

    // Simulate startup migration check
    if (!getSetting('memorySaver_v20_migrated', false)) {
      setSetting('memorySaver', false);
      setSetting('memorySaver_v20_migrated', true);
    }

    expect(getSetting('memorySaver', true)).toBe(false);
    expect(getSetting('memorySaver_v20_migrated', false)).toBe(true);
  });

  it('preserves user preference on subsequent updates when migration flag is set', () => {
    const store = new Map();
    const getSetting = (k, def) => store.has(k) ? store.get(k) : def;
    const setSetting = (k, v) => store.set(k, v);

    // Migration ran previously
    setSetting('memorySaver_v20_migrated', true);
    // User re-enabled memory saver in 0.20.1
    setSetting('memorySaver', true);

    // Update to 0.20.2 occurs
    if (!getSetting('memorySaver_v20_migrated', false)) {
      setSetting('memorySaver', false);
      setSetting('memorySaver_v20_migrated', true);
    }

    // Memory saver remains enabled
    expect(getSetting('memorySaver', false)).toBe(true);
  });
});

describe('Settings Software Updater UI & Invariants', () => {
  it('renders software update card, version badge, check update button, and progress elements', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();

    expect(html).toContain('id="btn-check-update"');
    expect(html).toContain('id="btn-check-update-text"');
    expect(html).toContain('id="update-card-status"');
    expect(html).toContain('id="update-card-notes"');
    expect(html).toContain('id="update-card-progress"');
    expect(html).toContain('id="update-progress-status"');
    expect(html).toContain('id="update-progress-percent"');
    expect(html).toContain('id="update-progress-bar-inner"');
    expect(html).toContain('class="update-version-badge"');
  });

  it('handles update checking when an update is available', async () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).toBeTruthy();
    const scriptCode = scriptMatch[1];

    const mockClasses = (initial = []) => {
      const set = new Set(initial);
      return {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        contains: (c) => set.has(c)
      };
    };

    let clickHandler = null;
    const btnCheckUpdate = {
      disabled: false,
      dataset: {},
      classList: mockClasses(['btn', 'btn-primary']),
      addEventListener: jest.fn((evt, fn) => {
        if (evt === 'click') clickHandler = fn;
      })
    };
    const btnCheckUpdateText = { textContent: 'Check for Updates' };
    const updateCardStatus = { innerHTML: '', textContent: '' };
    const updateCardNotes = { style: { display: 'none' }, innerHTML: '' };
    const updateCardProgress = { style: { display: 'none' } };

    const mockElements = {
      'btn-check-update': btnCheckUpdate,
      'btn-check-update-text': btnCheckUpdateText,
      'update-card-status': updateCardStatus,
      'update-card-notes': updateCardNotes,
      'update-card-progress': updateCardProgress
    };

    let checkUpdatesCalled = false;
    let installUpdateCalled = false;

    const mockContext = {
      document: {
        getElementById: (id) => mockElements[id] || {
          style: {},
          classList: mockClasses(),
          addEventListener: jest.fn(),
          querySelectorAll: () => [],
          querySelector: () => null
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: jest.fn(),
        body: { classList: mockClasses() }
      },
      window: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        location: { hash: '' },
        naptureAPI: {
          getAllSettings: jest.fn().mockResolvedValue({}),
          checkForUpdates: jest.fn().mockImplementation(async () => {
            checkUpdatesCalled = true;
            return { updateAvailable: true, version: '1.2.0', release_notes: 'Bug fixes' };
          }),
          installUpdate: jest.fn().mockImplementation(async () => {
            installUpdateCalled = true;
            return { success: true };
          })
        }
      },
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
      setInterval: () => 123,
      clearInterval: () => {},
      navigator: { userAgent: 'Napture' },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    expect(clickHandler).toBeDefined();

    // 1. First click: check for updates
    clickHandler();
    await new Promise((r) => setTimeout(r, 50));

    expect(checkUpdatesCalled).toBe(true);
    expect(btnCheckUpdate.dataset.action).toBe('install');
    expect(btnCheckUpdateText.textContent).toBe('Install & Restart');
    expect(btnCheckUpdate.classList.contains('btn-success')).toBe(true);
    expect(updateCardStatus.innerHTML).toContain('Version 1.2.0 is ready to install');
    expect(updateCardNotes.style.display).toBe('block');
    expect(updateCardNotes.innerHTML).toContain('Bug fixes');

    // 2. Second click: install and restart
    clickHandler();
    await new Promise((r) => setTimeout(r, 50));

    expect(installUpdateCalled).toBe(true);
    expect(btnCheckUpdate.disabled).toBe(true);
    expect(btnCheckUpdateText.textContent).toBe('Downloading & Installing...');
    expect(updateCardStatus.innerHTML).toContain('Downloading update package...');
  });

  it('handles update checking when Napture is already up to date', async () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const html = buildSettingsPage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptCode = scriptMatch[1];

    const mockClasses = (initial = []) => {
      const set = new Set(initial);
      return {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        contains: (c) => set.has(c)
      };
    };

    let clickHandler = null;
    const btnCheckUpdate = {
      disabled: false,
      dataset: {},
      classList: mockClasses(['btn', 'btn-primary']),
      addEventListener: jest.fn((evt, fn) => {
        if (evt === 'click') clickHandler = fn;
      })
    };
    const btnCheckUpdateText = { textContent: 'Check for Updates' };
    const updateCardStatus = { innerHTML: '', textContent: '' };
    const updateCardNotes = { style: { display: 'none' }, innerHTML: '' };
    const updateCardProgress = { style: { display: 'none' } };

    const mockElements = {
      'btn-check-update': btnCheckUpdate,
      'btn-check-update-text': btnCheckUpdateText,
      'update-card-status': updateCardStatus,
      'update-card-notes': updateCardNotes,
      'update-card-progress': updateCardProgress
    };

    const mockContext = {
      document: {
        getElementById: (id) => mockElements[id] || {
          style: {},
          classList: mockClasses(),
          addEventListener: jest.fn(),
          querySelectorAll: () => [],
          querySelector: () => null
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: jest.fn(),
        body: { classList: mockClasses() }
      },
      window: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        location: { hash: '' },
        naptureAPI: {
          getAllSettings: jest.fn().mockResolvedValue({}),
          checkForUpdates: jest.fn().mockResolvedValue({ updateAvailable: false })
        }
      },
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
      setInterval: () => 123,
      clearInterval: () => {},
      navigator: { userAgent: 'Napture' },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };

    vm.createContext(mockContext);
    vm.runInContext(scriptCode, mockContext);

    clickHandler();
    await new Promise((r) => setTimeout(r, 50));

    expect(btnCheckUpdate.dataset.action).toBeUndefined();
    expect(btnCheckUpdate.classList.contains('btn-primary')).toBe(true);
    expect(btnCheckUpdateText.textContent).toBe('Check for Updates');
    expect(updateCardStatus.innerHTML).toContain('Napture is up to date');
  });
});

