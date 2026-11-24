// ═══════════════════════════════════════════════════════════════
// BOKK TV — Sidebar de Navigation Latérale pour Smart TV & Grand Écran
// Navigation D-Pad ultra-fluide, indicateurs de focus lumineux & accès direct
// ═══════════════════════════════════════════════════════════════

import React, { useState, memo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Subscriber } from '../services/firebase';

interface TvSidebarProps {
  activeTab: 'home' | 'tv' | 'sport' | 'favoris';
  onSelectTab: (tab: 'home' | 'tv' | 'sport' | 'favoris') => void;
  onOpenAccount: () => void;
  isRegistered: boolean;
  subscriber: Subscriber | null;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
}

interface SidebarItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  isActive: boolean;
  onPress: () => void;
  badge?: string;
  badgeColor?: string;
  isVip?: boolean;
}

function SidebarItem({
  icon,
  iconActive,
  label,
  isActive,
  onPress,
  badge,
  badgeColor = '#e50914',
  isVip = false
}: SidebarItemProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      focusable={true}
      accessible={true}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        isActive && styles.navItemActive,
        isFocused && styles.navItemFocused,
        pressed && styles.navItemPressed
      ]}
    >
      <View style={[styles.iconWrap, isFocused && styles.iconWrapFocused, isActive && styles.iconWrapActive]}>
        <Ionicons
          name={isActive ? iconActive : icon}
          size={22}
          color={isFocused ? '#ffffff' : isActive ? '#ffffff' : isVip ? '#22c55e' : '#94a3b8'}
        />
        {badge ? (
          <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
        ) : null}
      </View>
      <Text
        style={[
          styles.navLabel,
          isActive && styles.navLabelActive,
          isFocused && styles.navLabelFocused
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isFocused && <View style={styles.focusIndicatorBar} />}
    </Pressable>
  );
}

export const TvSidebar = memo(function TvSidebar({
  activeTab,
  onSelectTab,
  onOpenAccount,
  isRegistered,
  subscriber,
  isSearchOpen,
  onToggleSearch
}: TvSidebarProps) {
  return (
    <View style={styles.container}>
      {/* ── LOGO BOKK TV EN HAUT DU RAIL ── */}
      <View style={styles.logoSection}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoTextBold}>BOKK</Text>
          <Text style={styles.logoTextSub}>TV</Text>
        </View>
        <View style={styles.liveDotWrap}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>DIRECT</Text>
        </View>
      </View>

      {/* ── LISTE DES ÉLÉMENTS DE NAVIGATION VERTICALE ── */}
      <View style={styles.navGroup}>
        <SidebarItem
          icon="home-outline"
          iconActive="home"
          label="Accueil"
          isActive={activeTab === 'home' && !isSearchOpen}
          onPress={() => onSelectTab('home')}
        />

        <SidebarItem
          icon="tv-outline"
          iconActive="tv"
          label="Direct TV"
          isActive={activeTab === 'tv' && !isSearchOpen}
          onPress={() => onSelectTab('tv')}
        />

        <SidebarItem
          icon="football-outline"
          iconActive="football"
          label="Sports"
          isActive={activeTab === 'sport' && !isSearchOpen}
          onPress={() => onSelectTab('sport')}
        />

        <SidebarItem
          icon="star-outline"
          iconActive="star"
          label="Favoris"
          isActive={activeTab === 'favoris' && !isSearchOpen}
          onPress={() => onSelectTab('favoris')}
        />

        <SidebarItem
          icon="search-outline"
          iconActive="search"
          label="Recherche"
          isActive={isSearchOpen}
          onPress={onToggleSearch}
        />
      </View>

      {/* ── FOOTER : MON COMPTE / PASS VIP ── */}
      <View style={styles.footerSection}>
        <SidebarItem
          icon="person-circle-outline"
          iconActive="person-circle"
          label={subscriber ? subscriber.prenom || 'Mon Compte' : 'Pass VIP'}
          isActive={false}
          onPress={onOpenAccount}
          isVip={isRegistered}
          badge={isRegistered ? 'VIP' : undefined}
          badgeColor="#22c55e"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 96,
    backgroundColor: '#0a0d14',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    zIndex: 50,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e50914',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
  logoTextBold: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  logoTextSub: {
    color: '#fee2e2',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
  },
  liveDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22c55e',
  },
  liveText: {
    color: '#22c55e',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  navGroup: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  navItem: {
    width: 82,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    marginVertical: 2,
  },
  navItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    borderColor: 'rgba(229, 9, 20, 0.4)',
  },
  navItemFocused: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderColor: '#38bdf8',
    transform: [{ scale: 1.1 }],
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 10,
  },
  navItemPressed: {
    transform: [{ scale: 0.96 }],
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconWrapActive: {
    // Styling optionnel
  },
  iconWrapFocused: {
    // Styling optionnel
  },
  badgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  navLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  navLabelFocused: {
    color: '#ffffff',
    fontWeight: '900',
  },
  focusIndicatorBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    backgroundColor: '#38bdf8',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  footerSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
});

