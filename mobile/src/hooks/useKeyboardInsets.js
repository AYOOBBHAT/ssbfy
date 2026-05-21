import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { keyboardDevLog } from '../utils/keyboardDevLog';

/**
 * Lightweight keyboard height listener — one subscription per screen that opts in.
 */
export function useKeyboardInsets() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e) => {
      const height = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
      setKeyboardVisible(true);
      keyboardDevLog('keyboard_show', { height, platform: Platform.OS });
    };

    const onHide = () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
      keyboardDevLog('keyboard_hide', { platform: Platform.OS });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return { keyboardHeight, keyboardVisible };
}
