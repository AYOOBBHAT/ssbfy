import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import {
  findNodeHandle,
  Platform,
  ScrollView,
  UIManager,
} from 'react-native';
import { useKeyboardInsets } from '../../hooks/useKeyboardInsets';
import { getScrollToFieldDelay } from '../../utils/keyboardConfig';
import { keyboardDevLog } from '../../utils/keyboardDevLog';

const KeyboardFormContext = createContext(null);

/** Extra space below the focused field when scrolling into view. */
const SCROLL_FIELD_BUFFER = 56;

/**
 * ScrollView with scroll-to-focused-input and light keyboard inset padding.
 * Pair with ScreenKeyboardContainer on form screens.
 */
export default function KeyboardSafeScrollView({
  children,
  contentContainerStyle,
  scrollRef,
  extraBottomPadding = 0,
  ...scrollProps
}) {
  const internalRef = useRef(null);
  const scrollViewRef = scrollRef || internalRef;
  const { keyboardHeight, keyboardVisible } = useKeyboardInsets();

  const scrollToField = useCallback(
    (fieldRef) => {
      const scrollNode = findNodeHandle(scrollViewRef.current);
      const fieldNode = findNodeHandle(fieldRef?.current);
      if (!scrollNode || !fieldNode) return;

      UIManager.measureLayout(
        fieldNode,
        scrollNode,
        () => {
          keyboardDevLog('scroll_measure_fail', {});
        },
        (x, y, width, height) => {
          const targetY = Math.max(0, y - SCROLL_FIELD_BUFFER);
          scrollViewRef.current?.scrollTo({
            y: targetY,
            animated: true,
          });
          keyboardDevLog('scroll_to_field', {
            y,
            height,
            targetY,
            keyboardHeight,
          });
        }
      );
    },
    [keyboardHeight, scrollViewRef]
  );

  const registerScrollToField = useCallback(
    (fieldRef) => {
      if (!fieldRef?.current) return;
      const delay = getScrollToFieldDelay();
      setTimeout(() => scrollToField(fieldRef), delay);
    },
    [scrollToField]
  );

  const contextValue = useMemo(
    () => ({ registerScrollToField }),
    [registerScrollToField]
  );

  const keyboardPadding =
    keyboardVisible && Platform.OS === 'android'
      ? Math.max(16, Math.round(keyboardHeight * 0.08))
      : keyboardVisible && Platform.OS === 'ios'
        ? 12
        : 0;

  return (
    <KeyboardFormContext.Provider value={contextValue}>
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          contentContainerStyle,
          keyboardPadding > 0 && { paddingBottom: keyboardPadding + extraBottomPadding },
        ]}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardFormContext.Provider>
  );
}

/** Call from inputs (AuthField, etc.) to scroll the focused field into view. */
export function useKeyboardSafeField() {
  return useContext(KeyboardFormContext);
}
