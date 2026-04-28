import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';

const TEST_TYPE = { SUBJECT: 'subject', POST: 'post' };

function humanizeTitle(rawTitle, index) {
  const raw = (rawTitle || 'Mock test').trim();
  const words = raw.replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  const upper = words
    .map((w) => {
      if (/^jkssb$/i.test(w)) return 'JKSSB';
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
  if (/jkssb/i.test(raw) && /(test|mock)/i.test(raw)) {
    return `JKSSB Full Mock #${index + 1}`;
  }
  return upper || `Mock test #${index + 1}`;
}

function typeBadgeLabel(type) {
  if (type === TEST_TYPE.POST) return 'Full syllabus';
  if (type === TEST_TYPE.SUBJECT) return 'Subject focus';
  return 'Mock';
}

export function MockTestCard({ item, index, onStart, isStarting }) {
  const title = humanizeTitle(item?.title, index);
  const duration = Number(item?.duration) || 0;
  const qCount = Array.isArray(item?.questionIds) ? item.questionIds.length : 0;
  const badge = typeBadgeLabel(item?.type);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>
            {qCount > 0 ? `${qCount} Questions` : 'Timed mock'}
            {' • '}
            {duration} mins
          </Text>
        </View>
        <View style={[styles.badge, badge === 'Full syllabus' && styles.badgeFull]}>
          <Text style={[styles.badgeText, badge === 'Full syllabus' && styles.badgeTextFull]}>
            {badge}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => onStart(item)}
        disabled={isStarting}
        style={({ pressed }) => [
          styles.startBtn,
          pressed && styles.pressed,
          isStarting && styles.disabled,
        ]}
      >
        <Text style={styles.startBtnText}>{isStarting ? 'Starting…' : 'Start test'}</Text>
        <Ionicons name="play" size={16} color={colors.textOnPrimary} style={styles.playIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-start',
  },
  badgeFull: {
    backgroundColor: '#eff6ff',
    borderColor: colors.primaryDark,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgeTextFull: {
    color: colors.primaryDark,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  startBtnText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  playIcon: { marginLeft: 8 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
});
