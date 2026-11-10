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
import { stopSpeaking } from './utils/audio';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentVoiceSession, setCurrentVoiceSession] = useState<VoiceSession | null>(null);
  const [isVoiceMinimized, setIsVoiceMinimized] = useState(false);
  const [textMessageCount, setTextMessageCount] = useState(0);
  const [voiceSessionCount, setVoiceSessionCount] = useState(0);
  const [isBackendConnected, setIsBackendConnected] = useState(true);

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

  // Initialize and perform safe legacy migration on initial mount
  useEffect(() => {
    performHistoryMigration();
    updateCounts();

    // Verify backend connectivity
    fetch('/api/config')
      .then(res => res.json())
      .then(() => setIsBackendConnected(true))
      .catch(() => setIsBackendConnected(false));
  }, []);

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
          <UpdatesView />
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
    </AndroidFrame>
  );
}
