const fs = require('fs');
const path = require('path');

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Napture updating</title>
  <style>
    body {
      background-color: #0F0F14;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      user-select: none;
      overflow: hidden;
      margin: 0;
    }
    .updater-card {
      width: 86%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: rgba(18, 19, 26, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 28px 24px;
    }
    .brand-title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    .status-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 6px; }
    .status-subtitle { font-size: 12px; color: #a9b1d6; margin-bottom: 20px; }
    .progress-track { width: 100%; height: 8px; background: #171822; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .progress-fill { height: 100%; width: 0%; background: #7f8cff; border-radius: 4px; transition: width 0.2s; }
    .metrics-row { display: flex; justify-content: space-between; width: 100%; font-size: 11px; color: #a9b1d6; }
  </style>
</head>
<body>
  <div class="updater-card">
    <div class="brand-title">Napture</div>
    <div class="status-title" id="status-title">Napture updating</div>
    <div class="status-subtitle" id="status-subtitle">Downloading update package...</div>
    <div class="progress-track"><div class="progress-fill" id="progress-bar"></div></div>
    <div class="metrics-row"><span id="speed-val">0 KB/s</span><span id="time-val">Calculating...</span></div>
  </div>
  <script>
    if (window.naptureAPI && window.naptureAPI.onUpdateDownloadProgress) {
      window.naptureAPI.onUpdateDownloadProgress((data) => {
        const { percent, speedBps, remainingSeconds, isExtracting } = data;
        const pb = document.getElementById('progress-bar');
        const st = document.getElementById('status-title');
        const ss = document.getElementById('status-subtitle');
        if (isExtracting) {
          if (st) st.textContent = 'Installing update';
          if (ss) ss.textContent = 'Extracting and applying files...';
          if (pb) pb.style.width = '100%';
          return;
        }
        if (pb) pb.style.width = Math.min(100, Math.max(0, percent)) + '%';
        if (ss) ss.textContent = 'Downloading update package... ' + percent + '%';
      });
    }
    if (window.naptureAPI && window.naptureAPI.onUpdateDownloadError) {
      window.naptureAPI.onUpdateDownloadError((data) => {
        const st = document.getElementById('status-title');
        const ss = document.getElementById('status-subtitle');
        const pb = document.getElementById('progress-bar');
        if (st) st.textContent = 'Update failed';
        if (ss) ss.textContent = data.error || 'An error occurred during update.';
        if (pb) { pb.style.background = '#ff5c5c'; pb.style.width = '100%'; }
      });
    }
  </script>
</body>
</html>`;

function getUpdaterHtml(logoBase64) {
  let html = FALLBACK_HTML;
  try {
    const templatePath = path.join(__dirname, 'updater-ui.html');
    if (fs.existsSync(templatePath)) {
      html = fs.readFileSync(templatePath, 'utf8');
    }
  } catch (e) {
    console.error('Failed to read updater-ui.html for updater:', e);
  }

  const logoHtml = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" class="brand-logo" alt="Napture Logo" onerror="this.style.display='none'">`
    : '';

  return html.replace('{{LOGO_PLACEHOLDER}}', logoHtml);
}

module.exports = { getUpdaterHtml };

