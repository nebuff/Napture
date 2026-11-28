# Napture Design System

The single definition of every visual element in Napture. Chrome UI, settings,
history, downloads, the updater window and every future surface are built from
this file set:

| File | Role |
| --- | --- |
| `design-system.css` | **The only stylesheet that defines visual values.** Tokens + components + utilities. |
| `design-tokens.js` | The JavaScript mirror, for native APIs and main-process overlays. |
| `themes.css` | Legacy `.napture-*` compatibility layer. Imports the system; defines no tokens. |

**Rules**

1. Never write a raw colour, radius, shadow, duration or z-index. Use a token.
2. Never restyle a control that already exists here. Compose the component.
3. New shared components go in `design-system.css` under the matching section,
   named `nb-<component>`, and are added to this document in the same change.
4. `tests/browser/design-system.test.js` enforces CSS/JS token parity, required
   component coverage, and that every generated page loads the system.

---

## 1. Surfaces and theming

Tokens resolve differently per **surface**, because translucency only makes
sense over a desktop wallpaper, not over a document.

| Scope | How to opt in | Use for |
| --- | --- | --- |
| Chrome | `<html data-nb-surface="chrome">` (default) | The browser shell: header, sidebar, omnibar, menus, overlays. Translucent surfaces. |
| Page | `<html data-nb-surface="page">` | Full-page documents: settings, history, downloads. Solid surfaces. |

**Light theme** — any of these selectors works; they are equivalent:

```html
<html data-nb-theme="light">
<body class="has-light-theme">
```

The application toggles `body.has-light-theme`; use that in chrome UI and
`data-nb-theme` in standalone pages. Both are wired to the same token overrides.

**Legacy variable names** (`--bg-hover`, `--text-primary`, `--popup-bg`,
`--sidebar-width`, …) are aliased to the canonical tokens at the end of the
token layer. Old CSS keeps working; new CSS must use `--nb-*`.

---

## 2. Tokens

### 2.1 Colour primitives

Never use these directly — they exist only to build semantic tokens.

| Token | Value | Notes |
| --- | --- | --- |
| `--nb-indigo-200` … `--nb-indigo-800` | `#c7ccff` → `#3a47b8` | Brand ramp |
| `--nb-slate-950` … `--nb-slate-050` | `#0b0c11` → `#e6e9f5` | Neutral ramp |
| `--nb-green-500/600`, `--nb-amber-500`, `--nb-red-500/600` | | Status hues |
| `--nb-cyan-400`, `--nb-purple-400`, `--nb-pink-400` | | Accents/gradients |
| `--nb-alpha-02` … `--nb-alpha-20` | `rgba(255,255,255,.02–.20)` | Overlays; flip to black alphas in light theme |

### 2.2 Backgrounds

| Token | Chrome (dark) | Use for |
| --- | --- | --- |
| `--nb-bg-app` | `#0b0c11` | App canvas |
| `--nb-bg-frame` | `rgba(18,19,26,.70)` | Window frame / mica layer |
| `--nb-bg-sidebar` | `rgba(18,19,26,.65)` | Sidebar panel |
| `--nb-bg-surface` | `rgba(18,19,26,.94)` | Solid surface |
| `--nb-bg-glass` | `rgba(26,27,38,.88)` | Frosted menus/popovers |
| `--nb-bg-glass-solid` | `rgba(20,21,30,.90)` | Modals |
| `--nb-bg-panel` | `rgba(23,23,32,.75)` | Docked sidebar panels |
| `--nb-bg-panel-solid` | `#171720` | Panel fallback |
| `--nb-bg-elevated` | `rgba(18,19,26,.85)` | Raised card |
| `--nb-bg-card` | `rgba(18,19,26,.60)` | Card fill |
| `--nb-bg-input` | `#12131a` | Solid input fill |
| `--nb-bg-input-soft` | `rgba(255,255,255,.06)` | Inputs over chrome |
| `--nb-bg-hover` | `rgba(42,43,54,.65)` | Hover |
| `--nb-bg-active` | `rgba(32,33,42,.65)` | Selected/active |
| `--nb-bg-selected` | `rgba(127,140,255,.18)` | Accent selection |
| `--nb-bg-scrim` | `rgba(10,11,14,.85)` | Modal overlay |

### 2.3 Text

| Token | Use for |
| --- | --- |
| `--nb-text-primary` | Titles, active labels |
| `--nb-text-secondary` | Body copy, inactive labels |
| `--nb-text-muted` | Metadata, hints, placeholders |
| `--nb-text-disabled` | Disabled controls |
| `--nb-text-on-accent` | Text on `--nb-accent` fills |
| `--nb-text-link` | Links |

### 2.4 Borders, accent, status

| Token | Use for |
| --- | --- |
| `--nb-border-subtle` | Section separators, quiet outlines |
| `--nb-border` | Default control outline, popup border |
| `--nb-border-strong` | Hover outline |
| `--nb-border-focus` | Focus ring colour |
| `--nb-border-input` | Input outline |
| `--nb-accent` / `-hover` / `-active` | Brand actions |
| `--nb-accent-soft` / `-softer` | Tinted backgrounds |
| `--nb-accent-ring` / `-glow` | Focus ring, glow |
| `--nb-success` / `-hover` / `-soft` | Confirmation |
| `--nb-warning` / `-soft` | Caution |
| `--nb-danger` / `-hover` / `-soft` | Destructive |
| `--nb-info` / `-soft` | Informational |

### 2.5 Typography

| Token | Value |
| --- | --- |
| `--nb-font-sans` | Inter → Outfit → system |
| `--nb-font-display` | Outfit → Inter → system |
| `--nb-font-mono` | JetBrains Mono → SF Mono → Consolas |
| `--nb-text-2xs` … `--nb-text-3xl` | 10 / 11 / 12 / 13 / 14 / 16 / 20 / 24 / 30px |
| `--nb-weight-regular/medium/semibold/bold` | 400 / 500 / 600 / 700 |
| `--nb-leading-tight/normal/relaxed` | 1.2 / 1.5 / 1.65 |
| `--nb-tracking-tight/wide` | -0.01em / 0.05em |

Sizes are semantic: **13px is the base** for UI text. Titles 16–20px, metadata
10–12px. Never use a size outside the scale.

### 2.6 Spacing (4px grid)

`--nb-space-0` … `--nb-space-12` =
0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48px.

Common pairings: control padding `4/6`, card padding `16/20`, section gap `24`.

### 2.7 Radius

| Token | Value | Use |
| --- | --- | --- |
| `--nb-radius-xs` | 4px | Badges, keycaps, tiny icons |
| `--nb-radius-sm` | 6px | Menu items, chips |
| `--nb-radius-md` | 8px | Buttons, inputs, list rows |
| `--nb-radius-lg` | 10px | Large buttons |
| `--nb-radius-xl` | 12px | Cards, address bar, viewport |
| `--nb-radius-2xl` | 14px | Menus, popovers |
| `--nb-radius-3xl` | 16px | Modals, panels |
| `--nb-radius-full` | 9999px | Pills, switches, avatars |

### 2.8 Elevation

`--nb-shadow-xs` (control) → `-sm` (card) → `-md` (raised) → `-lg` (panel) →
`-popup` (floating menu/modal) → `-glow` (accent emphasis).
Also `--nb-shadow-inset-top` (glass highlight) and `--nb-shadow-focus`.

### 2.9 Motion

| Token | Value |
| --- | --- |
| `--nb-duration-instant` | 80ms — press feedback |
| `--nb-duration-fast` | 120ms — hover/colour |
| `--nb-duration-base` | 160ms — toggles |
| `--nb-duration-moderate` | 220ms — popovers |
| `--nb-duration-slow` | 320ms — panels |
| `--nb-ease-standard` | `cubic-bezier(.2,0,0,1)` |
| `--nb-ease-out` | `cubic-bezier(.16,1,.3,1)` — entrances |
| `--nb-ease-spring` | `cubic-bezier(.34,1.56,.64,1)` — thumbs |
| `--nb-transition-colors` | bg + border + colour at fast |
| `--nb-transition-transform` | transform at base |

All animation is disabled under `prefers-reduced-motion`.

### 2.10 Layering

`--nb-z-content` 1 · `--nb-z-sticky` 10 · `--nb-z-sidebar` 100 ·
`--nb-z-header` 1000 · `--nb-z-dropdown` 5000 · `--nb-z-popover` 9000 ·
`--nb-z-overlay` 9999 · `--nb-z-modal` 99999 · `--nb-z-toast` 999999.

Never invent a z-index; pick the layer.

### 2.11 Layout and control sizing

| Token | Value |
| --- | --- |
| `--nb-sidebar-width` | 240px |
| `--nb-header-height` | 48px |
| `--nb-panel-width` | 240px |
| `--nb-page-max-width` | 1040px |
| `--nb-viewport-radius` | 12px |
| `--nb-viewport-gap` | 12px |
| `--nb-control-xs/sm/md/lg/xl` | 22 / 28 / 32 / 36 / 40px |
| `--nb-icon-xs/sm/md/lg` | 12 / 14 / 16 / 20px |
| `--nb-blur-sm/md/lg` | 12 / 20 / 28px blur, saturated |

---

## 3. Layout elements

| Class | Element | Notes |
| --- | --- | --- |
| `.nb-app` | Root column | 100vw × 100vh, no scroll |
| `.nb-shell` | Horizontal split | Sidebar + main |
| `.nb-sidebar` | Vertical sidebar | Fixed width, 1px right border |
| `.nb-main` | Content column | `min-width: 0` to allow truncation |
| `.nb-page` | Standalone page | 100vh column |
| `.nb-page__scroll` | Page scroll region | 24/32px padding |
| `.nb-content` | Centered column | max `--nb-page-max-width` |
| `.nb-toolbar` | Draggable header row | Children are `no-drag` automatically |

---

## 4. Components

### 4.1 Button — `.nb-btn`

```html
<button class="nb-btn">Secondary</button>
<button class="nb-btn nb-btn--primary">Save</button>
<button class="nb-btn nb-btn--ghost">Cancel</button>
<button class="nb-btn nb-btn--danger">Delete</button>
<button class="nb-btn nb-btn--primary nb-btn--sm">Small</button>
<button class="nb-btn nb-btn--primary nb-btn--lg">Large</button>
<button class="nb-btn nb-btn--icon" aria-label="Close">…</button>
<button class="nb-btn nb-btn--primary nb-btn--block">Full width</button>
<button class="nb-btn nb-btn--primary is-loading">Saving</button>
```

Variants: `--primary`, `--secondary` (default look), `--ghost`, `--danger`,
`--success`. Sizes: `--sm`, `--lg`. Shapes: `--icon`, `--block`, `--rounded`.
States: `:hover`, `:active` (scale .98), `:focus-visible` (accent ring),
`[disabled]`, `.is-loading`, `.is-active`.

Height is driven by `--nb-btn-height`; do not set `height` directly.

### 4.2 Icon button — `.nb-icon-btn`

Chrome toolbars and hover-revealed row actions. Square, transparent, accent on
hover, `scale(.92)` on press, 30% opacity when disabled.

```html
<button class="nb-icon-btn" aria-label="Reload"><svg …></svg></button>
<button class="nb-icon-btn is-active" aria-label="Pinned">…</button>
```

### 4.3 Inputs — `.nb-input` `.nb-textarea` `.nb-select`

```html
<div class="nb-field">
  <label class="nb-label" for="home">Home page</label>
  <input class="nb-input" id="home" placeholder="napture://welcome">
  <span class="nb-hint">Opened on every new tab.</span>
</div>
```

States: `:hover` (stronger border), `:focus` (accent border + 3px ring +
solid fill), `[disabled]`, `.is-invalid` (danger border/ring).
`<select>` has a built-in chevron. `.nb-textarea` is resizable.
`.nb-input-group` composes an icon + borderless input with a shared focus ring.

### 4.4 Switch, checkbox, radio, range

```html
<label class="nb-switch">
  <input type="checkbox" checked>
  <span class="nb-switch__track"></span>
</label>

<label class="nb-checkbox"><input type="checkbox" checked> Enable</label>
<label class="nb-radio"><input type="radio" name="g" checked> Option</label>
<input class="nb-range" type="range" min="0" max="100">
```

Switch: 40×22 track, 16px thumb, 18px spring travel, accent when on.
Always pair a switch with a `.nb-label` describing the setting.

### 4.5 Card — `.nb-card`

```html
<section class="nb-card">
  <header class="nb-card__header">
    <h3 class="nb-card__title">Appearance</h3>
    <button class="nb-btn nb-btn--sm">Reset</button>
  </header>
  <div class="nb-card__body">…</div>
  <footer class="nb-card__footer">
    <button class="nb-btn nb-btn--primary">Apply</button>
  </footer>
</section>
```

Modifiers: `--glass` (frosted, popup shadow), `--interactive` (pointer + lift),
`--list` (glass card that hosts list rows directly: `padding` 6px, `gap` 2px).

### 4.6 List rows — `.nb-list` `.nb-list-item`

The base for tabs, bookmarks, history entries, downloads and settings rows.

```html
<div class="nb-list" role="list">
  <button class="nb-list-item is-active" role="listitem" aria-selected="true">
    <span class="nb-list-item__icon"><img src="…" alt=""></span>
    <span class="nb-list-item__body">
      <span class="nb-list-item__title">Napture</span>
      <span class="nb-list-item__meta">napture.org</span>
    </span>
    <span class="nb-list-item__trailing">14:32</span>
    <span class="nb-list-item__actions">
      <button class="nb-icon-btn" aria-label="Close">…</button>
    </span>
  </button>
</div>
```

States: `:hover`, `.is-active` / `[aria-selected="true"]`,
`.is-disabled` / `[aria-disabled="true"]`, and `.is-highlighted` for the
keyboard-selected row in autocomplete / type-ahead lists (accent tint plus a
3px accent bar, mirrored by `aria-selected`).
`__actions` is hidden until hover/active — never require it to be visible to
perform the row's primary action.

### 4.7 Menu — `.nb-menu` `.nb-menu__item`

The browser's core floating surface (app menu, context menus, omnibar popups).

```html
<div class="nb-menu" role="menu">
  <button class="nb-menu__item" role="menuitem">
    <span class="nb-menu__icon"><svg …></svg></span>
    <span class="nb-menu__label">New Tab</span>
    <span class="nb-menu__meta">Ctrl+T</span>
  </button>
  <div class="nb-menu__divider"></div>
  <div class="nb-menu__group">Danger zone</div>
  <button class="nb-menu__item is-disabled" role="menuitem">Clear data</button>
</div>
```

Parts: `__icon` (16px, muted → accent on hover), `__label` (truncating, flex),
`__meta` (right-aligned, 11px, muted), `__chevron` (submenu affordance),
`__divider`, `__group` (uppercase section label), `__footer`.
States: `:hover`, `.is-selected` (accent tint), `.is-disabled`.

Rules: menus are 14px radius, 6px padding, 2px gap, 28px rows, blurred glass
with `--nb-shadow-popup`. A menu never scrolls internally on chrome; use a
panel for long content.

When a menu lives in its own overlay view, size that view with
`menuOuterHeight(itemCount, dividerCount)` from `design-tokens.js` instead of
hard-coding a pixel height: it mirrors these metrics (border, padding, row,
divider, gap) and a test keeps it in sync with the tokens. Rounding a height
down clips the last row, because `.nb-menu` is `overflow: hidden`.

### 4.8 Popover — `.nb-popover`

Positioned floating surface for flyouts and anchored panels. Same skin as
`.nb-menu`, no internal layout. Add `position` via inline style or a layout
parent, never a new z-index.

### 4.9 Tooltip — `.nb-tooltip`

Small, non-interactive label. 11px type, 8px radius, `pointer-events: none`.

### 4.10 Modal — `.nb-modal`

```html
<div class="nb-modal" role="dialog" aria-modal="true">
  <div class="nb-modal__dialog">
    <header class="nb-modal__header">
      <div>
        <h2 class="nb-modal__title">Clear history?</h2>
        <p class="nb-modal__desc">This cannot be undone.</p>
      </div>
      <button class="nb-modal__close" aria-label="Close">×</button>
    </header>
    <div class="nb-modal__body">…</div>
    <footer class="nb-modal__footer">
      <button class="nb-btn nb-btn--ghost">Cancel</button>
      <button class="nb-btn nb-btn--danger">Clear</button>
    </footer>
  </div>
</div>
```

Sizes: `--sm` 360, default 460, `--lg` 640, `--xl` 860px.
Hide with `[hidden]` or `.is-hidden`. One primary action per modal, rightmost.

### 4.11 Badge, chip, keycap

```html
<span class="nb-badge">Default</span>
<span class="nb-badge nb-badge--accent">New</span>
<span class="nb-badge nb-badge--warning nb-badge--dot">Alpha</span>
<button class="nb-chip is-active">Filter</button>
<kbd class="nb-kbd">Ctrl</kbd>
```

Badges: 18px pill, uppercase 10px semibold. Variants `--accent/--success/
--warning/--danger`, `--dot` prefix. Chips: interactive 28px pill.
Keycaps: bordered, 20px, for shortcut hints.

### 4.12 Tabs — `.nb-tabs` `.nb-tab`

Underlined horizontal tabs. `aria-selected="true"` / `.is-active` draws the
2px accent underline.

### 4.13 Navigation — `.nb-nav` `.nb-nav__item`

Settings-style vertical nav. `.is-active` / `[aria-current="page"]` gets the
active fill; icons turn accent. `__badge` is a right-aligned count pill.

### 4.14 Empty state — `.nb-empty`

```html
<div class="nb-empty">
  <div class="nb-empty__icon"><svg …></svg></div>
  <div class="nb-empty__title">No downloads yet</div>
  <p class="nb-empty__desc">Files you download appear here.</p>
</div>
```

Every list must define its empty state. Copy is sentence case, no exclamation
marks.

### 4.15 Progress, spinner, skeleton

```html
<div class="nb-progress"><div class="nb-progress__bar" style="width:42%"></div></div>
<div class="nb-progress nb-progress--indeterminate"><div class="nb-progress__bar"></div></div>
<div class="nb-progress nb-progress--gradient"><div class="nb-progress__bar"></div></div>
<span class="nb-spinner"></span>
<div class="nb-skeleton nb-skeleton--title"></div>
```

`--gradient` is the brand loading bar (indigo → purple → pink → cyan).
Skeleton variants: `--text`, `--title`, `--avatar`.

### 4.16 Section and divider

```html
<section class="nb-section">
  <header class="nb-section__header">
    <h2 class="nb-section__title">Privacy</h2>
    <p class="nb-section__desc">Control what Napture stores.</p>
  </header>
  …
</section>
<hr class="nb-divider">
<div class="nb-divider nb-divider--vertical"></div>
```

### 4.17 Segmented control

```html
<div class="nb-segmented">
  <button class="nb-segmented__item is-active">Standard</button>
  <button class="nb-segmented__item">Strict</button>
</div>
```

### 4.18 Scroll region — `.nb-scroll`

Adds edge masking. Toggle `can-scroll-up` / `can-scroll-down` from JS based on
`scrollTop`:
`up = scrollTop > 0`, `down = scrollTop + clientHeight < scrollHeight - 1`.

---

## 5. Utilities

Layout: `.nb-u-flex`, `.nb-u-row`, `.nb-u-col`, `.nb-u-center`,
`.nb-u-between`, `.nb-u-end`, `.nb-u-wrap`, `.nb-u-grow`, `.nb-u-nogrow`,
`.nb-u-spacer`.
Spacing: `.nb-u-gap-1..7`, `.nb-u-mt-4`, `.nb-u-mb-6`.
Text: `.nb-u-muted`, `.nb-u-secondary`, `.nb-u-mono`, `.nb-u-text-xs`,
`.nb-u-text-sm`, `.nb-u-bold`, `.nb-u-nowrap`, `.nb-u-text-center`.
Behaviour: `.nb-u-hidden`, `.nb-u-truncate`, `.nb-u-selectable`, `.nb-u-sr-only`.

Utilities never carry colour/identity — they adjust layout or emphasis only.

---

## 6. Accessibility contracts

- Every icon-only button needs `aria-label`.
- Menus: `role="menu"` + `role="menuitem"`; disabled items use
  `aria-disabled="true"` or `.is-disabled`.
- Modals: `role="dialog"`, `aria-modal="true"`, labelled by the title.
- Lists that track selection: `aria-selected` (mirrored by `.is-active`).
- Never remove `:focus-visible` outlines; the system supplies them.
- Minimum hit target: `--nb-control-sm` (28px); `--nb-control-md` (32px) for
  primary chrome controls.
- Motion honours `prefers-reduced-motion` automatically.

---

## 7. Adding a new UI surface

1. Pick the surface: `data-nb-surface="chrome"` or `"page"`.
2. Load the system once:
   - Chrome renderer: `@import "../../styles/design-system.css";` (already done
     by `userChrome.css`).
   - Generated page: `${getSharedThemeCss()}` from
     `src/components/shared-ui.js`, or `<link rel="stylesheet" href="styles/design-system.css">`
     for static files.
3. Build with `.nb-*` components and layout primitives. No new colour or
   spacing literals.
4. Extend with page-scoped CSS only for composition (grid tracks, widths). If
   you need a new visual primitive, add it to `design-system.css` and document
   it here.
5. If the value must reach the main process, add it to `design-tokens.js` and
   run the tests — parity is enforced.

---

## 8. Migration status

| Surface | Status |
| --- | --- |
| `userChrome.css` (header, sidebar, tabs, menus, viewport) | Imports the system; local token block removed; 202 lines of duplicate rules removed. |
| `themes.css` legacy components | Compatibility layer over the system; no tokens of its own. |
| Settings page | System inlined; `data-nb-surface="page"`. |
| Downloads page | System inlined; `data-nb-surface="page"`. |
| History page | System inlined; `data-nb-surface="page"`. |
| Updater window | Linked; tokens only. |
| Context menu + omnibar overlays (`main.js`, `omnibar-popup.*`) | Built from `.nb-menu` / `.nb-menu__item`; the design system is inlined into the data-URL context menu. |
| Address-bar suggestions overlay | `.nb-card--list` + `.nb-list-item` (`.is-highlighted` for keyboard selection); system inlined into its data-URL document. |
| `src/constants/theme.js`, `src/components/ui-builder.js`, `src/components/shared-ui.js` | Thin adapters over the system. |

Every browser UI surface now renders from the design system. New UI should extend
`design-system.css` (and this document) rather than introduce surface-local
styles.
