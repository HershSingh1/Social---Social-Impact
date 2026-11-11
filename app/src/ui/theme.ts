// Design tokens from the Figma Style Guide (file CUXYzgoB8YBvoorBUj1Oly: Style Guide frame 28:2944 plus the
// Onboarding, Home & Groups, Discover and Planning Flow sections). Names follow Figma's variable names.
// Screens read from here and never hard-code a color, size or font.
//
// Not from Figma yet: `space` and `radius` below. Figma has no variables for them, so they still need to be
// compared against the Components page (see TEC-6).

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

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

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
