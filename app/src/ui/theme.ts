// Design tokens. Placeholder values until they are pulled from the Figma file
// (Event-Planning-App, node 28-2943). Screens must read from here, never hard-code.
export const color = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#111111',
  textMuted: '#6B6B6B',
  line: '#E0E0E0',
  primary: '#111111',
  onPrimary: '#FFFFFF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

/** Minimum tap target (spec: 44 x 44 pt). */
export const minTap = 44;
