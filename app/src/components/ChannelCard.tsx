import React, { memo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';

interface ChannelCardProps {
  channel: Channel;
  isPlaying: boolean;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

export const ChannelCard = memo(function ChannelCard({
  channel,
  isPlaying,
  isFavorite,
  onPress,
  onToggleFavorite
}: ChannelCardProps) {
  const logoUri = channel.logo && channel.logo.startsWith('http')
    ? channel.logo
    : null;

  return (
    <Pressable
      style={({ pressed }: { pressed: boolean }) => [
        styles.card,
        isPlaying && styles.cardPlaying,
        pressed && styles.cardActive
      ]}
      onPress={onPress}
    >
      <View style={styles.logoWrap}>
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.logo}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={styles.placeholderLogo}>
            <Ionicons name="tv-outline" size={20} color="#e50914" />
          </View>
        )}
        {isPlaying && (
          <View style={styles.playingIndicator}>
            <View style={styles.playingDot} />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, isPlaying && styles.namePlaying]} numberOfLines={1}>
            {channel.name}
          </Text>
          {channel.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{channel.badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {channel.group || channel.category || 'Direct TV'}
        </Text>
      </View>

      <Pressable
        hitSlop={12}
        style={styles.favBtn}
        onPress={(e) => {
          e.stopPropagation?.();
          onToggleFavorite();
        }}
      >
        <Ionicons
          name={isFavorite ? 'star' : 'star-outline'}
          size={18}
          color={isFavorite ? '#f59e0b' : '#6b7280'}
        />
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121622',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPlaying: {
    borderColor: '#e50914',
    backgroundColor: '#1b1c2b',
  },
  cardActive: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#1c2235',
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0a0d14',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  logo: {
    width: 36,
    height: 36,
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingIndicator: {
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
  playingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  info: {
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
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  namePlaying: {
    color: '#ff4d4d',
  },
  badge: {
    backgroundColor: 'rgba(229,9,20,0.18)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
  },
  badgeText: {
    color: '#e50914',
    fontSize: 9,
    fontWeight: '800',
  },
  meta: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 2,
  },
  favBtn: {
    padding: 6,
    marginLeft: 8,
  },
});

