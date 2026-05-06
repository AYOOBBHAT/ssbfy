import {
  Platform,
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import VerifyOtpScreen from '../screens/VerifyOtpScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import TestsListScreen from '../screens/TestsListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TestScreen from '../screens/TestScreen';
import ResultScreen from '../screens/ResultScreen';
import ReviewAnswersScreen from '../screens/ReviewAnswersScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import PdfListScreen from '../screens/PdfListScreen';
import NotesListScreen from '../screens/NotesListScreen';
import NoteDetailScreen from '../screens/NoteDetailScreen';
import PremiumScreen from '../screens/PremiumScreen';
import SmartPracticeScreen from '../screens/SmartPracticeScreen';
import SavedMaterialsScreen from '../screens/SavedMaterialsScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import { colors, brand } from '../theme/colors';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const PracticeStack = createNativeStackNavigator();
const TestsStack = createNativeStackNavigator();
const LeaderboardStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const themedHeader = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textOnPrimary,
  headerTitleStyle: { fontWeight: '700' },
  headerShadowVisible: false,
};

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ ...themedHeader }}>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ title: brand.name }}
      />
    </HomeStack.Navigator>
  );
}

function PracticeStackNavigator() {
  return (
    <PracticeStack.Navigator screenOptions={{ ...themedHeader }}>
      <PracticeStack.Screen
        name="PracticeMain"
        component={SmartPracticeScreen}
        options={{ title: 'Practice' }}
      />
    </PracticeStack.Navigator>
  );
}

function TestsStackNavigator() {
  return (
    <TestsStack.Navigator screenOptions={{ ...themedHeader }}>
      <TestsStack.Screen
        name="TestsMain"
        component={TestsListScreen}
        options={{ title: 'Mock tests' }}
      />
    </TestsStack.Navigator>
  );
}

function LeaderboardStackNavigator() {
  return (
    <LeaderboardStack.Navigator screenOptions={{ ...themedHeader }}>
      <LeaderboardStack.Screen
        name="LeaderboardMain"
        component={LeaderboardScreen}
        options={{ title: 'Leaderboard' }}
      />
    </LeaderboardStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ ...themedHeader }}>
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </ProfileStack.Navigator>
  );
}

const tabIcons = {
  Home: 'home-outline',
  Practice: 'book-outline',
  Tests: 'clipboard-outline',
  Leaderboard: 'trophy-outline',
  Profile: 'person-outline',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 22 : 10,
          minHeight: Platform.OS === 'ios' ? 84 : 62,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
            },
            android: { elevation: 10 },
          }),
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={tabIcons[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Practice"
        component={PracticeStackNavigator}
        options={{ tabBarLabel: 'Practice' }}
      />
      <Tab.Screen
        name="Tests"
        component={TestsStackNavigator}
        options={{ tabBarLabel: 'Tests' }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardStackNavigator}
        options={{ tabBarLabel: 'Leaderboard' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

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
    <RootStack.Navigator
      key={isAuthenticated ? 'app' : 'auth'}
      screenOptions={{ ...themedHeader, headerShown: true }}
    >
      {isAuthenticated ? (
        <>
          <RootStack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen name="Test" component={TestScreen} options={{ title: 'Test' }} />
          <RootStack.Screen name="Result" component={ResultScreen} options={{ title: 'Result' }} />
          <RootStack.Screen
            name="ReviewAnswers"
            component={ReviewAnswersScreen}
            options={{ title: 'Review Answers' }}
          />
          <RootStack.Screen
            name="PdfList"
            component={PdfListScreen}
            options={{ title: 'PDF Notes' }}
          />
          <RootStack.Screen
            name="NotesList"
            component={NotesListScreen}
            options={{ title: 'Study Notes' }}
          />
          <RootStack.Screen
            name="NoteDetail"
            component={NoteDetailScreen}
            options={{ title: 'Note' }}
          />
          <RootStack.Screen
            name="Premium"
            component={PremiumScreen}
            options={{ title: 'Premium' }}
          />
          <RootStack.Screen
            name="SavedMaterials"
            component={SavedMaterialsScreen}
            options={{ title: 'Saved Materials' }}
          />
          <RootStack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            options={{ title: 'Change Password' }}
          />
        </>
      ) : (
        <>
          <RootStack.Screen name="Login" component={LoginScreen} options={{ title: brand.name }} />
          <RootStack.Screen name="Signup" component={SignupScreen} options={{ title: 'Sign up' }} />
          <RootStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ title: 'Forgot password' }}
          />
          <RootStack.Screen
            name="VerifyOtp"
            component={VerifyOtpScreen}
            options={{ title: 'Verify code' }}
          />
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ title: 'Reset password' }}
          />
        </>
      )}
    </RootStack.Navigator>
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
