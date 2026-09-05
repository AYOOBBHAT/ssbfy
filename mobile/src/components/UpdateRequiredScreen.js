import { useCallback, useEffect } from 'react';
import { BackHandler, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppButton from './AppButton';
import {
  PLAY_STORE_URL,
  UPDATE_NOW_LABEL,
  UPDATE_REQUIRED_MESSAGE,
  UPDATE_REQUIRED_TITLE,
} from '../constants/appVersion';
import { colors } from '../theme/colors';
import { authScreenBg } from '../theme/authUi';

export default function UpdateRequiredScreen() {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const openPlayStore = useCallback(async () => {
    try {
      await Linking.openURL(PLAY_STORE_URL);
    } catch {
      // Device cannot open the listing; user stays on this screen.
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-download-outline" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>{UPDATE_REQUIRED_TITLE}</Text>
        <Text style={styles.message}>{UPDATE_REQUIRED_MESSAGE}</Text>
        <AppButton title={UPDATE_NOW_LABEL} onPress={openPlayStore} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: authScreenBg,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    marginBottom: 28,
  },
});
