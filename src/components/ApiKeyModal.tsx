import React, { useState } from 'react';
import { 
  Key, 
  Sparkles, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ExternalLink, 
  RefreshCw,
  Cpu,
  Lock
} from 'lucide-react';
import { playHapticSound } from '../utils/audio';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (newKey: string) => void;
  pendingActionName?: string;
  onSuccessResume?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey,
  pendingActionName,
  onSuccessResume
}) => {
  const [keyInput, setKeyInput] = useState(currentKey || '');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setTestStatus({
        success: false,
        message: 'Please enter a Gemini API key first.'
      });
      playHapticSound('listen_stop');
      return;
    }

    setTesting(true);
    setTestStatus(null);
    playHapticSound('message_sent');

    try {
      const res = await fetch('/api/test-ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          customGeminiKey: trimmed
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestStatus({
          success: true,
          message: `Valid ✓ Connected to Google Gemini (${data.latencyMs || 150}ms)`
        });
        playHapticSound('listen_start');
      } else {
        setTestStatus({
          success: false,
          message: data.error || 'Connection failed: Invalid API key or model unreachable.'
        });
        playHapticSound('listen_stop');
      }
    } catch (err: any) {
      setTestStatus({
        success: false,
        message: err?.message || 'Network error while validating API key.'
      });
      playHapticSound('listen_stop');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = keyInput.trim();
    onSaveKey(trimmed);
    playHapticSound('message_sent');
    onClose();
    if (onSuccessResume && trimmed.length > 0) {
      setTimeout(() => {
        onSuccessResume();
      }, 250);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="bg-white/95 backdrop-blur-2xl border border-purple-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-slate-800">
        {/* Glow ambient background decoration */}
        <div className="absolute -top-14 -right-14 w-36 h-36 bg-purple-300/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-14 -left-14 w-36 h-36 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />

        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-200 mb-3 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-purple-600">
              <Key className="w-7 h-7" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 border border-purple-200 text-purple-800 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            <Sparkles className="w-3 h-3 text-purple-600" />
            <span>Google Gemini AI</span>
          </div>

          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            Configure Gemini API Key
          </h3>

          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {pendingActionName ? (
              <span>
                To use <strong className="text-purple-700">{pendingActionName}</strong>, please provide your personal Google Gemini API key.
              </span>
            ) : (
              'Connect your Google Gemini API key to activate natural conversation, intelligent voice responses, and advanced screen reasoning.'
            )}
          </p>
        </div>

        {/* API Key Input Field */}
        <div className="mt-4 space-y-2">
          <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
            <span>Gemini API Key</span>
            <span className="text-[10px] text-slate-400 font-normal">Stored securely on device</span>
          </label>

          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setTestStatus(null);
              }}
              placeholder="AIzaSy..."
              className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-purple-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all shadow-inner"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors"
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Test Status Feedback */}
        {testStatus && (
          <div
            className={`mt-3 p-2.5 rounded-xl text-xs flex items-start gap-2 border animate-fade-in ${
              testStatus.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {testStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <span className="leading-tight font-medium">{testStatus.message}</span>
          </div>
        )}

        {/* Free API Key Setup Link */}
        <div className="mt-3.5 p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[11px] text-indigo-950 font-medium">Free API key from Google AI Studio</span>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 underline underline-offset-2"
          >
            <span>Get Free Key</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !keyInput.trim()}
            className="w-full py-2.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connection'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-purple-200 flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Save &amp; Continue</span>
          </button>
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-1.5 text-slate-500 hover:text-slate-800 text-[11px] font-medium transition-colors text-center"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
