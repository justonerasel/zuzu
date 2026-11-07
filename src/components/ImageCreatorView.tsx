import React, { useState } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Share2, 
  X, 
  RefreshCw, 
  AlertCircle, 
  ArrowLeft,
  Copy,
  Check,
  Wand2,
  Sliders,
  ExternalLink
} from 'lucide-react';
import { AppSettings } from '../types';
import { playHapticSound } from '../utils/audio';

interface ImageCreatorViewProps {
  settings: AppSettings;
  onBack: () => void;
  onOpenSettings: () => void;
}

const PROMPT_HINTS = [
  {
    title: 'Futuristic Cybercity',
    prompt: 'Create a cinematic futuristic city at night with neon holographic billboards and flying vehicles in 8k.',
    emoji: '🌃'
  },
  {
    title: '3D Neon Zuzu Logo',
    prompt: 'Generate a beautiful 3D neon Zuzu AI logo glowing with electric cyan, purple, and rose crystals.',
    emoji: '💎'
  },
  {
    title: 'Fantasy Character',
    prompt: 'Create a realistic portrait of a fantasy character with radiant glowing eyes and intricate ornamental robes.',
    emoji: '🧙'
  }
];

const ASPECT_RATIOS = [
  { id: '1:1', label: 'Square (1:1)' },
  { id: '16:9', label: 'Landscape (16:9)' },
  { id: '9:16', label: 'Portrait (9:16)' },
  { id: '4:3', label: 'Standard (4:3)' }
];

export const ImageCreatorView: React.FC<ImageCreatorViewProps> = ({
  settings,
  onBack,
  onOpenSettings
}) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.1-flash-lite-image');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresKey, setRequiresKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSelectHint = (hintPrompt: string) => {
    setPrompt(hintPrompt);
    playHapticSound('switch');
  };

  const handleClearPrompt = () => {
    setPrompt('');
    playHapticSound('switch');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setErrorMsg(null);
    setRequiresKey(false);
    playHapticSound('message_sent');

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          customGeminiKey: settings.customGeminiApiKey
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresKey || res.status === 401) {
          setRequiresKey(true);
        }
        throw new Error(data.error || 'Failed to generate image. Please try again.');
      }

      setGeneratedImage(data.imageUrl);
      if (data.model) setActiveModel(data.model);
      playHapticSound('listen_start');
    } catch (err: any) {
      console.error('Image generation error:', err);
      setErrorMsg(err.message || 'Image generation failed. Ensure your Gemini API Key is configured.');
      playHapticSound('listen_stop');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveImage = () => {
    if (!generatedImage) return;
    try {
      const a = document.createElement('a');
      a.href = generatedImage;
      a.download = `zuzu-ai-generated-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      playHapticSound('listen_start');
    } catch (err) {
      console.warn('Download error:', err);
    }
  };

  const handleShareImage = async () => {
    if (!generatedImage) return;
    if (navigator.share) {
      try {
        // Convert base64 to Blob if possible
        const res = await fetch(generatedImage);
        const blob = await res.blob();
        const file = new File([blob], 'zuzu-ai-art.png', { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Zuzu AI Image Creator',
            text: `Generated with Zuzu AI: "${prompt.slice(0, 60)}"`,
            files: [file]
          });
          return;
        }
      } catch (err) {
        console.warn('Native share failed, falling back to url:', err);
      }
    }

    // Fallback: Copy link/notice
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-purple-50/50 via-slate-50 to-indigo-50/40 select-none">
      {/* Top Bar */}
      <div className="px-4 py-3 bg-white/80 backdrop-blur-md border-b border-purple-100 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-extrabold text-slate-800">Image Creator</h2>
              <span className="text-[9px] font-mono bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full font-bold">
                Gemini Vision
              </span>
            </div>
            <p className="text-[10px] text-slate-500">Real neural image generation powered by Gemini API</p>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-xl border border-purple-200 transition-colors flex items-center gap-1"
        >
          <Sliders className="w-3 h-3" />
          <span>API Key</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar pb-10">
        {/* Prompt Input Glass Card */}
        <div className="p-4 bg-white/90 backdrop-blur-xl border border-purple-100/80 rounded-3xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-purple-600" />
              <span>Describe the image you want to create:</span>
            </label>
            {prompt && (
              <button
                onClick={handleClearPrompt}
                className="text-[10px] text-slate-400 hover:text-rose-600 flex items-center gap-0.5 font-semibold"
              >
                <X className="w-3 h-3" />
                <span>Clear Prompt</span>
              </button>
            )}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. A futuristic cyberpunk street in Dhaka with glowing neon lights, cinematic 8k detailed portrait..."
            className="w-full p-3 bg-purple-50/40 text-xs text-slate-800 rounded-2xl border border-purple-100 focus:outline-none focus:border-purple-400 focus:bg-white resize-none shadow-inner"
          />

          {/* Aspect Ratio Selector */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aspect Ratio:</div>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map(ar => (
                <button
                  key={ar.id}
                  onClick={() => {
                    setAspectRatio(ar.id);
                    playHapticSound('switch');
                  }}
                  className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border text-center transition-all ${
                    aspectRatio === ar.id
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={`w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md ${
              isGenerating || !prompt.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-purple-600/25 active:scale-98'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Generating with Gemini API...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Generate Image</span>
              </>
            )}
          </button>
        </div>

        {/* 3 Prompt Hint Cards (Requirement 2) */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
            Prompt Ideas (Tap to Insert):
          </div>

          <div className="grid grid-cols-1 gap-2">
            {PROMPT_HINTS.map((hint, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectHint(hint.prompt)}
                className="p-3 bg-white/80 hover:bg-white border border-purple-100 rounded-2xl text-left text-xs transition-all shadow-xs hover:border-purple-300 flex items-start gap-2.5 group active:scale-98"
              >
                <div className="text-xl flex-shrink-0">{hint.emoji}</div>
                <div>
                  <div className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>{hint.title}</span>
                    <span className="text-[9px] text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Use prompt →
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {hint.prompt}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Error State with API Key Notice */}
        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-900 text-xs animate-fade-in shadow-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Image Generation Failed</div>
                <p className="text-[11px] text-rose-700 leading-relaxed">{errorMsg}</p>
              </div>
            </div>

            {requiresKey && (
              <div className="pt-2 border-t border-rose-200/80 flex items-center justify-between">
                <span className="text-[10px] text-rose-600">Requires a Google Gemini API Key</span>
                <button
                  onClick={onOpenSettings}
                  className="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-bold text-[10px] hover:bg-rose-700 flex items-center gap-1"
                >
                  <span>Configure Key in Settings</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Generated Image Preview Card */}
        {generatedImage && (
          <div className="p-4 bg-white/95 border border-purple-200 rounded-3xl shadow-md space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-600" />
                <span className="font-extrabold text-xs text-slate-800">Generated Artwork</span>
              </div>
              <span className="text-[9px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                {activeModel}
              </span>
            </div>

            {/* Image Container */}
            <div className="overflow-hidden rounded-2xl border border-purple-100 bg-slate-900 flex items-center justify-center max-h-[360px]">
              <img
                src={generatedImage}
                alt={prompt}
                className="w-full h-auto object-contain max-h-[360px]"
              />
            </div>

            {/* Prompt Recall */}
            <p className="text-[11px] text-slate-600 italic px-1 line-clamp-2">
              "{prompt}"
            </p>

            {/* Action Buttons: Save & Share */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleSaveImage}
                className="py-2.5 px-3 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-purple-200"
              >
                <Download className="w-3.5 h-3.5 text-purple-700" />
                <span>Save Image</span>
              </button>

              <button
                onClick={handleShareImage}
                className="py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Saved to Device</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Image</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
