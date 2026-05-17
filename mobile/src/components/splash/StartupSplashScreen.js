import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthAmbientBackground from '../auth/AuthAmbientBackground';
import BrandSplashAnimation from './BrandSplashAnimation';
import {
  BOOTSTRAP_LOADER_DELAY_MS,
  getSplashContentLift,
  splashTheme,
} from '../../theme/splash';

/**
 * Fullscreen branded startup — animation layer only; auth runs in parallel.
 */
export default function StartupSplashScreen({
  onAnimationComplete,
  showBootstrapLoader,
  splashOpacity,
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const contentLift = getSplashContentLift(screenHeight);
  const [showDelayedLoader, setShowDelayedLoader] = useState(false);
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const loaderDelayRef = useRef(null);

  useEffect(() => {
    if (loaderDelayRef.current) {
      clearTimeout(loaderDelayRef.current);
      loaderDelayRef.current = null;
    }

    if (!showBootstrapLoader) {
      setShowDelayedLoader(false);
      loaderOpacity.setValue(0);
      return;
    }

    loaderDelayRef.current = setTimeout(() => {
      setShowDelayedLoader(true);
      Animated.timing(loaderOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }, BOOTSTRAP_LOADER_DELAY_MS);

    return () => {
      if (loaderDelayRef.current) clearTimeout(loaderDelayRef.current);
    };
  }, [showBootstrapLoader, loaderOpacity]);

  const footerBottom = Math.max(insets.bottom + 20, 28);

  return (
    <View style={styles.root}>
      <AuthAmbientBackground />
      <StatusBar style="dark" backgroundColor={splashTheme.background} translucent={false} />
      {Platform.OS === 'android' ? (
        <View
          style={[styles.statusBarFill, { height: insets.top }]}
          pointerEvents="none"
        />
      ) : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.safeInner, { opacity: splashOpacity }]}>
          <View style={[styles.content, { marginTop: contentLift }]}>
            <BrandSplashAnimation onSequenceComplete={onAnimationComplete} />
          </View>
          <View style={[styles.footer, { bottom: footerBottom }]}>
            {showDelayedLoader ? (
              <Animated.View style={[styles.loaderWrap, { opacity: loaderOpacity }]}>
                <View style={styles.loaderTrack}>
                  <ActivityIndicator size="small" color={splashTheme.loader} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: splashTheme.background,
  },
  statusBarFill: {
    backgroundColor: splashTheme.background,
    width: '100%',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safeInner: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderTrack: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: splashTheme.loaderTrack,
  },
});
