import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { KEYBOARD_OFFSET_PRESETS } from '../../utils/keyboardConfig';
import KeyboardSafeScrollView from './KeyboardSafeScrollView';
import ScreenKeyboardContainer from './ScreenKeyboardContainer';

/**
 * Stack-screen form layout: keyboard container + scrollable body.
 * Use for Change Password, Battle Join, and future searchable forms.
 */
export default function FormScreenShell({
  children,
  contentContainerStyle,
  offsetPreset = KEYBOARD_OFFSET_PRESETS.stackHeader,
  backgroundColor = colors.bg,
}) {
  return (
    <ScreenKeyboardContainer
      style={[styles.root, { backgroundColor }]}
      offsetPreset={offsetPreset}
    >
      <KeyboardSafeScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        extraBottomPadding={24}
      >
        {children}
      </KeyboardSafeScrollView>
    </ScreenKeyboardContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, flexGrow: 1 },
});
