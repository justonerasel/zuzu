import React from 'react';
import { VoiceIdentity } from '../types';
import { getThemeDetails } from '../utils/theme';

interface AndroidFrameProps {
  children: React.ReactNode;
  activeIdentity: VoiceIdentity;
  viewMode?: 'android_frame' | 'fullscreen';
  onToggleViewMode?: () => void;
  themePreset?: string;
  customBgColor?: string;
  settings?: any;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({
  children,
  settings
}) => {
  const theme = settings ? getThemeDetails(settings) : {
    bgColor: '#FAF5FF',
    textColor: '#1E1B4B',
    containerStyle: { backgroundColor: '#FAF5FF', color: '#1E1B4B' }
  };

  return (
    <div
      style={theme.containerStyle}
      className="w-full h-screen min-h-dvh flex flex-col overflow-hidden relative font-sans transition-colors duration-300"
    >
      {/* Native System Status Bar Integration: clean edge-to-edge container without simulated phone frames or fake batteries */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
        {children}
      </div>
    </div>
  );
};
