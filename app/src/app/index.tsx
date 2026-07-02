import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Platform, Dimensions
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import channelsAll, { CATEGORIES } from '../data/channels';

const { width } = Dimensions.get('window');
const SIDEBAR_W = Math.min(280, width * 0.40);
const isTV = Platform.isTV;

const C = {
  bg:       '#080c12',
  surface:  '#0f1623',
  surface2: '#161f2e',
  border:   '#1e2d42',
  primary:  '#6366f1',
  primaryDim: 'rgba(99,102,241,0.15)',
  accent:   '#3fb950',
  text:     '#f1f5f9',
  muted:    '#64748b',
  live:     '#ef4444',
};

const CAT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  tous:        'grid-outline',
  senegal:     'location-outline',
  sport:       'trophy-outline',
  francophone: 'document-text-outline',
  arab:        'language-outline',
  news:        'newspaper-outline',
  music:       'musical-notes-outline',
  autres:      'tv-outline',
};

export default function App() {
  const [currentCat, setCurrentCat] = useState('tous');
  const [search, setSearch]         = useState('');
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [hasError, setHasError]     = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [focusedCh, setFocusedCh]   = useState<string | null>(null);

  const player = useVideoPlayer(currentUrl || '', (p) => {
    p.loop = false;
    if (currentUrl) p.play();
  });

  const filtered = channelsAll.filter(ch => {
    const matchCat = currentCat === 'tous' || ch.category === currentCat;
    const matchQ   = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const loadChannel = useCallback((url: string, name: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setCurrentUrl(url);
    setCurrentName(name);
    setHasError(false);
    setLoading(true);
    errorTimer.current = setTimeout(() => {
      setLoading(false);
      setHasError(true);
    }, 12000);
  }, []);

  const retry = useCallback(() => {
    if (currentUrl) loadChannel(currentUrl, currentName);
  }, [currentUrl, currentName, loadChannel]);

  useEffect(() => {
    // Auto-start default channel (Louga TV)
    const defaultIdx = channelsAll.findIndex(ch => ch.name.toLowerCase().includes('louga'));
    const fallbackIdx = channelsAll.findIndex(ch => ch.category === 'senegal');
    const startIdx = defaultIdx >= 0 ? defaultIdx : fallbackIdx;
    if (startIdx >= 0) {
      loadChannel(channelsAll[startIdx].url, channelsAll[startIdx].name);
    }
  }, [loadChannel]);

  const renderCat = ({ item }: { item: typeof CATEGORIES[0] }) => {
    const isActive = currentCat === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.catBtn,
          isActive && { backgroundColor: C.primaryDim, borderColor: 'rgba(99,102,241,0.4)' },
          isTV && focusedCat === item.key && styles.tvFocused
        ]}
        onPress={() => { setCurrentCat(item.key); setSearch(''); }}
        onFocus={() => setFocusedCat(item.key)}
        onBlur={() => setFocusedCat(null)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={CAT_ICONS[item.key] || 'tv-outline'}
          size={11}
          color={isActive ? '#a5b4fc' : C.muted}
        />
        <Text style={[styles.catText, isActive && { color: '#a5b4fc' }]}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  const renderChannel = ({ item }: { item: typeof channelsAll[0] }) => {
    const isActive = item.url === currentUrl;
    return (
      <TouchableOpacity
        style={[
          styles.chItem,
          isActive && styles.chItemActive,
          isTV && focusedCh === item.url && styles.tvFocused
        ]}
        onPress={() => loadChannel(item.url, item.name)}
        onFocus={() => setFocusedCh(item.url)}
        onBlur={() => setFocusedCh(null)}
        activeOpacity={0.7}
      >
        <View style={[styles.chDot, isActive && { backgroundColor: C.accent }]} />
        <Text style={[styles.chName, isActive && { color: '#a5b4fc', fontWeight: '600' }]} numberOfLines={1}>
          {item.name}
        </Text>
        {isActive && <Ionicons name="play" size={10} color="#a5b4fc" />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.surface} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="tv" size={20} color={C.primary} />
          <Text style={styles.logoText}>
            Loud<Text style={{ color: '#818cf8' }}>StreamTV</Text>
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.nowPlaying} numberOfLines={1}>
          {currentName || 'Sélectionnez une chaîne'}
        </Text>
      </View>

      <View style={[styles.layout, isTV && { flexDirection: 'row' }]}>

        {/* ── Player ── */}
        <View style={[styles.playerWrap, isTV && { flex: 1 }]}>
          {currentUrl ? (
            <View style={StyleSheet.absoluteFill}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                allowsPictureInPicture
                contentFit="contain"
                onFullscreenExit={() => {}}
              />
              {loading && (
                <View style={styles.overlay}>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={styles.overlayText}>Chargement...</Text>
                </View>
              )}
              {hasError && (
                <View style={styles.overlay}>
                  <Ionicons name="warning-outline" size={40} color="#f97316" />
                  <Text style={styles.overlayText}>Chaîne indisponible</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={retry}>
                    <Ionicons name="refresh" size={14} color={C.text} />
                    <Text style={styles.retryText}>Réessayer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="tv-outline" size={52} color="#1e2d42" />
              <Text style={styles.placeholderText}>Choisissez une chaîne</Text>
            </View>
          )}
        </View>

        {/* ── Sidebar ── */}
        <View style={[styles.sidebar, isTV && { width: SIDEBAR_W }]}>
          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={14} color={C.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher..."
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={14} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Categories */}
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={i => i.key}
            showsHorizontalScrollIndicator={false}
            style={styles.catList}
            contentContainerStyle={{ gap: 5, paddingHorizontal: 10, paddingVertical: 8 }}
            renderItem={renderCat}
          />

          <Text style={styles.count}>{filtered.length} chaîne{filtered.length !== 1 ? 's' : ''}</Text>

          {/* Channel list */}
          <FlatList
            data={filtered}
            keyExtractor={i => String(i.id)}
            renderItem={renderChannel}
            style={styles.chList}
            contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 6 }}
            getItemLayout={(_, idx) => ({ length: 40, offset: 40 * idx, index: idx })}
            removeClippedSubviews
            maxToRenderPerBatch={25}
            initialNumToRender={30}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoText: { color: C.text, fontWeight: '700', fontSize: 15, letterSpacing: -0.3 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.live },
  liveText: { color: C.live, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  nowPlaying: { flex: 1, color: C.muted, fontSize: 11, textAlign: 'right' },

  layout: { flex: 1, flexDirection: 'column' },

  playerWrap: {
    backgroundColor: '#000',
    height: Platform.isTV ? '100%' : 210,
    position: 'relative', justifyContent: 'center', alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,12,18,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  overlayText: { color: C.muted, fontSize: 13 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface2, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
  },
  retryText: { color: C.text, fontSize: 13, fontWeight: '500' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  placeholderText: { color: '#334155', fontSize: 13 },

  sidebar: {
    flex: 1, backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 10, backgroundColor: C.surface2, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 12.5, paddingVertical: 9 },

  catList: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  catBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
  },
  catText: { color: C.muted, fontSize: 11, fontWeight: '500' },

  count: { color: C.muted, fontSize: 10.5, paddingHorizontal: 12, paddingVertical: 5 },

  chList: { flex: 1 },
  chItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 40, paddingHorizontal: 8, gap: 8, borderRadius: 7,
  },
  chItemActive: { backgroundColor: 'rgba(99,102,241,0.12)' },
  chDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.border },
  chName: { flex: 1, color: '#94a3b8', fontSize: 12 },
  tvFocused: { borderColor: C.primary, borderWidth: 1, backgroundColor: 'rgba(99,102,241,0.05)' },
});
