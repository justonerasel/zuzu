import React from 'react';
import { AppSettings, ThemePresetId } from '../types';

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  bgColor: string;
  cardColor: string;
  accentColor: string;
  textColor: string;
  secondaryTextColor: string;
  borderColor: string;
  description: string;
  gradient: string;
  isDark?: boolean;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'lavender',
    name: 'Lavender Dream',
    bgColor: '#FAF5FF',
    cardColor: '#FFFFFF',
    accentColor: '#8B5CF6',
    textColor: '#1E1B4B',
    secondaryTextColor: '#6B7280',
    borderColor: '#E9D5FF',
    description: 'Soft cool lavender pastel with soothing violet aura',
    gradient: 'from-[#FAF5FF] via-[#F3F0FF] to-[#FAF8FF]'
  },
  {
    id: 'cool_blue',
    name: 'Cool Blue Sky',
    bgColor: '#F0F7FF',
    cardColor: '#FFFFFF',
    accentColor: '#3B82F6',
    textColor: '#0F172A',
    secondaryTextColor: '#64748B',
    borderColor: '#BFDBFE',
    description: 'Refreshing crisp pastel sky and cyan glow',
    gradient: 'from-[#F0F7FF] via-[#E8F2FF] to-[#F5FAFF]'
  },
  {
    id: 'mint',
    name: 'Mint Crystal',
    bgColor: '#F0FDF4',
    cardColor: '#FFFFFF',
    accentColor: '#10B981',
    textColor: '#064E3B',
    secondaryTextColor: '#4B5563',
    borderColor: '#BBF7D0',
    description: 'Fresh spring mint green and jade crystalline',
    gradient: 'from-[#F0FDF4] via-[#E6F9EE] to-[#F7FEFA]'
  },
  {
    id: 'soft_pink',
    name: 'Soft Rose Pastel',
    bgColor: '#FDF2F8',
    cardColor: '#FFFFFF',
    accentColor: '#EC4899',
    textColor: '#831843',
    secondaryTextColor: '#6B7280',
    borderColor: '#FBCFE8',
    description: 'Delicate pastel blossom and soft rose petals',
    gradient: 'from-[#FDF2F8] via-[#FCE7F3] to-[#FEF7FB]'
  },
  {
    id: 'emerald',
    name: 'Emerald Oasis',
    bgColor: '#ECFDF5',
    cardColor: '#FFFFFF',
    accentColor: '#059669',
    textColor: '#064E3B',
    secondaryTextColor: '#4B5563',
    borderColor: '#A7F3D0',
    description: 'Rich emerald jewel with serene botanical clarity',
    gradient: 'from-[#ECFDF5] via-[#D1FAE5] to-[#F0FDF4]'
  },
  {
    id: 'amber',
    name: 'Sunset Amber',
    bgColor: '#FFFBEB',
    cardColor: '#FFFFFF',
    accentColor: '#D97706',
    textColor: '#78350F',
    secondaryTextColor: '#71717A',
    borderColor: '#FDE68A',
    description: 'Warm golden amber glow and evening daylight',
    gradient: 'from-[#FFFBEB] via-[#FEF3C7] to-[#FFFDF5]'
  },
  {
    id: 'midnight',
    name: 'Midnight Cyber Neon',
    bgColor: '#090D16',
    cardColor: '#121927',
    accentColor: '#A855F7',
    textColor: '#F8FAFC',
    secondaryTextColor: '#94A3B8',
    borderColor: '#1E293B',
    description: 'Deep nocturnal cyber aesthetics with glowing accents',
    gradient: 'from-[#090D16] via-[#0D1322] to-[#05080E]',
    isDark: true
  }
];

export function isValidHexColor(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

export function getThemeDetails(settings: AppSettings): {
  bgColor: string;
  cardColor: string;
  accentColor: string;
  textColor: string;
  secondaryTextColor: string;
  borderColor: string;
  isDark: boolean;
  containerStyle: React.CSSProperties;
} {
  const preset = THEME_PRESETS.find(p => p.id === settings.themePreset) || THEME_PRESETS[0];

  const bgColor = (settings.themePreset === 'custom' && isValidHexColor(settings.customBgColor))
    ? settings.customBgColor
    : preset.bgColor;

  const cardColor = (settings.themePreset === 'custom' && isValidHexColor(settings.customCardColor))
    ? settings.customCardColor
    : preset.cardColor;

  const accentColor = (settings.themePreset === 'custom' && isValidHexColor(settings.customAccentColor))
    ? settings.customAccentColor
    : preset.accentColor;

  const isDark = (settings.themePreset === 'custom')
    ? false
    : (preset.isDark || false);

  const textColor = isDark ? '#F8FAFC' : preset.textColor;
  const secondaryTextColor = isDark ? '#94A3B8' : preset.secondaryTextColor;
  const borderColor = isDark ? '#1E293B' : (settings.themePreset === 'custom' ? `${accentColor}33` : preset.borderColor);

  return {
    bgColor,
    cardColor,
    accentColor,
    textColor,
    secondaryTextColor,
    borderColor,
    isDark,
    containerStyle: {
      backgroundColor: bgColor,
      color: textColor,
      // CSS custom variables propagated down tree
      ['--theme-bg' as any]: bgColor,
      ['--theme-card' as any]: cardColor,
      ['--theme-accent' as any]: accentColor,
      ['--theme-text' as any]: textColor,
      ['--theme-subtext' as any]: secondaryTextColor,
      ['--theme-border' as any]: borderColor
    }
  };
}
