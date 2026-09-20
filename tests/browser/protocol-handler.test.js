jest.mock('better-sqlite3', () => function() { return { exec: jest.fn(), prepare: () => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() }) }; }, { virtual: true });
jest.mock('electron', () => ({ app: { getPath: jest.fn(() => require('os').tmpdir()) }, protocol: { registerStringProtocol: jest.fn() } }));
const { getRouteFromUrl, handleCustomProtocolRequest } = require('../../napture/protocol-handler');

describe('Protocol Handler Security and Asset Routing', () => {
  it('should identify valid internal routes', () => {
    expect(getRouteFromUrl('napture://welcome')).toBe('welcome');
    expect(getRouteFromUrl('napture://downloads')).toBe('downloads');
    expect(getRouteFromUrl('napture://download')).toBe('downloads');
    expect(getRouteFromUrl('napture://settings')).toBe('settings');
    expect(getRouteFromUrl('napture://history')).toBe('history');
    expect(getRouteFromUrl('napture://keyboard')).toBe('keyboard');
    expect(getRouteFromUrl('napture://update-force')).toBe('update-force');
    expect(getRouteFromUrl('ne://update-force')).toBe('update-force');
    expect(getRouteFromUrl('napture://force-update')).toBe('update-force');
    expect(getRouteFromUrl('napture://logo')).toBe('logo');
    expect(getRouteFromUrl('napture://assets/index.html')).toBe('assets');
    expect(getRouteFromUrl('napture://error')).toBe('error');
    expect(getRouteFromUrl('napture://error/network')).toBe('error');
    expect(getRouteFromUrl('ne://error')).toBe('error');
    expect(getRouteFromUrl('ne://error/network?url=https%3A%2F%2Fexample.com&code=-105&desc=ERR_NAME_NOT_RESOLVED')).toBe('error');
  });

  it('should render force update page for update-force route', async () => {
    const req = {
      url: 'napture://update-force',
      method: 'GET',
      headers: new Headers()
    };
    const response = await handleCustomProtocolRequest(req);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Napture Force Update');
    expect(html).toContain('Napture is up to date');
    expect(html).toContain('checkForUpdates');
    expect(html).toContain('installUpdate');
  });

  it('should render web error page for error route', async () => {
    const req = {
      url: 'napture://error/network?url=https%3A%2F%2Fexample.com&code=-105&desc=ERR_NAME_NOT_RESOLVED',
      method: 'GET',
      headers: new Headers()
    };
    const response = await handleCustomProtocolRequest(req);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Could not resolve server');
    expect(html).toContain('example.com');
    expect(html).toContain('ERR_NAME_NOT_RESOLVED');
  });

  it('should block path traversal attempts in assets route', async () => {
    const maliciousRequest = {
      url: 'napture://assets/../../../../Windows/win.ini',
      method: 'GET',
      headers: new Headers()
    };
    const response = await handleCustomProtocolRequest(maliciousRequest);
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).toContain('Path Traversal Prohibited');
  });

  it('should block path traversal with encoded dots', async () => {
    const maliciousRequest = {
      url: 'napture://assets/%2e%2e%2f%2e%2e%2fpackage.json',
      method: 'GET',
      headers: new Headers()
    };
    const response = await handleCustomProtocolRequest(maliciousRequest);
    expect(response.status).toBe(403);
  });

  it('should return 404 for non-existent assets within sandbox', async () => {
    const req = {
      url: 'napture://assets/nonexistent-file-12345.js',
      method: 'GET',
      headers: new Headers()
    };
    const response = await handleCustomProtocolRequest(req);
    expect(response.status).toBe(404);
  });
});
