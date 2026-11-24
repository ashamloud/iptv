// ═══════════════════════════════════════════════════════════════
// BOKK TV — Catalogue VOD (Films & Séries)
// Données TMDB + Flux HLS/MP4 haute définition
// ═══════════════════════════════════════════════════════════════

export interface VodItem {
  id: string;
  title: string;
  raw_title?: string;
  category: 'recents' | 'netflix' | 'disney' | 'prime' | 'apple' | 'hbo' | 'action' | 'comedie' | 'horreur' | 'scifi' | 'animation' | 'series' | string;
  categoryLabel: string;
  type: 'film' | 'serie' | 'animation';
  poster: string;
  backdrop: string;
  year: string;
  rating: number;
  quality: '4K' | 'HD';
  url: string;
  group?: string;
  synopsis?: string;
}

export interface VodCategory {
  key: string;
  label: string;
  icon: string;
}

export const VOD_CATEGORIES: VodCategory[] = [
  { key: 'tous',       label: 'Tout le Cinéma', icon: 'sparkles' },
  { key: 'recents',    label: '🔥 Récents & Populaires', icon: 'flame' },
  { key: 'netflix',    label: '🔴 Netflix', icon: 'film' },
  { key: 'disney',     label: '✨ Disney+', icon: 'star' },
  { key: 'prime',      label: '📦 Prime Video', icon: 'play' },
  { key: 'apple',      label: '🍏 Apple TV+', icon: 'tv' },
  { key: 'hbo',        label: '💜 HBO Max', icon: 'videocam' },
  { key: 'series',     label: '📺 Séries', icon: 'layers' },
  { key: 'action',     label: '💥 Action', icon: 'flash' },
  { key: 'comedie',    label: '😂 Comédie', icon: 'happy' },
  { key: 'scifi',      label: '🚀 Sci-Fi', icon: 'planet' },
  { key: 'animation',  label: '🎨 Animation', icon: 'color-palette' },
];

import vodRaw from './vodData.json';

export const allVodItems: VodItem[] = vodRaw as VodItem[];
export default allVodItems;
