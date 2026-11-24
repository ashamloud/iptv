// ═══════════════════════════════════════════════════════════════
// BOKK TV — Widget Header : Chocs Sportifs & Matchs en Direct
// Design Natif Mobile & Android TV (Focusable avec télécommande)
// ═══════════════════════════════════════════════════════════════

import React, { memo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Platform
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MatchItem } from '../services/matches';

interface MatchHeaderTickerProps {
  matches: MatchItem[];
  onSelectMatch: (match: MatchItem) => void;
}

export const MatchHeaderTicker = memo(function MatchHeaderTicker({
  matches,
  onSelectMatch
}: MatchHeaderTickerProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  if (!matches || matches.length === 0) return null;

  const hasLive = matches.some((m) => m.isLive);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="football" size={14} color="#e50914" />
          <Text style={styles.sectionTitle}>CHOCS DU JOUR & EN DIRECT</Text>
          {hasLive && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>MATCH EN COURS</Text>
            </View>
          )}
        </View>
        <Text style={styles.scrollHint}>Glisser ➜</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {matches.map((item) => {
          const isCardFocused = focusedId === item.id;
          return (
            <Pressable
              key={item.id}
              focusable={true}
              accessible={true}
              onFocus={() => setFocusedId(item.id)}
              onBlur={() => setFocusedId((prev) => (prev === item.id ? null : prev))}
              style={({ pressed }) => [
                styles.matchCard,
                item.isLive && styles.matchCardLive,
                isCardFocused && styles.cardFocused,
                pressed && styles.cardPressed
              ]}
              onPress={() => onSelectMatch(item)}
            >
              <LinearGradient
                colors={
                  item.isLive
                    ? ['rgba(229, 9, 20, 0.22)', 'rgba(15, 23, 42, 0.85)']
                    : ['rgba(30, 41, 59, 0.7)', 'rgba(15, 23, 42, 0.9)']
                }
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />

            {/* Top Bar : Compétition & Statut (Live / Heure) */}
            <View style={styles.cardTopRow}>
              <View style={styles.compBadge}>
                <Text style={styles.compText} numberOfLines={1}>
                  {item.competitionBadge || item.competition}
                </Text>
              </View>

              {item.isLive ? (
                <View style={styles.liveTimeBadge}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.liveTimeText}>
                    {item.liveMinute || 'DIRECT'}
                  </Text>
                </View>
              ) : (
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={10} color="#94a3b8" />
                  <Text style={styles.timeText}>
                    {item.date === "Aujourd'hui" ? item.time : `${item.date} ${item.time}`}
                  </Text>
                </View>
              )}
            </View>

            {/* Centre : Logos des équipes + Score ou VS */}
            <View style={styles.teamsRow}>
              <View style={styles.teamCol}>
                <Image
                  source={{ uri: item.teamA.logo }}
                  style={styles.teamLogo}
                  contentFit="contain"
                  transition={150}
                />
                <Text style={styles.teamName} numberOfLines={1}>
                  {item.teamA.name}
                </Text>
              </View>

              <View style={styles.scoreWrap}>
                <Text style={[styles.scoreText, item.isLive && styles.scoreTextLive]}>
                  {item.score || 'VS'}
                </Text>
              </View>

              <View style={styles.teamCol}>
                <Image
                  source={{ uri: item.teamB.logo }}
                  style={styles.teamLogo}
                  contentFit="contain"
                  transition={150}
                />
                <Text style={styles.teamName} numberOfLines={1}>
                  {item.teamB.name}
                </Text>
              </View>
            </View>

            {/* Bottom : Chaîne de diffusion TV */}
            <View style={styles.cardFooter}>
              <Ionicons name="tv-outline" size={10} color="#60a5fa" />
              <Text style={styles.channelText} numberOfLines={1}>
                {item.channels || 'Direct TV'}
              </Text>
            </View>
          </Pressable>
        );
      })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: '#0a0d16',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  liveText: {
    color: '#e50914',
    fontSize: 9,
    fontWeight: '800',
  },
  scrollHint: {
    color: '#64748b',
    fontSize: 10,
  },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 10,
  },
  matchCard: {
    width: 200,
    borderRadius: 14,
    padding: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#111522',
    position: 'relative',
  },
  matchCardLive: {
    borderColor: 'rgba(229, 9, 20, 0.45)',
  },
  cardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 3,
    transform: [{ scale: 1.06 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 12,
    backgroundColor: '#0f172a',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  compBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  compText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timeText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  liveTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ffffff',
  },
  liveTimeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  teamLogo: {
    width: 28,
    height: 28,
  },
  teamName: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreWrap: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  scoreText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scoreTextLive: {
    color: '#22c55e',
    fontSize: 13,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  channelText: {
    color: '#60a5fa',
    fontSize: 9.5,
    fontWeight: '600',
    flex: 1,
  },
});
