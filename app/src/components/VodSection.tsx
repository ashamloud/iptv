// ═══════════════════════════════════════════════════════════════
// BOKK TV — Section VOD (Films & Séries)
// Design OTT Premium inspiré de Apple TV / Netflix
// Billboard Hero, Rails horizontaux TV Direct & Affiches TMDB
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo, useRef, useCallback, memo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import allVodItems, { VodItem, VOD_CATEGORIES, VodCategory } from '../data/vod';
import { Channel } from '../data/channels';

interface VodSectionProps {
  channels: Channel[];
  onPlayChannel: (channel: Channel) => void;
  onPlayVod: (vod: VodItem) => void;
  onNavigateToTv: () => void;
  isTvMode?: boolean;
}

// ── Données des chaînes phares pour le rail "Live TV" (Style Carte Broadcast) ──
const LIVE_TV_TOP_PICKS = [
  { name: 'RTS 1 SÉNÉGAL', label: '🇸🇳 Sénégal Officiel', bg: '#831843', query: 'rts 1' },
  { name: 'beIN SPORTS 1', label: '⚽ UEFA & Direct', bg: '#1e3a8a', query: 'bein sports 1' },
  { name: 'CANAL+ SPORT', label: '🏆 Premier League', bg: '#0f172a', query: 'canal+ sport' },
  { name: 'TF1 DIRECT', label: '🇫🇷 Divertissement', bg: '#1d4ed8', query: 'tf1' },
  { name: 'CANAL+ FOOT', label: '⚽ Ligue 1 & Europe', bg: '#14532d', query: 'canal+ foot' },
  { name: '2sTV SÉNÉGAL', label: '🇸🇳 Direct Dakar', bg: '#701a75', query: '2stv' },
  { name: 'DAZN 1 VIP', label: '🥊 Combat & Liga', bg: '#78350f', query: 'dazn' },
  { name: 'RMC SPORT 1', label: '🔥 UEFA Champions', bg: '#991b1b', query: 'rmc sport 1' },
];

export const VodSection = memo(function VodSection({
  channels,
  onPlayChannel,
  onPlayVod,
  onNavigateToTv,
  isTvMode = false,
}: VodSectionProps) {
  const { width } = useWindowDimensions();
  const [selectedCategory, setSelectedCategory] = useState<string>('tous');
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const [focusedBtn, setFocusedBtn] = useState<'play' | 'info' | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [selectedVodForModal, setSelectedVodForModal] = useState<VodItem | null>(null);

  // ── Sélection des films phares pour le Billboard Hero (Top 5 Blockbusters) ──
  const heroItems = useMemo(() => {
    const picks = allVodItems.filter(
      (v) => v.poster && v.poster.includes('image.tmdb.org') && v.title.length > 3
    );
    return picks.slice(0, 8);
  }, []);

  const currentHero = heroItems[heroIndex] || heroItems[0];

  // ── Filtrage par rails thématiques ──
  const recentMovies = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'recents').slice(0, 25);
  }, []);

  const netflixItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'netflix').slice(0, 25);
  }, []);

  const disneyItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'disney').slice(0, 25);
  }, []);

  const primeItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'prime').slice(0, 25);
  }, []);

  const appleItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'apple').slice(0, 25);
  }, []);

  const seriesItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'series').slice(0, 25);
  }, []);

  const animationItems = useMemo(() => {
    return allVodItems.filter((v) => v.category === 'animation').slice(0, 25);
  }, []);

  // ── Liste filtrée si une catégorie spécifique est active ──
  const filteredCategoryItems = useMemo(() => {
    if (selectedCategory === 'tous') return null;
    return allVodItems.filter((v) => v.category === selectedCategory).slice(0, 120);
  }, [selectedCategory]);

  // ── Lancer la chaîne Live TV correspondante ──
  const handleLiveTvCardPress = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      const found = channels.find((c) => c.name.toLowerCase().includes(q));
      if (found) {
        onPlayChannel(found);
      } else {
        onNavigateToTv();
      }
    },
    [channels, onPlayChannel, onNavigateToTv]
  );

  // Dimensions adaptatives
  const cardWidth = isTvMode ? 170 : 135;
  const cardHeight = isTvMode ? 255 : 200;
  const liveCardWidth = isTvMode ? 210 : 155;
  const liveCardHeight = isTvMode ? 115 : 88;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: isTvMode ? 40 : 110 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── BARRE DE CATÉGORIES HORIZONTALE (Style Header Site Web) ── */}
      <View style={styles.catBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catBarScroll}
        >
          {VOD_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                focusable={true}
                accessible={true}
                onPress={() => setSelectedCategory(cat.key)}
                style={({ pressed }) => [
                  styles.catPill,
                  isSelected && styles.catPillActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text
                  style={[
                    styles.catPillText,
                    isSelected && styles.catPillTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── VUE 1 : GRILLE CATÉGORIE FILTRÉE (si l'utilisateur a choisi un filtre précis) ── */}
      {filteredCategoryItems ? (
        <View style={styles.filteredSection}>
          <View style={styles.filteredHeaderRow}>
            <Text style={styles.sectionTitle}>
              {VOD_CATEGORIES.find((c) => c.key === selectedCategory)?.label || 'Sélection'}
            </Text>
            <Pressable onPress={() => setSelectedCategory('tous')} style={styles.resetFilterBtn}>
              <Text style={styles.resetFilterText}>Tout afficher ✕</Text>
            </Pressable>
          </View>

          <View style={styles.gridContainer}>
            {filteredCategoryItems.map((item) => {
              const isCardFocused = focusedCardId === item.id;
              return (
                <Pressable
                  key={item.id}
                  focusable={true}
                  accessible={true}
                  onFocus={() => setFocusedCardId(item.id)}
                  onBlur={() => setFocusedCardId(null)}
                  onPress={() => onPlayVod(item)}
                  style={({ pressed }) => [
                    styles.posterCard,
                    { width: cardWidth, height: cardHeight },
                    isCardFocused && styles.posterCardFocused,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Image
                    source={{ uri: item.poster }}
                    style={styles.posterImage}
                    contentFit="cover"
                    transition={200}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    style={styles.posterGradient}
                  />
                  <View style={styles.badgeTopRow}>
                    <View style={styles.qualityBadge}>
                      <Text style={styles.qualityText}>{item.quality || 'HD'}</Text>
                    </View>
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingText}>★ {item.rating}</Text>
                    </View>
                  </View>
                  <View style={styles.posterInfo}>
                    <Text style={styles.posterTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.posterYear}>{item.year}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        /* ── VUE 2 : MODE PAR DÉFAUT OTT (Billboard Hero + Rails Horizontaux) ── */
        <>
          {/* ══════════════════════════════════════════════════════
               HERO BILLBOARD (Affiche Grand Écran Haut de Page)
               Inspiré de l'image de référence
          ══════════════════════════════════════════════════════ */}
          {currentHero && (
            <View style={[styles.heroContainer, { height: isTvMode ? 360 : 310 }]}>
              {/* Image de fond en pleine largeur */}
              <Image
                source={{ uri: currentHero.backdrop || currentHero.poster }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
              {/* Gradient d'assombrissement cinéma */}
              <LinearGradient
                colors={['transparent', 'rgba(8,9,13,0.5)', 'rgba(8,9,13,0.98)']}
                style={StyleSheet.absoluteFill}
              />

              {/* Contenu textuel et boutons */}
              <View style={styles.heroContent}>
                {/* Badges de qualité & note */}
                <View style={styles.heroBadgesRow}>
                  <View style={styles.heroQualityBadge}>
                    <Text style={styles.heroQualityText}>{currentHero.quality || '4K UHD'}</Text>
                  </View>
                  <View style={styles.heroRatingBadge}>
                    <Ionicons name="star" size={12} color="#f59e0b" />
                    <Text style={styles.heroRatingText}>{currentHero.rating}</Text>
                  </View>
                  <Text style={styles.heroYearText}>{currentHero.year}</Text>
                  <Text style={styles.heroCategoryText}>• {currentHero.categoryLabel}</Text>
                </View>

                {/* Titre majestueux */}
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {currentHero.title.toUpperCase()}
                </Text>

                {/* Synopsis / Description */}
                <Text style={styles.heroDesc} numberOfLines={2}>
                  {currentHero.synopsis ||
                    `Une exclusivité streaming haute définition sur BOKK TV. Prêt pour une expérience cinéma immersive.`}
                </Text>

                {/* Boutons d'action : ▶ Play & ⓘ More Info */}
                <View style={styles.heroActionsRow}>
                  {/* Bouton Play Blanc */}
                  <Pressable
                    focusable={true}
                    accessible={true}
                    hasTVPreferredFocus={isTvMode}
                    onFocus={() => setFocusedBtn('play')}
                    onBlur={() => setFocusedBtn(null)}
                    onPress={() => onPlayVod(currentHero)}
                    style={({ pressed }) => [
                      styles.playBtn,
                      focusedBtn === 'play' && styles.playBtnFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="play" size={17} color="#000000" />
                    <Text style={styles.playBtnText}>Regarder</Text>
                  </Pressable>

                  {/* Bouton More Info Verre Translucide */}
                  <Pressable
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedBtn('info')}
                    onBlur={() => setFocusedBtn(null)}
                    onPress={() => setSelectedVodForModal(currentHero)}
                    style={({ pressed }) => [
                      styles.infoBtn,
                      focusedBtn === 'info' && styles.infoBtnFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Ionicons name="information-circle-outline" size={18} color="#ffffff" />
                    <Text style={styles.infoBtnText}>Détails</Text>
                  </Pressable>

                  {/* Sélecteur de héros suivant (optionnel) */}
                  {heroItems.length > 1 && (
                    <Pressable
                      onPress={() => setHeroIndex((prev) => (prev + 1) % heroItems.length)}
                      style={styles.heroNextChevron}
                    >
                      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════
               RAIL 1 : "Live TV" (Exactement comme sur la photo)
               Cartes colorées avec logo d'antenne radio 📶
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="radio" size={16} color="#e50914" />
                <Text style={styles.railTitle}>Live TV</Text>
              </View>
              <Pressable onPress={onNavigateToTv} style={styles.viewAllBtn}>
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {LIVE_TV_TOP_PICKS.map((item, idx) => {
                const isFocused = focusedCardId === `live_${idx}`;
                return (
                  <Pressable
                    key={`live_pick_${idx}`}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(`live_${idx}`)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => handleLiveTvCardPress(item.query)}
                    style={({ pressed }) => [
                      styles.liveChannelCard,
                      { width: liveCardWidth, height: liveCardHeight, backgroundColor: item.bg },
                      isFocused && styles.liveChannelCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {/* Badge Icône Antenne Broadcast en haut à gauche */}
                    <View style={styles.liveAntennaBadge}>
                      <Ionicons name="radio-outline" size={13} color="#ffffff" />
                    </View>

                    {/* Titre et sous-titre de la chaîne */}
                    <View style={styles.liveCardContent}>
                      <Text style={styles.liveCardName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.liveCardLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════
               RAIL 2 : "Recent Movies" (Exactement comme sur la photo)
               Affiches verticales 2:3 avec notes et titres
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="flame" size={16} color="#f59e0b" />
                <Text style={styles.railTitle}>Films Récents & Populaires</Text>
              </View>
              <Pressable
                onPress={() => setSelectedCategory('recents')}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {recentMovies.map((item) => {
                const isFocused = focusedCardId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(item.id)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => onPlayVod(item)}
                    style={({ pressed }) => [
                      styles.posterCard,
                      { width: cardWidth, height: cardHeight },
                      isFocused && styles.posterCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={styles.posterGradient}
                    />
                    <View style={styles.badgeTopRow}>
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityText}>{item.quality || '4K'}</Text>
                      </View>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>★ {item.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.posterInfo}>
                      <Text style={styles.posterTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.posterYear}>{item.year}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════
               RAIL 3 : "🔴 Netflix Exclusivités"
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="film" size={16} color="#e50914" />
                <Text style={styles.railTitle}>Netflix Exclusivités</Text>
              </View>
              <Pressable
                onPress={() => setSelectedCategory('netflix')}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {netflixItems.map((item) => {
                const isFocused = focusedCardId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(item.id)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => onPlayVod(item)}
                    style={({ pressed }) => [
                      styles.posterCard,
                      { width: cardWidth, height: cardHeight },
                      isFocused && styles.posterCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={styles.posterGradient}
                    />
                    <View style={styles.badgeTopRow}>
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityText}>{item.quality || 'HD'}</Text>
                      </View>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>★ {item.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.posterInfo}>
                      <Text style={styles.posterTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.posterYear}>{item.year}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════
               RAIL 4 : "✨ Disney+ & Marvel"
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="star" size={16} color="#38bdf8" />
                <Text style={styles.railTitle}>Disney+ & Marvel</Text>
              </View>
              <Pressable
                onPress={() => setSelectedCategory('disney')}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {disneyItems.map((item) => {
                const isFocused = focusedCardId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(item.id)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => onPlayVod(item)}
                    style={({ pressed }) => [
                      styles.posterCard,
                      { width: cardWidth, height: cardHeight },
                      isFocused && styles.posterCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={styles.posterGradient}
                    />
                    <View style={styles.badgeTopRow}>
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityText}>{item.quality || 'HD'}</Text>
                      </View>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>★ {item.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.posterInfo}>
                      <Text style={styles.posterTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.posterYear}>{item.year}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════
               RAIL 5 : "📦 Prime Video & Blockbusters"
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="play" size={16} color="#0284c7" />
                <Text style={styles.railTitle}>Prime Video & Action</Text>
              </View>
              <Pressable
                onPress={() => setSelectedCategory('prime')}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {primeItems.map((item) => {
                const isFocused = focusedCardId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(item.id)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => onPlayVod(item)}
                    style={({ pressed }) => [
                      styles.posterCard,
                      { width: cardWidth, height: cardHeight },
                      isFocused && styles.posterCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={styles.posterGradient}
                    />
                    <View style={styles.badgeTopRow}>
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityText}>{item.quality || 'HD'}</Text>
                      </View>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>★ {item.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.posterInfo}>
                      <Text style={styles.posterTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.posterYear}>{item.year}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════
               RAIL 6 : "📺 Séries Populaires"
          ══════════════════════════════════════════════════════ */}
          <View style={styles.railSection}>
            <View style={styles.railHeaderRow}>
              <View style={styles.railTitleGroup}>
                <Ionicons name="layers" size={16} color="#a855f7" />
                <Text style={styles.railTitle}>Séries Incontournables</Text>
              </View>
              <Pressable
                onPress={() => setSelectedCategory('series')}
                style={styles.viewAllBtn}
              >
                <Text style={styles.viewAllText}>Voir tout</Text>
                <Ionicons name="chevron-forward" size={13} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {seriesItems.map((item) => {
                const isFocused = focusedCardId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    focusable={true}
                    accessible={true}
                    onFocus={() => setFocusedCardId(item.id)}
                    onBlur={() => setFocusedCardId(null)}
                    onPress={() => onPlayVod(item)}
                    style={({ pressed }) => [
                      styles.posterCard,
                      { width: cardWidth, height: cardHeight },
                      isFocused && styles.posterCardFocused,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.posterImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={styles.posterGradient}
                    />
                    <View style={styles.badgeTopRow}>
                      <View style={styles.qualityBadge}>
                        <Text style={styles.qualityText}>SÉRIE</Text>
                      </View>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>★ {item.rating}</Text>
                      </View>
                    </View>
                    <View style={styles.posterInfo}>
                      <Text style={styles.posterTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.posterYear}>{item.year}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
           MODAL DÉTAILS D'UN FILM / SÉRIE ("Plus d'infos")
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedVodForModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedVodForModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: isTvMode ? 540 : '90%' }]}>
            {selectedVodForModal && (
              <>
                <View style={styles.modalPosterWrap}>
                  <Image
                    source={{ uri: selectedVodForModal.backdrop || selectedVodForModal.poster }}
                    style={styles.modalPoster}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(10,13,20,0.95)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <Pressable
                    style={styles.modalCloseBtn}
                    onPress={() => setSelectedVodForModal(null)}
                  >
                    <Ionicons name="close" size={20} color="#ffffff" />
                  </Pressable>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.modalTitle}>{selectedVodForModal.title}</Text>
                  <View style={styles.modalMetaRow}>
                    <Text style={styles.modalYear}>{selectedVodForModal.year}</Text>
                    <Text style={styles.modalCategory}>• {selectedVodForModal.categoryLabel}</Text>
                    <View style={styles.modalRatingPill}>
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text style={styles.modalRatingText}>{selectedVodForModal.rating}</Text>
                    </View>
                    <View style={styles.modalQualityPill}>
                      <Text style={styles.modalQualityText}>{selectedVodForModal.quality || '4K'}</Text>
                    </View>
                  </View>

                  <Text style={styles.modalSynopsis}>
                    {selectedVodForModal.synopsis ||
                      'Disponible en haute définition avec flux ultra-fluide sur BOKK TV.'}
                  </Text>

                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.modalPlayBtn}
                      onPress={() => {
                        const item = selectedVodForModal;
                        setSelectedVodForModal(null);
                        onPlayVod(item);
                      }}
                    >
                      <Ionicons name="play" size={18} color="#000000" />
                      <Text style={styles.modalPlayText}>Lancer la lecture</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090d',
  },
  scrollContent: {
    paddingTop: 8,
  },

  // ── Catégories en pilules ──
  catBarWrapper: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  catBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  catPillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  catPillTextActive: {
    color: '#000000',
    fontWeight: '700',
  },

  // ── Hero Billboard ──
  heroContainer: {
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  heroContent: {
    padding: 18,
    paddingBottom: 22,
    zIndex: 2,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  heroQualityBadge: {
    backgroundColor: '#e50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroQualityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  heroRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroRatingText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  heroYearText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  heroCategoryText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: '#cbd5e1',
    maxWidth: '90%',
    marginBottom: 16,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playBtnFocused: {
    borderWidth: 2,
    borderColor: '#38bdf8',
    transform: [{ scale: 1.05 }],
  },
  playBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  infoBtnFocused: {
    borderColor: '#38bdf8',
    transform: [{ scale: 1.05 }],
  },
  infoBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  heroNextChevron: {
    marginLeft: 6,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ── Rails Horizontaux ──
  railSection: {
    marginBottom: 26,
  },
  railHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  railTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  railTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  railScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },

  // ── Cartes Live TV (Style première rangée photo) ──
  liveChannelCard: {
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  liveChannelCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    transform: [{ scale: 1.04 }],
  },
  liveAntennaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 5,
    borderRadius: 6,
  },
  liveCardContent: {
    marginTop: 'auto',
  },
  liveCardName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  liveCardLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Affiches Posters Films & Séries (Style 2ème rangée photo) ──
  posterCard: {
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#12141c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  posterCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    transform: [{ scale: 1.05 }],
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  badgeTopRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  qualityBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  ratingBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '800',
  },
  posterInfo: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
  },
  posterTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  posterYear: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },

  // ── Grille filtrée ──
  filteredSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  filteredHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  resetFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
  },
  resetFilterText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },

  // ── Modal Détails Film ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0f131a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalPosterWrap: {
    height: 190,
    width: '100%',
    position: 'relative',
  },
  modalPoster: {
    width: '100%',
    height: '100%',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 20,
  },
  modalBody: {
    padding: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalYear: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  modalCategory: {
    color: '#64748b',
    fontSize: 12,
  },
  modalRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalRatingText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  modalQualityPill: {
    backgroundColor: '#e50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalQualityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  modalSynopsis: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalPlayBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderRadius: 24,
  },
  modalPlayText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
