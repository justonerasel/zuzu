import React from 'react';
import { Sparkles, MessageSquare, Settings, Radio } from 'lucide-react';
import { VoiceIdentity, PersonalityId, ActiveTab } from '../types';
import { PERSONALITIES, VOICE_IDENTITIES } from '../constants/personalities';
import { playHapticSound } from '../utils/audio';

interface TopBarProps {
  activeIdentity: VoiceIdentity;
  activePersonality: PersonalityId;
  onSelectIdentity: (id: VoiceIdentity) => void;
  onOpenSettings: () => void;
  onOpenChat?: () => void;
  isBackendConnected?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeIdentity,
  activePersonality,
  onSelectIdentity,
  onOpenSettings,
  onOpenChat,
  isBackendConnected = true
}) => {
  const currentIdentity = VOICE_IDENTITIES[activeIdentity];
  const personality = PERSONALITIES[activePersonality] || PERSONALITIES.Normal;

  const handleToggleIdentity = () => {
    const nextId: VoiceIdentity = activeIdentity === 'male' ? 'female' : 'male';
    playHapticSound('switch');
    onSelectIdentity(nextId);
  };

  return (
    <header className="px-4 py-2.5 bg-white/70 backdrop-blur-xl border-b border-purple-100/70 flex items-center justify-between z-30 select-none shadow-sm shadow-purple-950/5">
      {/* 1. Upper Left: Chat Shortcut */}
      <button
        onClick={onOpenChat}
        className="w-10 h-10 rounded-2xl bg-white/90 hover:bg-white text-purple-700 shadow-sm border border-purple-100/80 flex items-center justify-center transition-all active:scale-95 group relative"
        title="Open Text Chat"
      >
        <MessageSquare className="w-5 h-5 text-purple-600 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full border border-white" />
      </button>

      {/* 2. Center: Zuzu AI Logo & Name */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-500 p-0.5 shadow-md shadow-purple-600/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-black text-base tracking-tight text-slate-800">
            Zuzu <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">AI</span>
          </span>
        </div>
        <div className="text-[10px] text-purple-700/80 font-medium flex items-center gap-1">
          <span>{currentIdentity.name}</span>
          <span>•</span>
          <span>{personality.emoji} {personality.name}</span>
        </div>
      </div>

      {/* 3. Upper Right: Settings Shortcut & Quick Identity Switch */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleToggleIdentity}
          className={`h-8 px-2.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1 shadow-sm ${
            activeIdentity === 'female'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-indigo-50 border-indigo-200 text-indigo-700'
          }`}
          title="Switch Voice Gender"
        >
          <span>{activeIdentity === 'female' ? '♀ Female' : '♂ Male'}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-2xl bg-white/90 hover:bg-white text-slate-600 hover:text-purple-700 shadow-sm border border-purple-100/80 flex items-center justify-center transition-all active:scale-95 group"
          title="Open Settings"
        >
          <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform" />
        </button>
      </div>
    </header>
  );
};
