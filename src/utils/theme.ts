import { AppSettings, ThemePresetId } from '../types';

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  bgColor: string;
  cardColor: string;
  accentColor: string;
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
    description: 'Soft cool lavender pastel with violet aura',
    gradient: 'from-[#FAF5FF] via-[#F3F0FF] to-[#FAF8FF]'
  },
  {
    id: 'cool_blue',
    name: 'Cool Blue',
    bgColor: '#F0F7FF',
    cardColor: '#FFFFFF',
    accentColor: '#3B82F6',
    description: 'Refreshing crisp pastel sky and cyan glow',
    gradient: 'from-[#F0F7FF] via-[#E8F2FF] to-[#F5FAFF]'
  },
  {
    id: 'mint',
    name: 'Mint Crystal',
    bgColor: '#F0FDF4',
    cardColor: '#FFFFFF',
    accentColor: '#10B981',
    description: 'Fresh spring mint green and jade crystalline',
    gradient: 'from-[#F0FDF4] via-[#E6F9EE] to-[#F7FEFA]'
  },
  {
    id: 'soft_pink',
    name: 'Soft Pink',
    bgColor: '#FDF2F8',
    cardColor: '#FFFFFF',
    accentColor: '#EC4899',
    description: 'Delicate pastel rose and blossom tones',
    gradient: 'from-[#FDF2F8] via-[#FCE7F3] to-[#FEF7FB]'
  },
  {
    id: 'midnight',
    name: 'Midnight Neon',
    bgColor: '#090D16',
    cardColor: '#111827',
    accentColor: '#A855F7',
    description: 'Deep nocturnal cyber glow with glowing accents',
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

  const isDark = preset.isDark || false;

  return {
    bgColor,
    cardColor,
    accentColor,
    isDark,
    containerStyle: {
      backgroundColor: bgColor,
      color: isDark ? '#F1F5F9' : '#1E293B'
    }
  };
}
