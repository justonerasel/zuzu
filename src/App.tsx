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
import { stopSpeaking, speakText, playHapticSound } from './utils/audio';
import { apiFetch, APP_VERSION, APP_VERSION_CODE } from './utils/apiConfig';
import { syncBackgroundServicesWithSettings, setMicBusyForActiveSession } from './utils/backgroundService';
import { buildSmartWakeGreeting, getCachedWeatherSummary, refreshWeatherCacheSilently } from './utils/greetingHelper';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { syncZuCloudNow } from './utils/zuAccount';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentVoiceSession, setCurrentVoiceSession] = useState<VoiceSession | null>(null);
  const [isVoiceMinimized, setIsVoiceMinimized] = useState(false);
  const [textMessageCount, setTextMessageCount] = useState(0);
  const [voiceSessionCount, setVoiceSessionCount] = useState(0);
  const [isBackendConnected, setIsBackendConnected] = useState(true);

  // Force Update Overlay State (only shown when server signals genuine required update)
  const [forceUpdateInfo, setForceUpdateInfo] = useState<ForceUpdatePayload | null>(null);

  // First-launch permission flow state (Requirement 3)
  const [showFirstLaunch, setShowFirstLaunch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('zuzu_first_launch_done');
  });

  // Floating Gemini API Key Popup state (Requirement 4)
  const [apiKeyModalConfig, setApiKeyModalConfig] = useState<{
    isOpen: boolean;
    actionName?: string;
    onResume?: () => void;
  }>({ isOpen: false });

  // Initialize, configure edge-to-edge StatusBar, check Force Update & perform legacy migration on initial mount
  useEffect(() => {
    performHistoryMigration();
    updateCounts();

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

  // Listen for Always-On Wake Word, Mouth Whistle (শিস) & Finger Snap triggers
  useEffect(() => {
    const onWakeTriggered = async (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const remaining = typeof detail.remainingCommand === 'string' ? detail.remainingCommand.trim() : '';

      playHapticSound('switch');
      setIsVoiceMinimized(false);
      setActiveTab('voice');

      if (remaining) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('zuzu-auto-start-voice', {
            detail: { remainingCommand: remaining, greetingSpoken: true }
          }));
        }, 250);
        return;
      }

      // Pause background mic cleanly BEFORE Zuzu speaks greeting
      setMicBusyForActiveSession(true);

      const weather = await refreshWeatherCacheSilently(settings).catch(() => getCachedWeatherSummary());
      const reply = buildSmartWakeGreeting(settings, { weather });

      // Ensure VoiceView is mounted before dispatching display event
      await new Promise((resolve) => setTimeout(resolve, 60));
      window.dispatchEvent(new CustomEvent('zuzu-wake-greeting', {
        detail: { greetingText: reply, triggerLabel: detail.triggerLabel || '' }
      }));

      speakText({
        text: reply,
        voiceIdentity: settings.activeIdentity,
        customVoiceId: settings.activeIdentity === 'female' ? settings.elevenLabsFemaleVoiceId : settings.elevenLabsMaleVoiceId,
        customApiKey: settings.customElevenLabsApiKey,
        stability: settings.stability,
        similarityBoost: settings.similarityBoost,
        speechRate: settings.speechRate,
        volume: settings.volume,
        voiceStyleId: settings.selectedVoiceStyleId,
        onEnd: () => {
          window.dispatchEvent(new CustomEvent('zuzu-auto-start-voice', {
            detail: { remainingCommand: '', greetingSpoken: true, greetingText: reply }
          }));
        },
        onError: () => {
          window.dispatchEvent(new CustomEvent('zuzu-auto-start-voice', {
            detail: { remainingCommand: '', greetingSpoken: true, greetingText: reply }
          }));
        }
      });
    };

    window.addEventListener('zuzu-wake-word-triggered', onWakeTriggered);
    return () => window.removeEventListener('zuzu-wake-word-triggered', onWakeTriggered);
  }, [
    settings.activeIdentity,
    settings.userNickname,
    settings.recognitionLanguage,
    settings.elevenLabsFemaleVoiceId,
    settings.elevenLabsMaleVoiceId,
    settings.customElevenLabsApiKey,
    settings.stability,
    settings.similarityBoost,
    settings.speechRate,
    settings.volume,
    settings.selectedVoiceStyleId
  ]);

  // Auto-sync ZU-ID Account Firebase cloud backup in background when local data changes
  useEffect(() => {
    if (!settings.zuAccountId || !settings.zuVaultKey) return;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerDebouncedSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        const latest = getAppSettings();
        if (latest.zuAccountId && latest.zuVaultKey) {
          syncZuCloudNow(latest).catch(() => {});
        }
      }, 3000);
    };

    window.addEventListener('zuzu-zu-data-changed', triggerDebouncedSync);
    triggerDebouncedSync();

    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener('zuzu-zu-data-changed', triggerDebouncedSync);
    };
  }, [
    textMessageCount,
    voiceSessionCount,
    settings.zuAccountId,
    settings.zuVaultKey,
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

  const handleUpdateSettings = (partial: Partial<AppSettings>) => {
    const updated = saveAppSettings(partial);
    setSettings(updated);
  };

  const handleSelectIdentity = (identity: VoiceIdentity) => {
    handleUpdateSettings({ activeIdentity: identity });
  };

  const handleSelectTab = (tab: ActiveTab) => {
    if (tab === 'voice') {
      setIsVoiceMinimized(false);
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
        onOpenSettings={() => setActiveTab('settings')}
        onOpenChat={() => setActiveTab('chat')}
        isBackendConnected={isBackendConnected}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'dashboard' && (
          <DashboardView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onNavigateTab={handleSelectTab}
            textMessageCount={textMessageCount}
            voiceSessionCount={voiceSessionCount}
            isBackendConnected={isBackendConnected}
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
        onMicClick={() => handleSelectTab('voice')}
        onMicHoldCancel={() => {
          stopSpeaking();
          setIsVoiceMinimized(false);
          setCurrentVoiceSession(null);
        }}
      />

      {/* First-Launch Permission Introduction Popup (Requirement 3) */}
      <FirstLaunchPermissionModal
        isOpen={showFirstLaunch}
        onFinish={() => setShowFirstLaunch(false)}
      />

      {/* Floating Gemini API Key Popup (Requirement 4) */}
      <ApiKeyModal
        isOpen={apiKeyModalConfig.isOpen}
        onClose={() => setApiKeyModalConfig(prev => ({ ...prev, isOpen: false }))}
        currentKey={settings.customGeminiApiKey}
        onSaveKey={(newKey) => handleUpdateSettings({ customGeminiApiKey: newKey })}
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
    </AndroidFrame>
  );
}
