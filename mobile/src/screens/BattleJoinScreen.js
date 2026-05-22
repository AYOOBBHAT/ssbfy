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
import BattleFramingBanner from '../components/battle/BattleFramingBanner';
import { useKeyboardSafeField } from '../components/layout/KeyboardSafeScrollView';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { joinBattle, previewBattleInvite } from '../services/battleService';
import { battleAccent, formatBattleRulesSummary } from '../theme/setupPresentation';
import { colors } from '../theme/colors';
import { setupPresentationDevLog } from '../utils/setupPresentationDevLog';
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
  const fromInviteLink = !!initialCode;

  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(!!initialCode);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const lockRef = useRef(false);
  const previewRef = useRef(null);

  useEffect(() => {
    setupPresentationDevLog('battle_join_screen', {
      fromInviteLink,
      inviteCode: initialCode || null,
    });
  }, [fromInviteLink, initialCode]);

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
      navigation.replace('BattleLobby', { battleId: battle.id, joined: true });
    } catch (e) {
      if (!isRequestCancelled(e)) setError(getApiErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }, [code, navigation]);

  return (
    <FormScreenShell backgroundColor={colors.bg}>
      {fromInviteLink ? (
        <BattleFramingBanner
          title="You were challenged"
          subtitle="A friend invited you to a head-to-head battle. Rules are set by them — review below, then accept to join."
          icon="mail-open-outline"
        />
      ) : (
        <BattleFramingBanner
          title="Join a challenge"
          subtitle="Enter your friend's battle code or open their invite link. You cannot change match settings."
          icon="enter-outline"
        />
      )}

      <Text style={styles.fieldLabel}>Battle code</Text>
      <BattleCodeInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        onBlur={() => void loadPreview(code)}
        editable={!joining}
      />
      {loading ? (
        <ActivityIndicator color={battleAccent.primary} style={styles.spinner} />
      ) : preview ? (
        <View style={styles.previewCard}>
          <View style={styles.previewHead}>
            <Ionicons name="lock-closed" size={18} color={battleAccent.text} />
            <Text style={styles.previewTitle}>Battle rules (locked)</Text>
          </View>
          <Text style={styles.previewRules}>{formatBattleRulesSummary(preview)}</Text>
          <Text style={styles.previewHint}>
            Same questions for both players · settings chosen by the creator
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable
        onPress={handleJoin}
        disabled={joining || !code.trim()}
        style={({ pressed }) => [
          styles.btn,
          pressCardStyle(pressed),
          (joining || !code.trim()) && styles.btnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Accept challenge"
      >
        <Ionicons name="shield-checkmark" size={20} color={colors.textOnPrimary} />
        <Text style={styles.btnText}>{joining ? 'Joining…' : 'Accept challenge'}</Text>
      </Pressable>
    </FormScreenShell>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
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
    backgroundColor: battleAccent.soft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: battleAccent.border,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  previewRules: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 22 },
  previewHint: { fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 18 },
  err: { color: colors.danger, marginBottom: 12 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: battleAccent.primary,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    minHeight: 48,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 16 },
});
