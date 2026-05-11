import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMockTests } from '../hooks/useMockTests';
import { MockTestCard } from '../components/MockTestCard';
import { LoadingState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getMyTestStatus } from '../services/testService';

function EmptyTests() {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="document-text-outline" size={40} color={colors.muted} />
      <Text style={styles.emptyTitle}>No tests available</Text>
      <Text style={styles.emptySub}>Check back soon for new mock tests.</Text>
    </View>
  );
}

export default function TestsListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isPremium = userHasPremiumAccess(user);
  const [statusMap, setStatusMap] = useState({});
  const [statusError, setStatusError] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const {
    tests,
    loading,
    error,
    loadTests,
    mockStartError,
    startingId,
    handleStartTest,
    FREE_TEST_LIMIT_MESSAGE,
  } = useMockTests();

  useEffect(() => {
    const ac = new AbortController();
    const loadStatuses = async () => {
      try {
        setStatusError(null);
        setStatusLoading(true);
        const data = await getMyTestStatus({ signal: ac.signal });
        const next = data?.status && typeof data.status === 'object' ? data.status : {};
        if (ac.signal.aborted) return;
        setStatusMap(next);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setStatusError(getApiErrorMessage(e));
        setStatusMap({});
      }
      if (ac.signal.aborted) return;
      setStatusLoading(false);
    };
    void loadStatuses();
    return () => {
      ac.abort();
    };
  }, []);

  const testStatusById = useMemo(() => {
    const map = new Map();
    for (const t of tests || []) {
      const id = String(t?._id ?? '').trim();
      if (!id) continue;
      const st = statusMap?.[id];
      map.set(id, {
        hasOpen: !!st?.hasOpenAttempt,
        isCompleted: !!st?.hasCompletedAttempt,
      });
    }
    return map;
  }, [tests, statusMap]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={tests}
      keyExtractor={(item, idx) => String(item?._id ?? idx)}
      refreshing={loading && tests.length > 0}
      onRefresh={loadTests}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Text style={styles.lead}>
            Full-length timed mocks aligned with your exam pattern. Tap start when you are ready.
          </Text>
          {statusLoading && tests.length > 0 ? (
            <View style={styles.syncInfo}>
              <Text style={styles.syncInfoText}>Syncing test status...</Text>
            </View>
          ) : null}
          {statusError ? (
            <View style={styles.softWarn}>
              <Text style={styles.softWarnText}>
                Some test statuses may be outdated. {statusError}
              </Text>
            </View>
          ) : null}
          {mockStartError ? (
            <View style={styles.alert}>
              <Text style={styles.alertTitle}>Could not start test</Text>
              <Text style={styles.alertBody}>{mockStartError}</Text>
              {mockStartError === FREE_TEST_LIMIT_MESSAGE ? (
                <>
                  <Text style={styles.alertHint}>
                    Upgrade to premium for unlimited mock tests and full access on this device.
                  </Text>
                  <Pressable
                    onPress={() => navigation.navigate('Premium', { from: 'limit' })}
                    style={({ pressed }) => [styles.upgradeBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.upgradeBtnText}>See plans & upgrade</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          {loading && tests.length === 0 ? (
            <View style={styles.card}>
              <LoadingState label="Loading tests..." compact />
            </View>
          ) : null}
          {error ? (
            <View style={styles.card}>
              <ErrorState message={error} onRetry={loadTests} compact />
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const itemId = item?._id;
        const isStarting =
          startingId != null && String(startingId) === String(itemId);
        const st =
          testStatusById.get(String(itemId)) || { hasOpen: false, isCompleted: false };

        let cta = 'Open test';
        let ctaState = 'loading';
        if (!statusLoading && !statusError) {
          cta = 'Start test';
          ctaState = 'start';
          if (st.hasOpen) {
            cta = 'Resume test';
            ctaState = 'resume';
          } else if (st.isCompleted && isPremium) {
            cta = 'Retry test';
            ctaState = 'retry';
          } else if (st.isCompleted && !isPremium) {
            cta = 'Completed';
            ctaState = 'completed';
          }
        } else if (!statusLoading && statusError) {
          // If status could not be fetched, avoid claiming a state we don't know.
          // Backend will still resume / block correctly when Start is pressed.
          cta = 'Open test';
          ctaState = 'unknown';
        }
        return (
          <MockTestCard
            item={item}
            index={index}
            onStart={handleStartTest}
            isStarting={isStarting}
            actionLabel={cta}
            ctaState={ctaState}
            isPremium={isPremium}
          />
        );
      }}
      ListEmptyComponent={
        !loading && !error && tests.length === 0 ? <EmptyTests /> : null
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerBlock: { marginBottom: 4 },
  lead: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alert: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  alertBody: { fontSize: 14, color: colors.danger, fontWeight: '600' },
  alertHint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 18,
  },
  upgradeBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  upgradeBtnText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: { opacity: 0.88 },
  softWarn: {
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  syncInfo: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncInfoText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  softWarnText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },
});
