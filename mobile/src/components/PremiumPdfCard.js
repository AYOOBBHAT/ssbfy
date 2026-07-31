import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { premiumUi } from '../theme/premiumUi';
import { pressCardStyle } from '../utils/pressFeedback';
import { formatFileSize } from '../services/pdfService';

/**
 * @param {string | Date | null | undefined} value
 */
export function formatPdfUploadedLabel(value) {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'Uploaded recently';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Uploaded just now';
  if (mins < 60) return `Uploaded ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Uploaded ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Uploaded 1 day ago';
  if (days < 30) return `Uploaded ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Uploaded ${months} mo ago`;
  return `Uploaded ${new Date(t).toLocaleDateString()}`;
}

/**
 * Discovery / open card for PDF notes.
 *
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   pages?: number | null,
 *   fileSize?: number | string | null,
 *   createdAt?: string | Date | null,
 *   locked?: boolean,
 *   isOpening?: boolean,
 *   onPress?: () => void,
 *   onUnlockPress?: () => void,
 * }} props
 */
function PremiumPdfCardImpl({
  title,
  subtitle,
  pages,
  fileSize,
  createdAt,
  locked = false,
  isOpening = false,
  onPress,
  onUnlockPress,
}) {
  const sizeLabel =
    typeof fileSize === 'string' && fileSize.trim()
      ? fileSize.trim()
      : formatFileSize(fileSize);
  const uploaded = formatPdfUploadedLabel(createdAt);
  const pagesLabel =
    pages != null && Number.isFinite(Number(pages)) && Number(pages) > 0
      ? `${Math.floor(Number(pages))} Pages`
      : null;

  const metaParts = [pagesLabel, sizeLabel || null, uploaded || null].filter(Boolean);

  return (
    <Pressable
      onPress={locked ? onUnlockPress || onPress : onPress}
      disabled={isOpening}
      style={({ pressed }) => [
        styles.card,
        locked && styles.cardLocked,
        pressCardStyle(pressed, isOpening),
        isOpening && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${title}, Premium` : title}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, locked && styles.iconWrapLocked]}>
          <Text style={[styles.iconText, locked && styles.iconTextLocked]}>PDF</Text>
          {locked ? (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={10} color={colors.textOnPrimary} />
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title || 'Untitled PDF'}
            </Text>
            {locked ? (
              <View style={styles.premiumPill}>
                <Text style={styles.premiumPillText}>PREMIUM</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {metaParts.length ? (
            <Text style={styles.meta} numberOfLines={2}>
              {metaParts.join('  ·  ')}
            </Text>
          ) : null}
          {locked ? (
            <View style={styles.unlockRow}>
              <Ionicons name="lock-closed" size={14} color={colors.accent} />
              <Text style={styles.unlockText}>Unlock PDF</Text>
            </View>
          ) : (
            <Text style={styles.openHint} numberOfLines={1}>
              {isOpening ? 'Opening…' : 'Tap to open'}
            </Text>
          )}
        </View>

        <Ionicons
          name={locked ? 'diamond-outline' : 'chevron-forward'}
          size={18}
          color={locked ? colors.accent : colors.muted}
        />
      </View>
    </Pressable>
  );
}

export const PremiumPdfCard = memo(PremiumPdfCardImpl);

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: premiumUi.radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...cardShadow,
  },
  cardLocked: {
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapLocked: {
    backgroundColor: colors.accentSoft,
  },
  iconText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  iconTextLocked: {
    color: colors.accent,
  },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  premiumPill: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.muted,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  unlockRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unlockText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  openHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  disabled: { opacity: 0.65 },
});
