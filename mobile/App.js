import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  getStateFromPath,
  useNavigationContainerRef,
} from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { battleDeepLinkDevLog, parseBattleInviteFromUrl } from './src/utils/battleDeepLinkDevLog';
import { colors } from './src/theme/colors';
import { splashTheme } from './src/theme/splash';
import { markStartup } from './src/utils/startupTiming';

markStartup('app_start');
void SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: splashTheme.background,
    card: colors.card,
  },
};

const linkingConfig = {
  screens: {
    BattleJoin: {
      path: 'battle/:inviteCode',
      parse: { inviteCode: (code) => String(code || '').trim().toUpperCase() },
    },
  },
};

const linking = {
  prefixes: [
    Linking.createURL('/'),
    'ssbfy://',
    'https://api.jkssbfy.in',
    'https://ssbfy.app',
  ],
  config: linkingConfig,
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) {
      battleDeepLinkDevLog('initial_url', {
        url,
        inviteCode: parseBattleInviteFromUrl(url),
      });
    }
    return url;
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      battleDeepLinkDevLog('incoming_url', {
        url,
        inviteCode: parseBattleInviteFromUrl(url),
      });
      listener(url);
    });
    return () => subscription.remove();
  },
  getStateFromPath(path, options) {
    const state = getStateFromPath(path, options);
    const inviteCode = parseBattleInviteFromUrl(path) ?? parseBattleInviteFromUrl(`/${path}`);
    const matched = !!state?.routes?.some((r) => r.name === 'BattleJoin');
    battleDeepLinkDevLog('route_match', {
      path,
      inviteCode,
      matched,
      success: matched && !!inviteCode,
    });
    return state;
  },
};

function AppBootstrapRoot() {
  const navigationRef = useNavigationContainerRef();
  const { initializing } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
  const [rootLaidOut, setRootLaidOut] = useState(false);
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    markStartup('fonts_loaded', { strategy: 'none_configured' });
  }, []);

  useEffect(() => {
    if (!initializing) {
      markStartup('auth_restored');
    }
  }, [initializing]);

  const maybeHideSplash = useCallback(async () => {
    if (splashHiddenRef.current) return;
    if (initializing || !navigationReady || !rootLaidOut) return;
    splashHiddenRef.current = true;
    await SplashScreen.hideAsync();
    markStartup('splash_hidden', {
      routeName: navigationRef.getCurrentRoute()?.name ?? null,
    });
  }, [initializing, navigationReady, rootLaidOut, navigationRef]);

  useEffect(() => {
    void maybeHideSplash();
  }, [maybeHideSplash]);

  const handleRootLayout = useCallback(() => {
    setRootLaidOut(true);
  }, []);

  const handleNavigationReady = useCallback(() => {
    setNavigationReady(true);
    markStartup('first_screen_rendered', {
      routeName: navigationRef.getCurrentRoute()?.name ?? null,
    });
  }, [navigationRef]);

  return (
    <View onLayout={handleRootLayout} style={{ flex: 1, backgroundColor: splashTheme.background }}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: splashTheme.background }}>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          linking={linking}
          onReady={handleNavigationReady}
        >
          <AppNavigator />
        </NavigationContainer>
        <StatusBar style="dark" backgroundColor={splashTheme.background} />
      </GestureHandlerRootView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppBootstrapRoot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
