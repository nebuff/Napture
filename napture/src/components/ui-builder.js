// Napture Shared UI Component Base
//
// Every generated page gets the complete design system inlined, plus the
// `data-nb-surface` scope that selects the correct token values for an opaque
// page. `coreCSS` is exported for callers that only need the token/component
// layer (and for compatibility with existing consumers/tests).

const { getSharedThemeCss } = require('./shared-ui');

// The full design system. Exposed under the historical name `coreCSS`.
const coreCSS = getSharedThemeCss();

/**
 * Build a standalone Napture page shell.
 *
 * @param {string} title        Document title.
 * @param {string} bodyContent  Markup placed inside <body>.
 * @param {string} lang         BCP-47 language tag.
 * @param {string} extraStyles  Page-specific CSS, appended after the system.
 * @param {'chrome'|'page'} surface  Token scope for the page.
 */
function buildHTMLShell(title, bodyContent, lang = 'en-US', extraStyles = '', surface = 'page') {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${coreCSS}
    ${extraStyles}
  </style>
</head>
<body data-nb-surface="${surface}">
  ${bodyContent}
</body>
</html>`;
}

module.exports = { buildHTMLShell, coreCSS };
