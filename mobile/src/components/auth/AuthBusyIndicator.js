import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { splashTheme } from '../../theme/splash';

/**
 * Branded spinner for auth actions. `prominent` uses a larger indicator so
 * slow Android devices still read clearly as “working”, not frozen.
 */
export default function AuthBusyIndicator({
  color = colors.textOnPrimary,
  /** @type {'small' | 'large' | number} */
  size,
  prominent = false,
  track = false,
  /** Light well behind spinner (primary buttons on blue). */
  onPrimary = false,
}) {
  const resolvedSize =
    size ?? (prominent ? (Platform.OS === 'android' ? 28 : 24) : 'small');

  const indicator = (
    <ActivityIndicator
      size={resolvedSize}
      color={onPrimary ? colors.primary : color}
      animating
      hidesWhenStopped={false}
    />
  );

  const core = onPrimary ? (
    <View style={styles.primaryWell}>{indicator}</View>
  ) : (
    indicator
  );

  if (!track) return core;

  return <View style={styles.track}>{core}</View>;
}

const styles = StyleSheet.create({
  primaryWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  track: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: splashTheme.loaderTrack,
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
