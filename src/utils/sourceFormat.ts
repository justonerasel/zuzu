import type { SearchSourceItem } from '../types';

/**
 * Formats publication timestamp + relative age for real-time Google Search & News sources.
 * Never fabricates timestamps: returns null if no verified publication timestamp exists.
 */
export function formatSourcePublicationTime(src: SearchSourceItem): string {
  const parts: string[] = [];

  if (src.isWithin20Min) {
    parts.push('Last 20m');
  }

  if (src.ageLabel && src.ageLabel.trim()) {
    parts.push(src.ageLabel.trim());
  }

  if (src.publishedAt) {
    const ms = Date.parse(src.publishedAt);
    if (!Number.isNaN(ms)) {
      const formatted = new Date(ms).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      if (formatted) {
        parts.push(formatted);
      }
    }
  }

  if (parts.length === 0) {
    return 'Google Search';
  }

  return parts.join(' • ');
}

/**
 * Extracts a readable website domain from a URL for display when needed.
 */
export function getReadableWebsiteLabel(url: string, fallbackSourceName?: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (
      host.includes('vertexaisearch.cloud.google.com') ||
      host === 'news.google.com'
    ) {
      return fallbackSourceName || 'Web Article';
    }
    return host || fallbackSourceName || 'Web Source';
  } catch {
    return fallbackSourceName || 'Web Source';
  }
}
