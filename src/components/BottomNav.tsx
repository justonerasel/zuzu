import React, { useRef, useState } from 'react';
import { Home, MessageSquare, Mic, Settings, Sparkles } from 'lucide-react';
import { ActiveTab, VoiceIdentity } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  activeIdentity: VoiceIdentity;
  isVoiceActive?: boolean;
  onMicClick?: () => void;
  onMicHoldCancel?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  activeIdentity,
  isVoiceActive = false,
  onMicClick,
  onMicHoldCancel
}) => {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = () => {
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      if (onMicHoldCancel) {
        onMicHoldCancel();
      }
    }, 700); // 700ms hold to cancel
  };

  const handleTouchEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!isHolding) {
      if (onMicClick) {
        onMicClick();
      } else {
        onSelectTab('voice');
      }
    }
    setIsHolding(false);
  };

  return (
    <nav className="h-16 bg-white/85 backdrop-blur-2xl border-t border-purple-100/80 px-2 flex items-center justify-around z-30 select-none relative shadow-lg shadow-purple-950/5">
      {/* 1. Home */}
      <button
        onClick={() => onSelectTab('dashboard')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'dashboard'
            ? 'text-purple-700 font-bold'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <Home className={`w-5 h-5 mb-0.5 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        <span className="text-[10px] tracking-tight">Home</span>
      </button>

      {/* 2. Chat */}
      <button
        onClick={() => onSelectTab('chat')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'chat'
            ? 'text-purple-700 font-bold'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <MessageSquare className={`w-5 h-5 mb-0.5 ${activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        <span className="text-[10px] tracking-tight">Chat</span>
      </button>

      {/* 3. Central Prominent Elevated Microphone Button */}
      <div className="flex-1 flex justify-center -mt-6">
        <button
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-500 shadow-xl shadow-purple-600/30 flex items-center justify-center text-white border-[3.5px] border-[#f5f3ff] transform active:scale-90 transition-all duration-200 relative ${
            isVoiceActive ? 'animate-pulse ring-4 ring-purple-400/30' : ''
          }`}
          title="Tap to Speak • Hold to Cancel"
        >
          <Mic className="w-6 h-6 stroke-[2.2]" />
          {isVoiceActive && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
          )}
        </button>
      </div>

      {/* 4. Settings */}
      <button
        onClick={() => onSelectTab('settings')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'settings'
            ? 'text-purple-700 font-bold'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <Settings className={`w-5 h-5 mb-0.5 ${activeTab === 'settings' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
        <span className="text-[10px] tracking-tight">Settings</span>
      </button>

      {/* 5. Updates */}
      <button
        onClick={() => onSelectTab('updates')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'updates'
            ? 'text-purple-700 font-bold'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <div className="relative">
          <Sparkles className={`w-5 h-5 mb-0.5 ${activeTab === 'updates' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-purple-600" />
        </div>
        <span className="text-[10px] tracking-tight">Updates</span>
      </button>
    </nav>
  );
};
