import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

function formatMmSs(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Isolated countdown: only this subtree re-renders once per second, not the
 * full TestScreen (options / question body stay stable).
 */
export default function TestCountdownBar({
  initialSeconds,
  enabled,
  /** ISO string from server for resumed attempts; omit for client-local clocks. */
  serverStartTime,
  isLocal,
  onExpire,
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Number(initialSeconds) || 0));
  const firedRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    firedRef.current = false;
  }, [initialSeconds, enabled, serverStartTime, isLocal]);

  useEffect(() => {
    if (!enabled || initialSeconds <= 0) {
      setRemaining(0);
      return undefined;
    }

    let endTimeMs;
    if (!isLocal && serverStartTime) {
      const startMs = new Date(serverStartTime).getTime();
      const anchor = Number.isFinite(startMs) ? startMs : Date.now();
      endTimeMs = anchor + initialSeconds * 1000;
    } else {
      endTimeMs = Date.now() + initialSeconds * 1000;
    }

    const tick = () => {
      const next = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (!firedRef.current) {
          firedRef.current = true;
          onExpire?.();
        }
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, initialSeconds, isLocal, serverStartTime, onExpire]);

  if (initialSeconds <= 0) return null;

  const showWarn = remaining <= 60;
  const label = `Time Left: ${formatMmSs(remaining)}`;

  return (
    <View style={styles.timerBlock}>
      <Text style={[styles.timer, showWarn && styles.timerWarn]}>{label}</Text>
      {showWarn ? <Text style={styles.hurryText}>Hurry up!</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timerBlock: { marginBottom: 4 },
  timer: { fontSize: 16, fontWeight: '600', marginBottom: 4, color: colors.text },
  timerWarn: { color: colors.danger },
  hurryText: { color: colors.danger, fontWeight: '600', marginBottom: 4 },
});
