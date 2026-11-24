import React, { memo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';

interface ChannelCardProps {
  channel: Channel;
  isPlaying: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  viewMode?: 'grid' | 'list';
  hasTVPreferredFocus?: boolean;
}

export const ChannelCard = memo(function ChannelCard({
  channel,
  isPlaying,
  isFavorite,
  onPress,
  onToggleFavorite,
  viewMode = 'grid',
  hasTVPreferredFocus = false
}: ChannelCardProps) {
  const [isFocused, setIsFocused] = useState(false);

  const logoUri = channel.logo && channel.logo.startsWith('http')
    ? channel.logo
    : null;

  // ── MODE LISTE COMPACT (Ligne horizontale pour navigation rapide) ──
  if (viewMode === 'list') {
    return (
      <Pressable
        focusable={true}
        accessible={true}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={({ pressed }) => [
          styles.listCard,
          isPlaying && styles.listCardPlaying,
          isFocused && styles.listCardFocused,
          pressed && styles.cardActive
        ]}
        onPress={onPress}
      >
        <View style={[styles.listLogoWrap, isFocused && styles.listLogoWrapFocused]}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.listLogo}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Ionicons name="tv-outline" size={20} color="#e50914" />
            </View>
          )}
          {isPlaying && (
            <View style={styles.playingBadgeCorner}>
              <View style={styles.pulseDot} />
            </View>
          )}
        </View>

        <View style={styles.listInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, isPlaying && styles.namePlaying, isFocused && styles.nameFocused]} numberOfLines={1}>
              {channel.name}
            </Text>
            {channel.badge && (
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>{channel.badge}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.meta, isFocused && styles.metaFocused]} numberOfLines={1}>
            {channel.group || channel.category || 'Direct TV'}
          </Text>
        </View>

        {isPlaying && (
          <View style={styles.liveEqualizer}>
            <View style={[styles.eqBar, styles.eqBar1]} />
            <View style={[styles.eqBar, styles.eqBar2]} />
            <View style={[styles.eqBar, styles.eqBar3]} />
          </View>
        )}

        {isFocused && (
          <View style={styles.listTvOkHint}>
            <Text style={styles.listTvOkText}>OK</Text>
          </View>
        )}

        <Pressable
          hitSlop={14}
          style={styles.favBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleFavorite();
          }}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={18}
            color={isFavorite ? '#f59e0b' : '#64748b'}
          />
        </Pressable>
      </Pressable>
    );
  }

  // ── MODE GRILLE (Carte moderne style myCANAL / Android TV Leanback) ──
  return (
    <Pressable
      focusable={true}
      accessible={true}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={({ pressed }) => [
        styles.gridCard,
        isPlaying && styles.gridCardPlaying,
        isFocused && styles.cardFocused,
        pressed && styles.cardActive
      ]}
      onPress={onPress}
    >
      {/* Zone visuelle avec Logo */}
      <View style={[styles.gridVisualBox, isFocused && styles.gridVisualBoxFocused]}>
        <LinearGradient
          colors={
            isFocused
              ? ['#13283c', '#0f172a']
              : isPlaying
              ? ['#281014', '#121624']
              : ['#171d2c', '#0d111a']
          }
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={[styles.gridLogo, isFocused && styles.gridLogoFocused]}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.placeholderLogo}>
            <Ionicons name="tv-outline" size={26} color={isFocused ? '#38bdf8' : '#e50914'} />
          </View>
        )}

        {/* Badge supérieur gauche (4K, DIRECT, etc.) */}
        <View style={styles.topBadgeRow}>
          {isPlaying ? (
            <View style={styles.liveNowBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.liveNowText}>EN COURS</Text>
            </View>
          ) : channel.badge ? (
            <View style={[styles.qualityBadge, isFocused && styles.qualityBadgeFocused]}>
              <Text style={[styles.qualityText, isFocused && styles.qualityTextFocused]}>{channel.badge}</Text>
            </View>
          ) : (
            <View style={[styles.qualityBadge, isFocused && styles.qualityBadgeFocused]}>
              <Text style={[styles.qualityText, isFocused && styles.qualityTextFocused]}>HD</Text>
            </View>
          )}
        </View>

        {/* Bouton Favori en haut à droite avec fond circulaire verre */}
        <Pressable
          hitSlop={12}
          style={styles.gridFavBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleFavorite();
          }}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={14}
            color={isFavorite ? '#f59e0b' : 'rgba(255,255,255,0.7)'}
          />
        </Pressable>
      </View>

      {/* Zone texte et détails en bas */}
      <View style={[styles.gridInfoBox, isPlaying && styles.gridInfoBoxPlaying, isFocused && styles.gridInfoBoxFocused]}>
        <Text
          style={[styles.gridName, isPlaying && styles.gridNamePlaying, isFocused && styles.gridNameFocused]}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        <Text style={[styles.gridMeta, isFocused && styles.gridMetaFocused]} numberOfLines={1}>
          {channel.group || channel.category || 'Direct TV'}
        </Text>
      </View>

      {/* ── BANDEAU DE FOCUS VISUEL SUR SMART TV (Indicateur ultra-clair anti-tâtonnement) ── */}
      {isFocused ? (
        <View style={styles.tvFocusBar}>
          <Ionicons name="play" size={10} color="#030712" />
          <Text style={styles.tvFocusBarText}>OK POUR REGARDER</Text>
        </View>
      ) : isPlaying ? (
        /* Ligne rouge brillante en bas quand la chaîne est en lecture */
        <View style={styles.playingUnderline} />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // ── Grille ──
  gridCard: {
    flex: 1,
    margin: 6,
    borderRadius: 14,
    backgroundColor: '#111522',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  gridCardPlaying: {
    borderColor: '#e50914',
    borderWidth: 2,
    shadowColor: '#e50914',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  cardActive: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  cardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 3,
    transform: [{ scale: 1.07 }],
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 25,
    backgroundColor: '#0f172a',
  },
  gridVisualBox: {
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 8,
  },
  gridVisualBoxFocused: {
    backgroundColor: '#13283c',
  },
  gridLogo: {
    width: '70%',
    height: '70%',
  },
  gridLogoFocused: {
    width: '78%',
    height: '78%',
  },
  topBadgeRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
  },
  liveNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  liveNowText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
  },
  qualityBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  qualityBadgeFocused: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  qualityText: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  qualityTextFocused: {
    color: '#030712',
    fontWeight: '900',
  },
  gridFavBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 2,
  },
  gridInfoBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0d101a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  gridInfoBoxPlaying: {
    backgroundColor: '#170c10',
  },
  gridInfoBoxFocused: {
    backgroundColor: '#0f172a',
  },
  gridName: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gridNamePlaying: {
    color: '#ff4d4d',
    fontWeight: '800',
  },
  gridNameFocused: {
    color: '#ffffff',
    fontWeight: '900',
  },
  gridMeta: {
    color: '#64748b',
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: '500',
  },
  gridMetaFocused: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  playingUnderline: {
    height: 3,
    backgroundColor: '#e50914',
    width: '100%',
  },
  tvFocusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    paddingVertical: 3,
    gap: 4,
    width: '100%',
  },
  tvFocusBarText: {
    color: '#030712',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  // ── Mode Liste ──
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111522',
    borderRadius: 12,
    padding: 10,
    marginVertical: 4,
    marginHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  listCardPlaying: {
    borderColor: '#e50914',
    backgroundColor: '#1b1418',
  },
  listCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 3,
    backgroundColor: '#0f172a',
    transform: [{ scale: 1.02 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 20,
  },
  listLogoWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#0a0d16',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  listLogoWrapFocused: {
    borderColor: '#38bdf8',
    backgroundColor: '#13283c',
  },
  listLogo: {
    width: 36,
    height: 36,
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingBadgeCorner: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  namePlaying: {
    color: '#ff4d4d',
    fontWeight: '800',
  },
  nameFocused: {
    color: '#38bdf8',
    fontWeight: '900',
  },
  badgePill: {
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
  },
  badgePillText: {
    color: '#e50914',
    fontSize: 9,
    fontWeight: '800',
  },
  meta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  metaFocused: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  liveEqualizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    gap: 2,
    marginRight: 10,
  },
  eqBar: {
    width: 2.5,
    backgroundColor: '#e50914',
    borderRadius: 1,
  },
  eqBar1: { height: 8 },
  eqBar2: { height: 14 },
  eqBar3: { height: 10 },
  listTvOkHint: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    marginRight: 8,
  },
  listTvOkText: {
    color: '#030712',
    fontSize: 10,
    fontWeight: '900',
  },
  favBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
