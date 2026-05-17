import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import {
  APP_ENTER_FADE_DELAY_MS,
  APP_ENTER_FADE_MS,
  SPLASH_EXIT_FADE_MS,
} from '../theme/splash';
import { authScreenBg } from '../theme/authUi';

let startupSplashConsumed = false;

const EASE = Easing.out(Easing.cubic);

/**
 * Splash gate with cross-fade into app — splash and Login/Home overlap briefly.
 */
export function useStartupSplash(initializing) {
  const skipSplash = startupSplashConsumed;
  const [animationComplete, setAnimationComplete] = useState(skipSplash);
  const [overlayVisible, setOverlayVisible] = useState(!skipSplash);
  const [appRevealed, setAppRevealed] = useState(skipSplash);
  const exitStartedRef = useRef(false);

  const splashOpacity = useRef(new Animated.Value(skipSplash ? 0 : 1)).current;
  const appOpacity = useRef(new Animated.Value(skipSplash ? 1 : 0)).current;

  const onAnimationComplete = useCallback(() => {
    setAnimationComplete(true);
  }, []);

  useEffect(() => {
    if (skipSplash || exitStartedRef.current) return;
    if (!animationComplete || initializing) return;

    exitStartedRef.current = true;
    setAppRevealed(true);

    Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: SPLASH_EXIT_FADE_MS,
        easing: EASE,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(APP_ENTER_FADE_DELAY_MS),
        Animated.timing(appOpacity, {
          toValue: 1,
          duration: APP_ENTER_FADE_MS,
          easing: EASE,
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (!finished) return;
      startupSplashConsumed = true;
      setOverlayVisible(false);
    });
  }, [animationComplete, initializing, splashOpacity, appOpacity, skipSplash]);

  return {
    overlayVisible,
    appRevealed,
    splashOpacity,
    appOpacity,
    animationComplete,
    showBootstrapLoader: overlayVisible && animationComplete && initializing,
    onAnimationComplete: skipSplash ? () => {} : onAnimationComplete,
    rootStyle: styles.root,
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authScreenBg,
  },
});
