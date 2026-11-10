import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useColors } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'caption' | 'code';
const styles: Record<Variant, TextStyle> = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  code: { fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: 6, fontVariant: ['tabular-nums'] },
};

export type AppTextProps = TextProps & { variant?: Variant; muted?: boolean; color?: string };

/** Text always scales with the system font size (no fixed heights anywhere), so 200% text still fits. */
export function Text({ variant = 'body', muted, color, style, ...rest }: AppTextProps) {
  const c = useColors();
  return <RNText {...rest} style={[styles[variant], { color: color ?? (muted ? c.textMuted : c.text) }, style]} />;
}
