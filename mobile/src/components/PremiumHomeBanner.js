import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { premiumStyles } from '../theme/premiumUi';
import { pressFeedbackStyle } from '../utils/pressFeedback';

/**
 * Home tab — explore premium (soft gold accent, blue CTA).
 */
export function PremiumHomeBanner({ title, subtitle, buttonLabel, onPress }) {
  return (
    <View style={premiumStyles.homeBanner}>
      <View style={premiumStyles.homeIconWrap}>
        <Ionicons name="star-outline" size={26} color={colors.accent} />
      </View>
      <View style={premiumStyles.homeBody}>
        <Text style={premiumStyles.homeTitle}>{title}</Text>
        <Text style={premiumStyles.homeSub}>{subtitle}</Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [premiumStyles.ctaButton, pressFeedbackStyle(pressed)]}
        >
          <Text style={premiumStyles.ctaButtonText}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
