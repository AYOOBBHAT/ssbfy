import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { parseVersionCode } from './appVersionPolicy';

/**
 * Installed Android versionCode from the native binary.
 * Do not persist or read this from device storage. Returns null when unreadable.
 */
export function getInstalledAndroidVersionCode() {
  const native = parseVersionCode(Application.nativeBuildVersion);
  if (native != null) return native;
  return parseVersionCode(Constants.expoConfig?.android?.versionCode);
}
