import React, { useState } from 'react';
import { Calendar, Sparkles, ChevronDown, ChevronUp, Globe, Award, Flag } from 'lucide-react';
import { getTodayHighlights, TodayHighlightData } from '../utils/dailyHighlights';
import { playHapticSound } from '../utils/audio';

export const DailyHighlightsWidget: React.FC = () => {
  const [data] = useState<TodayHighlightData>(() => getTodayHighlights());
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-purple-100/90 p-4 shadow-sm space-y-2.5 transition-all text-slate-800">
      {/* Header with Date & Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-900 tracking-tight">
                {data.dayOfWeek}, {data.fullDateString}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700">
                Today
              </span>
            </div>
            <p className="text-[10px] text-purple-700 font-medium">
              {data.bengaliDateString}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            playHapticSound('switch');
            setIsExpanded(!isExpanded);
          }}
          className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Observances and Events List */}
      {isExpanded && (
        <div className="space-y-1.5 pt-1 animate-fade-in">
          {data.events.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-2xl bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white border border-purple-100/70 text-left flex items-start gap-2.5 shadow-2xs"
            >
              <span className="text-base flex-shrink-0 mt-0.5">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <h4 className="text-[11px] font-bold text-slate-900 leading-snug">
                    {item.title}
                  </h4>
                  <span
                    className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full border ${item.badgeColor}`}
                  >
                    {item.category}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
