import { Capacitor, registerPlugin } from '@capacitor/core';

export type PermissionStatusState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'permanently_denied'
  | 'system_required'
  | 'unsupported';

export type MicrophonePermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'permanently_denied'
  | 'unsupported';

export type PermissionCategoryId =
  | 'all'
  | 'microphone'
  | 'notifications'
  | 'location'
  | 'camera'
  | 'files_media'
  | 'background_services'
  | 'alarms_reminders';

export type PermissionKind = 'runtime' | 'special' | 'manifest';

export interface PermissionDefinition {
  id: string;
  name: string;
  androidManifestName: string;
  category: Exclude<PermissionCategoryId, 'all'>;
  permissionType: PermissionKind;
  nativeAlias?: string;
  whyNeeded: string;
  androidSecurityNote: string;
  isSpecialSystemSetting: boolean;
  settingsAction?: string;
  androidOnly?: boolean;
}

export interface PermissionStateItem extends PermissionDefinition {
  status: PermissionStatusState;
  isSupported: boolean;
}

export const PERMISSION_CATEGORY_TABS: Array<{ id: PermissionCategoryId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'microphone', label: 'Microphone' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'location', label: 'Location' },
  { id: 'camera', label: 'Camera' },
  { id: 'files_media', label: 'Files & Media' },
  { id: 'background_services', label: 'Background Services' },
  { id: 'alarms_reminders', label: 'Alarms & Reminders' }
];

const STORAGE_KEY_PREFIX = 'zuzu_perm_status_';
const MIC_STORAGE_KEY = 'zuzu_mic_permission_status';

const ZuzuNativePluginProxy =
  typeof window !== 'undefined' ? registerPlugin<any>('ZuzuNative') : null;

export function getNativeZuzuPlugin(): any | null {
  if (typeof window === 'undefined') return null;
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('ZuzuNative') &&
    ZuzuNativePluginProxy
  ) {
    return ZuzuNativePluginProxy;
  }
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() && cap?.Plugins?.ZuzuNative) {
    return cap.Plugins.ZuzuNative;
  }
  return null;
}

/**
 * Minimal Android Permissions — strictly matching genuinely implemented Zuzu AI features.
 * Unused permissions (Contacts, Phone Calls, SMS, Bluetooth, Overlays, Write Settings, Query All Packages, Install Packages)
 * have been completely removed.
 */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // ---- Microphone ----
  {
    id: 'microphone',
    name: 'Microphone (Record Audio)',
    androidManifestName: 'android.permission.RECORD_AUDIO',
    category: 'microphone',
    permissionType: 'runtime',
    nativeAlias: 'microphone',
    whyNeeded: 'Captures live English & Bengali voice commands, Wake Word detection, and acoustic triggers.',
    androidSecurityNote: 'Requested on demand when tapping the Voice Orb or enabling Wake Word.',
    isSpecialSystemSetting: false
  },
  {
    id: 'modify_audio',
    name: 'Audio Output Routing',
    androidManifestName: 'android.permission.MODIFY_AUDIO_SETTINGS',
    category: 'microphone',
    permissionType: 'manifest',
    whyNeeded: 'Routes Zuzu AI spoken audio cleanly across device speaker, earpiece, and wired/system headsets.',
    androidSecurityNote: 'Normal manifest permission.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },

  // ---- Notifications ----
  {
    id: 'notifications',
    name: 'Notifications (Android 13+)',
    androidManifestName: 'android.permission.POST_NOTIFICATIONS',
    category: 'notifications',
    permissionType: 'runtime',
    nativeAlias: 'notifications',
    whyNeeded: 'Delivers scheduled reminder alerts and anchors the silent Wake Word foreground notification.',
    androidSecurityNote: 'Requested when creating reminders or enabling background service.',
    isSpecialSystemSetting: false
  },
  {
    id: 'vibrate',
    name: 'Haptic Feedback',
    androidManifestName: 'android.permission.VIBRATE',
    category: 'notifications',
    permissionType: 'manifest',
    whyNeeded: 'Provides subtle tactile haptics when tapping the Voice Orb or firing reminders.',
    androidSecurityNote: 'Normal manifest permission.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },

  // ---- Location ----
  {
    id: 'fine_location',
    name: 'Precise GPS Location',
    androidManifestName: 'android.permission.ACCESS_FINE_LOCATION',
    category: 'location',
    permissionType: 'runtime',
    nativeAlias: 'location',
    whyNeeded: 'Fetches accurate live local weather forecasts on the Dashboard Weather Card.',
    androidSecurityNote: 'Requested only when you enable or refresh live GPS weather.',
    isSpecialSystemSetting: false
  },
  {
    id: 'coarse_location',
    name: 'Approximate Location',
    androidManifestName: 'android.permission.ACCESS_COARSE_LOCATION',
    category: 'location',
    permissionType: 'runtime',
    nativeAlias: 'location',
    whyNeeded: 'Provides city-level weather coordinates with minimal battery impact.',
    androidSecurityNote: 'Requested alongside GPS weather access.',
    isSpecialSystemSetting: false
  },

  // ---- Camera ----
  {
    id: 'camera',
    name: 'Camera Access',
    androidManifestName: 'android.permission.CAMERA',
    category: 'camera',
    permissionType: 'runtime',
    nativeAlias: 'camera',
    whyNeeded: 'Supports camera video capture requests and voice "Open Camera" actions.',
    androidSecurityNote: 'Requested only when camera capture is triggered.',
    isSpecialSystemSetting: false
  },

  // ---- Files & Media ----
  {
    id: 'media_images',
    name: 'Photos & Media Images',
    androidManifestName: 'android.permission.READ_MEDIA_IMAGES',
    category: 'files_media',
    permissionType: 'runtime',
    nativeAlias: 'media_images',
    whyNeeded: 'Saves AI-generated artwork to Pictures/ZuzuAI and reads images selected for analysis.',
    androidSecurityNote: 'Uses scoped READ_MEDIA_IMAGES on Android 13+ and maxSdkVersion=32 legacy read on older Android.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },

  // ---- Background Services & Network ----
  {
    id: 'internet',
    name: 'Internet Access',
    androidManifestName: 'android.permission.INTERNET',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Connects to Google Gemini AI, Google Search Grounding, Open-Meteo Weather, and Firebase Sync.',
    androidSecurityNote: 'Normal manifest permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'access_network',
    name: 'Network Connectivity State',
    androidManifestName: 'android.permission.ACCESS_NETWORK_STATE',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Checks online status before running AI requests or live Google Search.',
    androidSecurityNote: 'Normal manifest permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'foreground_service',
    name: 'Foreground Service Execution',
    androidManifestName: 'android.permission.FOREGROUND_SERVICE',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Allows opt-in Always-On Wake Word monitoring to remain active in the background.',
    androidSecurityNote: 'Normal manifest permission for Android 9+.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },
  {
    id: 'fg_microphone',
    name: 'Foreground Microphone Type',
    androidManifestName: 'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Required by Android 14+ when Wake Word foreground service is enabled.',
    androidSecurityNote: 'Android 14+ typed FGS manifest permission.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },
  {
    id: 'wake_lock',
    name: 'CPU WakeLock (Background Wake)',
    androidManifestName: 'android.permission.WAKE_LOCK',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Keeps background Wake Word audio processing uninterrupted when enabled.',
    androidSecurityNote: 'Lightweight partial wakelock via PowerManager.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },
  {
    id: 'boot_completed',
    name: 'Restore Alarms After Reboot',
    androidManifestName: 'android.permission.RECEIVE_BOOT_COMPLETED',
    category: 'background_services',
    permissionType: 'manifest',
    whyNeeded: 'Re-schedules saved reminders and background service automatically after phone restart.',
    androidSecurityNote: 'Broadcast receiver restore on BOOT_COMPLETED.',
    isSpecialSystemSetting: false,
    androidOnly: true
  },
  {
    id: 'battery_opt',
    name: 'Battery Optimization Exemption',
    androidManifestName: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    category: 'background_services',
    permissionType: 'special',
    whyNeeded: 'Prevents Android OEM battery savers from stopping scheduled reminders or background wake listening.',
    androidSecurityNote: 'Optional special system setting.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    androidOnly: true
  },

  // ---- Alarms & Reminders ----
  {
    id: 'exact_alarm',
    name: 'Exact Alarms & Reminders',
    androidManifestName: 'android.permission.SCHEDULE_EXACT_ALARM',
    category: 'alarms_reminders',
    permissionType: 'special',
    whyNeeded: 'Fires custom, recurring, and preset reminders on Android AlarmManager at the exact scheduled minute.',
    androidSecurityNote: 'Controlled via Android Alarms & Reminders system setting on Android 12+.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',
    androidOnly: true
  }
];

function mapNativeState(raw: unknown): PermissionStatusState {
  if (raw === 'granted') return 'granted';
  if (raw === 'permanently_denied') return 'permanently_denied';
  if (raw === 'denied') return 'denied';
  if (raw === 'system_required') return 'system_required';
  if (raw === 'unsupported') return 'unsupported';
  return 'prompt';
}

export interface PermissionCheckResult {
  state: MicrophonePermissionState;
  isSupported: boolean;
  canRequest: boolean;
}

export async function checkMicrophonePermission(): Promise<MicrophonePermissionState> {
  if (typeof window === 'undefined') {
    return 'unsupported';
  }

  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.checkRecordAudioPermission) {
    try {
      const recCheck = await nativePlugin.checkRecordAudioPermission();
      if (recCheck?.granted === true || recCheck?.state === 'granted') {
        localStorage.setItem(MIC_STORAGE_KEY, 'granted');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'granted');
        return 'granted';
      }
      const rawState = recCheck?.state;
      if (rawState === 'permanently_denied' || rawState === 'denied' || rawState === 'prompt') {
        localStorage.setItem(MIC_STORAGE_KEY, rawState);
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, rawState);
        return rawState;
      }
    } catch {}
  }

  if (nativePlugin?.checkAllNativePermissions) {
    try {
      const nativeStatus = await nativePlugin.checkAllNativePermissions();
      const raw = nativeStatus?.microphone;
      const mapped: MicrophonePermissionState =
        raw === 'granted'
          ? 'granted'
          : raw === 'permanently_denied'
          ? 'permanently_denied'
          : raw === 'denied'
          ? 'denied'
          : 'prompt';
      localStorage.setItem(MIC_STORAGE_KEY, mapped);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, mapped);
      return mapped;
    } catch {}
  }

  const hasWebSpeechOrMic = Boolean(
    navigator?.mediaDevices?.getUserMedia ||
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
  );

  if (!hasWebSpeechOrMic) {
    return 'unsupported';
  }

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') {
        localStorage.setItem(MIC_STORAGE_KEY, 'granted');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'granted');
        return 'granted';
      }
      if (status.state === 'denied') {
        localStorage.setItem(MIC_STORAGE_KEY, 'permanently_denied');
        localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'permanently_denied');
        return 'permanently_denied';
      }
      // Browser reports 'prompt' — clear stale 'granted' cache if previously revoked
      localStorage.setItem(MIC_STORAGE_KEY, 'prompt');
      localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, 'prompt');
      return 'prompt';
    } catch {}
  }

  const cached = localStorage.getItem(MIC_STORAGE_KEY) as MicrophonePermissionState | null;
  if (cached === 'granted' || cached === 'denied' || cached === 'permanently_denied') {
    return cached;
  }
  return 'prompt';
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

  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.requestCorePermissions) {
    try {
      const nativeResult = await nativePlugin.requestCorePermissions({ alias: 'microphone' });
      const raw = nativeResult?.microphone;
      const resolved: MicrophonePermissionState =
        raw === 'granted'
          ? 'granted'
          : raw === 'permanently_denied'
          ? 'permanently_denied'
          : raw === 'denied'
          ? 'denied'
          : 'denied';
      localStorage.setItem(MIC_STORAGE_KEY, resolved);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, resolved);

      if (resolved === 'granted') {
        return { success: true, state: 'granted' };
      }
      const isPerm = resolved === 'permanently_denied';
      return {
        success: false,
        state: resolved,
        isPermanentDenied: isPerm,
        error: isPerm
          ? 'Microphone permission is blocked in Android settings. Open App Settings -> Permissions -> Microphone to allow.'
          : 'Microphone permission was declined. Please allow Microphone access to use Voice Assistant.'
      };
    } catch (err) {
      console.warn('[Permissions] Native mic request notice:', err);
    }
  }

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
    const isNotAllowed = errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError';

    let finalState: MicrophonePermissionState = 'denied';
    if (isNotAllowed && navigator.permissions?.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (perm.state === 'denied') {
          finalState = 'permanently_denied';
        }
      } catch {}
    } else if (isNotAllowed) {
      finalState = 'permanently_denied';
    }

    localStorage.setItem(MIC_STORAGE_KEY, finalState);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}microphone`, finalState);

    return {
      success: false,
      state: finalState,
      isPermanentDenied: finalState === 'permanently_denied',
      error:
        finalState === 'permanently_denied'
          ? 'Microphone access is blocked in browser/site settings. Enable Microphone and tap Re-check.'
          : err?.message || 'Microphone permission request was denied.'
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
      const st = mapNativeState(nativeResult?.notifications);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, st);
      return {
        success: st === 'granted',
        status: st,
        message:
          st === 'granted'
            ? 'Notifications enabled cleanly.'
            : st === 'permanently_denied'
            ? 'Notifications blocked in Android App Settings. Open Settings to enable.'
            : 'Notification access declined.'
      };
    } catch {}
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, 'granted');
        return { success: true, status: 'granted', message: 'Notifications already enabled.' };
      }
      if (Notification.permission === 'denied') {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, 'permanently_denied');
        return {
          success: false,
          status: 'permanently_denied',
          message: 'Notifications are blocked in browser site settings.'
        };
      }
      const perm = await Notification.requestPermission();
      const mapped: PermissionStatusState =
        perm === 'granted' ? 'granted' : perm === 'denied' ? 'permanently_denied' : 'prompt';
      localStorage.setItem(`${STORAGE_KEY_PREFIX}notifications`, mapped);
      return {
        success: perm === 'granted',
        status: mapped,
        message:
          perm === 'granted'
            ? 'Notifications enabled.'
            : mapped === 'permanently_denied'
            ? 'Notifications blocked in settings.'
            : 'Notification permission dismissed.'
      };
    } catch (err: any) {
      return { success: false, status: 'denied', message: err?.message || 'Notification request failed.' };
    }
  }

  return { success: false, status: 'unsupported', message: 'Notifications are unsupported in this environment.' };
}

/**
 * Checks implemented permissions truthfully via Android Native Bridge or real Browser Permissions API.
 * Never fabricates 'granted' for unavailable or ungranted permissions.
 */
export async function checkAllPermissions(): Promise<Record<string, PermissionStatusState>> {
  const results: Record<string, PermissionStatusState> = {};

  const nativePlugin = getNativeZuzuPlugin();
  let nativeMap: Record<string, unknown> | null = null;
  if (nativePlugin?.checkAllNativePermissions) {
    try {
      nativeMap = await nativePlugin.checkAllNativePermissions();
    } catch (err) {
      console.warn('[Permissions] Native check notice:', err);
    }
  }

  for (const def of PERMISSION_DEFINITIONS) {
    if (nativeMap && nativeMap[def.id] !== undefined) {
      const mapped = mapNativeState(nativeMap[def.id]);
      results[def.id] = mapped;
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${def.id}`, mapped);
      if (def.id === 'microphone') {
        localStorage.setItem(MIC_STORAGE_KEY, mapped);
      }
      continue;
    }

    // Browser / Web fallback checks (no fake 'granted' values)
    if (def.androidOnly) {
      results[def.id] = 'unsupported';
      continue;
    }

    if (def.id === 'microphone') {
      results[def.id] = await checkMicrophonePermission();
      continue;
    }

    if (def.id === 'notifications') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        results[def.id] =
          Notification.permission === 'granted'
            ? 'granted'
            : Notification.permission === 'denied'
            ? 'permanently_denied'
            : 'prompt';
      } else {
        results[def.id] = 'unsupported';
      }
      continue;
    }

    if (def.id === 'fine_location' || def.id === 'coarse_location') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        results[def.id] = 'unsupported';
        continue;
      }
      if (navigator.permissions?.query) {
        try {
          const geoStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          results[def.id] =
            geoStatus.state === 'granted'
              ? 'granted'
              : geoStatus.state === 'denied'
              ? 'permanently_denied'
              : 'prompt';
          continue;
        } catch {}
      }
      const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}${def.id}`) as PermissionStatusState | null;
      results[def.id] = cached || 'prompt';
      continue;
    }

    if (def.id === 'camera') {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        results[def.id] = 'unsupported';
        continue;
      }
      if (navigator.permissions?.query) {
        try {
          const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          results[def.id] =
            camStatus.state === 'granted'
              ? 'granted'
              : camStatus.state === 'denied'
              ? 'permanently_denied'
              : 'prompt';
          continue;
        } catch {}
      }
      results[def.id] = 'prompt';
      continue;
    }

    if (def.id === 'internet' || def.id === 'access_network') {
      results[def.id] = typeof navigator !== 'undefined' && navigator.onLine ? 'granted' : 'prompt';
      continue;
    }

    results[def.id] = 'unsupported';
  }

  return results;
}

/**
 * Requests or opens settings for an individual permission cleanly on demand.
 */
export async function handlePermissionAction(id: string): Promise<{
  success: boolean;
  status: PermissionStatusState;
  message?: string;
}> {
  const def = PERMISSION_DEFINITIONS.find((p) => p.id === id);
  if (!def) return { success: false, status: 'unsupported' };

  const nativePlugin = getNativeZuzuPlugin();

  if (def.permissionType === 'manifest') {
    if (!nativePlugin && def.androidOnly) {
      return {
        success: false,
        status: 'unsupported',
        message: `${def.name} applies only inside the Android APK build.`
      };
    }
    const snap = await checkAllPermissions();
    const st = snap[id] || (nativePlugin ? 'granted' : 'unsupported');
    return {
      success: st === 'granted',
      status: st,
      message: `${def.name} (${def.androidManifestName}) status: ${st.toUpperCase()}.`
    };
  }

  if (def.isSpecialSystemSetting) {
    if (id === 'exact_alarm' && nativePlugin?.openExactAlarmSettings) {
      openExactAlarmSettings();
      return {
        success: true,
        status: 'system_required',
        message: 'Opened Android Alarms & Reminders settings. Toggle "Allow setting alarms and reminders".'
      };
    }
    if (nativePlugin?.openSystemSettings) {
      openAndroidSettings(def.settingsAction);
      return {
        success: true,
        status: 'system_required',
        message: `Opened Android system settings for ${def.name}.`
      };
    }
    return {
      success: false,
      status: 'unsupported',
      message: `${def.name} is an Android system setting available inside the Android APK.`
    };
  }

  if (id === 'microphone') {
    const current = await checkMicrophonePermission();
    if (current === 'granted') {
      return { success: true, status: 'granted', message: 'Microphone access already active.' };
    }
    if (current === 'permanently_denied') {
      openAndroidAppSettingsGuide();
      return {
        success: false,
        status: 'permanently_denied',
        message: 'Microphone is blocked in settings. Opened App Settings — enable Microphone and tap Re-check.'
      };
    }
    const res = await requestMicrophonePermission();
    return {
      success: res.success,
      status: res.state,
      message: res.success ? 'Microphone access granted.' : res.error
    };
  }

  if (id === 'notifications') {
    const res = await requestNotificationPermission();
    if (res.status === 'permanently_denied' && nativePlugin) {
      openAndroidSettings('android.settings.APP_NOTIFICATION_SETTINGS');
    }
    return res;
  }

  if (nativePlugin?.requestCorePermissions && def.nativeAlias) {
    try {
      const snap = await nativePlugin.checkAllNativePermissions?.();
      if (snap && snap[def.id] === 'permanently_denied') {
        openAndroidAppSettingsGuide();
        return {
          success: false,
          status: 'permanently_denied',
          message: `${def.name} is permanently denied. Opened App Settings — enable it under Permissions.`
        };
      }
      const nativeResult = await nativePlugin.requestCorePermissions({ alias: def.nativeAlias });
      const resolved = mapNativeState(nativeResult?.[def.id]);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${def.id}`, resolved);
      return {
        success: resolved === 'granted',
        status: resolved,
        message:
          resolved === 'granted'
            ? `${def.name} granted cleanly.`
            : resolved === 'permanently_denied'
            ? `${def.name} blocked permanently. Open App Settings -> Permissions to enable.`
            : `${def.name} declined. You can enable it whenever you use this feature.`
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'denied',
        message: err?.message || `Could not request ${def.name}.`
      };
    }
  }

  // Browser fallbacks for Location & Camera
  if ((id === 'fine_location' || id === 'coarse_location') && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}fine_location`, 'granted');
          localStorage.setItem(`${STORAGE_KEY_PREFIX}coarse_location`, 'granted');
          resolve({ success: true, status: 'granted', message: `${def.name} granted.` });
        },
        (err) => {
          const permDenied = err.code === 1;
          const st: PermissionStatusState = permDenied ? 'permanently_denied' : 'denied';
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, st);
          resolve({
            success: false,
            status: st,
            message: permDenied ? 'Location access blocked in browser settings.' : err.message || 'Location request failed.'
          });
        },
        { timeout: 8000 }
      );
    });
  }

  if (id === 'camera' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      localStorage.setItem(`${STORAGE_KEY_PREFIX}camera`, 'granted');
      return { success: true, status: 'granted', message: 'Camera access granted.' };
    } catch (err: any) {
      const isPerm = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      const st: PermissionStatusState = isPerm ? 'permanently_denied' : 'denied';
      localStorage.setItem(`${STORAGE_KEY_PREFIX}camera`, st);
      return {
        success: false,
        status: st,
        message: isPerm ? 'Camera permission denied in browser settings.' : err?.message || 'Camera request failed.'
      };
    }
  }

  return {
    success: false,
    status: 'unsupported',
    message: `${def.name} requires Android APK runtime.`
  };
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

/**
 * Checks location permission silently without triggering an OS permission dialog.
 */
export async function checkLocationPermissionSilent(): Promise<PermissionStatusState> {
  if (typeof window === 'undefined') return 'unsupported';
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.checkAllNativePermissions) {
    try {
      const snap = await nativePlugin.checkAllNativePermissions();
      if (snap?.fine_location === 'granted' || snap?.coarse_location === 'granted') {
        return 'granted';
      }
      if (snap?.fine_location === 'permanently_denied' && snap?.coarse_location === 'permanently_denied') {
        return 'permanently_denied';
      }
      return 'prompt';
    } catch {}
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }
  if (navigator.permissions?.query) {
    try {
      const geo = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (geo.state === 'granted') return 'granted';
      if (geo.state === 'denied') return 'permanently_denied';
      return 'prompt';
    } catch {}
  }
  const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}fine_location`) as PermissionStatusState | null;
  return cached === 'granted' ? 'granted' : 'prompt';
}

export async function checkAndRequestLocationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.checkAllNativePermissions) {
    try {
      const snap = await nativePlugin.checkAllNativePermissions();
      if (snap?.fine_location === 'granted' || snap?.coarse_location === 'granted') {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}fine_location`, 'granted');
        return true;
      }
      if (nativePlugin.requestCorePermissions) {
        const requested = await nativePlugin.requestCorePermissions({ alias: 'location' });
        const granted = requested?.fine_location === 'granted' || requested?.coarse_location === 'granted';
        localStorage.setItem(`${STORAGE_KEY_PREFIX}fine_location`, granted ? 'granted' : mapNativeState(requested?.fine_location));
        return granted;
      }
    } catch {}
  }
  return Boolean(typeof navigator !== 'undefined' && navigator.geolocation);
}

export async function checkExactAlarmPermission(): Promise<{
  canScheduleExactAlarms: boolean;
  requiresSetting: boolean;
}> {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.checkExactAlarmPermission) {
    try {
      const res = await nativePlugin.checkExactAlarmPermission();
      const canSchedule = Boolean(res?.canScheduleExactAlarms);
      return {
        canScheduleExactAlarms: canSchedule,
        requiresSetting: !canSchedule
      };
    } catch {}
  }
  return { canScheduleExactAlarms: true, requiresSetting: false };
}

export function openExactAlarmSettings(): void {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.openExactAlarmSettings) {
    nativePlugin.openExactAlarmSettings().catch(() => {});
  }
}


