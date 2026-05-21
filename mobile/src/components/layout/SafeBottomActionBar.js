import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  useBottomSafeInsets,
  useBottomSafeInsetsDevLog,
} from '../../hooks/useBottomSafeInsets';
import { safeAreaDevLog } from '../../utils/safeAreaDevLog';

/**
 * Wraps bottom CTAs (Finish, Submit, Prev/Next) so they sit above the system nav / gesture area.
 * Does not alter scroll regions — place fixed actions inside this bar below flex scroll content.
 */
function SafeBottomActionBar({ children, style, screenKey = null }) {
  const metrics = useBottomSafeInsets();
  useBottomSafeInsetsDevLog(screenKey, metrics);

  if (__DEV__ && screenKey) {
    safeAreaDevLog('bottom_action_bar_active', {
      screen: screenKey,
      paddingBottom: metrics.actionBarPadding,
    });
  }

  return (
    <View style={[styles.bar, metrics.actionBarStyle, style]}>
      {children}
    </View>
  );
}

export default memo(SafeBottomActionBar);

const styles = StyleSheet.create({
  bar: {
    paddingTop: 4,
  },
});
