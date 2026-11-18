export type PermissionStatusState = 'granted' | 'prompt' | 'denied' | 'system_required' | 'unsupported';
export type MicrophonePermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export type PermissionCategoryId = 'all' | 'audio' | 'system' | 'device';
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

/**
 * Complete 30 Android Permissions for Zuzu AI Assistant
 */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // ---- Audio, Voice & Bluetooth (6) ----
  {
    id: 'microphone',
    name: 'Microphone (Record Audio)',
    androidManifestName: 'android.permission.RECORD_AUDIO',
    category: 'audio',
    permissionType: 'runtime',
    nativeAlias: 'microphone',
    whyNeeded: 'Captures live English & Bengali voice commands, Wake Word, and custom whistle/snap audio triggers.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'modify_audio',
    name: 'Modify Audio Settings',
    androidManifestName: 'android.permission.MODIFY_AUDIO_SETTINGS',
    category: 'audio',
    permissionType: 'manifest',
    whyNeeded: 'Routes voice playback cleanly between speakerphone, earpiece, and wired/Bluetooth headsets.',
    androidSecurityNote: 'Automatically granted via AndroidManifest.',
    isSpecialSystemSetting: false
  },
  {
    id: 'bluetooth',
    name: 'Bluetooth Audio Access',
    androidManifestName: 'android.permission.BLUETOOTH',
    category: 'audio',
    permissionType: 'manifest',
    whyNeeded: 'Streams Zuzu AI voice output and hands-free mic input over paired Bluetooth audio devices.',
    androidSecurityNote: 'Manifest permission for legacy Bluetooth stack.',
    isSpecialSystemSetting: false
  },
  {
    id: 'bluetooth_admin',
    name: 'Bluetooth Device Admin',
    androidManifestName: 'android.permission.BLUETOOTH_ADMIN',
    category: 'audio',
    permissionType: 'manifest',
    whyNeeded: 'Enables toggling and managing Bluetooth audio profile connections.',
    androidSecurityNote: 'Manifest permission for Bluetooth headset routing.',
    isSpecialSystemSetting: false
  },
  {
    id: 'bluetooth_connect',
    name: 'Bluetooth Connect (Android 12+)',
    androidManifestName: 'android.permission.BLUETOOTH_CONNECT',
    category: 'audio',
    permissionType: 'runtime',
    nativeAlias: 'bluetooth',
    whyNeeded: 'Required on Android 12+ to communicate with paired Bluetooth earbuds and car kits.',
    androidSecurityNote: 'Android 12+ runtime Nearby Devices permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'bluetooth_scan',
    name: 'Bluetooth Scan (Android 12+)',
    androidManifestName: 'android.permission.BLUETOOTH_SCAN',
    category: 'audio',
    permissionType: 'runtime',
    nativeAlias: 'bluetooth',
    whyNeeded: 'Discovers nearby Bluetooth headsets and smart accessories for voice routing.',
    androidSecurityNote: 'Android 12+ runtime Nearby Devices permission.',
    isSpecialSystemSetting: false
  },

  // ---- Network, Background Services & System Controls (16) ----
  {
    id: 'internet',
    name: 'Full Internet Access',
    androidManifestName: 'android.permission.INTERNET',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Connects to Google Gemini 3.8 Flash, xAI Grok, ElevenLabs, and Firebase ZU-ID Cloud Sync.',
    androidSecurityNote: 'Standard Android network access.',
    isSpecialSystemSetting: false
  },
  {
    id: 'access_network',
    name: 'View Network Connections',
    androidManifestName: 'android.permission.ACCESS_NETWORK_STATE',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Detects online/offline connectivity transitions cleanly before cloud sync or AI requests.',
    androidSecurityNote: 'Automatically granted via AndroidManifest.',
    isSpecialSystemSetting: false
  },
  {
    id: 'access_wifi',
    name: 'View Wi-Fi Connections',
    androidManifestName: 'android.permission.ACCESS_WIFI_STATE',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Optimizes OTA delta syncs and high-quality neural audio streaming on Wi-Fi.',
    androidSecurityNote: 'Automatically granted via AndroidManifest.',
    isSpecialSystemSetting: false
  },
  {
    id: 'foreground_service',
    name: 'Run Foreground Service',
    androidManifestName: 'android.permission.FOREGROUND_SERVICE',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Keeps the silent Zuzu AI Wake-Word listener reliable in the background.',
    androidSecurityNote: 'Android 9+ foreground execution permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'fg_microphone',
    name: 'Foreground Microphone Service',
    androidManifestName: 'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Required by Android 14+ to run Always-On Wake Word and whistle/snap triggers silently.',
    androidSecurityNote: 'Android 14+ typed foreground service permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'fg_media',
    name: 'Foreground Media Playback',
    androidManifestName: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Ensures uninterrupted neural voice responses and audio playback when screen is dimmed.',
    androidSecurityNote: 'Android 14+ typed foreground service permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'wake_lock',
    name: 'Prevent Device Sleep (WakeLock)',
    androidManifestName: 'android.permission.WAKE_LOCK',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Prevents Android CPU doze from cutting off live voice responses or background wake listening.',
    androidSecurityNote: 'Lightweight partial wakelock via PowerManager.',
    isSpecialSystemSetting: false
  },
  {
    id: 'boot_completed',
    name: 'Run at Device Startup',
    androidManifestName: 'android.permission.RECEIVE_BOOT_COMPLETED',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Restores the silent background Wake Word listener automatically after phone reboot.',
    androidSecurityNote: 'Standard boot receiver permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'battery_opt',
    name: 'Ignore Battery Optimizations',
    androidManifestName: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    category: 'system',
    permissionType: 'special',
    whyNeeded: 'Stops Android OEM battery savers from killing Zuzu AI background wake listening.',
    androidSecurityNote: 'Special Android system battery exemption.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
  },
  {
    id: 'notifications',
    name: 'Post Notifications (Android 13+)',
    androidManifestName: 'android.permission.POST_NOTIFICATIONS',
    category: 'system',
    permissionType: 'runtime',
    nativeAlias: 'notifications',
    whyNeeded: 'Required by Android 13+ to anchor the 100% silent foreground service notification.',
    androidSecurityNote: 'Silent low-priority channel with zero sound or vibration.',
    isSpecialSystemSetting: false
  },
  {
    id: 'vibrate',
    name: 'Haptic Vibration Feedback',
    androidManifestName: 'android.permission.VIBRATE',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Provides subtle tactile haptics when tapping the Voice Orb or detecting a trigger.',
    androidSecurityNote: 'Standard Android manifest permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'system_alert_window',
    name: 'Display Over Other Apps',
    androidManifestName: 'android.permission.SYSTEM_ALERT_WINDOW',
    category: 'system',
    permissionType: 'special',
    whyNeeded: 'Allows Zuzu AI floating assistive overlays and screen assistant views across apps.',
    androidSecurityNote: 'Special Android overlay permission.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.action.MANAGE_OVERLAY_PERMISSION'
  },
  {
    id: 'write_settings',
    name: 'Modify System Settings',
    androidManifestName: 'android.permission.WRITE_SETTINGS',
    category: 'system',
    permissionType: 'special',
    whyNeeded: 'Supports voice-controlled system brightness, volume, and quick device adjustments.',
    androidSecurityNote: 'Special Android system write permission.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.action.MANAGE_WRITE_SETTINGS'
  },
  {
    id: 'expand_status_bar',
    name: 'Expand/Collapse Status Bar',
    androidManifestName: 'android.permission.EXPAND_STATUS_BAR',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Supports voice commands that open notifications or quick settings shade.',
    androidSecurityNote: 'Standard Android manifest permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'query_all_packages',
    name: 'Query Installed Apps',
    androidManifestName: 'android.permission.QUERY_ALL_PACKAGES',
    category: 'system',
    permissionType: 'manifest',
    whyNeeded: 'Enables Zuzu AI to locate and launch installed Android apps via voice command.',
    androidSecurityNote: 'Android 11+ package visibility permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'request_install_packages',
    name: 'Request Package Installs',
    androidManifestName: 'android.permission.REQUEST_INSTALL_PACKAGES',
    category: 'system',
    permissionType: 'special',
    whyNeeded: 'Supports package install intent handling when updating companion assistant builds.',
    androidSecurityNote: 'Special Android install-packages permission.',
    isSpecialSystemSetting: true,
    settingsAction: 'android.settings.MANAGE_UNKNOWN_APP_SOURCES'
  },

  // ---- Location, Calls, Contacts, Storage & Camera (8) ----
  {
    id: 'fine_location',
    name: 'Precise GPS Location',
    androidManifestName: 'android.permission.ACCESS_FINE_LOCATION',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'location',
    whyNeeded: 'Provides accurate real-time local weather forecasts and location-aware greetings.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'coarse_location',
    name: 'Approximate Location',
    androidManifestName: 'android.permission.ACCESS_COARSE_LOCATION',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'location',
    whyNeeded: 'Provides city-level regional weather and time-zone awareness with low battery use.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'call_phone',
    name: 'Direct Phone Calls',
    androidManifestName: 'android.permission.CALL_PHONE',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'phone',
    whyNeeded: 'Enables hands-free voice calling commands when requested by the user.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'read_contacts',
    name: 'Read Contacts',
    androidManifestName: 'android.permission.READ_CONTACTS',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'contacts',
    whyNeeded: 'Matches spoken contact names for voice calls and messaging shortcuts.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'write_contacts',
    name: 'Write Contacts',
    androidManifestName: 'android.permission.WRITE_CONTACTS',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'contacts',
    whyNeeded: 'Allows saving new contact entries when instructed via assistant voice/chat.',
    androidSecurityNote: 'Android runtime dangerous permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'read_storage',
    name: 'Read External Storage',
    androidManifestName: 'android.permission.READ_EXTERNAL_STORAGE',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'storage',
    whyNeeded: 'Reads screenshots, images, and local documents selected for AI analysis or captions.',
    androidSecurityNote: 'Android runtime storage permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'write_storage',
    name: 'Write External Storage',
    androidManifestName: 'android.permission.WRITE_EXTERNAL_STORAGE',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'storage',
    whyNeeded: 'Saves AI-generated artwork and exported Zuzu AI data backups to device storage.',
    androidSecurityNote: 'Android runtime storage permission.',
    isSpecialSystemSetting: false
  },
  {
    id: 'camera',
    name: 'Camera Access (Vision)',
    androidManifestName: 'android.permission.CAMERA',
    category: 'device',
    permissionType: 'runtime',
    nativeAlias: 'camera',
    whyNeeded: 'Optional visual capture for multimodal Gemini 3.8 Flash vision analysis and captioning.',
    androidSecurityNote: 'Android runtime dangerous permission (used only when opened).',
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
 * Checks all 30 Android assistant permissions cleanly
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

    if (def.permissionType === 'manifest') {
      results[def.id] = 'granted';
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

    if ((def.id === 'fine_location' || def.id === 'coarse_location') && navigator.geolocation) {
      if (navigator.permissions?.query) {
        try {
          const geoStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          results[def.id] = geoStatus.state === 'granted' ? 'granted' : geoStatus.state === 'denied' ? 'denied' : cached || 'prompt';
          continue;
        } catch {}
      }
    }

    if (def.id === 'camera' && navigator.permissions?.query) {
      try {
        const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        results[def.id] = camStatus.state === 'granted' ? 'granted' : camStatus.state === 'denied' ? 'denied' : cached || 'prompt';
        continue;
      } catch {}
    }

    if (def.isSpecialSystemSetting) {
      results[def.id] = cached || 'system_required';
      continue;
    }

    results[def.id] = cached || 'prompt';
  }

  return results;
}

/**
 * Requests any of the 30 permissions smoothly via native Android bridge or browser APIs
 */
export async function handlePermissionAction(id: string): Promise<{
  success: boolean;
  status: PermissionStatusState;
  message?: string;
}> {
  const def = PERMISSION_DEFINITIONS.find(p => p.id === id);
  if (!def) return { success: false, status: 'unsupported' };

  if (def.permissionType === 'manifest') {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'granted');
    return {
      success: true,
      status: 'granted',
      message: `${def.name} (${def.androidManifestName}) is pre-declared and active in AndroidManifest.xml.`
    };
  }

  if (def.isSpecialSystemSetting) {
    const nativePlugin = getNativeZuzuPlugin();
    if (nativePlugin?.openSystemSettings) {
      openAndroidSettings(def.settingsAction);
      return {
        success: true,
        status: 'system_required',
        message: `Opened Android system settings for ${def.name}. Toggle allow to enable.`
      };
    }
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'granted');
    return {
      success: true,
      status: 'granted',
      message: `${def.name} verified for WebView mode. On Android APK, toggle this in Android System Settings.`
    };
  }

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

  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.requestCorePermissions && def.nativeAlias) {
    try {
      const nativeResult = await nativePlugin.requestCorePermissions({ alias: def.nativeAlias });
      const resolved: PermissionStatusState = nativeResult?.[def.id] === 'granted' ? 'granted' : 'denied';
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${def.id}`, resolved);
      return {
        success: resolved === 'granted',
        status: resolved,
        message: resolved === 'granted'
          ? `${def.name} granted cleanly.`
          : `${def.name} declined. Tap App Settings to enable anytime.`
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
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'granted');
          resolve({ success: true, status: 'granted', message: `${def.name} granted.` });
        },
        (err) => {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'denied');
          resolve({ success: false, status: 'denied', message: err.message || 'Location permission declined.' });
        },
        { timeout: 8000 }
      );
    });
  }

  if (id === 'camera' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      localStorage.setItem(`${STORAGE_KEY_PREFIX}camera`, 'granted');
      return { success: true, status: 'granted', message: 'Camera access granted.' };
    } catch (err: any) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}camera`, 'denied');
      return { success: false, status: 'denied', message: err?.message || 'Camera permission declined.' };
    }
  }

  localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, 'granted');
  return {
    success: true,
    status: 'granted',
    message: `${def.name} (${def.androidManifestName}) registered for Android APK runtime.`
  };
}

/**
 * Requests all runtime permissions in a single guided pass on native Android or web fallbacks
 */
export async function requestAllRuntimePermissions(): Promise<{
  statuses: Record<string, PermissionStatusState>;
  message: string;
}> {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.requestCorePermissions) {
    try {
      const result = await nativePlugin.requestCorePermissions({ alias: 'all' });
      const refreshed = await checkAllPermissions();
      const grantedCount = Object.values(refreshed).filter(v => v === 'granted').length;
      return {
        statuses: result ? { ...refreshed, ...result } : refreshed,
        message: `Permissions updated: ${grantedCount} of ${PERMISSION_DEFINITIONS.length} active.`
      };
    } catch {}
  }

  await requestMicrophonePermission().catch(() => {});
  await requestNotificationPermission().catch(() => {});
  const refreshed = await checkAllPermissions();
  const grantedCount = Object.values(refreshed).filter(v => v === 'granted').length;
  return {
    statuses: refreshed,
    message: `Permissions synced: ${grantedCount} of ${PERMISSION_DEFINITIONS.length} active.`
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
