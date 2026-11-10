import { View } from 'react-native';
import type { Category } from '@/types/database';
import { Text, radius } from '@/shared/ui';
import { categoryLabel, categoryTint } from './categories';

/** Category placeholder used wherever an experience has no photo (the catalog has no image column yet). Decorative. */
export function CategoryArt({ category, height = 64, width, rounded = radius.md, showLabel = false }: {
  category: Category; height?: number; width?: number; rounded?: number; showLabel?: boolean;
}) {
  const label = categoryLabel(category);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height, width: width ?? height, borderRadius: rounded, backgroundColor: categoryTint(category),
        alignItems: 'center', justifyContent: 'center', padding: 8,
      }}
    >
      <Text variant={showLabel ? 'heading' : 'bodyStrong'} color="#FFFFFF" allowFontScaling={false}>
        {showLabel ? label : label[0]}
      </Text>
    </View>
  );
}
