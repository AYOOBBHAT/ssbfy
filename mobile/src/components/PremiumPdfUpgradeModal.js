import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, brand } from '../theme/colors';
import { premiumUi } from '../theme/premiumUi';
import { pressFeedbackStyle } from '../utils/pressFeedback';

const BENEFITS = [
  '500+ Exam PDFs',
  'Topic-wise Notes',
  'Latest Updates',
  'Unlimited Reading',
  'Saved Materials',
  'Future Premium Content',
];

/**
 * Calm upgrade modal for PDF discovery / saved materials.
 *
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 *   onUpgrade: () => void,
 *   title?: string,
 *   subtitle?: string,
 * }} props
 */
export function PremiumPdfUpgradeModal({
  visible,
  onClose,
  onUpgrade,
  title = 'Unlock Premium PDFs',
  subtitle = `Access the complete ${brand.name} PDF Library.`,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropHit} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.iconRing}>
            <Ionicons name="diamond" size={26} color={colors.accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.benefits}>
            {BENEFITS.map((line) => (
              <View key={line} style={styles.benefitRow}>
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={14} color={colors.success} />
                </View>
                <Text style={styles.benefitText}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={onUpgrade}
            style={({ pressed }) => [styles.primaryBtn, pressFeedbackStyle(pressed)]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Upgrade Now</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryBtn, pressFeedbackStyle(pressed)]}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Maybe Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const sheetShadow = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  android: { elevation: 8 },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  backdropHit: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...sheetShadow,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  benefits: {
    marginTop: 18,
    marginBottom: 8,
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: premiumUi.radius.btn,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
