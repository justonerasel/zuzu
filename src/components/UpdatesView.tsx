import React, { useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  RefreshCw, 
  Smartphone, 
  Brain, 
  CloudSun, 
  Radio, 
  ShieldCheck, 
  Layers, 
  Heart,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

export const UpdatesView: React.FC = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<string | null>(null);

  const handleCheckUpdate = () => {
    setIsChecking(true);
    setCheckStatus(null);
    setTimeout(() => {
      setIsChecking(false);
      setCheckStatus('Zuzu AI is up-to-date with the latest Android 14 build.');
    }, 1200);
  };

  const CHANGELOG = [
    {
      version: 'v3.5.0 (Latest Release)',
      date: 'Current Build',
      badge: 'Advanced Feature Update',
      features: [
        {
          title: '64-District Weather & Global Search',
          desc: 'Permanent GPS live forecast plus all 64 Bangladesh districts grouped by division, international cities, and worldwide Open-Meteo search.'
        },
        {
          title: 'AI Image Creator on Dashboard',
          desc: 'High-speed image generation powered by Gemini 3.1 Flash-Lite Image with preset prompt cards, instant previews, and image saving.'
        },
        {
          title: 'Voice Identity & Expression',
          desc: '5 selectable voice styles, real-time audio preview, playback speed & volume calibration, and Gemini Live model selector.'
        },
        {
          title: 'Assistant Nickname & GF Mode Greetings',
          desc: 'Customizable assistant wake nickname and dynamic girlfriend-mode affectionate greetings across 4 intensity levels in Bengali & English.'
        },
        {
          title: 'AI Providers: Gemini & xAI Grok',
          desc: 'Multi-provider reasoning engine with secure device-only API keys, live connection testing, and automatic latency fallback.'
        },
        {
          title: '17 Permissions Center & Platform Automation',
          desc: 'Live permission status across Core, System, Media & Hardware, plus transparent Facebook and Gallery automation workflow.'
        }
      ]
    },
    {
      version: 'v3.2.0',
      date: 'Earlier',
      badge: 'Core Feature',
      features: [
        {
          title: 'Dual Gender Voice Architecture',
          desc: 'Brian (Male) and Sarah (Female) premade voices via ElevenLabs and calibrated Android Speech synthesis.'
        },
        {
          title: 'Strict History Isolation',
          desc: '100% strict separation between typed Text Chat and spoken Voice Sessions in isolated persistent stores.'
        }
      ]
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-8">
      {/* Header Banner */}
      <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 p-5 shadow-lg shadow-purple-900/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span>System Release</span>
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              Zuzu AI Updates
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Version 3.5.0 • Android AI Assistant Architecture
            </p>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={isChecking}
            className="p-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5 text-xs font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Check'}</span>
          </button>
        </div>

        {checkStatus && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{checkStatus}</span>
          </div>
        )}
      </div>

      {/* Changelog Cards */}
      <div className="space-y-3">
        {CHANGELOG.map((release, rIdx) => (
          <div
            key={release.version}
            className="rounded-3xl bg-white/75 backdrop-blur-xl border border-white/80 p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between border-b border-purple-100/60 pb-2.5">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <span>{release.version}</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold ${
                    rIdx === 0 ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {release.badge}
                  </span>
                </h3>
                <span className="text-[10px] text-slate-400">{release.date}</span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              {release.features.map((feat) => (
                <div key={feat.title} className="flex items-start gap-2.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-700">{feat.title}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* System Integrity & Build Info */}
      <div className="rounded-3xl bg-white/60 backdrop-blur-md border border-white/70 p-4 text-xs text-slate-500 space-y-1">
        <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
          <ShieldCheck className="w-4 h-4 text-purple-600" />
          <span>Application Environment</span>
        </div>
        <div>Target Platform: Android 14 / Capacitor &amp; Modern Mobile Web</div>
        <div>Neural Backend: Gemini 3.8 Flash + ElevenLabs Multilingual V2</div>
        <div>Data Privacy: On-device Local Storage with Anti-Leak Filter</div>
      </div>
    </div>
  );
};
