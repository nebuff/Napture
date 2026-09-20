jest.mock('better-sqlite3', () => function() { return { exec: jest.fn(), prepare: () => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() }) }; }, { virtual: true });
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) },
  protocol: { registerStringProtocol: jest.fn() }
}));

const { buildWebErrorPage } = require('../../napture/protocol-handler');

describe('Web Error Page Builder', () => {
  it('should format DNS resolution error correctly', () => {
    const html = buildWebErrorPage({
      url: 'https://invalid-host.example',
      code: '-105',
      desc: 'ERR_NAME_NOT_RESOLVED'
    });
    expect(html).toContain('Could not resolve server');
    expect(html).toContain('invalid-host.example');
    expect(html).toContain('ERR_NAME_NOT_RESOLVED (-105)');
  });

  it('should format connection refused error correctly', () => {
    const html = buildWebErrorPage({
      url: 'https://offline-server.local:8080',
      code: '-102',
      desc: 'ERR_CONNECTION_REFUSED'
    });
    expect(html).toContain('Connection Refused');
    expect(html).toContain('offline-server.local');
    expect(html).toContain('ERR_CONNECTION_REFUSED (-102)');
  });

  it('should format timeout error correctly', () => {
    const html = buildWebErrorPage({
      url: 'https://slow-site.com',
      code: '-118',
      desc: 'ERR_CONNECTION_TIMED_OUT'
    });
    expect(html).toContain('Connection Timed Out');
    expect(html).toContain('slow-site.com');
  });

  it('should format SSL / Certificate error correctly', () => {
    const html = buildWebErrorPage({
      url: 'https://bad-ssl.com',
      code: '-200',
      desc: 'ERR_CERT_COMMON_NAME_INVALID'
    });
    expect(html).toContain('Security Certificate Error');
    expect(html).toContain('bad-ssl.com');
    expect(html).toContain('Continue anyway');
  });

  it('should handle missing URL or code safely', () => {
    const html = buildWebErrorPage({
      url: '',
      code: '',
      desc: ''
    });
    expect(html).toContain('Unknown Target');
    expect(html).toContain('Could not resolve server');
  });
});
