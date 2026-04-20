import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import HomeScreen from '../screens/HomeScreen';
import TestScreen from '../screens/TestScreen';
import ResultScreen from '../screens/ResultScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import { colors, brand } from '../theme/colors';

const Stack = createNativeStackNavigator();

const themedHeader = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textOnPrimary,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
};

export default function AppNavigator() {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.bootBrand}>{brand.name}</Text>
        <Text style={styles.bootText}>Loading...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={isAuthenticated ? 'app' : 'auth'}
      screenOptions={{ ...themedHeader, headerShown: true }}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: brand.name }}
          />
          <Stack.Screen name="Test" component={TestScreen} options={{ title: 'Test' }} />
          <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'Result' }} />
          <Stack.Screen
            name="Leaderboard"
            component={LeaderboardScreen}
            options={{ title: 'Leaderboard' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: brand.name }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Sign up' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  bootBrand: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  bootText: { marginTop: 6, color: colors.muted },
});
