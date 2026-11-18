import React, { memo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
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
}

export const ChannelCard = memo(function ChannelCard({
  channel,
  isPlaying,
  isFavorite,
  onPress,
  onToggleFavorite,
  viewMode = 'grid'
}: ChannelCardProps) {
  const logoUri = channel.logo && channel.logo.startsWith('http')
    ? channel.logo
    : null;

  // ── MODE LISTE COMPACT (Ligne horizontale pour navigation rapide) ──
  if (viewMode === 'list') {
    return (
      <Pressable
        focusable={true}
        style={({ pressed, focused }: any) => [
          styles.listCard,
          isPlaying && styles.listCardPlaying,
          focused && styles.cardFocused,
          pressed && styles.cardActive
        ]}
        onPress={onPress}
      >
        <View style={styles.listLogoWrap}>
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
            <Text style={[styles.name, isPlaying && styles.namePlaying]} numberOfLines={1}>
              {channel.name}
            </Text>
            {channel.badge && (
              <View style={styles.badgePill}>
                <Text style={styles.badgePillText}>{channel.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
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

  // ── MODE GRILLE (Carte moderne style myCANAL / Netflix) ──
  return (
    <Pressable
      focusable={true}
      style={({ pressed, focused }: any) => [
        styles.gridCard,
        isPlaying && styles.gridCardPlaying,
        focused && styles.cardFocused,
        pressed && styles.cardActive
      ]}
      onPress={onPress}
    >
      {/* Zone visuelle avec Logo */}
      <View style={styles.gridVisualBox}>
        <LinearGradient
          colors={isPlaying ? ['#281014', '#121624'] : ['#171d2c', '#0d111a']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.gridLogo}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.placeholderLogo}>
            <Ionicons name="tv-outline" size={26} color="#e50914" />
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
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText}>{channel.badge}</Text>
            </View>
          ) : (
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText}>HD</Text>
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
      <View style={[styles.gridInfoBox, isPlaying && styles.gridInfoBoxPlaying]}>
        <Text
          style={[styles.gridName, isPlaying && styles.gridNamePlaying]}
          numberOfLines={1}
        >
          {channel.name}
        </Text>
        <Text style={styles.gridMeta} numberOfLines={1}>
          {channel.group || channel.category || 'Direct TV'}
        </Text>
      </View>

      {/* Ligne rouge brillante en bas quand la chaîne est en lecture */}
      {isPlaying && <View style={styles.playingUnderline} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // ── Grille ──
  gridCard: {
    flex: 1,
    margin: 5,
    borderRadius: 14,
    backgroundColor: '#111522',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  gridCardPlaying: {
    borderColor: '#e50914',
    borderWidth: 1.5,
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
    borderColor: '#00d2ff',
    borderWidth: 2.5,
    transform: [{ scale: 1.04 }],
    shadowColor: '#00d2ff',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  gridVisualBox: {
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 8,
  },
  gridLogo: {
    width: '70%',
    height: '70%',
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
    backgroundColor: 'rgba(229, 9, 20, 0.9)',
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
  qualityText: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    paddingVertical: 9,
    backgroundColor: '#0d101a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  gridInfoBoxPlaying: {
    backgroundColor: '#170c10',
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
  gridMeta: {
    color: '#64748b',
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: '500',
  },
  playingUnderline: {
    height: 2.5,
    backgroundColor: '#e50914',
    width: '100%',
  },

  // ── Mode Liste ──
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111522',
    borderRadius: 12,
    padding: 10,
    marginVertical: 4,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  listCardPlaying: {
    borderColor: '#e50914',
    backgroundColor: '#1b1418',
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
  favBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
