
// Napture Shared UI Component Base

const coreCSS = `
  :root {
    --bg-app: transparent;
    --bg-sidebar: transparent;
    --bg-card: rgba(18, 19, 26, 0.6);
    --bg-input: #12131a;
    --bg-hover: #2a2b36;
    --bg-active: #20212a;
    --border-color: rgba(255, 255, 255, 0.08);
    --border-focus: #7f8cff;
    --text-primary: #ffffff;
    --text-secondary: #a9b1d6;
    --text-muted: #565f89;
    --accent: #7f8cff;
    --accent-hover: #6c7af7;
    --danger: #e81123;
    --danger-hover: #c40e1d;
    --success: #28a745;
    --font-main: 'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
`;

function buildHTMLShell(title, bodyContent, lang = 'en-US', extraStyles = '') {
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-app); }
    ::-webkit-scrollbar-thumb { background: #2E2F3E; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
    body { font-family: var(--font-main); background-color: var(--bg-app); color: var(--text-primary); user-select: none; overflow: hidden; }
    ${extraStyles}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

module.exports = { buildHTMLShell, coreCSS };
