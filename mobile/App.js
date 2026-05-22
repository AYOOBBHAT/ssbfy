import { DefaultTheme, NavigationContainer, getStateFromPath } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { battleDeepLinkDevLog, parseBattleInviteFromUrl } from './src/utils/battleDeepLinkDevLog';
import { colors } from './src/theme/colors';
import { splashTheme } from './src/theme/splash';

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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: splashTheme.background }}>
          <NavigationContainer theme={navigationTheme} linking={linking}>
            <AppNavigator />
          </NavigationContainer>
          <StatusBar style="dark" backgroundColor={splashTheme.background} />
        </GestureHandlerRootView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
