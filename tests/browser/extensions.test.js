const fs = require('fs');
const path = require('path');
const os = require('os');

let mockUserDataPath = path.join(os.tmpdir(), 'napture-ext-test-' + process.pid);

jest.mock('electron', () => ({
  app: { getPath: jest.fn((name) => (name === 'userData' ? mockUserDataPath : '')) },
  session: {
    defaultSession: {
      extensions: {
        loadExtension: jest.fn(),
        removeExtension: jest.fn()
      }
    }
  }
}));

const STORE_ID = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';

function writeManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

describe('Chrome Extension Host', () => {
  let extensions;
  let loadExtension;
  let removeExtension;

  beforeEach(() => {
    mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'napture-ext-'));
    jest.resetModules();
    const electron = require('electron');
    loadExtension = electron.session.defaultSession.extensions.loadExtension;
    removeExtension = electron.session.defaultSession.extensions.removeExtension;
    extensions = require('../../napture/extensions');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
  });

  async function loadStoredExtension(manifestOverrides = {}) {
    const manifest = {
      name: 'uBlock Origin Lite',
      version: '1.2.3',
      description: 'Blocks ads',
      action: { default_popup: '/popup.html' },
      ...manifestOverrides
    };
    const dir = path.join(mockUserDataPath, 'extensions', STORE_ID);
    writeManifest(dir, manifest);
    loadExtension.mockResolvedValue({
      id: STORE_ID,
      name: manifest.name,
      version: manifest.version,
      manifest
    });
    return dir;
  }

  describe('normalizeStoreId', () => {
    it('accepts a bare 32-character store ID', () => {
      expect(extensions.normalizeStoreId(STORE_ID)).toBe(STORE_ID);
    });

    it('extracts the ID from Chrome Web Store URLs and pasted text', () => {
      expect(
        extensions.normalizeStoreId('https://chromewebstore.google.com/detail/ublock-origin/' + STORE_ID + '?hl=en')
      ).toBe(STORE_ID);
      expect(extensions.normalizeStoreId('  install ' + STORE_ID + ' please ')).toBe(STORE_ID);
    });

    it('trims surrounding whitespace on a bare ID', () => {
      expect(extensions.normalizeStoreId('  ' + STORE_ID + '\n')).toBe(STORE_ID);
    });

    it('rejects missing, too-short, uppercase, and out-of-range characters', () => {
      expect(extensions.normalizeStoreId('')).toBeNull();
      expect(extensions.normalizeStoreId()).toBeNull();
      expect(extensions.normalizeStoreId(STORE_ID.slice(0, 31))).toBeNull();
      expect(extensions.normalizeStoreId(STORE_ID.toUpperCase())).toBeNull();
      expect(extensions.normalizeStoreId('z'.repeat(32))).toBeNull();
    });
  });

  describe('paths and lookups', () => {
    it('stores extensions under the user data directory', () => {
      expect(extensions.getExtensionsRoot()).toBe(path.join(mockUserDataPath, 'extensions'));
    });

    it('returns null for unknown ids and extensions without a popup', async () => {
      expect(extensions.getDescriptor('unknown')).toBeNull();
      expect(extensions.getPopupUrl('unknown')).toBeNull();

      await loadStoredExtension({ action: undefined });
      await extensions.init();
      expect(extensions.getPopupUrl(STORE_ID)).toBeNull();
    });
  });

  describe('init', () => {
    it('loads stored extensions and exposes popup and action metadata', async () => {
      const dir = await loadStoredExtension();

      const list = await extensions.init();

      expect(loadExtension).toHaveBeenCalledWith(dir, { allowFileAccess: false });
      expect(list).toEqual([
        {
          id: STORE_ID,
          name: 'uBlock Origin Lite',
          version: '1.2.3',
          description: 'Blocks ads',
          hasAction: true,
          popupPath: 'popup.html',
          iconDataUrl: null
        }
      ]);
      expect(extensions.getDescriptor(STORE_ID)).toMatchObject({ id: STORE_ID });
      expect(extensions.getPopupUrl(STORE_ID)).toBe('chrome-extension://' + STORE_ID + '/popup.html');
    });

    it('returns copies so callers cannot mutate the registry', async () => {
      await loadStoredExtension();
      const list = await extensions.init();

      list[0].name = 'mutated';

      expect(extensions.getDescriptor(STORE_ID).name).toBe('uBlock Origin Lite');
    });

    it('skips folders without a manifest and plain files', async () => {
      const root = path.join(mockUserDataPath, 'extensions');
      fs.mkdirSync(path.join(root, 'empty-folder'), { recursive: true });
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'stray.txt'), 'not an extension');

      expect(await extensions.init()).toEqual([]);
      expect(loadExtension).not.toHaveBeenCalled();
    });

    it('keeps loading other extensions when one fails, and logs the failure', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const brokenId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const goodId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const root = path.join(mockUserDataPath, 'extensions');
      writeManifest(path.join(root, brokenId), { name: 'Broken', version: '1.0.0' });
      writeManifest(path.join(root, goodId), { name: 'Good', version: '1.0.0' });

      loadExtension.mockImplementation(async (dir) => {
        if (dir.endsWith(brokenId)) throw new Error('bad manifest');
        return { id: goodId, name: 'Good', version: '1.0.0', manifest: { name: 'Good', version: '1.0.0' } };
      });

      const list = await extensions.init();

      expect(list.map((ext) => ext.id)).toEqual([goodId]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load extension from'),
        'bad manifest'
      );
    });

    it('rejects a stored extension whose loaded ID does not match its folder name', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await loadStoredExtension();
      loadExtension.mockResolvedValue({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Wrong',
        version: '1.0.0',
        manifest: { name: 'Wrong', version: '1.0.0' }
      });

      expect(await extensions.init()).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load extension from'),
        expect.stringContaining('Extension ID mismatch')
      );
    });
  });

  describe('installFromStore', () => {
    it('rejects links and IDs that cannot identify an extension', async () => {
      await expect(extensions.installFromStore('https://example.com/not-an-extension')).rejects.toThrow(
        'Enter a Chrome Web Store link or a 32-character extension ID'
      );
      await expect(extensions.installFromStore('')).rejects.toThrow(
        'Enter a Chrome Web Store link or a 32-character extension ID'
      );
    });

    it('returns the installed descriptor without downloading the extension again', async () => {
      await loadStoredExtension();
      await extensions.init();
      loadExtension.mockClear();

      const descriptor = await extensions.installFromStore(
        'https://chromewebstore.google.com/detail/ublock-origin/' + STORE_ID
      );

      expect(descriptor.id).toBe(STORE_ID);
      expect(loadExtension).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes the extension from the session, the registry and disk', async () => {
      const dir = await loadStoredExtension();
      await extensions.init();

      const list = await extensions.remove(STORE_ID);

      expect(removeExtension).toHaveBeenCalledWith(STORE_ID);
      expect(fs.existsSync(dir)).toBe(false);
      expect(extensions.getDescriptor(STORE_ID)).toBeNull();
      expect(list).toEqual([]);
    });

    it('is safe to call for an extension that was never installed', async () => {
      expect(await extensions.remove('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toEqual([]);
      expect(removeExtension).toHaveBeenCalled();
    });
  });
});
