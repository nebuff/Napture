// Napture Design Tokens — the JavaScript view of design-system.css
//
// Single source of truth for any value that must be handed to a native API,
// inlined into generated HTML, or compared in tests. Every token here mirrors
// a custom property of the same name in design-system.css:
//
//     colors.accent        <->  --nb-accent
//     colors.bgGlass       <->  --nb-bg-glass
//
// tests/browser/design-system.test.js enforces that parity. When you change a
// token, change it in design-system.css first, then here.

const colors = {
  // Brand
  indigo200: '#c7ccff',
  indigo300: '#9ca8ff',
  indigo500: '#7f8cff',
  indigo600: '#6c7af7',
  indigo700: '#4b5be5',
  indigo800: '#3a47b8',

  // Chrome surfaces (dark)
  bgApp: '#0b0c11',
  bgFrame: 'rgba(18, 19, 26, 0.70)',
  bgSidebar: 'rgba(18, 19, 26, 0.65)',
  bgSurface: 'rgba(18, 19, 26, 0.94)',
  bgGlass: 'rgba(26, 27, 38, 0.88)',
  bgGlassSolid: 'rgba(20, 21, 30, 0.90)',
  bgPanel: 'rgba(23, 23, 32, 0.75)',
  bgPanelSolid: '#171720',
  bgCard: 'rgba(18, 19, 26, 0.60)',
  bgInput: '#12131a',
  bgInputSoft: 'rgba(255, 255, 255, 0.06)',
  bgHover: 'rgba(42, 43, 54, 0.65)',
  bgActive: 'rgba(32, 33, 42, 0.65)',
  bgScrim: 'rgba(10, 11, 14, 0.85)',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a9b1d6',
  textMuted: '#565f89',
  textDisabled: 'rgba(255, 255, 255, 0.30)',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  border: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',

  // Accent
  accent: '#7f8cff',
  accentHover: '#6c7af7',
  accentActive: '#4b5be5',
  accentSoft: 'rgba(127, 140, 255, 0.18)',

  // Status
  success: '#28a745',
  successHover: '#218838',
  warning: '#f5a623',
  danger: '#e81123',
  dangerHover: '#c40e1d',
  info: '#38bdf8'
};

const fonts = {
  sans: "'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  display: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', 'Cascadia Code', Consolas, 'Liberation Mono', monospace"
};

const typography = {
  text2xs: '10px',
  textXs: '11px',
  textSm: '12px',
  textBase: '13px',
  textMd: '14px',
  textLg: '16px',
  textXl: '20px',
  text2xl: '24px',
  text3xl: '30px'
};

const space = {
  0: '0', 1: '2px', 2: '4px', 3: '6px', 4: '8px', 5: '10px',
  6: '12px', 7: '16px', 8: '20px', 9: '24px', 10: '32px',
  11: '40px', 12: '48px'
};

const radius = {
  xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '12px',
  '2xl': '14px', '3xl': '16px', full: '9999px'
};

const motion = {
  instant: '80ms',
  fast: '120ms',
  base: '160ms',
  moderate: '220ms',
  slow: '320ms',
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
};

const layout = {
  sidebarWidth: '240px',
  headerHeight: '48px',
  viewportRadius: '12px',
  controlSm: '28px',
  controlMd: '32px',
  controlLg: '36px',
  controlXl: '40px',
  pageMaxWidth: '1040px'
};

const zIndex = {
  content: 1,
  sidebar: 100,
  header: 1000,
  dropdown: 5000,
  popover: 9000,
  overlay: 9999,
  modal: 99999,
  toast: 999999
};

/**
 * Flat `--nb-*` custom-property map.
 * Useful for injecting tokens into a WebContentsView HUD or a native window.
 */
function toCssVariables() {
  const vars = {};
  Object.entries(colors).forEach(([key, value]) => {
    vars[`--nb-${kebab(key)}`] = value;
  });
  vars['--nb-font-sans'] = fonts.sans;
  vars['--nb-font-display'] = fonts.display;
  vars['--nb-font-mono'] = fonts.mono;
  Object.entries(typography).forEach(([key, value]) => {
    vars[`--nb-${kebab(key)}`] = value;
  });
  Object.entries(space).forEach(([key, value]) => {
    vars[`--nb-space-${key}`] = value;
  });
  Object.entries(radius).forEach(([key, value]) => {
    vars[`--nb-radius-${key}`] = value;
  });
  return vars;
}

/** Serialise the token map into a `:root { … }` block. */
function toCssRootBlock() {
  return `:root {\n${Object.entries(toCssVariables())
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')}\n}`;
}

function kebab(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Resolved box metrics of `.nb-menu`, mirrored from design-system.css.
 * Overlay views are sized by the main process before their content exists, so
 * these numbers must match the stylesheet exactly. The design-system test
 * derives them from the CSS tokens to keep the two in sync.
 *
 *   border        1px solid
 *   padding       --nb-space-3
 *   itemHeight    --nb-control-sm
 *   dividerHeight 1px line + 2 * --nb-space-2 margin
 *   gap           --nb-space-1
 */
const MENU_GEOMETRY = Object.freeze({
  border: 1,
  padding: 6,
  itemHeight: 28,
  dividerHeight: 9,
  gap: 2
});

/**
 * Outer height of a `.nb-menu` holding `itemCount` menu items and
 * `dividerCount` dividers, in CSS pixels.
 *
 * @param {number} itemCount
 * @param {number} [dividerCount]
 * @returns {number}
 */
function menuOuterHeight(itemCount, dividerCount = 0) {
  const children = itemCount + dividerCount;
  const gaps = Math.max(0, children - 1);
  return (
    2 * MENU_GEOMETRY.border +
    2 * MENU_GEOMETRY.padding +
    itemCount * MENU_GEOMETRY.itemHeight +
    dividerCount * MENU_GEOMETRY.dividerHeight +
    gaps * MENU_GEOMETRY.gap
  );
}

module.exports = {
  colors,
  fonts,
  typography,
  space,
  radius,
  motion,
  layout,
  zIndex,
  kebab,
  toCssVariables,
  toCssRootBlock,
  MENU_GEOMETRY,
  menuOuterHeight
};
