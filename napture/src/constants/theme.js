// Napture Theme Constants
//
// Kept for backwards compatibility. The real definitions now live in
// napture/styles/design-tokens.js, which mirrors design-system.css.
// Import design-tokens directly in new code.

const { colors, fonts, radius, motion, layout, typography } = require('../../styles/design-tokens');

module.exports = {
  colors,
  fonts: {
    ...fonts,
    // Legacy key used by pre-design-system call sites.
    main: fonts.sans
  },
  radius,
  motion,
  layout,
  typography
};
