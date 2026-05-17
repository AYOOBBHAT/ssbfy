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
 * Branded startup overlay — opacity controlled by parent for cross-fade.
 */
export default function StartupSplashScreen({
  onAnimationComplete,
  showBootstrapLoader,
  overlayOpacity,
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
        duration: 280,
        useNativeDriver: true,
      }).start();
    }, BOOTSTRAP_LOADER_DELAY_MS);

    return () => {
      if (loaderDelayRef.current) clearTimeout(loaderDelayRef.current);
    };
  }, [showBootstrapLoader, loaderOpacity]);

  const footerBottom = Math.max(insets.bottom + 16, 24);

  return (
    <Animated.View style={[styles.root, { opacity: overlayOpacity }]}>
      <AuthAmbientBackground />
      <StatusBar style="dark" backgroundColor={splashTheme.background} translucent={false} />
      {Platform.OS === 'android' ? (
        <View
          style={[styles.statusBarFill, { height: insets.top }]}
          pointerEvents="none"
        />
      ) : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.safeInner}>
          <View style={[styles.content, { marginTop: contentLift }]}>
            <BrandSplashAnimation onSequenceComplete={onAnimationComplete} />
          </View>
          {showDelayedLoader ? (
            <Animated.View
              style={[styles.footer, { bottom: footerBottom, opacity: loaderOpacity }]}
              pointerEvents="none"
            >
              <ActivityIndicator size="small" color={splashTheme.loader} />
            </Animated.View>
          ) : null}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
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
    opacity: 0.45,
  },
});
