import React from 'react';
import { Mic, Volume2, Sparkles, X, Maximize2 } from 'lucide-react';
import { VoiceIdentity } from '../types';
import { VOICE_IDENTITIES } from '../constants/personalities';

interface MinimizedVoiceOverlayProps {
  activeIdentity: VoiceIdentity;
  onMaximize: () => void;
  onClose: () => void;
}

export const MinimizedVoiceOverlay: React.FC<MinimizedVoiceOverlayProps> = ({
  activeIdentity,
  onMaximize,
  onClose
}) => {
  const currentIdentity = VOICE_IDENTITIES[activeIdentity];

  return (
    <div className="absolute bottom-20 right-4 z-50 flex items-center gap-2 select-none animate-bounce-short">
      <div
        onClick={onMaximize}
        className={`px-3.5 py-2.5 rounded-2xl bg-white/95 backdrop-blur-xl border ${
          activeIdentity === 'female' ? 'border-purple-300 shadow-purple-200/60' : 'border-blue-300 shadow-blue-200/60'
        } shadow-lg flex items-center gap-2.5 cursor-pointer hover:scale-105 active:scale-95 transition-all text-slate-800`}
      >
        {/* Pulsating Icon */}
        <div
          className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${currentIdentity.avatarGradient} p-0.5 flex items-center justify-center shadow-xs`}
        >
          <div className="w-full h-full bg-white/90 rounded-[10px] flex items-center justify-center">
            <Mic
              className={`w-3.5 h-3.5 ${
                activeIdentity === 'female' ? 'text-purple-600' : 'text-blue-600'
              } animate-pulse`}
            />
          </div>
        </div>

        <div>
          <div className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1">
            <span>{currentIdentity.name}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
          <div className="text-[9px] text-slate-500 font-mono">Tap to expand session</div>
        </div>

        <Maximize2 className="w-3.5 h-3.5 text-slate-400 ml-1" />
      </div>

      {/* Quick Close Button */}
      <button
        onClick={onClose}
        className="w-7 h-7 rounded-full bg-white/90 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors shadow-md"
        title="Stop and Close Voice Assistant"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
