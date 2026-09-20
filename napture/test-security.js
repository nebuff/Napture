const { app, BrowserWindow, WebContentsView } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600 });

  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });

  const popupHtml = `<!DOCTYPE html>
<html>
<body>
  <div id="test">Hello</div>
  <script>
    console.log(window.naptureAPI);
    if (window.naptureAPI) {
      document.getElementById('test').innerText = 'Preload works!';
    }
  </script>
</body>
</html>`;

  view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(popupHtml)}`);

  setTimeout(() => {
    app.quit();
  }, 2000);
});
