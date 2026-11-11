// Design tokens from the Figma Style Guide (file CUXYzgoB8YBvoorBUj1Oly: Style Guide frame 28:2944 plus the
// Onboarding, Home & Groups, Discover and Planning Flow sections). Names follow Figma's variable names.
// Screens read from here and never hard-code a color, size or font.
//
// Figma has no variables for spacing, radii or shadows. `radius`, `inset`, `size` and `shadow` below are
// measured from the nodes named in their comments (Components page 3:2 and the Discover, Planning Flow and
// Activity frames). `space` is a general scale for gaps between things and is not read from one node.

export const color = {
  // Surfaces
  bg: '#ffffff', // bg/canvas
  surface: '#fbf2f2', // bg/subtle
  muted: '#f3e3e5', // bg/muted
  strong: '#e9d3d6', // bg/strong

  // Text
  text: '#2b1119', // text/primary (17.5:1 on bg)
  textSecondary: '#6b4e58', // text/secondary (7.4:1 on bg)
  textMuted: '#6b4e58', // alias of textSecondary for placeholders and hints
  // text/tertiary is only 3.0:1 on bg and 2.7:1 on surface. Use it for large or decorative text, never for
  // small text that people need to read.
  textTertiary: '#a88e96',

  // Fills
  primary: '#431d2d', // fill/primary
  onPrimary: '#ffffff', // fill/on-primary (14.5:1 on primary)
  overlay: '#2b1119', // fill/overlay

  // Borders
  line: '#f0e1e3', // border/default
  lineStrong: '#e2cbcf', // border/strong

  // Accents. Figma's names are kept; accent/blue is really a yellow-orange and accent/green-soft is a pink.
  orange: '#f5a93b', // accent/orange
  orangeSoft: '#fff0d6', // accent/orange-soft
  orangeInk: '#8a4b05', // accent/orange-ink (6.1:1 on orangeSoft)
  blue: '#ffc46b', // accent/blue
  blueSoft: '#fff3de', // accent/blue-soft
  blueInk: '#431d2d', // accent/blue-ink
  greenSoft: '#f7e3e5', // accent/green-soft
  greenInk: '#431d2d', // accent/green-ink

  // Heat scale (heat/1 to heat/4), lightest to darkest
  heat: ['#ffefd6', '#ffc46b', '#7a3a50', '#431d2d'],
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Corner radii as measured in Figma.
export const radius = {
  xs: 6, // Tag (4:175)
  sm: 10, // Small button (4:159), Input field (4:201), image tile (28:4880)
  md: 12, // Large button (4:157)
  lg: 16, // Card (28:5705)
  xl: 20, // Top corners of the bottom sheet (28:4876)
  pill: 999, // Chip (4:170 is 17 on a 34 pt height, so a full pill)
} as const;

// Padding and gaps inside components, as measured in Figma.
export const inset = {
  buttonLarge: 20, // horizontal, Large button (4:157)
  buttonSmall: 14, // horizontal, Small button (4:159)
  chip: 14, // horizontal (4:170)
  tag: 8, // horizontal (4:175)
  field: 14, // horizontal, Input field (4:201)
  fieldGap: 6, // between an Input's label and its field (4:199)
  cardX: 16, cardY: 12, // Card (28:5705)
  sheetX: 20, sheetTop: 10, sheetGap: 14, // Bottom sheet (28:4876); its bottom padding is the 34 pt home-indicator inset
  screen: 20, // side padding of screen content: 157 elements sit at x = 20 in the 390 pt frames (only the sides are measured)
  avatarOverlap: 0.3, // share of an avatar's width that the next one covers: 24 pt steps 17 pt (7 pt), 32 pt steps 22 pt (10 pt)
} as const;

// Fixed sizes as measured in Figma. Hit areas still grow to `minTap` where a control is smaller.
export const size = {
  buttonLarge: 52, // (4:157)
  buttonSmall: 36, // (4:159)
  chip: 34, // (4:170)
  tag: 24, // (4:175)
  field: 48, // (4:201)
  codeBox: 58, // one box of the join code entry (28:3061)
  thumb: 56, // image tile in a list card (28:3640)
  avatar: { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 }, // Avatar sizes (4:182 to 4:190)
  grabber: { width: 36, height: 5, radius: 3 }, // Bottom sheet handle (28:4877)
} as const;

// Shadows as measured in Figma, as React Native `boxShadow` layers (supported on RN 0.88).
export const shadow = {
  // Card (28:5705): 0 8 24 -4 rgba(66,28,46,.09), 0 1 3 rgba(66,28,46,.05)
  card: [
    { offsetX: 0, offsetY: 8, blurRadius: 24, spreadDistance: -4, color: 'rgba(66,28,46,0.09)' },
    { offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(66,28,46,0.05)' },
  ],
  // Primary button on the screen frames (28:4908): 0 1 1 rgba(67,29,45,.12), 0 4 6 rgba(67,29,45,.28)
  button: [
    { offsetX: 0, offsetY: 1, blurRadius: 1, color: 'rgba(67,29,45,0.12)' },
    { offsetX: 0, offsetY: 4, blurRadius: 6, color: 'rgba(67,29,45,0.28)' },
  ],
} as const;

// Font families are loaded in `fonts.ts`. Custom fonts need one family name per weight, so there is no fontWeight.
const inter = { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold' } as const;
const jakarta = { bold: 'PlusJakartaSans_700Bold', extrabold: 'PlusJakartaSans_800ExtraBold' } as const;

const title1 = { fontFamily: jakarta.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 } as const;
const title2 = { fontFamily: jakarta.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 } as const;

export const type = {
  display: { fontFamily: jakarta.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 }, // Hi-Fi/Display
  title1, // Hi-Fi/Title 1
  title2, // Hi-Fi/Title 2
  headline: { fontFamily: jakarta.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 }, // Hi-Fi/Headline
  body: { fontFamily: inter.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 }, // Hi-Fi/Body
  bodyStrong: { fontFamily: inter.medium, fontSize: 15, lineHeight: 22, letterSpacing: 0 }, // Hi-Fi/Body Strong
  callout: { fontFamily: inter.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0 }, // Hi-Fi/Callout
  subhead: { fontFamily: inter.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0 }, // Hi-Fi/Subhead
  caption: { fontFamily: inter.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0 }, // Hi-Fi/Caption
  captionStrong: { fontFamily: inter.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0 }, // Hi-Fi/Caption Strong
  overline: { fontFamily: inter.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 }, // Hi-Fi/Overline
  tab: { fontFamily: inter.semibold, fontSize: 10, lineHeight: 12, letterSpacing: 0.1 }, // Hi-Fi/Tab

  // Names the existing components already use
  title: title1,
  heading: title2,
} as const;

/** Minimum tap target (spec: 44 x 44 pt). */
export const minTap = 44;
