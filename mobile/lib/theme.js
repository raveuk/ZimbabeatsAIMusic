// Design tokens for the app. Every screen + component pulls from here so the
// visual language stays consistent — change one value, every screen updates.
// Modelled on Suno's dark UI: near-black background, warm orange accent,
// 8-pt spacing, generous border-radius.

export const colors = {
  // Backgrounds, ordered darkest to lightest.
  bg:        "#0a0a0f", // page background
  surface:   "#15151c", // cards, sheets
  surface2:  "#1f1f29", // raised elements, inputs
  surface3:  "#2a2a37", // hover/pressed
  divider:   "#262631",

  // Text hierarchy.
  text:      "#fafaff",
  textMute:  "#a5a5b8",
  textFade:  "#6b6b80",

  // Accent — hot pink (matches fspecii/ace-step-ui).
  accent:    "#ff69b4",
  accentSoft:"#ff8fc8",
  accentDeep:"#e84697",

  // Status.
  success:   "#22c55e",
  warn:      "#f59e0b",
  danger:    "#ef4444",
};

// 8-point grid. Use these by name everywhere; never hand-roll a margin/padding.
export const space = {
  xxs: 4, xs: 6, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, pill: 999,
};

export const typography = {
  // System stack — RN web uses these natively; on iOS/Android they map to
  // San Francisco / Roboto which both render well at all sizes.
  family: '-apple-system, "Segoe UI", Roboto, Inter, system-ui, sans-serif',
  // Font sizes, named by visual role.
  h1: { fontSize: 30, fontWeight: "800", letterSpacing: -0.4 },
  h2: { fontSize: 22, fontWeight: "700", letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "400" },
  meta: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 12, fontWeight: "500" },
};

// Common shadow recipes (work via boxShadow on web, elevation on Android).
export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};
