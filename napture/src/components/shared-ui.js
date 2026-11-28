// Napture Shared UI Helpers
// Loads the ONE global design system stylesheet so every generated page in the
// browser (settings, downloads, history, updater, popups) is guaranteed to be
// rendered by the same token set and component library.
const fs = require('fs');
const path = require('path');

const DESIGN_SYSTEM_PATH = path.join(__dirname, '..', '..', 'styles', 'design-system.css');

let _cachedDesignSystemCss = null;

/** The complete design system, as CSS text. */
function getSharedThemeCss() {
  if (_cachedDesignSystemCss) return _cachedDesignSystemCss;
  try {
    if (fs.existsSync(DESIGN_SYSTEM_PATH)) {
      _cachedDesignSystemCss = fs.readFileSync(DESIGN_SYSTEM_PATH, 'utf8');
      return _cachedDesignSystemCss;
    }
    console.error('[DesignSystem] design-system.css not found at', DESIGN_SYSTEM_PATH);
  } catch (e) {
    console.error('[DesignSystem] Failed to load design-system.css:', e);
  }
  return '';
}

/** Back-compat alias — older call sites used this name. */
const getSharedDesignSystemCss = getSharedThemeCss;

/**
 * Common <head> contents for a generated Napture page.
 * `surface` selects the token scope: 'chrome' (translucent) or 'page' (opaque).
 */
function generateCommonHead(title, surface = 'page') {
  const sharedCss = getSharedThemeCss();
  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' ne: file:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: http: https: ne: file:; connect-src 'self' http: https: ws: wss:;">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${sharedCss}
  </style>
  <script>document.documentElement.setAttribute('data-nb-surface', '${surface}');</script>
  `;
}

module.exports = {
  DESIGN_SYSTEM_PATH,
  getSharedThemeCss,
  getSharedDesignSystemCss,
  generateCommonHead
};
