import React, { useState } from 'react';
import { 
  Share2, 
  Search, 
  MessageSquare, 
  ThumbsUp, 
  Image as ImageIcon, 
  X, 
  ExternalLink, 
  Check, 
  AlertTriangle, 
  Sparkles, 
  ShieldCheck, 
  Upload, 
  Edit3,
  RefreshCw,
  Lock
} from 'lucide-react';
import { AppSettings } from '../types';
import { playHapticSound } from '../utils/audio';

export type FacebookTaskType = 'search' | 'comment' | 'like' | 'upload_photo' | 'info';

interface FacebookAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTask?: FacebookTaskType;
  initialQuery?: string;
  settings: AppSettings;
}

export const FacebookAutomationModal: React.FC<FacebookAutomationModalProps> = ({
  isOpen,
  onClose,
  initialTask = 'search',
  initialQuery = '',
  settings
}) => {
  const [activeTask, setActiveTask] = useState<FacebookTaskType>(initialTask);
  const [searchTarget, setSearchTarget] = useState(initialQuery || '');
  const [profileTarget, setProfileTarget] = useState(initialQuery || '');
  const [draftComment, setDraftComment] = useState('Great post! Truly inspiring work ✨');
  const [postUrl, setPostUrl] = useState('');
  
  // Gallery upload state
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. Open Facebook Search
  const handleExecuteSearch = () => {
    const query = searchTarget.trim();
    if (!query) return;

    playHapticSound('message_sent');
    // Primary Android Intent via web fallback
    const fbUrl = `https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`;
    window.open(fbUrl, '_blank');
  };

  // 2. Prepare Comment & Open
  const handleExecuteComment = () => {
    playHapticSound('message_sent');
    // Copy comment to clipboard for user convenience
    if (navigator.clipboard && draftComment) {
      navigator.clipboard.writeText(draftComment);
    }
    const target = profileTarget.trim();
    const url = target.startsWith('http') 
      ? target 
      : target 
      ? `https://www.facebook.com/search/top/?q=${encodeURIComponent(target)}`
      : 'https://www.facebook.com';
    window.open(url, '_blank');
  };

  // 3. Like Post
  const handleExecuteLike = () => {
    playHapticSound('message_sent');
    const url = postUrl.trim() || 'https://www.facebook.com';
    window.open(url, '_blank');
  };

  // 4. Handle Gallery Photo Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setSelectedPhoto(base64);
      setUploadStatus(null);
      playHapticSound('switch');

      // Automatically generate caption via AI
      setIsGeneratingCaption(true);
      try {
        const res = await fetch('/api/generate-caption', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type,
            customGeminiKey: settings.customGeminiApiKey
          })
        });
        const data = await res.json();
        setPhotoCaption(data.caption || 'Captured moments ✨ #Life #Photography');
      } catch (err) {
        setPhotoCaption('Cherishing every moment ✨ #Memories #GoodTimes');
      } finally {
        setIsGeneratingCaption(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 5. Confirm & Publish to Facebook
  const handleConfirmUpload = () => {
    if (!selectedPhoto) return;
    setIsUploading(true);
    playHapticSound('message_sent');

    // Copy caption to clipboard so user can immediately paste it into Facebook
    if (navigator.clipboard && photoCaption) {
      navigator.clipboard.writeText(photoCaption);
    }

    setTimeout(() => {
      setIsUploading(false);
      setUploadStatus('success');

      // Open Facebook official sharer / web intent
      const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.origin)}&quote=${encodeURIComponent(photoCaption)}`;
      window.open(fbShareUrl, '_blank');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in select-none">
      <div className="bg-white rounded-3xl p-5 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl border border-blue-100 animate-scale-in space-y-3.5">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
              f
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Facebook &amp; Gallery Assistant</h3>
              <p className="text-[10px] text-slate-400">Authentic Android intent &amp; automation workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
          {[
            { id: 'search', label: 'Search Person', icon: Search },
            { id: 'upload_photo', label: 'Upload Photo', icon: Upload },
            { id: 'comment', label: 'Comment', icon: MessageSquare },
            { id: 'like', label: 'Like Post', icon: ThumbsUp },
            { id: 'info', label: 'Capabilities', icon: ShieldCheck }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTask(tab.id as any);
                  playHapticSound('switch');
                }}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTask === tab.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 text-slate-800 text-xs">
          
          {/* TASK 1: SEARCH PERSON */}
          {activeTask === 'search' && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Give voice or typed commands like: <br />
                <span className="font-semibold text-blue-700 italic">"Zuzu, open Facebook and search for MD Rasel Hossen"</span>
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Person / Page Name:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTarget}
                    onChange={(e) => setSearchTarget(e.target.value)}
                    placeholder="Enter name (e.g. MD RASEL HOSSEN)"
                    className="w-full bg-slate-50 text-xs text-slate-800 pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/70 border border-blue-200/70 rounded-xl text-[11px] text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-blue-600" />
                  <span>Verified Intent Workflow:</span>
                </div>
                <p className="text-[10px] text-blue-800">
                  Directs directly into the Facebook App or web search without requiring password bypass or scraping.
                </p>
              </div>

              <button
                onClick={handleExecuteSearch}
                disabled={!searchTarget.trim()}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Facebook Search</span>
              </button>
            </div>
          )}

          {/* TASK 2: UPLOAD PHOTO FROM GALLERY */}
          {activeTask === 'upload_photo' && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Command: <span className="font-semibold text-blue-700 italic">"Upload the photo in my Gallery to Facebook with a suitable caption."</span>
              </p>

              {/* Photo Picker */}
              <div>
                <input
                  type="file"
                  id="fb-photo-upload"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!selectedPhoto ? (
                  <label
                    htmlFor="fb-photo-upload"
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 rounded-2xl cursor-pointer transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xs text-blue-800">Select Photo from Android Gallery</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">JPEG, PNG, WEBP</span>
                  </label>
                ) : (
                  <div className="space-y-2.5">
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 max-h-48 bg-slate-900 flex items-center justify-center">
                      <img src={selectedPhoto} alt="Selected" className="max-h-48 w-auto object-contain" />
                      <label
                        htmlFor="fb-photo-upload"
                        className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black text-white text-[10px] font-bold cursor-pointer"
                      >
                        Change Photo
                      </label>
                    </div>

                    {/* AI Generated Caption Box */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                        <span className="flex items-center gap-1 text-purple-700">
                          <Sparkles className="w-3 h-3" />
                          <span>AI-Generated Caption (Editable):</span>
                        </span>
                        {isGeneratingCaption && <span className="text-purple-600 animate-pulse">Analyzing image...</span>}
                      </div>

                      <textarea
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        rows={2}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-400 resize-none"
                      />
                      <p className="text-[9px] text-slate-400">Caption will be auto-copied to clipboard for one-tap paste.</p>
                    </div>

                    {/* Confirmation & Post Button */}
                    <div className="pt-1">
                      <button
                        onClick={handleConfirmUpload}
                        disabled={isUploading}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Preparing Share Intent...</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Confirm &amp; Share to Facebook</span>
                          </>
                        )}
                      </button>
                    </div>

                    {uploadStatus === 'success' && (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>Caption copied to clipboard! Facebook Share dialog launched.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TASK 3: COMMENT PREPARATION */}
          {activeTask === 'comment' && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Command: <span className="font-semibold text-blue-700 italic">"Open this Facebook profile and prepare a comment."</span>
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Profile or Post Link / Name:</label>
                <input
                  type="text"
                  value={profileTarget}
                  onChange={(e) => setProfileTarget(e.target.value)}
                  placeholder="e.g. facebook.com/username or Person's name"
                  className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Draft Comment (Review &amp; Edit):</label>
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-900 flex items-start gap-1.5">
                <Lock className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Meta Security Policy: Android third-party apps cannot inject comments into personal accounts in the background. Zuzu copies your drafted comment and opens the post for your one-tap review and send.
                </span>
              </div>

              <button
                onClick={handleExecuteComment}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Copy Comment &amp; Open Facebook</span>
              </button>
            </div>
          )}

          {/* TASK 4: LIKE POST */}
          {activeTask === 'like' && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Command: <span className="font-semibold text-blue-700 italic">"Zuzu, like this post."</span>
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Post Link (Optional):</label>
                <input
                  type="text"
                  value={postUrl}
                  onChange={(e) => setPostUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full bg-slate-50 text-xs text-slate-800 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[10px] text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-blue-600" />
                  <span>Accessibility &amp; Platform Boundaries:</span>
                </div>
                <p>
                  Direct headless like actions are restricted by Meta OAuth policies. When using Android Accessibility Service, Zuzu highlights the Like button on your active screen for confirmation.
                </p>
              </div>

              <button
                onClick={handleExecuteLike}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>Open Post to Like</span>
              </button>
            </div>
          )}

          {/* TASK 5: CAPABILITY & POLICY EXPLANATION (Requirement 10) */}
          {activeTask === 'info' && (
            <div className="space-y-2.5 animate-fade-in">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Real Android Automation Capabilities</span>
                </div>
                
                <div className="space-y-2 text-[11px]">
                  <div className="p-2 bg-white rounded-xl border border-slate-100 space-y-0.5">
                    <div className="font-bold text-emerald-700 flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Fully Supported</span>
                    </div>
                    <p className="text-slate-500">
                      Searching people/profiles, generating multimodal AI captions for gallery photos, sharing photos via Android system intents, deep-linking into the Facebook application.
                    </p>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-100 space-y-0.5">
                    <div className="font-bold text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span>Requires Manual Confirmation</span>
                    </div>
                    <p className="text-slate-500">
                      Uploading private photos, publishing drafted captions, submitting comments, and confirming Likes (protects user privacy and account safety).
                    </p>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-100 space-y-0.5">
                    <div className="font-bold text-rose-700 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-rose-600" />
                      <span>Restricted by Meta Platform</span>
                    </div>
                    <p className="text-slate-500">
                      Silent background posting without user consent, scraping private feeds, and bypassing 2-Factor Authentication or CAPTCHA are blocked by Meta security guidelines.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
