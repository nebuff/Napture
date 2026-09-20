// Utility functions shared across main and renderer processes
const fs = require('fs');
const path = require('path');

let _logoDataUrl = null;

function getLogoDataUrl() {
  if (_logoDataUrl !== null) return _logoDataUrl;
  try {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath);
      _logoDataUrl = 'data:image/png;base64,' + buffer.toString('base64');
      return _logoDataUrl;
    }
  } catch (e) {
    console.error('Error reading logo.png:', e);
  }
  _logoDataUrl = '';
  return _logoDataUrl;
}

function getAppVersions() {
  let naptureVersion = '1.1.3';
  let newebChromiumVersion = 'v1.3b12';

  try {
    const localVersions = path.join(__dirname, 'versions.json');
    const parentVersions = path.join(__dirname, '..', 'versions.json');
    const versionsPath = fs.existsSync(localVersions) ? localVersions : (fs.existsSync(parentVersions) ? parentVersions : localVersions);
    if (fs.existsSync(versionsPath)) {
      try { delete require.cache[require.resolve(versionsPath)]; } catch (e) { delete require.cache[versionsPath]; }
      const data = require(versionsPath);
      if (data.napture) naptureVersion = data.napture;
      if (data.newebxEngine) newebChromiumVersion = data.newebxEngine;
      else if (data.newebChromium) newebChromiumVersion = data.newebChromium;
      else if (data.newebEngine) newebChromiumVersion = data.newebEngine;
    }
  } catch (e) {}

  try {
    if (naptureVersion === '1.1.3') {
      const localPkg = path.join(__dirname, 'package.json');
      const parentPkg = path.join(__dirname, '..', 'package.json');
      const pkgPath = fs.existsSync(localPkg) ? localPkg : (fs.existsSync(parentPkg) ? parentPkg : localPkg);
      if (fs.existsSync(pkgPath)) {
        try { delete require.cache[require.resolve(pkgPath)]; } catch (e) { delete require.cache[pkgPath]; }
        const pkg = require(pkgPath);
        if (pkg.version) naptureVersion = pkg.version;
      }
    }
  } catch (err) {}

  return { naptureVersion, newebChromiumVersion };
}

function isNeProtocolSupported() {
  try {
    if (process.env.DISABLE_NE_PROTOCOL === 'true' || process.env.ENABLE_NE_PROTOCOL === 'false') {
      return false;
    }
    if (process.env.ENABLE_NE_PROTOCOL === 'true') {
      return true;
    }
    const localVersions = path.join(__dirname, 'versions.json');
    const parentVersions = path.join(__dirname, '..', 'versions.json');
    const versionsPath = fs.existsSync(localVersions) ? localVersions : (fs.existsSync(parentVersions) ? parentVersions : localVersions);
    if (fs.existsSync(versionsPath)) {
      try { delete require.cache[require.resolve(versionsPath)]; } catch (e) { delete require.cache[versionsPath]; }
      const data = require(versionsPath);
      if (data.enableNeProtocol === false || data.neProtocol === false || data.disableNeProtocol === true) {
        return false;
      }
    }
  } catch (e) {}
  return true;
}

function unwrapRedirectUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // Google redirect: google.*/url?q=... or google.*/url?url=...
    if (/(^|\.)google\.[a-z]+(\.[a-z]+)?$/i.test(host) && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('url') || parsed.searchParams.get('q');
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return target;
      }
    }

    // DuckDuckGo redirect: duckduckgo.com/l/?uddg=...
    if (host.includes('duckduckgo.com') && parsed.pathname === '/l/') {
      const target = parsed.searchParams.get('uddg');
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return target;
      }
    }

    return rawUrl;
  } catch (e) {
    return rawUrl;
  }
}

function isAuthOrSensitiveUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Specific OAuth / IDP authentication domains
    const isGoogleAuth = (host === 'accounts.google.com') &&
      (path.startsWith('/o/oauth2') || path.startsWith('/signin') || path.startsWith('/v3/signin') || path.startsWith('/servicelogin'));
    const isMicrosoftAuth = (host === 'login.microsoftonline.com' || host === 'login.live.com') &&
      (path.includes('/oauth2') || path.includes('/login') || path.includes('/authorize'));
    const isAppleAuth = (host === 'appleid.apple.com') &&
      (path.includes('/auth') || path.includes('/oauth'));
    const isGithubAuth = (host === 'github.com') &&
      (path.startsWith('/login/oauth') || path.startsWith('/login'));
    const isDiscordAuth = (host === 'discord.com') &&
      (path.startsWith('/oauth2/authorize') || path.startsWith('/login'));
    const isAuth0 = host.endsWith('.auth0.com') &&
      (path.startsWith('/authorize') || path.startsWith('/u/login'));

    if (isGoogleAuth || isMicrosoftAuth || isAppleAuth || isGithubAuth || isDiscordAuth || isAuth0) {
      return true;
    }

    // Explicit OAuth authorize endpoints on other providers
    if (path === '/oauth/authorize' || path === '/oauth2/authorize' || path === '/oauth/v2/authorize') {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

function isBlurBackgroundEnabled() {
  try {
    if (process.env.DISABLE_WINDOW_BLUR === 'true' || process.env.ENABLE_WINDOW_BLUR === 'false' || process.env.DISABLE_BLUR_BACKGROUND === 'true' || process.env.ENABLE_BLUR_BACKGROUND === 'false') {
      return false;
    }
    if (process.env.ENABLE_WINDOW_BLUR === 'true' || process.env.ENABLE_BLUR_BACKGROUND === 'true') {
      return true;
    }
    const localVersions = path.join(__dirname, 'versions.json');
    const parentVersions = path.join(__dirname, '..', 'versions.json');
    const versionsPath = fs.existsSync(localVersions) ? localVersions : (fs.existsSync(parentVersions) ? parentVersions : localVersions);
    if (fs.existsSync(versionsPath)) {
      try { delete require.cache[require.resolve(versionsPath)]; } catch (e) { delete require.cache[versionsPath]; }
      const data = require(versionsPath);
      if (data.enableBlurBackground === false || data.enableWindowBlur === false || data.blurBackground === false || data.disableWindowBlur === true || data.disableBlurBackground === true) {
        return false;
      }
      if (data.enableBlurBackground === true || data.enableWindowBlur === true || data.blurBackground === true) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

module.exports = {
  getLogoDataUrl,
  getAppVersions,
  isNeProtocolSupported,
  isBlurBackgroundEnabled,
  unwrapRedirectUrl,
  isAuthOrSensitiveUrl
};
