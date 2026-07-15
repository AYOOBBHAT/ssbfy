import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { pressCardStyle } from '../../utils/pressFeedback';
import { FEEDBACK_MENU_ITEMS } from '../../constants/feedbackTypes';
import { isFeedbackFormConfigured } from '../../config/feedbackConfig';
import { confirmAndOpenFeedbackForm } from '../../utils/feedbackForm';

export default function SupportFeedbackSection() {
  const configured = isFeedbackFormConfigured();

  return (
    <>
      <Text style={styles.sectionLabel}>Support & Feedback</Text>
      <View style={styles.card}>
        {FEEDBACK_MENU_ITEMS.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={configured ? item.subtitle : 'Feedback form is not configured yet'}
            accessibilityState={{ disabled: !configured }}
            disabled={!configured}
            onPress={() =>
              confirmAndOpenFeedbackForm({
                type: item.type,
                analyticsEvent: item.analyticsEvent,
              })
            }
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.rowDivider,
              !configured && styles.rowDisabled,
              configured && pressCardStyle(pressed),
            ]}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={configured ? colors.text : colors.muted}
            />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, !configured && styles.rowTitleDisabled]}>
                {item.title}
              </Text>
              <Text style={styles.rowSub}>{item.subtitle}</Text>
            </View>
            <Ionicons
              name="open-outline"
              size={20}
              color={configured ? colors.muted : colors.border}
            />
          </Pressable>
        ))}
      </View>

      {!configured ? (
        <Text style={styles.configHint}>Feedback form is not configured yet.</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    minHeight: 64,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowTitleDisabled: { color: colors.muted },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  configHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
