import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { authMottoDot, authScreenBg } from '../../theme/authUi';

/**
 * Faint bottom ambient shapes — warmth without competing with the form.
 * Sits behind scroll content; pointerEvents none.
 */
export default function AuthAmbientBackground() {
  return (
    <View style={styles.layer} pointerEvents="none" accessibilityElementsHidden>
      <View style={[styles.orb, styles.orbBlueLeft]} />
      <View style={[styles.orb, styles.orbBlueRight]} />
      <View style={[styles.orb, styles.orbGold]} />
      <View style={styles.softHill} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: authScreenBg,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbBlueLeft: {
    width: 200,
    height: 200,
    left: -72,
    bottom: 48,
    backgroundColor: colors.primary,
    opacity: 0.06,
  },
  orbBlueRight: {
    width: 140,
    height: 140,
    right: -36,
    bottom: 100,
    backgroundColor: colors.primaryDark,
    opacity: 0.05,
  },
  orbGold: {
    width: 56,
    height: 56,
    right: 48,
    bottom: 168,
    backgroundColor: authMottoDot,
    opacity: 0.07,
  },
  softHill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    backgroundColor: colors.primarySoft,
    opacity: 0.28,
    borderTopLeftRadius: 56,
    borderTopRightRadius: 56,
  },
});
