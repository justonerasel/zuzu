import React, { useState, useEffect } from 'react';
import { ActiveTab, AppSettings, VoiceIdentity, VoiceSession } from './types';
import { 
  getAppSettings, 
  saveAppSettings, 
  performHistoryMigration, 
  getChatMessages, 
  getVoiceSessions 
} from './utils/storage';
import { AndroidFrame } from './components/AndroidFrame';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { ChatView } from './components/ChatView';
import { VoiceView } from './components/VoiceView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { UpdatesView } from './components/UpdatesView';
import { MinimizedVoiceOverlay } from './components/MinimizedVoiceOverlay';
import { ImageCreatorView } from './components/ImageCreatorView';
import { FirstLaunchPermissionModal } from './components/FirstLaunchPermissionModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ForceUpdateOverlay, ForceUpdatePayload } from './components/ForceUpdateOverlay';
import { stopSpeaking, playHapticSound } from './utils/audio';
import { apiFetch, APP_VERSION, APP_VERSION_CODE } from './utils/apiConfig';
import { syncBackgroundServicesWithSettings } from './utils/backgroundService';
import { checkMicrophonePermission, getNativeZuzuPlugin } from './utils/permission';
import {
  computeNextRecurringTriggerMs,
  getRemindersList,
  setRemindersList,
  syncRemindersToNative
} from './utils/assistantStore';
import { getDefaultGeminiVoiceForIdentity, getGeminiVoiceByName } from './constants/personalities';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { User } from 'firebase/auth';
import { FirebaseUserProfile } from './types';
import { subscribeFirebaseAuthState } from './utils/authService';
import {
  hydrateUserIsolatedWorkspace,
  loadOrCreateUserProfile,
  pushActiveVaultToCloud
} from './utils/userCloudVault';
import { AuthModal } from './components/AuthModal';
import { SettingsCategoryId } from './components/SettingsView';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentVoiceSession, setCurrentVoiceSession] = useState<VoiceSession | null>(null);
  const [isVoiceMinimized, setIsVoiceMinimized] = useState(false);
  const [textMessageCount, setTextMessageCount] = useState(0);
  const [voiceSessionCount, setVoiceSessionCount] = useState(0);
  const [isBackendConnected, setIsBackendConnected] = useState(true);

  // Firebase Auth & Isolated Profile State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<FirebaseUserProfile | null>(null);
  const [authModalConfig, setAuthModalConfig] = useState<{
    isOpen: boolean;
    mode: 'signin' | 'link_phone';
  }>({ isOpen: false, mode: 'signin' });
  const [settingsTargetCategory, setSettingsTargetCategory] = useState<SettingsCategoryId | null>(null);

  // Force Update Overlay State (only shown when server signals genuine required update)
  const [forceUpdateInfo, setForceUpdateInfo] = useState<ForceUpdatePayload | null>(null);
  const [dueReminderToast, setDueReminderToast] = useState<string | null>(null);

  // First-launch permission flow state
  const [showFirstLaunch, setShowFirstLaunch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('zuzu_first_launch_done');
  });

  // Floating Gemini API Key Popup state
  const [apiKeyModalConfig, setApiKeyModalConfig] = useState<{
    isOpen: boolean;
    actionName?: string;
    onResume?: () => void;
  }>({ isOpen: false });

  // Initialize, configure edge-to-edge StatusBar, sync native mic status, sync AlarmManager reminders, check Force Update & migrate history
  useEffect(() => {
    performHistoryMigration();
    updateCounts();
    syncRemindersToNative().catch(() => {});

    checkMicrophonePermission()
      .then((perm) => {
        if (perm === 'granted') {
          syncBackgroundServicesWithSettings(getAppSettings());
        }
      })
      .catch(() => {});

    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    }

    // Verify backend connectivity
    apiFetch('/api/config')
      .then(res => res.json())
      .then(() => setIsBackendConnected(true))
      .catch(() => setIsBackendConnected(false));

    // Check Force Update policy
    apiFetch(`/api/system/check-update?installedVersion=${encodeURIComponent(APP_VERSION)}&versionCode=${APP_VERSION_CODE}`)
      .then(res => res.json())
      .then(data => {
        if (data?.forceUpdate) {
          setForceUpdateInfo({
            latestVersion: data.latestVersion || `v${APP_VERSION}`,
            minSupportedVersion: data.minSupportedVersion,
            websiteUrl: data.websiteUrl || 'https://ais-pre-requvmmuycwborvooarj55-817905745905.asia-east1.run.app',
            message: data.message || 'A required Zuzu AI OTA update is available.',
            changelogSummary: data.changelogSummary
          });
        }
      })
      .catch(() => {});
  }, []);

  // Subscribe to real Firebase Authentication state & isolate per-UID workspace
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeFirebaseAuthState(async (user) => {
      if (!active) return;
      setFirebaseUser(user);

      if (user) {
        try {
          const hydrated = await hydrateUserIsolatedWorkspace(user);
          if (!active) return;
          setUserProfile(hydrated.profile);
          setSettings(hydrated.settings);
          updateCounts();
        } catch {
          try {
            const fallbackProfile = await loadOrCreateUserProfile(user);
            if (active) setUserProfile(fallbackProfile);
          } catch {}
        }
      } else {
        setUserProfile(null);
        setSettings(getAppSettings());
        updateCounts();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Refresh reactive counts on workspace changes
  useEffect(() => {
    const onWorkspaceSwitched = () => {
      setSettings(getAppSettings());
      updateCounts();
    };
    window.addEventListener('zuzu-workspace-switched', onWorkspaceSwitched);
    return () => window.removeEventListener('zuzu-workspace-switched', onWorkspaceSwitched);
  }, []);

  // Sync Foreground Service, Always-On Wake Word & Custom Audio Triggers with Settings
  useEffect(() => {
    syncBackgroundServicesWithSettings(settings);
  }, [
    settings.foregroundServiceEnabled,
    settings.wakeWordEnabled,
    settings.wakeWordPhrase,
    settings.customTriggersEnabled,
    settings.customAudioTriggers,
    settings.recognitionLanguage
  ]);

  // Listen for Always-On Wake Word, Mouth Whistle (শিস) & Finger Snap triggers — immediately open listening without greeting speech
  useEffect(() => {
    const onWakeTriggered = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const remaining = typeof detail.remainingCommand === 'string' ? detail.remainingCommand.trim() : '';

      playHapticSound('listen_start');
      setIsVoiceMinimized(false);
      setActiveTab('voice');

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('zuzu-auto-start-voice', {
          detail: { remainingCommand: remaining }
        }));
      }, 90);
    };

    window.addEventListener('zuzu-wake-word-triggered', onWakeTriggered);
    return () => window.removeEventListener('zuzu-wake-word-triggered', onWakeTriggered);
  }, []);

  // Auto-sync authenticated user's private Firebase Cloud vault in background when local data changes
  useEffect(() => {
    if (!firebaseUser) return;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerDebouncedSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        pushActiveVaultToCloud(firebaseUser, true).catch(() => {});
      }, 3000);
    };

    window.addEventListener('zuzu-zu-data-changed', triggerDebouncedSync);
    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener('zuzu-zu-data-changed', triggerDebouncedSync);
    };
  }, [
    firebaseUser,
    textMessageCount,
    voiceSessionCount,
    settings.userNickname,
    settings.activePersonality
  ]);

  // Update counts whenever tab switches or sessions update
  const updateCounts = () => {
    setTextMessageCount(getChatMessages().length);
    setVoiceSessionCount(getVoiceSessions().length);
  };

  useEffect(() => {
    updateCounts();
  }, [activeTab, currentVoiceSession]);

  // Poll due reminders every 20s and notify/advance recurring reminders (never auto-complete)
  useEffect(() => {
    const checkDueReminders = () => {
      try {
        const list = getRemindersList();
        if (list.length === 0) return;

        const now = Date.now();
        let updated = false;
        const nextList = list.map((rem) => {
          if (!rem.completed && !rem.notified && typeof rem.time === 'number' && rem.time <= now) {
            updated = true;
            setDueReminderToast(
              rem.description?.trim()
                ? `${rem.title} — ${rem.description.trim()}`
                : rem.title || 'Scheduled Reminder'
            );
            const nativePlugin = getNativeZuzuPlugin();
            if (!nativePlugin && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Zuzu AI Reminder', {
                  body: rem.description?.trim()
                    ? `${rem.title} — ${rem.description.trim()}`
                    : rem.title || 'Reminder due now'
                });
              } catch {}
            }

            if (rem.recurrence && rem.recurrence !== 'none') {
              return {
                ...rem,
                time: computeNextRecurringTriggerMs(
                  rem.time,
                  rem.recurrence,
                  rem.recurrenceWeekday
                ),
                notified: false,
                completed: false,
                updatedAt: now
              };
            }
            return { ...rem, notified: true, completed: false, updatedAt: now };
          }
          return rem;
        });

        if (updated) {
          setRemindersList(nextList);
        }
      } catch {}
    };

    checkDueReminders();
    const timer = setInterval(checkDueReminders, 20000);
    return () => clearInterval(timer);
  }, []);

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    const updated = saveAppSettings(partial);
    setSettings(updated);
  };

  const handleSelectIdentity = (identity: VoiceIdentity) => {
    const currentVoice = getGeminiVoiceByName(settings.geminiVoiceName);
    const nextVoice =
      currentVoice && currentVoice.gender === identity
        ? currentVoice.id
        : getDefaultGeminiVoiceForIdentity(identity).id;
    handleUpdateSettings({ activeIdentity: identity, geminiVoiceName: nextVoice });
  };

  const handleSelectTab = (tab: ActiveTab) => {
    if (tab === 'voice') {
      setIsVoiceMinimized(false);
    }
    if (tab !== 'settings') {
      setSettingsTargetCategory(null);
    }
    setActiveTab(tab);
  };

  const handleMinimizeVoice = () => {
    setIsVoiceMinimized(true);
    setActiveTab('dashboard');
  };

  const handleMaximizeVoice = () => {
    setIsVoiceMinimized(false);
    setActiveTab('voice');
  };

  const handleCloseMinimizedVoice = () => {
    stopSpeaking();
    setIsVoiceMinimized(false);
  };

  return (
    <AndroidFrame
      activeIdentity={settings.activeIdentity}
      settings={settings}
    >
      {/* Android Top Action Bar */}
      <TopBar
        activeIdentity={settings.activeIdentity}
        activePersonality={settings.activePersonality}
        onSelectIdentity={handleSelectIdentity}
        onOpenSettings={() => {
          setSettingsTargetCategory(null);
          setActiveTab('settings');
        }}
        onOpenChat={() => setActiveTab('chat')}
        onOpenHistory={() => setActiveTab('history')}
        isBackendConnected={isBackendConnected}
        firebaseUser={firebaseUser}
        userProfile={userProfile}
        onOpenAuthModal={() => setAuthModalConfig({ isOpen: true, mode: 'signin' })}
        onOpenProfile={() => {
          setSettingsTargetCategory('profile');
          setActiveTab('settings');
        }}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {dueReminderToast && (
          <div className="mx-4 mt-2 px-3.5 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-bold shadow-lg flex items-center justify-between gap-2 z-40 animate-fade-in">
            <span className="truncate">Reminder: {dueReminderToast}</span>
            <button
              onClick={() => setDueReminderToast(null)}
              className="px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-extrabold flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onNavigateTab={handleSelectTab}
            textMessageCount={textMessageCount}
            voiceSessionCount={voiceSessionCount}
            isBackendConnected={isBackendConnected}
            onRequestApiKeyModal={(actionName, onResume) => setApiKeyModalConfig({ isOpen: true, actionName, onResume })}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onRequestApiKeyModal={(actionName, onResume) => setApiKeyModalConfig({ isOpen: true, actionName, onResume })}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onMinimize={handleMinimizeVoice}
            onOpenHistory={() => handleSelectTab('history')}
            currentSession={currentVoiceSession}
            setCurrentSession={setCurrentVoiceSession}
            onRequestApiKeyModal={(actionName, onResume) => setApiKeyModalConfig({ isOpen: true, actionName, onResume })}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView settings={settings} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onNavigateTab={handleSelectTab}
            initialCategory={settingsTargetCategory}
            firebaseUser={firebaseUser}
            userProfile={userProfile}
            onProfileUpdated={(updatedProfile) => {
              setUserProfile(updatedProfile);
              if (updatedProfile.displayName) {
                handleUpdateSettings({ userNickname: updatedProfile.displayName });
              }
            }}
            onOpenAuthModal={(mode = 'signin') =>
              setAuthModalConfig({ isOpen: true, mode })
            }
            onSignedOut={() => {
              setUserProfile(null);
              setSettings(getAppSettings());
              updateCounts();
            }}
          />
        )}

        {activeTab === 'updates' && (
          <UpdatesView
            onForceUpdateTriggered={(payload) => setForceUpdateInfo(payload)}
          />
        )}

        {activeTab === 'image_creator' && (
          <ImageCreatorView
            settings={settings}
            onBack={() => handleSelectTab('dashboard')}
            onOpenSettings={() => handleSelectTab('settings')}
          />
        )}


        {/* Floating Android Assistive Bubble if Voice Mode is minimized */}
        {isVoiceMinimized && activeTab !== 'voice' && (
          <MinimizedVoiceOverlay
            activeIdentity={settings.activeIdentity}
            onMaximize={handleMaximizeVoice}
            onClose={handleCloseMinimizedVoice}
          />
        )}
      </main>

      {/* Android Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        activeIdentity={settings.activeIdentity}
        isVoiceActive={Boolean(currentVoiceSession || isVoiceMinimized)}
        onMicClick={() => {
          if (activeTab === 'voice') {
            window.dispatchEvent(new CustomEvent('zuzu-voice-orb-toggle'));
          } else {
            handleSelectTab('voice');
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('zuzu-auto-start-voice', { detail: { remainingCommand: '' } }));
            }, 80);
          }
        }}
        onMicHoldCancel={() => {
          stopSpeaking();
          setIsVoiceMinimized(false);
          setCurrentVoiceSession(null);
        }}
      />

      {/* First-Launch Permission Introduction Popup */}
      <FirstLaunchPermissionModal
        isOpen={showFirstLaunch}
        onFinish={() => setShowFirstLaunch(false)}
      />

      {/* Floating Gemini API Key Popup */}
      <ApiKeyModal
        isOpen={apiKeyModalConfig.isOpen}
        onClose={() => setApiKeyModalConfig(prev => ({ ...prev, isOpen: false }))}
        currentKey={settings.customGeminiApiKey}
        onSaveKey={(newKey) =>
          handleUpdateSettings({
            customGeminiApiKey: newKey,
            geminiEnabled: Boolean(newKey.trim())
          })
        }
        pendingActionName={apiKeyModalConfig.actionName}
        onSuccessResume={apiKeyModalConfig.onResume}
      />

      {/* Mandatory Force Update Overlay ("OTA Update Required") */}
      <ForceUpdateOverlay
        isOpen={Boolean(forceUpdateInfo)}
        updateInfo={forceUpdateInfo}
        onStartOtaUpdate={() => {
          setForceUpdateInfo(null);
          setActiveTab('updates');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('zuzu-trigger-ota-sync'));
          }, 120);
        }}
      />

      {/* Firebase Authentication & Phone OTP Modal */}
      <AuthModal
        isOpen={authModalConfig.isOpen}
        mode={authModalConfig.mode}
        onClose={() => setAuthModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onAuthenticated={async (authenticatedUser) => {
          setFirebaseUser(authenticatedUser);
          try {
            const p = await loadOrCreateUserProfile(authenticatedUser);
            setUserProfile(p);
          } catch {}
        }}
      />
    </AndroidFrame>
  );
}

