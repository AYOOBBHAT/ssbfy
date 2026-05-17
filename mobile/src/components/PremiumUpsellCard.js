import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { premiumStyles } from '../theme/premiumUi';
import { pressFeedbackStyle } from '../utils/pressFeedback';

/**
 * Calm premium upsell — Notes, PDF, and similar surfaces.
 */
export function PremiumUpsellCard({ title, subtitle, onPress, icon = 'sparkles-outline' }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [premiumStyles.upsellCard, pressFeedbackStyle(pressed)]}
      accessibilityRole="button"
    >
      <View style={premiumStyles.upsellRow}>
        <View style={premiumStyles.upsellIconWrap}>
          <Ionicons name={icon} size={20} color={colors.accent} />
        </View>
        <View style={premiumStyles.upsellBody}>
          <Text style={premiumStyles.upsellTitle}>{title}</Text>
          <Text style={premiumStyles.upsellSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}
