import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: splashTheme.background }}>
          <NavigationContainer theme={navigationTheme}>
            <AppNavigator />
          </NavigationContainer>
          <StatusBar style="dark" backgroundColor={splashTheme.background} />
        </GestureHandlerRootView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
