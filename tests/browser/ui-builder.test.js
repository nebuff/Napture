const { buildHTMLShell, coreCSS } = require('../../napture/src/components/ui-builder');

describe('UI Builder - buildHTMLShell', () => {
  it('should generate an HTML shell with the correct title and body content', () => {
    const title = 'Test Title';
    const bodyContent = '<div id="test">Hello World</div>';

    const html = buildHTMLShell(title, bodyContent);

    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(bodyContent);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('should use en-US as the default language', () => {
    const html = buildHTMLShell('Title', 'Body');

    expect(html).toContain('<html lang="en-US">');
  });

  it('should allow setting a custom language', () => {
    const html = buildHTMLShell('Title', 'Body', 'fr-FR');

    expect(html).toContain('<html lang="fr-FR">');
  });

  it('should include coreCSS in the generated HTML', () => {
    const html = buildHTMLShell('Title', 'Body');

    expect(html).toContain(coreCSS);
  });

  it('should include extraStyles when provided', () => {
    const extraStyles = '.custom-class { color: red; }';

    const html = buildHTMLShell('Title', 'Body', 'en-US', extraStyles);

    expect(html).toContain(extraStyles);
  });


  it('should handle empty string for extraStyles', () => {
    const html = buildHTMLShell('Title', 'Body', 'en-US', '');
    expect(html).toContain('</style>');
  });
});
