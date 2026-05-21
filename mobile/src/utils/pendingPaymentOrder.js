import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ssbfy:pendingPremiumOrderId';

export async function savePendingPremiumOrderId(orderId) {
  const id = orderId != null ? String(orderId).trim() : '';
  if (!id) return;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    /* non-fatal */
  }
}

export async function readPendingPremiumOrderId() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? String(raw).trim() : null;
  } catch {
    return null;
  }
}

export async function clearPendingPremiumOrderId() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
