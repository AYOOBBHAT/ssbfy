import { KeyboardAvoidingView, Platform, View } from 'react-native';
import {
  KEYBOARD_AVOID_BEHAVIOR,
  KEYBOARD_OFFSET_PRESETS,
  useKeyboardVerticalOffset,
} from '../../utils/keyboardConfig';

/**
 * Platform-correct keyboard avoidance wrapper.
 * iOS: KeyboardAvoidingView padding. Android: adjustResize (no KAV — avoids double padding).
 */
export default function ScreenKeyboardContainer({
  children,
  style,
  offsetPreset = KEYBOARD_OFFSET_PRESETS.none,
  enabled = true,
}) {
  const keyboardVerticalOffset = useKeyboardVerticalOffset(offsetPreset);

  if (!enabled || Platform.OS === 'android') {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={KEYBOARD_AVOID_BEHAVIOR}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
