jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => require('os').tmpdir())
  }
}));

const { buildHistoryPage } = require('../../napture/history-ui');
const vm = require('vm');

describe('Full Screen History UI (buildHistoryPage)', () => {
  it('renders valid HTML document with CSP, fonts, and required UI components', () => {
    const html = buildHistoryPage();

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('id="search-history"');
    expect(html).toContain('id="history-content"');
    expect(html).toContain('id="batch-bar"');
    expect(html).toContain('id="modal-clear"');
    expect(html).toContain('id="empty-state"');
    expect(html).toContain('id="toast-bar"');
  });

  it('includes clear browsing data modal elements', () => {
    const html = buildHistoryPage();

    expect(html).toContain('id="chk-history"');
    expect(html).toContain('id="chk-cookies"');
    expect(html).toContain('id="chk-cache"');
    expect(html).toContain('id="chk-downloads"');
    expect(html).toContain('id="btn-confirm-clear"');
  });

  it('includes client-side script with zero syntax errors', () => {
    const html = buildHistoryPage();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

    expect(scriptMatch).toBeTruthy();
    const scriptCode = scriptMatch[1];

    expect(() => {
      new vm.Script(scriptCode);
    }).not.toThrow();
  });

  it('contains helper functions formatTime, formatDateGroup, and getDomain in client script', () => {
    const html = buildHistoryPage();

    expect(html).toContain('function formatTime');
    expect(html).toContain('function formatDateGroup');
    expect(html).toContain('function getDomain');
    expect(html).toContain('function escapeHtml');
    expect(html).toContain('function loadHistory');
  });
});
