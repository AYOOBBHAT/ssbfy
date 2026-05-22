import { Animated, Platform, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useStartupSplash } from '../hooks/useStartupSplash';
import StartupSplashScreen from '../components/splash/StartupSplashScreen';
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
import BattleCreateScreen from '../screens/BattleCreateScreen';
import BattleJoinScreen from '../screens/BattleJoinScreen';
import BattleLobbyScreen from '../screens/BattleLobbyScreen';
import BattleResultScreen from '../screens/BattleResultScreen';
import SavedMaterialsScreen from '../screens/SavedMaterialsScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import { colors, brand } from '../theme/colors';
import { authScreenBg } from '../theme/authUi';
import { stackContentStyle, stackMotion, tabSceneStyle } from '../theme/motion';

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
  contentStyle: stackContentStyle,
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
        sceneContainerStyle: tabSceneStyle,
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
  const {
    overlayVisible,
    appRevealed,
    splashOpacity,
    appOpacity,
    showBootstrapLoader,
    onAnimationComplete,
    rootStyle,
  } = useStartupSplash(initializing);

  return (
    <View style={rootStyle}>
      {appRevealed ? (
        <Animated.View style={[styles.appLayer, { opacity: appOpacity }]}>
          <RootStack.Navigator
      key={isAuthenticated ? 'app' : 'auth'}
      screenOptions={{
        ...themedHeader,
        headerShown: true,
        contentStyle: isAuthenticated ? stackContentStyle : { backgroundColor: authScreenBg },
        ...(isAuthenticated ? {} : { animation: 'fade', headerShown: false }),
      }}
    >
      {isAuthenticated ? (
        <>
          <RootStack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="Test"
            component={TestScreen}
            options={({ route }) => {
              const mode = route.params?.mode;
              const blockSwipe =
                mode === 'practice' ||
                mode === 'daily' ||
                mode === 'retry' ||
                mode === 'battle';
              return {
                title: 'Test',
                gestureEnabled: !blockSwipe,
                ...stackMotion.defaultPush,
              };
            }}
          />
          <RootStack.Screen
            name="Result"
            component={ResultScreen}
            options={{ title: 'Result', ...stackMotion.resultReveal }}
          />
          <RootStack.Screen
            name="ReviewAnswers"
            component={ReviewAnswersScreen}
            options={{ title: 'Review Answers', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="PdfList"
            component={PdfListScreen}
            options={{ title: 'PDF Notes', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="NotesList"
            component={NotesListScreen}
            options={{ title: 'Study Notes', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="NoteDetail"
            component={NoteDetailScreen}
            options={{ title: 'Note', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="Premium"
            component={PremiumScreen}
            options={{ title: 'Premium', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="SavedMaterials"
            component={SavedMaterialsScreen}
            options={{ title: 'Saved Materials', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            options={{ title: 'Change Password', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="BattleCreate"
            component={BattleCreateScreen}
            options={{ title: 'Create battle', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="BattleJoin"
            component={BattleJoinScreen}
            options={{ title: 'Accept challenge', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="BattleLobby"
            component={BattleLobbyScreen}
            options={{ title: 'Battle lobby', ...stackMotion.defaultPush }}
          />
          <RootStack.Screen
            name="BattleResult"
            component={BattleResultScreen}
            options={{ title: 'Battle results', ...stackMotion.resultReveal }}
          />
        </>
      ) : (
        <>
          <RootStack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="Signup"
            component={SignupScreen}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false, animation: 'fade' }}
          />
          <RootStack.Screen
            name="VerifyOtp"
            component={VerifyOtpScreen}
            options={{ headerShown: false, animation: 'fade' }}
          />
          <RootStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false, animation: 'fade' }}
          />
        </>
      )}
          </RootStack.Navigator>
        </Animated.View>
      ) : null}
      {overlayVisible ? (
        <StartupSplashScreen
          onAnimationComplete={onAnimationComplete}
          showBootstrapLoader={showBootstrapLoader}
          overlayOpacity={splashOpacity}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  appLayer: {
    flex: 1,
  },
});
