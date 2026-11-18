export type PermissionStatusState = 'granted' | 'prompt' | 'denied' | 'system_required' | 'unsupported';
export type MicrophonePermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export type PermissionCategoryId = 'all' | 'core';

export interface PermissionDefinition {
  id: string;
  name: string;
  androidManifestName: string;
  category: 'core';
  whyNeeded: string;
  androidSecurityNote: string;
  isSpecialSystemSetting: boolean;
  settingsAction?: string;
}

export interface PermissionStateItem extends PermissionDefinition {
  status: PermissionStatusState;
  isSupported: boolean;
}

const STORAGE_KEY_PREFIX = 'zuzu_perm_status_';
const MIC_STORAGE_KEY = 'zuzu_mic_permission_status';

export function getNativeZuzuPlugin(): any | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() && cap?.Plugins?.ZuzuNative) {
    return cap.Plugins.ZuzuNative;
  }
  return null;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    id: 'microphone',
    name: 'Microphone Access',
    androidManifestName: 'android.permission.RECORD_AUDIO',
    category: 'core',
    whyNeeded: 'Essential for voice assistant recognition (English & Bangla) and hands-free Wake Word detection.',
    androidSecurityNote: 'Granted once via Android runtime prompt or App Settings.',
    isSpecialSystemSetting: false
  },
  {
    id: 'notifications',
    name: 'Assistant Notifications',
    androidManifestName: 'android.permission.POST_NOTIFICATIONS',
    category: 'core',
    whyNeeded: 'Required by Android 13+ to run the silent background Wake Word service reliably without interrupting you.',
    androidSecurityNote: 'Silent low-priority channel with zero sound or vibration.',
    isSpecialSystemSetting: false
  }
];

export interface PermissionCheckResult {
  state: MicrophonePermissionState;
  isSupported: boolean;
  canRequest: boolean;
}

export async function checkMicrophonePermission(): Promise<PermissionCheckResult> {
  if (typeof window === 'undefined') {
    return { state: 'unsupported', isSupported: false, canRequest: false };
  }

  // 1. Check real Android OS RECORD_AUDIO status first when inside Capacitor APK
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.checkAllNativePermissions) {
    try {
      const nativeStatus = await nativePlugin.checkAllNativePermissions();
      if (nativeStatus?.microphone === 'granted') {
        localStorage.setItem(MIC_STORAGE_KEY, 'granted');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'granted');
        return { state: 'granted', isSupported: true, canRequest: false };
      }
      const mapped = nativeStatus?.microphone === 'denied' ? 'denied' : 'prompt';
      localStorage.setItem(MIC_STORAGE_KEY, mapped);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, mapped);
      return { state: mapped, isSupported: true, canRequest: true };
    } catch {}
  }

  // 2. Check cached Web/Browser grant state cleanly (avoids repeated prompts in WebView)
  const cached =
    (localStorage.getItem(MIC_STORAGE_KEY) as MicrophonePermissionState | null) ||
    (localStorage.getItem(`${STORAGE_KEY_PREFIX}microphone`) as MicrophonePermissionState | null);

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') {
        localStorage.setItem(MIC_STORAGE_KEY, 'granted');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'granted');
        return { state: 'granted', isSupported: true, canRequest: false };
      }
      if (status.state === 'denied') {
        localStorage.setItem(MIC_STORAGE_KEY, 'denied');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'denied');
        return { state: 'denied', isSupported: true, canRequest: true };
      }
    } catch {}
  }

  if (cached === 'granted') {
    return { state: 'granted', isSupported: true, canRequest: false };
  }

  const hasWebSpeechOrMic = Boolean(
    navigator?.mediaDevices ||
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
  );

  if (!hasWebSpeechOrMic) {
    return { state: 'unsupported', isSupported: false, canRequest: false };
  }

  return {
    state: cached || 'prompt',
    isSupported: true,
    canRequest: true
  };
}

export interface PermissionRequestResult {
  success: boolean;
  state: MicrophonePermissionState;
  error?: string;
  isPermanentDenied?: boolean;
}

export async function requestMicrophonePermission(): Promise<PermissionRequestResult> {
  if (typeof window === 'undefined') {
    return {
      success: false,
      state: 'unsupported',
      error: 'Microphone is unavailable in this environment.'
    };
  }

  // 1. Prefer Capacitor Native Android RECORD_AUDIO runtime permission dialog
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.requestCorePermissions) {
    try {
      const nativeResult = await nativePlugin.requestCorePermissions({ alias: 'microphone' });
      const resolved = nativeResult?.microphone === 'granted' ? 'granted' : 'denied';
      localStorage.setItem(MIC_STORAGE_KEY, resolved);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, resolved);

      if (resolved === 'granted') {
        return { success: true, state: 'granted' };
      }
      return {
        success: false,
        state: 'denied',
        isPermanentDenied: true,
        error: 'Microphone permission denied in Android settings. Tap Open App Settings to enable Microphone.'
      };
    } catch (err) {
      console.warn('[Permissions] Native mic request fallback:', err);
    }
  }

  // 2. Web / Browser fallback using getUserMedia
  if (!navigator?.mediaDevices?.getUserMedia) {
    return {
      success: false,
      state: 'unsupported',
      error: 'MediaDevices audio API is not supported on this browser.'
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });

    localStorage.setItem(MIC_STORAGE_KEY, 'granted');
    localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'granted');

    return {
      success: true,
      state: 'granted'
    };
  } catch (err: any) {
    const errorName = err?.name || '';
    const isDenied = errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError';

    localStorage.setItem(MIC_STORAGE_KEY, 'denied');
    localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'denied');

    return {
      success: false,
      state: 'denied',
      isPermanentDenied: isDenied,
      error: err?.message || 'Microphone permission request was denied.'
    };
  }
}

export async function requestNotificationPermission(): Promise<{
  success: boolean;
  status: PermissionStatusState;
  message: string;
}> {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.requestCorePermissions) {
    try {
      const nativeResult = await nativePlugin.requestCorePermissions({ alias: 'notifications' });
      const st = nativeResult?.notifications === 'granted' ? 'granted' : 'denied';
      localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, st);
      return {
        success: st === 'granted',
        status: st,
        message: st === 'granted'
          ? 'Notifications enabled cleanly.'
          : 'Notification access declined. Enable in App Settings if desired.'
      };
    } catch {}
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, 'granted');
        return { success: true, status: 'granted', message: 'Notifications already enabled.' };
      }
      const perm = await Notification.requestPermission();
      const mapped: PermissionStatusState = perm === 'granted' ? 'granted' : 'denied';
      localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, mapped);
      return {
        success: perm === 'granted',
        status: mapped,
        message: perm === 'granted' ? 'Notifications enabled.' : 'Notification permission declined.'
      };
    } catch (err: any) {
      return { success: false, status: 'denied', message: err?.message || 'Notification request failed.' };
    }
  }

  localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, 'granted');
  return { success: true, status: 'granted', message: 'Notifications active.' };
}

/**
 * Checks essential assistant permissions (Microphone & Notifications)
 */
export async function checkAllPermissions(): Promise<Record<string, PermissionStatusState>> {
  const results: Record<string, PermissionStatusState> = {};

  const nativePlugin = getNativeZuzuPlugin();
  let nativeMap: Record<string, PermissionStatusState> | null = null;
  if (nativePlugin?.checkAllNativePermissions) {
    try {
      nativeMap = await nativePlugin.checkAllNativePermissions();
    } catch (err) {
      console.warn('[Permissions] Native check notice:', err);
    }
  }

  for (const def of PERMISSION_DEFINITIONS) {
    if (nativeMap && nativeMap[def.id]) {
      results[def.id] = nativeMap[def.id];
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${def.id}`, nativeMap[def.id]);
      if (def.id === 'microphone') {
        localStorage.setItem(MIC_STORAGE_KEY, nativeMap[def.id]);
      }
      continue;
    }

    const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}${def.id}`) as PermissionStatusState | null;

    if (def.id === 'microphone') {
      const micRes = await checkMicrophonePermission();
      results[def.id] = micRes.state as PermissionStatusState;
      continue;
    }

    if (def.id === 'notifications') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        results[def.id] = Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
          ? 'denied'
          : cached || 'prompt';
      } else {
        results[def.id] = cached || 'prompt';
      }
      continue;
    }

    results[def.id] = cached || 'prompt';
  }

  return results;
}

/**
 * Requests an essential permission smoothly without repeated prompts once granted
 */
export async function handlePermissionAction(id: string): Promise<{
  success: boolean;
  status: PermissionStatusState;
  message?: string;
}> {
  const def = PERMISSION_DEFINITIONS.find(p => p.id === id);
  if (!def) return { success: false, status: 'unsupported' };

  if (id === 'microphone') {
    const current = await checkMicrophonePermission();
    if (current.state === 'granted') {
      return { success: true, status: 'granted', message: 'Microphone access already active.' };
    }
    const res = await requestMicrophonePermission();
    return {
      success: res.success,
      status: res.state as PermissionStatusState,
      message: res.success ? 'Microphone access granted.' : res.error
    };
  }

  if (id === 'notifications') {
    return requestNotificationPermission();
  }

  return { success: false, status: 'unsupported' };
}

export function openAndroidSettings(action?: string): void {
  try {
    const nativePlugin = getNativeZuzuPlugin();
    if (nativePlugin?.openSystemSettings) {
      nativePlugin.openSystemSettings({ action: action || '' });
      return;
    }
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      (window as any).Capacitor?.Plugins?.App?.openUrl?.({
        url: 'package:com.zuzu.ai.assistant'
      });
    }
  } catch (err) {
    console.warn('Settings navigation notice:', err);
  }
}

export function openAndroidAppSettingsGuide(): void {
  openAndroidSettings('android.settings.APPLICATION_DETAILS_SETTINGS');
}
