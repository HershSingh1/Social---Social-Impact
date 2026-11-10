import { useColorScheme } from 'react-native';

export const lightColors = {
  bg: '#FFFFFF', surface: '#F4F6F9', card: '#FFFFFF', border: '#D9DEE5',
  text: '#14171C', textMuted: '#55606E',
  primary: '#1B5FD9', onPrimary: '#FFFFFF', primarySoft: '#E5EDFB',
  danger: '#B3261E', onDanger: '#FFFFFF', dangerSoft: '#FCE8E6',
  success: '#1B7A43', successSoft: '#E1F3E8',
  warn: '#8A5300', warnSoft: '#FFF0D4',
  skeleton: '#E6EAF0',
};
export type Colors = typeof lightColors;

export const darkColors: Colors = {
  bg: '#0E1116', surface: '#171B22', card: '#171B22', border: '#2B323D',
  text: '#F1F3F6', textMuted: '#A5AEBB',
  primary: '#7FA8FF', onPrimary: '#0A1630', primarySoft: '#1C2A48',
  danger: '#FF8F86', onDanger: '#2D0A07', dangerSoft: '#3A1815',
  success: '#6FD59A', successSoft: '#12301F',
  warn: '#F2B84B', warnSoft: '#35280D',
  skeleton: '#232A35',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/** Minimum tap target (points): spec "tap targets at least 44 x 44 pt". */
export const MIN_TAP = 44;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}
