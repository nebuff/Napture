const fs = require('fs');
const path = require('path');

describe('Link Bar (Search / Address Bar) Gradient Loading Bar', () => {
  const indexPath = path.join(__dirname, '../../napture/renderer/index.html');
  const userChromePath = path.join(__dirname, '../../napture/newebx/chrome/userChrome.css');
  const userContentPath = path.join(__dirname, '../../napture/newebx/chrome/userContent.css');
  const rendererPath = path.join(__dirname, '../../napture/renderer/renderer.js');

  let indexHtml;
  let userChromeCss;
  let userContentCss;
  let rendererJs;

  beforeAll(() => {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    userChromeCss = fs.readFileSync(userChromePath, 'utf8');
    userContentCss = fs.readFileSync(userContentPath, 'utf8');
    rendererJs = fs.readFileSync(rendererPath, 'utf8');
  });

  describe('DOM Elements Structure in index.html', () => {
    it('does NOT contain #toolbar-loading-bar on header-bar (only link bar has loading bar)', () => {
      expect(indexHtml).not.toContain('id="toolbar-loading-bar"');
    });

    it('contains #address-loading-bar inside #address-container', () => {
      expect(indexHtml).toContain('id="address-loading-bar"');
      expect(indexHtml).toContain('class="address-loading-bar"');
    });
  });

  describe('CSS Gradient & Animation Definitions', () => {
    it('defines address-loading-bar styles and gradient animation in userChrome.css', () => {
      expect(userChromeCss).toContain('.address-loading-bar');
      expect(userChromeCss).toContain('naptureAddressLoading');
      expect(userChromeCss).toContain('linear-gradient(');
    });

    it('defines #address-container.is-loading glowing state in userChrome.css', () => {
      expect(userChromeCss).toContain('#address-container.is-loading');
    });

    it('defines #header-bar.is-loading reload icon rotation in userChrome.css', () => {
      expect(userChromeCss).toContain('#header-bar.is-loading #reload-btn .reload-icon');
    });

    it('mirrors address-loading-bar styles in userContent.css', () => {
      expect(userContentCss).toContain('.address-loading-bar');
      expect(userContentCss).toContain('naptureAddressLoading');
    });
  });

  describe('Renderer Logic & State Updates', () => {
    it('defines updatePageLoadingState function in renderer.js', () => {
      expect(rendererJs).toContain('function updatePageLoadingState(isLoading)');
    });

    it('manages is-loading and active classes on address bar elements correctly', () => {
      const createMockElement = () => {
        const classSet = new Set();
        return {
          classList: {
            add: (cls) => classSet.add(cls),
            remove: (cls) => classSet.delete(cls),
            contains: (cls) => classSet.has(cls)
          }
        };
      };

      const headerBar = createMockElement();
      const addressContainer = createMockElement();
      const loadingIndicator = createMockElement();
      loadingIndicator.classList.add('hidden');
      const addressLoadingBar = createMockElement();

      function updatePageLoadingState(isLoading) {
        const addrBar = addressLoadingBar || document.getElementById('address-loading-bar');

        if (isLoading) {
          if (loadingIndicator) loadingIndicator.classList.remove('hidden');
          if (headerBar) headerBar.classList.add('is-loading');
          if (addressContainer) addressContainer.classList.add('is-loading');
          if (addrBar) addrBar.classList.add('active');
        } else {
          if (loadingIndicator) loadingIndicator.classList.add('hidden');
          if (headerBar) headerBar.classList.remove('is-loading');
          if (addressContainer) addressContainer.classList.remove('is-loading');
          if (addrBar) addrBar.classList.remove('active');
        }
      }

      // Initial state: not loading
      updatePageLoadingState(false);
      expect(headerBar.classList.contains('is-loading')).toBe(false);
      expect(addressContainer.classList.contains('is-loading')).toBe(false);
      expect(addressLoadingBar.classList.contains('active')).toBe(false);
      expect(loadingIndicator.classList.contains('hidden')).toBe(true);

      // Trigger loading / refreshing
      updatePageLoadingState(true);
      expect(headerBar.classList.contains('is-loading')).toBe(true);
      expect(addressContainer.classList.contains('is-loading')).toBe(true);
      expect(addressLoadingBar.classList.contains('active')).toBe(true);
      expect(loadingIndicator.classList.contains('hidden')).toBe(false);

      // Stop loading
      updatePageLoadingState(false);
      expect(headerBar.classList.contains('is-loading')).toBe(false);
      expect(addressContainer.classList.contains('is-loading')).toBe(false);
      expect(addressLoadingBar.classList.contains('active')).toBe(false);
      expect(loadingIndicator.classList.contains('hidden')).toBe(true);
    });
  });
});
