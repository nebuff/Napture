// Reusable UI Component Generators
const fs = require('fs');
const path = require('path');

let _cachedThemeCss = null;

function getSharedThemeCss() {
  if (_cachedThemeCss) return _cachedThemeCss;
  try {
    const cssPath = path.join(__dirname, '..', '..', 'styles', 'themes.css');
    if (fs.existsSync(cssPath)) {
      _cachedThemeCss = fs.readFileSync(cssPath, 'utf8');
      return _cachedThemeCss;
    }
  } catch(e) {
    console.error('Failed to load shared theme css:', e);
  }
  return '';
}

function generateCommonHead(title) {
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
  `;
}

module.exports = {
  getSharedThemeCss,
  generateCommonHead
};
