describe('URL Navigation & Address Bar Display Logic', () => {
  function formatUrlDisplay(url) {
    if (!url) return '';
    if (url === 'about:blank') return '';
    if (url === 'napture://welcome' || url === 'napture://newtab') return 'napture://welcome';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        return parsed.hostname + parsed.pathname + parsed.search + parsed.hash;
      }
      if (parsed.protocol === 'napture:') {
        return url;
      }
      return url;
    } catch (e) {
      return url;
    }
  }

  function isExplicitWelcomeUrl(url) {
    if (!url) return false;
    const cleanUrl = url.trim().toLowerCase();
    return cleanUrl === 'napture://welcome' ||
           cleanUrl === 'napture://newtab' ||
           cleanUrl.startsWith('napture://welcome/') ||
           cleanUrl.startsWith('napture://newtab/');
  }

  describe('formatUrlDisplay', () => {
    it('formats https URLs by stripping https:// prefix', () => {
      expect(formatUrlDisplay('https://example.com/path?q=1#hash')).toBe('example.com/path?q=1#hash');
      expect(formatUrlDisplay('https://github.com/napture')).toBe('github.com/napture');
    });

    it('preserves napture:// custom protocol URLs', () => {
      expect(formatUrlDisplay('napture://welcome')).toBe('napture://welcome');
      expect(formatUrlDisplay('napture://dns')).toBe('napture://dns');
    });

    it('returns empty string for about:blank or empty input', () => {
      expect(formatUrlDisplay('about:blank')).toBe('');
      expect(formatUrlDisplay('')).toBe('');
      expect(formatUrlDisplay(null)).toBe('');
    });
  });

  describe('isExplicitWelcomeUrl', () => {
    it('returns true for explicit welcome and newtab URLs', () => {
      expect(isExplicitWelcomeUrl('napture://welcome')).toBe(true);
      expect(isExplicitWelcomeUrl('napture://newtab')).toBe(true);
      expect(isExplicitWelcomeUrl('NAPTURE://WELCOME')).toBe(true);
      expect(isExplicitWelcomeUrl('napture://welcome/settings')).toBe(true);
    });

    it('returns false for external URLs, about:blank, or in-flight blank tabs', () => {
      expect(isExplicitWelcomeUrl('https://google.com')).toBe(false);
      expect(isExplicitWelcomeUrl('about:blank')).toBe(false);
      expect(isExplicitWelcomeUrl('')).toBe(false);
      expect(isExplicitWelcomeUrl('napture://dns')).toBe(false);
    });
  });

  describe('Welcome Tab Backdrop Overlay Control', () => {
    it('prevents transient about:blank from adding .is-welcome-tab to document body', () => {
      const mockBodyClasses = new Set();
      const documentBody = {
        classList: {
          add: (c) => mockBodyClasses.add(c),
          remove: (c) => mockBodyClasses.delete(c),
          contains: (c) => mockBodyClasses.has(c)
        }
      };

      const updateHeaderVisibility = (activeUrl) => {
        if (isExplicitWelcomeUrl(activeUrl)) {
          documentBody.classList.add('is-welcome-tab');
        } else {
          documentBody.classList.remove('is-welcome-tab');
        }
      };

      updateHeaderVisibility('napture://welcome');
      expect(documentBody.classList.contains('is-welcome-tab')).toBe(true);

      updateHeaderVisibility('about:blank');
      expect(documentBody.classList.contains('is-welcome-tab')).toBe(false);

      updateHeaderVisibility('https://wikipedia.org');
      expect(documentBody.classList.contains('is-welcome-tab')).toBe(false);
    });
  });

  describe('SSL Security Badge Display', () => {
    function getSslBadgeState(url) {
      if (!url || isExplicitWelcomeUrl(url) || url === 'about:blank') {
        return { visible: false, icon: 'none' };
      }
      if (url.startsWith('https://')) {
        return { visible: true, icon: 'lock-secure' };
      }
      if (url.startsWith('http://')) {
        return { visible: true, icon: 'lock-insecure' };
      }
      return { visible: false, icon: 'none' };
    }

    it('returns secure lock for https URLs', () => {
      expect(getSslBadgeState('https://secure.example.com')).toEqual({
        visible: true,
        icon: 'lock-secure'
      });
    });

    it('returns insecure warning for http URLs', () => {
      expect(getSslBadgeState('http://insecure.example.com')).toEqual({
        visible: true,
        icon: 'lock-insecure'
      });
    });

    it('hides SSL badge for internal pages and about:blank', () => {
      expect(getSslBadgeState('napture://welcome')).toEqual({ visible: false, icon: 'none' });
      expect(getSslBadgeState('about:blank')).toEqual({ visible: false, icon: 'none' });
    });
  });
});
