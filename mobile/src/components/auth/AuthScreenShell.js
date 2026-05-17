import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { authStyles, getAuthScrollInsets } from '../../theme/authUi';
import AuthAmbientBackground from './AuthAmbientBackground';

/**
 * Immersive auth layout — ambient background + balanced vertical spacing.
 */
export default function AuthScreenShell({
  children,
  showBack = false,
  onBack,
  flow = false,
  footer = null,
}) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = getAuthScrollInsets(screenHeight, flow);

  return (
    <View style={authStyles.safeRoot}>
      <AuthAmbientBackground />
      <SafeAreaView style={authStyles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={authStyles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
        >
          <ScrollView
            contentContainerStyle={[
              flow ? authStyles.scrollFlow : authStyles.scroll,
              {
                paddingTop: insets.paddingTop,
                paddingBottom: insets.paddingBottom,
                minHeight: insets.minScrollHeight,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {showBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={({ pressed }) => [
                  authStyles.backRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
                <Text style={authStyles.backLabel}>Back</Text>
              </Pressable>
            ) : null}
            {children}
            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
