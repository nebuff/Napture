describe('Cookie Synchronization & Domain Scope Compatibility', () => {
  function prepareCookieDetails(c) {
    if (!c || !c.name || (!c.domain && !c.url)) return null;
    const domainClean = (c.domain || '').replace(/^\./, '');
    const isHostOnly = Boolean(c.hostOnly || !c.domain);
    const isPrefixHost = c.name && c.name.startsWith('__Host-');
    const isPrefixSecure = c.name && c.name.startsWith('__Secure-');
    const isSecure = Boolean(c.secure) || isPrefixHost || isPrefixSecure || c.sameSite === 'no_restriction';
    const protocol = isSecure ? 'https://' : 'http://';
    const path = c.path || '/';
    const url = c.url || (domainClean ? `${protocol}${domainClean}${path.startsWith('/') ? path : '/' + path}` : 'http://localhost/');

    const cookieDetails = {
      url: url,
      name: c.name,
      value: c.value,
      path: path,
      secure: isSecure,
      httpOnly: Boolean(c.httpOnly),
      sameSite: (['unspecified', 'no_restriction', 'lax', 'strict'].includes(c.sameSite)) ? c.sameSite : 'unspecified'
    };

    // In Electron cookies.set, domain must NOT start with a dot, and must not be set for hostOnly or __Host- cookies
    if (!isHostOnly && !isPrefixHost && domainClean) {
      cookieDetails.domain = domainClean;
    }

    if (!c.session && typeof c.expirationDate === 'number' && c.expirationDate > (Date.now() / 1000)) {
      cookieDetails.expirationDate = c.expirationDate;
    }

    return cookieDetails;
  }

  it('correctly strips leading dot from domain cookies so Electron cookies.set succeeds for google.com', () => {
    const rawGoogleCookie = {
      name: 'SID',
      value: 'secret_google_session_sid',
      domain: '.google.com',
      hostOnly: false,
      path: '/',
      secure: true,
      httpOnly: true,
      session: false,
      expirationDate: Math.floor(Date.now() / 1000) + 86400,
      sameSite: 'lax'
    };

    const details = prepareCookieDetails(rawGoogleCookie);
    expect(details).not.toBeNull();
    expect(details.domain).toBe('google.com');
    expect(details.domain.startsWith('.')).toBe(false);
    expect(details.url).toBe('https://google.com/');
    expect(details.secure).toBe(true);
    expect(details.httpOnly).toBe(true);
    expect(details.sameSite).toBe('lax');
    expect(details.expirationDate).toBe(rawGoogleCookie.expirationDate);
  });

  it('omits domain property for host-only cookies to preserve exact host scoping', () => {
    const hostOnlyCookie = {
      name: 'local_token',
      value: 'abc123xyz',
      domain: 'accounts.google.com',
      hostOnly: true,
      path: '/',
      secure: true,
      httpOnly: true,
      session: true
    };

    const details = prepareCookieDetails(hostOnlyCookie);
    expect(details).not.toBeNull();
    expect(details.domain).toBeUndefined();
    expect(details.url).toBe('https://accounts.google.com/');
    expect(details.expirationDate).toBeUndefined();
  });

  it('omits domain property and enforces secure: true for __Host- prefixed cookies according to RFC 6265bis', () => {
    const hostPrefixedCookie = {
      name: '__Host-GAPS',
      value: '1:auth_key:xyz',
      domain: '.google.com',
      hostOnly: false,
      path: '/',
      secure: false, // will be coerced to true
      httpOnly: true,
      session: true
    };

    const details = prepareCookieDetails(hostPrefixedCookie);
    expect(details).not.toBeNull();
    expect(details.domain).toBeUndefined(); // Must NOT have domain attribute
    expect(details.secure).toBe(true);
    expect(details.url.startsWith('https://')).toBe(true);
  });

  it('enforces secure: true when sameSite is no_restriction (SameSite=None)', () => {
    const crossSiteCookie = {
      name: '__Secure-3PSID',
      value: '3psid_token_val',
      domain: '.google.com',
      hostOnly: false,
      path: '/',
      secure: false,
      sameSite: 'no_restriction',
      session: false,
      expirationDate: Math.floor(Date.now() / 1000) + 3600
    };

    const details = prepareCookieDetails(crossSiteCookie);
    expect(details).not.toBeNull();
    expect(details.domain).toBe('google.com');
    expect(details.secure).toBe(true);
    expect(details.sameSite).toBe('no_restriction');
  });

  it('preserves session cookies without forcing an expirationDate', () => {
    const sessionCookie = {
      name: 'NID',
      value: '511=abcd',
      domain: '.google.com',
      hostOnly: false,
      path: '/',
      secure: true,
      session: true,
      expirationDate: 12345 // Stale or mock number, should be ignored because session is true
    };

    const details = prepareCookieDetails(sessionCookie);
    expect(details).not.toBeNull();
    expect(details.expirationDate).toBeUndefined();
  });

  describe('Storage Access & Cookie Permissions', () => {
    function checkPermission(permission, blockCookiesSetting = 'incognito') {
      const allowedPermissions = [
        'media', 'display-capture', 'notifications', 'fullscreen', 'pointerLock',
        'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write',
        'storage-access', 'top-level-storage-access', 'idle-detection', 'window-management'
      ];
      if (permission === 'storage-access' || permission === 'top-level-storage-access') {
        if (blockCookiesSetting === 'all') {
          return false;
        }
        return true;
      }
      return allowedPermissions.includes(permission);
    }

    it('grants storage-access and top-level-storage-access when blockCookies is allow', () => {
      expect(checkPermission('storage-access', 'allow')).toBe(true);
      expect(checkPermission('top-level-storage-access', 'allow')).toBe(true);
    });

    it('grants storage-access when blockCookies is incognito (default)', () => {
      expect(checkPermission('storage-access', 'incognito')).toBe(true);
      expect(checkPermission('top-level-storage-access', 'incognito')).toBe(true);
    });

    it('blocks storage-access when blockCookies is all', () => {
      expect(checkPermission('storage-access', 'all')).toBe(false);
      expect(checkPermission('top-level-storage-access', 'all')).toBe(false);
    });
  });
});
