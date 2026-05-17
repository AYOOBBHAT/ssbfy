import { Text, View } from 'react-native';
import { authStyles } from '../../theme/authUi';

export function AuthErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={authStyles.errorBanner}>
      <Text style={authStyles.errorText}>{message}</Text>
    </View>
  );
}

export function AuthInfoBanner({ message }) {
  if (!message) return null;
  return (
    <View style={authStyles.infoBanner}>
      <Text style={authStyles.infoText}>{message}</Text>
    </View>
  );
}
