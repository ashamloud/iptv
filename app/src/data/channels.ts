// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Mobile (React Native / Expo)
// Catalogue complet des chaînes (7 805 chaînes synchronisées)
// ═══════════════════════════════════════════════════════════════

export interface Channel {
  id: number | string;
  name: string;
  url: string;
  fallbackUrl?: string;
  type?: 'hls' | 'ts' | 'embed' | string;
  category: string;
  group?: string;
  country?: string;
  badge?: string;
  desc?: string;
  logo?: string;
}

export interface Category {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { key: 'tous',         label: 'Toutes les chaînes', icon: 'grid-outline',          color: '#6366f1' },
  { key: 'favoris',      label: '⭐ Favoris',          icon: 'star-outline',          color: '#f59e0b' },
  { key: 'senegal',      label: '🇸🇳 Sénégal',         icon: 'location-outline',      color: '#10b981' },
  { key: 'francophone',  label: '🇫🇷 France',          icon: 'flag-outline',          color: '#3b82f6' },
  { key: 'sport',        label: '⚽ Sport',           icon: 'football-outline',      color: '#f97316' },
  { key: 'cinema',       label: '🎬 Films & Séries',  icon: 'film-outline',          color: '#a855f7' },
  { key: 'uk',           label: '🇬🇧 UK & USA',        icon: 'globe-outline',         color: '#06b6d4' },
  { key: 'espagne',      label: '🇪🇸 Espagne',         icon: 'planet-outline',        color: '#eab308' },
  { key: 'allemagne',    label: '🇩🇪 Allemagne',       icon: 'compass-outline',       color: '#ec4899' },
  { key: 'italie',       label: '🇮🇹 Italie',          icon: 'map-outline',           color: '#14b8a6' },
  { key: 'albanie',      label: '🇦🇱 Albanie',         icon: 'shield-outline',        color: '#84cc16' },
  { key: 'documentaire', label: '🌍 Documentaire',     icon: 'earth-outline',         color: '#6366f1' },
  { key: 'jeunesse',     label: '🧸 Jeunesse',        icon: 'happy-outline',         color: '#f43f5e' },
  { key: 'music',        label: '🎵 Musique',         icon: 'musical-notes-outline', color: '#d946ef' },
];

import channelsRaw from './channelsData.json';

export const channelsAll: Channel[] = channelsRaw as Channel[];
export default channelsAll;
