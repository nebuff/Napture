const fs = require('fs');
const path = require('path');

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => require('os').tmpdir()) }
}));

jest.mock('../../napture/db/history', () => ({
  getSetting: jest.fn(() => null),
  setSetting: jest.fn(),
  getAllSettings: jest.fn(() => ({})),
  saveAllSettings: jest.fn(),
  searchHistory: jest.fn(() => []),
  deleteHistoryItem: jest.fn(),
  deleteHistoryItems: jest.fn(),
  clearAllHistory: jest.fn()
}));

const root = path.resolve(__dirname, '../..');
const designSystemPath = path.join(root, 'napture/styles/design-system.css');
const tokens = require('../../napture/styles/design-tokens');

const css = fs.readFileSync(designSystemPath, 'utf8');

function normalize(value) {
  return String(value).replace(/\s+/g, '').toLowerCase();
}

/** Map of custom property -> first declared value in the stylesheet. */
function readCustomProperties(source) {
  const map = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (!map.has(match[1])) map.set(match[1], match[2].trim());
  }
  return map;
}

const properties = readCustomProperties(css);

/** Follow var() references until a literal value is reached. */
function resolveToken(name, depth = 0) {
  if (depth > 8) return null;
  const raw = properties.get(name);
  if (!raw) return null;
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (ref) return resolveToken(ref[1], depth + 1);
  return raw;
}

/** Top-level rule texts, for duplicate detection. */
function splitTopLevelRules(source) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '/' && source[i + 1] === '*' && depth === 0) {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 1;
      continue;
    }
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        rules.push(source.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  return rules;
}

// Use the canonical namer from the token module so the test cannot drift.
const kebab = tokens.kebab;

describe('Design system - tokens', () => {
  it('defines every required semantic token', () => {
    const required = [
      '--nb-bg-app', '--nb-bg-frame', '--nb-bg-sidebar', '--nb-bg-surface',
      '--nb-bg-glass', '--nb-bg-glass-solid', '--nb-bg-panel', '--nb-bg-card',
      '--nb-bg-input', '--nb-bg-input-soft', '--nb-bg-hover', '--nb-bg-active',
      '--nb-bg-selected', '--nb-bg-scrim',
      '--nb-text-primary', '--nb-text-secondary', '--nb-text-muted',
      '--nb-text-disabled', '--nb-text-on-accent', '--nb-text-link',
      '--nb-border-subtle', '--nb-border', '--nb-border-strong',
      '--nb-border-focus', '--nb-border-input',
      '--nb-accent', '--nb-accent-hover', '--nb-accent-active',
      '--nb-accent-soft', '--nb-accent-ring', '--nb-accent-glow',
      '--nb-success', '--nb-warning', '--nb-danger', '--nb-info',
      '--nb-font-sans', '--nb-font-display', '--nb-font-mono',
      '--nb-text-base', '--nb-text-lg',
      '--nb-space-1', '--nb-space-4', '--nb-space-7', '--nb-space-9',
      '--nb-radius-sm', '--nb-radius-md', '--nb-radius-xl',
      '--nb-radius-2xl', '--nb-radius-3xl', '--nb-radius-full',
      '--nb-shadow-sm', '--nb-shadow-popup', '--nb-shadow-focus',
      '--nb-duration-fast', '--nb-ease-out',
      '--nb-z-header', '--nb-z-popover', '--nb-z-modal',
      '--nb-sidebar-width', '--nb-header-height', '--nb-control-md'
    ];
    required.forEach((token) => {
      expect(properties.has(token)).toBe(true);
      expect(resolveToken(token)).toBeTruthy();
    });
  });

  it('resolves aliases instead of leaving var() chains unresolved', () => {
    expect(normalize(resolveToken('--nb-accent'))).toBe('#7f8cff');
    expect(normalize(resolveToken('--nb-bg-app'))).toBe('#0b0c11');
    expect(normalize(resolveToken('--nb-bg-active'))).toBe('rgba(32,33,42,0.65)');
  });

  it('defines both surface scopes and the light theme', () => {
    expect(css).toContain('[data-nb-surface="page"]');
    expect(css).toContain('[data-nb-theme="light"]');
    expect(css).toContain('body.has-light-theme');
  });

  it('aliases every legacy variable used by existing stylesheets', () => {
    const legacy = [
      '--bg-app', '--bg-sidebar', '--bg-darkest', '--bg-dark', '--bg-surface',
      '--bg-surface-glass', '--bg-surface-glass-solid', '--bg-backdrop',
      '--bg-card', '--bg-input', '--bg-hover', '--bg-active',
      '--border-color', '--border-overlay', '--border-focus',
      '--text-primary', '--text-secondary', '--text-muted',
      '--accent', '--accent-hover', '--danger', '--danger-hover', '--success',
      '--font-main', '--radius-base', '--radius-large', '--shadow-popup',
      '--sidebar-width', '--header-height', '--sidebar-panel-bg',
      '--popup-bg', '--popup-border', '--popup-shadow', '--popup-text-primary',
      '--popup-text-secondary', '--popup-text-muted', '--popup-icon',
      '--popup-hover', '--popup-item-active', '--popup-divider',
      '--popup-input-bg', '--popup-input-border'
    ];
    legacy.forEach((name) => expect(properties.has(name)).toBe(true));
  });
});

describe('Design system - JS/CSS parity', () => {
  it('matches every JavaScript colour token to its CSS custom property', () => {
    Object.entries(tokens.colors).forEach(([key, value]) => {
      const tokenName = `--nb-${kebab(key)}`;
      expect(properties.has(tokenName)).toBe(true);
      expect(normalize(resolveToken(tokenName))).toBe(normalize(value));
    });
  });

  it('matches the font stacks, radii and layout metrics', () => {
    expect(normalize(resolveToken('--nb-font-sans'))).toBe(normalize(tokens.fonts.sans));
    expect(normalize(resolveToken('--nb-font-display'))).toBe(normalize(tokens.fonts.display));
    expect(normalize(resolveToken('--nb-font-mono'))).toBe(normalize(tokens.fonts.mono));
    expect(normalize(resolveToken('--nb-sidebar-width'))).toBe(tokens.layout.sidebarWidth);
    expect(normalize(resolveToken('--nb-header-height'))).toBe(tokens.layout.headerHeight);
    expect(normalize(resolveToken('--nb-radius-md'))).toBe(tokens.radius.md);
    expect(normalize(resolveToken('--nb-duration-fast'))).toBe(tokens.motion.fast);
  });

  it('derives overlay menu geometry from the tokens the CSS uses', () => {
    const px = (name) => Number.parseFloat(resolveToken(name));
    const g = tokens.MENU_GEOMETRY;
    expect(css).toMatch(/\.nb-menu \{[^}]*padding:\s*var\(--nb-space-3\)/);
    expect(css).toMatch(/\.nb-menu \{[^}]*gap:\s*var\(--nb-space-1\)/);
    expect(css).toMatch(/\.nb-menu \{[^}]*border:\s*1px solid/);
    expect(css).toMatch(/\.nb-menu__divider \{[^}]*margin:\s*var\(--nb-space-2\)/);
    expect(g.padding).toBe(px('--nb-space-3'));
    expect(g.gap).toBe(px('--nb-space-1'));
    expect(g.itemHeight).toBe(px('--nb-control-sm'));
    expect(g.dividerHeight).toBe(px('--nb-space-2') * 2 + 1);
    expect(g.border).toBe(1);
    // Two items and one divider: 2px borders + 12px padding + 56px items
    // + 9px divider + two 2px gaps.
    expect(tokens.menuOuterHeight(2, 1)).toBe(83);
    expect(tokens.menuOuterHeight(0, 0)).toBe(14);
  });

  it('serialises the token map into a valid :root block', () => {
    const block = tokens.toCssRootBlock();
    expect(block.startsWith(':root {')).toBe(true);
    expect(block).toContain('--nb-accent: #7f8cff;');
    expect(block).toContain('--nb-space-7: 16px;');
  });

});

describe('Design system - component catalogue', () => {
  it('defines every documented component', () => {
    const selectors = [
      '.nb-btn', '.nb-btn--primary', '.nb-btn--ghost', '.nb-btn--danger',
      '.nb-btn--sm', '.nb-btn--icon', '.nb-btn--block', '.nb-btn.is-loading',
      '.nb-icon-btn',
      '.nb-input', '.nb-textarea', '.nb-select', '.nb-field', '.nb-label',
      '.nb-hint', '.nb-error', '.nb-input-group', '.nb-switch',
      '.nb-checkbox', '.nb-radio', '.nb-range',
      '.nb-card', '.nb-card__header', '.nb-card__body', '.nb-card__footer',
      '.nb-list', '.nb-list-item', '.nb-list-item__icon',
      '.nb-list-item__title', '.nb-list-item__meta', '.nb-list-item__actions',
      '.nb-list-item.is-highlighted', '.nb-card--list',
      '.nb-menu', '.nb-menu__item', '.nb-menu__icon', '.nb-menu__label',
      '.nb-menu__meta', '.nb-menu__divider', '.nb-menu__group',
      '.nb-popover', '.nb-tooltip',
      '.nb-modal', '.nb-modal__dialog', '.nb-modal__title', '.nb-modal__desc',
      '.nb-modal__footer', '.nb-modal__close',
      '.nb-badge', '.nb-badge--accent', '.nb-chip', '.nb-kbd',
      '.nb-tabs', '.nb-tab', '.nb-nav', '.nb-nav__item', '.nb-nav__badge',
      '.nb-empty', '.nb-progress', '.nb-progress__bar', '.nb-spinner',
      '.nb-skeleton', '.nb-section', '.nb-divider', '.nb-toolbar',
      '.nb-segmented', '.nb-scroll', '.nb-truncate',
      '.nb-app', '.nb-shell', '.nb-sidebar', '.nb-main', '.nb-content',
      '.nb-u-hidden', '.nb-u-grow', '.nb-u-sr-only'
    ];
    selectors.forEach((selector) => {
      expect(css).toContain(selector);
    });
  });

  it('keeps animation definitions in the system layer', () => {
    ['nb-spin', 'nb-fade-in', 'nb-pop-in', 'nb-modal-in', 'nb-indeterminate']
      .forEach((name) => expect(css).toContain(`@keyframes ${name}`));
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('Design system - adoption', () => {
  it('has no token definitions left in userChrome.css', () => {
    const chromeCss = fs.readFileSync(
      path.join(root, 'napture/newebx/chrome/userChrome.css'),
      'utf8'
    );
    expect(chromeCss.startsWith('@import "../../styles/design-system.css";')).toBe(true);
    expect(chromeCss).not.toMatch(/^:root\s*\{/m);
    expect(chromeCss).not.toMatch(/^body\.has-light-theme\s*\{/m);
  });

  it('has no byte-identical duplicate top-level rules in userChrome.css', () => {
    const chromeCss = fs.readFileSync(
      path.join(root, 'napture/newebx/chrome/userChrome.css'),
      'utf8'
    );
    const seen = new Set();
    const duplicates = [];
    splitTopLevelRules(chromeCss).forEach((rule) => {
      const key = rule.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
      if (!key.includes('{')) return;
      if (seen.has(key)) duplicates.push(key.slice(0, 60));
      seen.add(key);
    });
    expect(duplicates).toEqual([]);
  });

  it('keeps themes.css token-free and pointed at the system', () => {
    const themesCss = fs.readFileSync(path.join(root, 'napture/styles/themes.css'), 'utf8');
    expect(themesCss).toContain('@import "design-system.css";');
    expect(themesCss).not.toMatch(/--(bg|text|accent|border|popup)-[a-z-]+\s*:/);
  });

  it('inlines the system and sets the page surface in every generated page', () => {
    const { buildSettingsPage } = require('../../napture/settings-ui');
    const { buildDownloadsPage } = require('../../napture/downloads-ui');
    const { buildHistoryPage } = require('../../napture/history-ui');

    const pages = [buildSettingsPage(), buildDownloadsPage(), buildHistoryPage()];
    pages.forEach((html) => {
      expect(html).toContain('data-nb-surface="page"');
      expect(html).toContain('--nb-accent');
      expect(html).toContain('.nb-btn');
    });

    // The design system should be inlined exactly once per page.
    pages.forEach((html) => {
      expect(html.split(':root,\n[data-nb-surface="chrome"]').length).toBe(2);
    });
  });

  it('links the system from the updater window and the renderer shell', () => {
    const updater = fs.readFileSync(path.join(root, 'napture/updater-ui.html'), 'utf8');
    expect(updater).toContain('href="styles/design-system.css"');
    expect(updater).not.toMatch(/--text-primary\s*:/);

    const shell = fs.readFileSync(path.join(root, 'napture/renderer/index.html'), 'utf8');
    expect(shell).toContain('data-nb-surface="chrome"');
    expect(shell).toContain('../newebx/chrome/userChrome.css');
  });

  it('builds main-process overlay menus from design system components', () => {
    const main = fs.readFileSync(path.join(root, 'napture/main.js'), 'utf8');
    expect(main).not.toContain('suggestionSkin(');
    expect(main).not.toContain('popupSkin(');
    expect(main).toContain('class="nb-menu"');
    expect(main).toContain('nb-menu__item');
    expect(main).toContain('nb-menu__label');
    expect(main).toContain('nb-menu__divider');
    expect(main).not.toContain('class="menu-item');
    expect(main).not.toContain("closest('.menu-item')");
    expect(main).not.toContain("'rgba(23, 23, 32, 0.88)'");
  });

  it('sizes overlay views from the shared menu geometry', () => {
    const main = fs.readFileSync(path.join(root, 'napture/main.js'), 'utf8');
    expect(main).toContain('menuOuterHeight(');
    expect(main).not.toContain('calculatedHeight');
  });

  it('inlines the system into the data-URL context menu overlay', () => {
    const main = fs.readFileSync(path.join(root, 'napture/main.js'), 'utf8');
    expect(main).toContain('${getDesignSystemCss()}');
    expect(main).toContain('data:text/html;charset=utf-8,');
  });

  it('builds the suggestions overlay from nb-list components', () => {
    const main = fs.readFileSync(path.join(root, 'napture/main.js'), 'utf8');
    expect(main).toContain('nb-card nb-card--glass nb-card--list');
    expect(main).toContain('nb-list-item__icon');
    expect(main).toContain('nb-list-item__title');
    expect(main).toContain('is-highlighted');
    expect(main).toContain('window.updateContent = function(html, isLight)');
    expect(main).not.toContain('sug-item');
    expect(main).not.toContain('suggestions-card');
  });

  it('builds the omnibar popup from nb-menu components', () => {
    const popupHtml = fs.readFileSync(
      path.join(root, 'napture/renderer/omnibar-popup.html'),
      'utf8'
    );
    const popupJs = fs.readFileSync(
      path.join(root, 'napture/renderer/omnibar-popup.js'),
      'utf8'
    );

    expect(popupHtml).toContain('class="nb-menu animate"');
    expect(popupHtml).toContain('id="popup-container"');
    expect(popupHtml).toContain('../newebx/chrome/userChrome.css');
    expect(popupHtml).not.toContain('class="menu-item');

    expect(popupJs).toContain('nb-menu__item');
    expect(popupJs).toContain('nb-menu__label');
    expect(popupJs).toContain('nb-menu__meta');
    expect(popupJs).toContain('window.updateContent = function(html, isLight)');
    expect(popupJs).not.toContain('item-title');
    expect(popupJs).not.toContain('menu-divider');
  });

  it('routes the injected content stylesheet through the system', () => {
    const contentCss = fs.readFileSync(
      path.join(root, 'napture/newebx/chrome/userContent.css'),
      'utf8'
    );
    expect(contentCss.startsWith('@import "../../styles/design-system.css";')).toBe(true);
    expect(contentCss).not.toMatch(/^:root\s*\{/m);
    expect(contentCss).not.toMatch(/^body\.has-light-theme\s*\{/m);
  });

  it('inlines the system into the bookmark importer window', () => {
    const main = fs.readFileSync(path.join(root, 'napture/main.js'), 'utf8');
    expect(main).toContain('${getDesignSystemCss()}');
    expect(main).toContain('data-nb-surface="chrome"');
    expect(main).toContain('--nb-bg-app: #0F0F14');
    expect(main).not.toContain('var(--accent-glow)');
  });

  it('keeps the compatibility adapters delegating to the system', () => {
    const theme = require('../../napture/src/constants/theme');
    expect(theme.colors.accent).toBe(tokens.colors.accent);
    expect(theme.fonts.main).toBe(tokens.fonts.sans);

    const { buildHTMLShell, coreCSS } = require('../../napture/src/components/ui-builder');
    const html = buildHTMLShell('Title', '<div>Body</div>');
    expect(coreCSS).toContain('--nb-accent');
    expect(html).toContain(coreCSS);
    expect(html).toContain('data-nb-surface="page"');
  });
});
