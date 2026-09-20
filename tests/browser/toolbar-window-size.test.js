// Test suite for toolbar responsiveness across window resize events
const fs = require('fs');
const path = require('path');

describe('Toolbar Visibility Logic and Window Minimum Size Constraints', () => {
  const mainJsPath = path.join(__dirname, '../../napture/main.js');
  const rendererJsPath = path.join(__dirname, '../../napture/renderer/renderer.js');
  const userChromeCssPath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
  const userContentCssPath = path.join(__dirname, '../../napture/newebx/chrome/userContent.css');

  describe('Main Process: Native View Layering', () => {
    test('keeps the active page view below renderer-owned browser popups', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');

      expect(mainContent).toContain('win.contentView.addChildView(newActiveView, 0);');
      expect(mainContent).toContain('win.contentView.addChildView(activeView, 0);');
      expect(mainContent).toMatch(/Keep page content below the renderer-owned browser chrome/);
    });
  });

  describe('Main Process: Minimum Window Dimensions', () => {
    test('enforces minWidth and minHeight in createWarmWindow and createBrowserWindow', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');

      // createWarmWindow must configure minWidth and minHeight
      expect(mainContent).toMatch(/function createWarmWindow\(\)[\s\S]*?minWidth:\s*640/);
      expect(mainContent).toMatch(/function createWarmWindow\(\)[\s\S]*?minHeight:\s*450/);

      // createBrowserWindow must configure minWidth and minHeight
      expect(mainContent).toMatch(/function createBrowserWindow[\s\S]*?minWidth:\s*(options\.minWidth\s*\|\|\s*640|minWidth)/);
      expect(mainContent).toMatch(/function createBrowserWindow[\s\S]*?minHeight:\s*(options\.minHeight\s*\|\|\s*450|minHeight)/);

      // claimWarmWindow must clamp width/height
      expect(mainContent).toMatch(/claimWarmWindow[\s\S]*?Math\.max\(640/);
      expect(mainContent).toMatch(/claimWarmWindow[\s\S]*?Math\.max\(450/);
    });
  });

  describe('CSS Flexbox and Responsive Visibility Rules', () => {
    test('userChrome.css sets proper flex-shrink and min-width rules for header and toolbar', () => {
      const css = fs.readFileSync(userChromeCssPath, 'utf8');

      // .header-center must allow shrinking to prevent pushing header-right offscreen
      expect(css).toMatch(/\.header-center\s*\{[^}]*min-width:\s*0\s*!important/);

      // .header-right must never shrink/be pushed offscreen
      expect(css).toMatch(/\.header-right\s*\{[^}]*flex-shrink:\s*0\s*!important/);

      // #address-container must allow shrinking
      expect(css).toMatch(/#address-container\s*\{[^}]*min-width:\s*0\s*!important/);
      expect(css).toMatch(/#address-container\s*\{[^}]*flex-shrink:\s*1\s*!important/);

      // #address-input and .address-display must allow shrinking
      expect(css).toMatch(/#address-input\s*\{[^}]*min-width:\s*0\s*!important/);
      expect(css).toMatch(/\.address-display\s*\{[^}]*min-width:\s*0\s*!important/);

      // toolbar-item-wrapper for address-container must allow shrinking
      expect(css).toMatch(/\.toolbar-item-wrapper\[data-id="address-container"\][\s\S]*?min-width:\s*0\s*!important/);
      expect(css).toMatch(/\.toolbar-item-wrapper\[data-id="address-container"\][\s\S]*?flex-shrink:\s*1\s*!important/);

      // Responsive compact header media query
      expect(css).toMatch(/@media\s*\(max-width:\s*850px\)\s*\{[\s\S]*?\.header-left\s*\{[\s\S]*?width:\s*auto\s*!important/);
    });

    test('userContent.css mirrors the header-center and address-container shrinking rules', () => {
      const css = fs.readFileSync(userContentCssPath, 'utf8');

      expect(css).toMatch(/\.header-center\s*\{[^}]*min-width:\s*0\s*!important/);
      expect(css).toMatch(/\.header-right\s*\{[^}]*flex-shrink:\s*0\s*!important/);
      expect(css).toMatch(/#address-container\s*\{[^}]*min-width:\s*0\s*!important/);
      expect(css).toMatch(/#address-input\s*\{[^}]*min-width:\s*0\s*!important/);
    });
  });

  describe('Renderer Process: Dynamic Toolbar Visibility Logic', () => {
    test('renderer.js contains ensureToolbarVisibility and hooks it to resize events', () => {
      const rendererContent = fs.readFileSync(rendererJsPath, 'utf8');

      // ensureToolbarVisibility function declaration
      expect(rendererContent).toContain('function ensureToolbarVisibility()');

      // Called at end of renderToolbarCustomizable
      expect(rendererContent).toMatch(/renderToolbarCustomizable\(\)[\s\S]*?ensureToolbarVisibility\(\);/);

      // Called on window resize
      expect(rendererContent).toMatch(/window\.addEventListener\('resize',[\s\S]*?ensureToolbarVisibility/);

      // Called on IPC onTriggerResize
      expect(rendererContent).toMatch(/onTriggerResize\([\s\S]*?ensureToolbarVisibility/);
    });

    test('renderToolbarCustomizable does not lock address-container with inflexible flex-shrink: 0', () => {
      const rendererContent = fs.readFileSync(rendererJsPath, 'utf8');

      // Must not use fixed inflexible '0 0 ' + item.width + 'px' on address-container
      expect(rendererContent).not.toMatch(/sysEl\.style\.flex\s*=\s*'0 0 '\s*\+\s*item\.width/);

      // Address container wrapper gets toolbar-address-wrapper class
      expect(rendererContent).toContain("wrapper.classList.add('toolbar-address-wrapper');");

      // Address container sysEl is flexible and shrinkable
      expect(rendererContent).toMatch(/sysEl\.style\.flex\s*=\s*'1 1 auto'/);
      expect(rendererContent).toMatch(/sysEl\.style\.flexShrink\s*=\s*'1'/);
      expect(rendererContent).toMatch(/sysEl\.style\.minWidth\s*=\s*'0'/);
    });

    test('simulated ensureToolbarVisibility logic properly clamps address bar when window shrinks', () => {
      // Logic simulation matching ensureToolbarVisibility in renderer.js
      function calculateRemainingForAddress({ headerBarWidth, leftWidth, rightWidth, buttonsWidth, gapsCount, configuredWidth }) {
        const centerAvailableWidth = Math.max(0, headerBarWidth - leftWidth - rightWidth - 32);
        const totalGaps = gapsCount * 8;
        const remaining = Math.max(0, centerAvailableWidth - buttonsWidth - totalGaps);
        const safeWidth = configuredWidth ? Math.min(configuredWidth, remaining) : remaining;
        return {
          centerAvailableWidth,
          remaining,
          safeWidth: Math.max(60, safeWidth)
        };
      }

      // Case 1: Large window (1200px), configured address bar width = 600px, 4 nav buttons (128px)
      const largeWin = calculateRemainingForAddress({
        headerBarWidth: 1200,
        leftWidth: 240,
        rightWidth: 110,
        buttonsWidth: 128,
        gapsCount: 4,
        configuredWidth: 600
      });
      // Available center space: 1200 - 240 - 110 - 32 = 818px.
      // Remaining for address: 818 - 128 - 32 = 658px.
      // Safe width clamps to user configured width: 600px.
      expect(largeWin.safeWidth).toBe(600);

      // Case 2: Small window (680px), configured address bar width = 600px, 4 nav buttons (128px)
      // On narrow window, left header collapses to compact (40px)
      const smallWin = calculateRemainingForAddress({
        headerBarWidth: 680,
        leftWidth: 40,
        rightWidth: 110,
        buttonsWidth: 128,
        gapsCount: 4,
        configuredWidth: 600
      });
      // Available center space: 680 - 40 - 110 - 32 = 498px.
      // Remaining for address: 498 - 128 - 32 = 338px.
      // The 600px set address bar is clamped to 338px so ALL buttons remain 100% visible!
      expect(smallWin.safeWidth).toBe(338);
      expect(smallWin.safeWidth + 128 + 32).toBeLessThanOrEqual(498);
    });
  });
});
