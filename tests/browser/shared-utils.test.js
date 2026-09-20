const fs = require('fs');
const path = require('path');

// We have to mock fs properly for Jest.
// Note: do not use jest.mock('fs') broadly if we want to mock specific functions.
describe('shared-utils', () => {
  let sharedUtils;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mock fs module functions directly instead of jest.mock('fs') at top-level
    jest.mock('fs', () => ({
      existsSync: jest.fn(),
      readFileSync: jest.fn()
    }));

    sharedUtils = require('../../napture/shared-utils');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    jest.unmock('fs');
  });

  describe('getLogoDataUrl', () => {
    it('returns data URL when logo.png exists', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('logo.png'));
      mockFs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));

      const result = sharedUtils.getLogoDataUrl();

      expect(result).toBe('data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh');
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('caches the result on subsequent calls', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('logo.png'));
      mockFs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));

      const result1 = sharedUtils.getLogoDataUrl();
      const result2 = sharedUtils.getLogoDataUrl();

      expect(result1).toBe('data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh');
      expect(result2).toBe(result1);

      expect(mockFs.existsSync).toHaveBeenCalledTimes(1);
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('returns empty string when logo.png does not exist', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockReturnValue(false);

      const result = sharedUtils.getLogoDataUrl();

      expect(result).toBe('');
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('returns empty string and logs error when readFileSync throws', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('logo.png'));
      const error = new Error('Read error');
      mockFs.readFileSync.mockImplementation(() => { throw error; });

      const result = sharedUtils.getLogoDataUrl();

      expect(result).toBe('');
      expect(console.error).toHaveBeenCalledWith('Error reading logo.png:', error);
    });
  });

  describe('getAppVersions', () => {
    const versionsPath = path.resolve(__dirname, '../../napture/versions.json');
    const pkgPath = path.resolve(__dirname, '../../package.json');

    beforeEach(() => {
      // Clear require cache for the files so we can mock them properly
      delete require.cache[versionsPath];
      delete require.cache[pkgPath];
    });

    it('returns default versions when no files exist', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockReturnValue(false);

      const versions = sharedUtils.getAppVersions();

      expect(versions).toEqual({
        naptureVersion: '1.1.3',
        newebChromiumVersion: 'v1.3b12'
      });
    });

    it('reads napture and newebxEngine from versions.json', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('versions.json'));
      jest.doMock(versionsPath, () => ({
        napture: '2.0.0',
        newebxEngine: 'v2.0b1'
      }));

      sharedUtils = require('../../napture/shared-utils');
      const versions = sharedUtils.getAppVersions();

      expect(versions).toEqual({
        naptureVersion: '2.0.0',
        newebChromiumVersion: 'v2.0b1'
      });
    });

    it('falls back to newebChromium if newebxEngine is missing in versions.json', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('versions.json'));
      jest.doMock(versionsPath, () => ({
        newebChromium: 'v2.0b2'
      }));

      sharedUtils = require('../../napture/shared-utils');
      const versions = sharedUtils.getAppVersions();

      expect(versions.newebChromiumVersion).toBe('v2.0b2');
    });

    it('falls back to newebEngine if both newebxEngine and newebChromium are missing', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('versions.json'));
      jest.doMock(versionsPath, () => ({
        newebEngine: 'v2.0b3'
      }));

      sharedUtils = require('../../napture/shared-utils');
      const versions = sharedUtils.getAppVersions();

      expect(versions.newebChromiumVersion).toBe('v2.0b3');
    });

    it('reads naptureVersion from package.json if versions.json is missing or lacks it', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('package.json'));
      const localPkgPath = path.resolve(__dirname, '../../napture/package.json');
      jest.doMock(pkgPath, () => ({ version: '3.0.0' }));
      jest.doMock(localPkgPath, () => ({ version: '3.0.0' }), { virtual: true });

      sharedUtils = require('../../napture/shared-utils');
      const versions = sharedUtils.getAppVersions();

      expect(versions.naptureVersion).toBe('3.0.0');
    });

    it('does not read package.json if naptureVersion is already modified from versions.json', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('versions.json') || p.endsWith('package.json'));
      jest.doMock(versionsPath, () => ({
        napture: '2.5.0'
      }));
      const localPkgPath = path.resolve(__dirname, '../../napture/package.json');
      jest.doMock(pkgPath, () => ({ version: '3.0.0' }));
      jest.doMock(localPkgPath, () => ({ version: '3.0.0' }), { virtual: true });

      sharedUtils = require('../../napture/shared-utils');
      const versions = sharedUtils.getAppVersions();

      expect(versions.naptureVersion).toBe('2.5.0');
    });

    it('handles exceptions gracefully when reading versions.json or package.json', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation(() => { throw new Error('File system error'); });

      const versions = sharedUtils.getAppVersions();

      expect(versions).toEqual({
        naptureVersion: '1.1.3',
        newebChromiumVersion: 'v1.3b12'
      });
    });
  });

  describe('isNeProtocolSupported', () => {
    const versionsPath = path.resolve(__dirname, '../../napture/versions.json');
    const originalEnv = { ...process.env };

    beforeEach(() => {
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

    it('returns true by default when versions.json does not disable it', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockReturnValue(false);

      expect(sharedUtils.isNeProtocolSupported()).toBe(true);
    });

    it('returns false when enableNeProtocol is false in versions.json', () => {
      const mockFs = require('fs');
      mockFs.existsSync.mockImplementation((p) => p.endsWith('versions.json'));
      jest.doMock(versionsPath, () => ({
        enableNeProtocol: false
      }), { virtual: true });

      sharedUtils = require('../../napture/shared-utils');
      expect(sharedUtils.isNeProtocolSupported()).toBe(false);
    });

    it('returns false when DISABLE_NE_PROTOCOL env var is true', () => {
      process.env.DISABLE_NE_PROTOCOL = 'true';
      expect(sharedUtils.isNeProtocolSupported()).toBe(false);
    });

    it('returns false when ENABLE_NE_PROTOCOL env var is false', () => {
      process.env.ENABLE_NE_PROTOCOL = 'false';
      expect(sharedUtils.isNeProtocolSupported()).toBe(false);
    });
  });
});
