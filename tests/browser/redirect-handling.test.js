const { unwrapRedirectUrl, isAuthOrSensitiveUrl } = require('../../napture/shared-utils');

describe('Redirect Handling & Window/Tab Routing Logic', () => {
  describe('unwrapRedirectUrl', () => {
    it('unwraps Google redirect URL using "url" query parameter', () => {
      const input = 'https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=&ved=2ahUKEwi&url=https%3A%2F%2Fgithub.com%2Fnebuff%2FNaptureDEV&usg=AOvVaw2';
      expect(unwrapRedirectUrl(input)).toBe('https://github.com/nebuff/NaptureDEV');
    });

    it('unwraps Google redirect URL using "q" query parameter', () => {
      const input = 'https://www.google.com/url?q=https://en.wikipedia.org/wiki/Earth&sa=U&ved=0ahUKEwi';
      expect(unwrapRedirectUrl(input)).toBe('https://en.wikipedia.org/wiki/Earth');
    });

    it('unwraps redirects across international Google domains', () => {
      expect(unwrapRedirectUrl('https://www.google.co.uk/url?q=https://bbc.com/news')).toBe('https://bbc.com/news');
      expect(unwrapRedirectUrl('https://google.ca/url?url=https%3A%2F%2Fcbc.ca')).toBe('https://cbc.ca');
      expect(unwrapRedirectUrl('https://www.google.de/url?q=https://spiegel.de')).toBe('https://spiegel.de');
      expect(unwrapRedirectUrl('https://www.google.com.au/url?q=https://abc.net.au')).toBe('https://abc.net.au');
    });

    it('unwraps DuckDuckGo redirect URLs ("uddg" parameter)', () => {
      const input = 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fabout&rut=xyz';
      expect(unwrapRedirectUrl(input)).toBe('https://duckduckgo.com/about');
    });

    it('preserves normal Google search and homepage URLs unchanged', () => {
      expect(unwrapRedirectUrl('https://www.google.com/search?q=test+query')).toBe('https://www.google.com/search?q=test+query');
      expect(unwrapRedirectUrl('https://www.google.com/')).toBe('https://www.google.com/');
      expect(unwrapRedirectUrl('https://google.com/maps')).toBe('https://google.com/maps');
    });

    it('preserves non-redirect URLs and internal browser URLs', () => {
      expect(unwrapRedirectUrl('https://example.com/some/path')).toBe('https://example.com/some/path');
      expect(unwrapRedirectUrl('napture://welcome')).toBe('napture://welcome');
      expect(unwrapRedirectUrl('about:blank')).toBe('about:blank');
    });

    it('ignores invalid or relative redirect targets to prevent open redirect abuse', () => {
      expect(unwrapRedirectUrl('https://www.google.com/url?q=/localpath')).toBe('https://www.google.com/url?q=/localpath');
      expect(unwrapRedirectUrl('https://www.google.com/url?q=javascript:alert(1)')).toBe('https://www.google.com/url?q=javascript:alert(1)');
      expect(unwrapRedirectUrl('https://www.google.com/url?other=123')).toBe('https://www.google.com/url?other=123');
    });

    it('safely handles non-string and falsy inputs', () => {
      expect(unwrapRedirectUrl(null)).toBeNull();
      expect(unwrapRedirectUrl(undefined)).toBeUndefined();
      expect(unwrapRedirectUrl('')).toBe('');
      expect(unwrapRedirectUrl(12345)).toBe(12345);
    });
  });

  describe('isAuthOrSensitiveUrl', () => {
    it('correctly identifies genuine Google OAuth & Accounts endpoints', () => {
      expect(isAuthOrSensitiveUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=123')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://accounts.google.com/signin/v2/identifier')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://accounts.google.com/v3/signin/identifier')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://accounts.google.com/ServiceLogin?continue=https...')).toBe(true);
    });

    it('correctly identifies other major OAuth identity provider endpoints', () => {
      expect(isAuthOrSensitiveUrl('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://login.live.com/oauth20_authorize.srf')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://appleid.apple.com/auth/authorize?client_id=com.app')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://github.com/login/oauth/authorize?client_id=xyz')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://discord.com/oauth2/authorize?client_id=123')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://auth.company.auth0.com/authorize?response_type=code')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://auth.myprovider.com/oauth/authorize?response_type=code')).toBe(true);
      expect(isAuthOrSensitiveUrl('https://sso.myprovider.com/oauth2/authorize')).toBe(true);
    });

    it('NEVER classifies Google search or Google redirect URLs as auth endpoints', () => {
      expect(isAuthOrSensitiveUrl('https://www.google.com/search?q=best+laptops')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://www.google.com/url?sa=t&url=https%3A%2F%2Fexample.com')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://google.com')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://www.google.co.uk')).toBe(false);
    });

    it('NEVER classifies YouTube, normal GitHub pages, or Apple product pages as auth endpoints', () => {
      expect(isAuthOrSensitiveUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://github.com/nebuff/NaptureDEV')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://github.com/nebuff/NaptureDEV/issues/1')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://www.apple.com/macbook-pro/')).toBe(false);
    });

    it('NEVER misclassifies articles or regular pages containing "login" or "auth" in content paths', () => {
      expect(isAuthOrSensitiveUrl('https://example.com/blog/auth-system-architecture')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://medium.com/@author/login-security-tips')).toBe(false);
      expect(isAuthOrSensitiveUrl('https://wikipedia.org/wiki/OAuth')).toBe(false);
    });

    it('safely handles non-string or malformed inputs', () => {
      expect(isAuthOrSensitiveUrl(null)).toBe(false);
      expect(isAuthOrSensitiveUrl(undefined)).toBe(false);
      expect(isAuthOrSensitiveUrl('')).toBe(false);
      expect(isAuthOrSensitiveUrl('not-a-url')).toBe(false);
    });
  });

  describe('setWindowOpenHandler Dispatch Simulation', () => {
    function simulateWindowOpenHandler(details, targetWin) {
      const targetUrl = unwrapRedirectUrl(details.url);

      const hasPopupFeatures = typeof details.features === 'string' && details.features.length > 0 && (
        details.features.includes('width=') ||
        details.features.includes('height=') ||
        details.features.includes('popup') ||
        details.features.includes('menubar=no') ||
        details.features.includes('toolbar=no') ||
        details.features.includes('location=no') ||
        details.features.includes('status=no') ||
        details.features.includes('resizable=no')
      );

      const isAuthEndpoint = isAuthOrSensitiveUrl(targetUrl) || isAuthOrSensitiveUrl(details.url);
      const isPopup = hasPopupFeatures || (isAuthEndpoint && details.disposition === 'new-window');

      if (isPopup) {
        return {
          action: 'allow',
          isPopup: true,
          targetUrl
        };
      }

      if (targetWin && !targetWin.isDestroyed()) {
        targetWin.webContents.send('open-url-in-new-tab', { url: targetUrl });
      }
      return { action: 'deny', isPopup: false, targetUrl };
    }

    it('denies window creation and dispatches Google redirects to open-url-in-new-tab with unwrapped URL', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          send: jest.fn()
        }
      };

      const details = {
        url: 'https://www.google.com/url?sa=t&url=https%3A%2F%2Fgithub.com%2Fnebuff%2FNaptureDEV',
        disposition: 'new-window', // Chromium default for target="_blank"
        features: ''
      };

      const result = simulateWindowOpenHandler(details, mockWin);

      expect(result.action).toBe('deny');
      expect(result.isPopup).toBe(false);
      expect(mockWin.webContents.send).toHaveBeenCalledWith('open-url-in-new-tab', {
        url: 'https://github.com/nebuff/NaptureDEV'
      });
    });

    it('opens regular target="_blank" links in a new tab, NOT a new window', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          send: jest.fn()
        }
      };

      const details = {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        disposition: 'new-window',
        features: ''
      };

      const result = simulateWindowOpenHandler(details, mockWin);

      expect(result.action).toBe('deny');
      expect(result.isPopup).toBe(false);
      expect(mockWin.webContents.send).toHaveBeenCalledWith('open-url-in-new-tab', {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'
      });
    });

    it('allows popup windows when explicit window popup geometry is specified', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: { send: jest.fn() }
      };

      const details = {
        url: 'https://example.com/checkout/popup',
        disposition: 'new-window',
        features: 'width=500,height=600,menubar=no'
      };

      const result = simulateWindowOpenHandler(details, mockWin);

      expect(result.action).toBe('allow');
      expect(result.isPopup).toBe(true);
      expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });

    it('allows OAuth popups when opened with new-window disposition or features', () => {
      const mockWin = {
        isDestroyed: () => false,
        webContents: { send: jest.fn() }
      };

      const details = {
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
        disposition: 'new-window',
        features: ''
      };

      const result = simulateWindowOpenHandler(details, mockWin);

      expect(result.action).toBe('allow');
      expect(result.isPopup).toBe(true);
      expect(mockWin.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('Network-level onBeforeRequest redirect unwrapping', () => {
    function simulateOnBeforeRequest(details) {
      let response = null;
      const callback = (res) => { response = res; };

      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
        const unwrapped = unwrapRedirectUrl(details.url);
        if (unwrapped !== details.url) {
          callback({ redirectURL: unwrapped });
          return response;
        }
      }

      callback({});
      return response;
    }

    it('redirects mainFrame navigation to Google redirect directly to target website', () => {
      const details = {
        url: 'https://www.google.com/url?q=https://wikipedia.org/wiki/Cat&sa=U',
        resourceType: 'mainFrame'
      };

      const res = simulateOnBeforeRequest(details);
      expect(res).toEqual({ redirectURL: 'https://wikipedia.org/wiki/Cat' });
    });

    it('leaves non-redirect navigations untouched', () => {
      const details = {
        url: 'https://www.google.com/search?q=kittens',
        resourceType: 'mainFrame'
      };

      const res = simulateOnBeforeRequest(details);
      expect(res).toEqual({});
    });

    it('does not redirect non-frame resources like images or scripts', () => {
      const details = {
        url: 'https://www.google.com/url?q=https://example.com',
        resourceType: 'image'
      };

      const res = simulateOnBeforeRequest(details);
      expect(res).toEqual({});
    });
  });
});
