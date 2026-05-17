import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { SPLASH_EXIT_FADE_MS } from '../theme/splash';

/**
 * Cold-start only: after first successful exit, splash is skipped on resume.
 */
let startupSplashConsumed = false;

/**
 * Branded splash gate — animation complete AND auth bootstrap ready before exit.
 * Fades out briefly to avoid a hard cut into Login/Home.
 */
export function useStartupSplash(initializing) {
  const skipSplash = startupSplashConsumed;
  const [animationComplete, setAnimationComplete] = useState(skipSplash);
  const [visible, setVisible] = useState(!skipSplash);
  const exitStartedRef = useRef(false);
  const opacity = useRef(new Animated.Value(skipSplash ? 0 : 1)).current;

  const onAnimationComplete = useCallback(() => {
    setAnimationComplete(true);
  }, []);

  useEffect(() => {
    if (skipSplash || exitStartedRef.current) return;
    if (!animationComplete || initializing) return;

    exitStartedRef.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: SPLASH_EXIT_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      startupSplashConsumed = true;
      setVisible(false);
    });
  }, [animationComplete, initializing, opacity, skipSplash]);

  return {
    showSplash: visible,
    splashOpacity: opacity,
    animationComplete,
    showBootstrapLoader: visible && animationComplete && initializing,
    onAnimationComplete: skipSplash ? () => {} : onAnimationComplete,
  };
}
