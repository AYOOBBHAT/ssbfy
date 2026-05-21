import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import FormScreenShell from '../components/layout/FormScreenShell';
import { useKeyboardSafeField } from '../components/layout/KeyboardSafeScrollView';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { joinBattle, previewBattleInvite } from '../services/battleService';
import { colors } from '../theme/colors';
import { tryAcquireLock } from '../utils/navigationGuard';
import { pressCardStyle } from '../utils/pressFeedback';

function BattleCodeInput({ value, onChangeText, onBlur, editable = true }) {
  const inputRef = useRef(null);
  const keyboardForm = useKeyboardSafeField();

  return (
    <TextInput
      ref={inputRef}
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder="e.g. JK24AB"
      placeholderTextColor={colors.muted}
      autoCapitalize="characters"
      maxLength={12}
      editable={editable}
      returnKeyType="go"
      onBlur={onBlur}
      onFocus={() => keyboardForm?.registerScrollToField(inputRef)}
    />
  );
}

export default function BattleJoinScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const initialCode = String(route.params?.inviteCode ?? '').trim().toUpperCase();

  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(!!initialCode);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const lockRef = useRef(false);
  const previewRef = useRef(null);

  const loadPreview = useCallback(async (inviteCode) => {
    const c = String(inviteCode).trim().toUpperCase();
    if (c.length < 4) {
      setPreview(null);
      setLoading(false);
      return;
    }
    previewRef.current?.abort();
    const ac = new AbortController();
    previewRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const data = await previewBattleInvite(c, { signal: ac.signal });
      if (previewRef.current !== ac) return;
      setPreview(data?.battle ?? null);
    } catch (e) {
      if (isRequestCancelled(e) || previewRef.current !== ac) return;
      setPreview(null);
      setError(getApiErrorMessage(e));
    } finally {
      if (previewRef.current === ac) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) void loadPreview(initialCode);
    return () => previewRef.current?.abort();
  }, [initialCode, loadPreview]);

  const handleJoin = useCallback(async () => {
    const c = code.trim().toUpperCase();
    if (!c || !tryAcquireLock(lockRef)) return;
    setJoining(true);
    setError(null);
    try {
      const data = await joinBattle(c);
      const battle = data?.battle;
      if (!battle?.id) {
        setError('Could not join battle.');
        return;
      }
      navigation.replace('BattleLobby', { battleId: battle.id });
    } catch (e) {
      if (!isRequestCancelled(e)) setError(getApiErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }, [code, navigation]);

  return (
    <FormScreenShell backgroundColor={colors.bg}>
      <Text style={styles.lead}>Enter a friend&apos;s battle code or open their invite link.</Text>
      <BattleCodeInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        onBlur={() => void loadPreview(code)}
        editable={!joining}
      />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      ) : preview ? (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Battle found</Text>
          <Text style={styles.previewMeta}>
            {preview.questionCount} questions · {preview.difficulty || 'all'} ·{' '}
            {preview.status}
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable
        onPress={handleJoin}
        disabled={joining || !code.trim()}
        style={({ pressed }) => [styles.btn, pressCardStyle(pressed), joining && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Join battle"
      >
        <Ionicons name="people" size={20} color={colors.textOnPrimary} />
        <Text style={styles.btnText}>{joining ? 'Joining…' : 'Join battle'}</Text>
      </Pressable>
    </FormScreenShell>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 15, color: colors.muted, marginBottom: 16, lineHeight: 22 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spinner: { marginVertical: 12 },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  previewMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  err: { color: colors.danger, marginBottom: 12 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    minHeight: 48,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 16 },
});
