jest.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: jest.fn(),
    handle: jest.fn()
  },
  app: {
    getPath: jest.fn(() => require('os').tmpdir())
  }
}));

const { getRouteFromUrl, handleCustomProtocolRequest } = require('../../napture/protocol-handler');

describe('Custom Protocol Handlers & Route Resolution', () => {
  describe('getRouteFromUrl', () => {
    it('resolves welcome route for napture://welcome and napture://newtab', () => {
      expect(getRouteFromUrl('napture://welcome')).toBe('welcome');
      expect(getRouteFromUrl('napture://newtab')).toBe('welcome');
      expect(getRouteFromUrl('ne://start')).toBe('welcome');
    });

    it('resolves settings route for napture://settings', () => {
      expect(getRouteFromUrl('napture://settings')).toBe('settings');
      expect(getRouteFromUrl('ne://settings')).toBe('settings');
    });

    it('resolves history route for napture://history', () => {
      expect(getRouteFromUrl('napture://history')).toBe('history');
      expect(getRouteFromUrl('ne://history')).toBe('history');
    });

    it('resolves keyboard shortcuts route for napture://keyboard', () => {
      expect(getRouteFromUrl('napture://keyboard')).toBe('keyboard');
      expect(getRouteFromUrl('napture://shortcuts')).toBe('keyboard');
    });

    it('resolves force update route for napture://update-force, ne://update-force, and napture://force-update', () => {
      expect(getRouteFromUrl('napture://update-force')).toBe('update-force');
      expect(getRouteFromUrl('ne://update-force')).toBe('update-force');
      expect(getRouteFromUrl('napture://force-update')).toBe('update-force');
      expect(getRouteFromUrl('ne://force-update')).toBe('update-force');
    });

    it('resolves error route for napture://error', () => {
      expect(getRouteFromUrl('napture://error?code=-105')).toBe('error');
    });

    it('falls back to welcome for unrecognized routes', () => {
      expect(getRouteFromUrl('napture://unknown-route')).toBe('welcome');
    });
  });

  describe('Path Traversal Prevention in handleCustomProtocolRequest', () => {
    it('blocks path traversal attempts with HTTP 403 Forbidden', () => {
      const response1 = handleCustomProtocolRequest({ url: 'napture://assets/../secret.txt' });
      expect(response1.status).toBe(403);

      const response2 = handleCustomProtocolRequest({ url: 'napture://assets/%2e%2e/passwd' });
      expect(response2.status).toBe(403);
    });
  });

  describe('handleCustomProtocolRequest HTML Responses', () => {
    it('returns text/html response for napture://welcome', async () => {
      const res = handleCustomProtocolRequest({ url: 'napture://welcome' });
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const text = await res.text();
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('New Tab');
    });

    it('returns text/html response for napture://settings', async () => {
      const res = handleCustomProtocolRequest({ url: 'napture://settings' });
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const text = await res.text();
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('Settings');
    });

    it('returns text/html response for napture://history', async () => {
      const res = handleCustomProtocolRequest({ url: 'napture://history' });
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const text = await res.text();
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('History');
    });

    it('returns text/html response for napture://update-force', async () => {
      const res = handleCustomProtocolRequest({ url: 'napture://update-force' });
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const text = await res.text();
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('Napture Force Update');
      expect(text).toContain('Napture is up to date');
    });
  });
});
