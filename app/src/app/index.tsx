import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Platform, Dimensions, Modal, ScrollView
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import channelsAll, { Channel, CATEGORIES, Category } from '../data/channels';
import bouquetsList from '../data/bouquets.json';

const { width } = Dimensions.get('window');
const isTV = Platform.isTV;
const SIDEBAR_W = Math.min(320, width * 0.42);

const C = {
  bg:         '#06090e',
  surface:    '#0c1320',
  surface2:   '#111a2c',
  card:       '#152238',
  cardHover:  '#1c2d4a',
  border:     'rgba(255, 255, 255, 0.08)',
  borderGlow: 'rgba(99, 102, 241, 0.4)',
  primary:    '#6366f1',
  primaryDim: 'rgba(99, 102, 241, 0.16)',
  accent:     '#10b981',
  text:       '#f8fafc',
  textMuted:  '#64748b',
  live:       '#ef4444',
  gold:       '#f59e0b',
};

const RENDER_PROXY = 'https://iptv-vbm1.onrender.com';

function resolveStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    // Les flux RTS acangroup ou megatv passent directement par le proxy cloud haute compatibilité
    if (rawUrl.includes('megatv') || rawUrl.includes(':80/live/')) {
      return `${RENDER_PROXY}/proxy?url=${encodeURIComponent(rawUrl)}&ua=IPTVSmartersPro`;
    }
    return rawUrl;
  }
  // Chaîne alias comme 'rts1', 'rts2', 'sentv'
  return `${RENDER_PROXY}/proxy?url=${encodeURIComponent(rawUrl)}`;
}

export default function App() {
  const [currentCat, setCurrentCat]         = useState('tous');
  const [selectedBouquet, setSelectedBouquet] = useState('all');
  const [search, setSearch]                 = useState('');
  const [isGridView, setIsGridView]         = useState(false);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [loading, setLoading]               = useState(false);
  const [hasError, setHasError]             = useState(false);
  const [favorites, setFavorites]           = useState<Set<number | string>>(new Set());
  const [showBouquetModal, setShowBouquetModal] = useState(false);

  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [focusedCh, setFocusedCh]   = useState<string | null>(null);

  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialisation du lecteur vidéo expo-video
  const streamUrl = useMemo(() => {
    if (!currentChannel) return '';
    return resolveStreamUrl(currentChannel.url);
  }, [currentChannel]);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    if (streamUrl) p.play();
  });

  // Gestion des favoris
  const toggleFavorite = (id: number | string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Chargement d'une chaîne
  const loadChannel = useCallback((channel: Channel) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setCurrentChannel(channel);
    setHasError(false);
    setLoading(true);

    errorTimer.current = setTimeout(() => {
      setLoading(false);
      setHasError(true);
    }, 15000);
  }, []);

  const retry = useCallback(() => {
    if (currentChannel) {
      if (currentChannel.fallbackUrl && currentChannel.fallbackUrl !== currentChannel.url) {
        loadChannel({ ...currentChannel, url: currentChannel.fallbackUrl });
      } else {
        loadChannel(currentChannel);
      }
    }
  }, [currentChannel, loadChannel]);

  // Lancement automatique de la première chaîne sénégalaise (RTS 1)
  useEffect(() => {
    const rts1 = channelsAll.find(ch => ch.name.toLowerCase().includes('rts 1') || ch.category === 'senegal');
    if (rts1) {
      loadChannel(rts1);
    } else if (channelsAll.length > 0) {
      loadChannel(channelsAll[0]);
    }
  }, [loadChannel]);

  // Filtrage ultra-rapide et optimisé
  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return channelsAll.filter(ch => {
      // Éviter les séparateurs de section bruts
      if (ch.name.startsWith('###')) return false;

      // Filtre catégorie
      if (currentCat === 'favoris') {
        if (!favorites.has(ch.id)) return false;
      } else if (currentCat !== 'tous') {
        if (ch.category !== currentCat) return false;
      }

      // Filtre Bouquet
      if (selectedBouquet !== 'all') {
        if (ch.group !== selectedBouquet) return false;
      }

      // Filtre Recherche
      if (query) {
        const matchName = ch.name.toLowerCase().includes(query);
        const matchGroup = (ch.group || '').toLowerCase().includes(query);
        if (!matchName && !matchGroup) return false;
      }

      return true;
    });
  }, [currentCat, selectedBouquet, search, favorites]);

  // Rendu catégorie
  const renderCat = ({ item }: { item: Category }) => {
    const isActive = currentCat === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.catBtn,
          isActive && styles.catBtnActive,
          isTV && focusedCat === item.key && styles.tvFocused
        ]}
        onPress={() => { setCurrentCat(item.key); }}
        onFocus={() => setFocusedCat(item.key)}
        onBlur={() => setFocusedCat(null)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={(item.icon as any) || 'tv-outline'}
          size={12}
          color={isActive ? '#a5b4fc' : C.textMuted}
        />
        <Text style={[styles.catText, isActive && styles.catTextActive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Rendu chaîne en Mode Liste
  const renderChannelList = ({ item }: { item: Channel }) => {
    const isActive = currentChannel?.id === item.id;
    const isFav = favorites.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.chRow,
          isActive && styles.chRowActive,
          isTV && focusedCh === String(item.id) && styles.tvFocused
        ]}
        onPress={() => loadChannel(item)}
        onFocus={() => setFocusedCh(String(item.id))}
        onBlur={() => setFocusedCh(null)}
        activeOpacity={0.7}
      >
        <View style={styles.chRowLogoWrap}>
          {item.logo ? (
            <Image
              source={{ uri: item.logo }}
              style={styles.chRowLogo}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <Ionicons name="tv" size={16} color={C.textMuted} />
          )}
        </View>

        <View style={styles.chRowInfo}>
          <Text style={[styles.chRowTitle, isActive && styles.chRowTitleActive]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.chRowSub} numberOfLines={1}>
            {item.group || item.category.toUpperCase()}
          </Text>
        </View>

        {item.badge && (
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.favBtn}
          onPress={() => toggleFavorite(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={16}
            color={isFav ? C.gold : 'rgba(255,255,255,0.2)'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Rendu chaîne en Mode Grille (Cards)
  const renderChannelGrid = ({ item }: { item: Channel }) => {
    const isActive = currentChannel?.id === item.id;
    const isFav = favorites.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          isActive && styles.gridCardActive,
          isTV && focusedCh === String(item.id) && styles.tvFocused
        ]}
        onPress={() => loadChannel(item)}
        onFocus={() => setFocusedCh(String(item.id))}
        onBlur={() => setFocusedCh(null)}
        activeOpacity={0.7}
      >
        <View style={styles.gridLogoWrap}>
          {item.logo ? (
            <Image
              source={{ uri: item.logo }}
              style={styles.gridLogo}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <Ionicons name="tv-outline" size={28} color={C.textMuted} />
          )}
        </View>

        <Text style={[styles.gridTitle, isActive && styles.gridTitleActive]} numberOfLines={2}>
          {item.name}
        </Text>

        <Text style={styles.gridSub} numberOfLines={1}>
          {item.group || item.category}
        </Text>

        {item.badge && (
          <View style={styles.gridBadge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.gridFavBtn}
          onPress={() => toggleFavorite(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={14}
            color={isFav ? C.gold : 'rgba(255,255,255,0.3)'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.surface} />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <Ionicons name="tv" size={22} color={C.primary} />
          <Text style={styles.brandTitle}>
            BOKK<Text style={{ color: '#818cf8' }}>TV</Text>
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>DIRECT</Text>
          </View>
        </View>

        <Text style={styles.nowPlaying} numberOfLines={1}>
          {currentChannel ? currentChannel.name : 'Sélectionnez une chaîne'}
        </Text>
      </View>

      <View style={[styles.mainLayout, isTV && { flexDirection: 'row' }]}>

        {/* ── LECTEUR VIDÉO ── */}
        <View style={[styles.playerContainer, isTV && { flex: 1 }]}>
          {currentChannel ? (
            <View style={StyleSheet.absoluteFill}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                allowsPictureInPicture
                contentFit="contain"
              />
              {loading && (
                <View style={styles.overlay}>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={styles.overlayText}>Chargement du flux direct...</Text>
                </View>
              )}
              {hasError && (
                <View style={styles.overlay}>
                  <Ionicons name="alert-circle-outline" size={44} color="#f97316" />
                  <Text style={styles.overlayText}>Flux momentanément indisponible</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={retry}>
                    <Ionicons name="refresh" size={15} color={C.text} />
                    <Text style={styles.retryText}>Réessayer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="tv-outline" size={54} color="#1e2d42" />
              <Text style={styles.placeholderText}>Sélectionnez une chaîne pour démarrer</Text>
            </View>
          )}
        </View>

        {/* ── BARRE LATÉRALE & LISTE DES CHAÎNES ── */}
        <View style={[styles.sidebar, isTV && { width: SIDEBAR_W }]}>

          {/* Recherche & Filtres */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={C.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher une chaîne ou un bouquet..."
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Barre des Catégories Horizontale */}
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={item => item.key}
            showsHorizontalScrollIndicator={false}
            style={styles.catScroll}
            contentContainerStyle={styles.catScrollContent}
            renderItem={renderCat}
          />

          {/* Sélecteur de Bouquet & Bascule Vue (Liste / Grille) */}
          <View style={styles.filterMetaRow}>
            <TouchableOpacity
              style={styles.bouquetBtn}
              onPress={() => setShowBouquetModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="layers-outline" size={13} color="#818cf8" />
              <Text style={styles.bouquetBtnText} numberOfLines={1}>
                {selectedBouquet === 'all' ? 'Tous les bouquets (148)' : selectedBouquet}
              </Text>
              <Ionicons name="chevron-down" size={12} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.viewToggleGroup}>
              <TouchableOpacity
                style={[styles.viewToggleBtn, !isGridView && styles.viewToggleActive]}
                onPress={() => setIsGridView(false)}
              >
                <Ionicons name="list" size={16} color={!isGridView ? '#a5b4fc' : C.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewToggleBtn, isGridView && styles.viewToggleActive]}
                onPress={() => setIsGridView(true)}
              >
                <Ionicons name="grid" size={15} color={isGridView ? '#a5b4fc' : C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Nombre de chaînes */}
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              {filteredChannels.length.toLocaleString('fr-FR')} chaîne{filteredChannels.length > 1 ? 's' : ''} disponible{filteredChannels.length > 1 ? 's' : ''}
            </Text>
          </View>

          {/* Liste Principale des Chaînes */}
          <FlatList
            key={isGridView ? 'grid-view' : 'list-view'}
            data={filteredChannels}
            keyExtractor={item => String(item.id)}
            renderItem={isGridView ? renderChannelGrid : renderChannelList}
            numColumns={isGridView ? 2 : 1}
            style={styles.channelScroll}
            contentContainerStyle={styles.channelScrollContent}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={7}
            removeClippedSubviews
          />
        </View>
      </View>

      {/* ── MODAL SÉLECTEUR DE BOUQUETS ── */}
      <Modal
        visible={showBouquetModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBouquetModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionnez un Bouquet</Text>
              <TouchableOpacity onPress={() => setShowBouquetModal(false)}>
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.modalItem, selectedBouquet === 'all' && styles.modalItemActive]}
                onPress={() => { setSelectedBouquet('all'); setShowBouquetModal(false); }}
              >
                <Text style={[styles.modalItemText, selectedBouquet === 'all' && styles.modalItemTextActive]}>
                  ⚡ Tous les bouquets (148)
                </Text>
              </TouchableOpacity>
              {bouquetsList.map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.modalItem, selectedBouquet === b && styles.modalItemActive]}
                  onPress={() => { setSelectedBouquet(b); setShowBouquetModal(false); }}
                >
                  <Text style={[styles.modalItemText, selectedBouquet === b && styles.modalItemTextActive]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandTitle: { color: C.text, fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 6, paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.live },
  liveText: { color: C.live, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  nowPlaying: { flex: 1, color: C.textMuted, fontSize: 11.5, textAlign: 'right' },

  // Layout
  mainLayout: { flex: 1, flexDirection: 'column' },

  // Lecteur
  playerContainer: {
    backgroundColor: '#000',
    height: Platform.isTV ? '100%' : 220,
    position: 'relative', justifyContent: 'center', alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,9,14,0.88)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  overlayText: { color: C.textMuted, fontSize: 13, fontWeight: '500' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface2, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
  },
  retryText: { color: C.text, fontSize: 13, fontWeight: '600' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  placeholderText: { color: '#334155', fontSize: 13 },

  // Sidebar
  sidebar: {
    flex: 1, backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
  },

  // Recherche
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 10, marginBottom: 8,
    backgroundColor: C.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 13, paddingVertical: 8 },

  // Catégories
  catScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  catScrollContent: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  catBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
  },
  catBtnActive: {
    backgroundColor: C.primaryDim, borderColor: C.primary,
  },
  catText: { color: C.textMuted, fontSize: 11.5, fontWeight: '500' },
  catTextActive: { color: '#a5b4fc', fontWeight: '700' },

  // Meta & Bouquet Filter
  filterMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, gap: 10,
  },
  bouquetBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface2, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
  },
  bouquetBtnText: { flex: 1, color: C.text, fontSize: 11, fontWeight: '600' },
  viewToggleGroup: {
    flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, padding: 2,
  },
  viewToggleBtn: { padding: 4, borderRadius: 6 },
  viewToggleActive: { backgroundColor: C.card },

  counterRow: { paddingHorizontal: 14, paddingBottom: 4 },
  counterText: { color: C.textMuted, fontSize: 10.5 },

  // Channel Scroll
  channelScroll: { flex: 1 },
  channelScrollContent: { paddingHorizontal: 8, paddingBottom: 24, gap: 4 },

  // Channel Row (List)
  chRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 10, gap: 10,
    borderRadius: 10, backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'transparent',
  },
  chRowActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.14)',
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  chRowLogoWrap: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  chRowLogo: { width: '85%', height: '85%' },
  chRowInfo: { flex: 1, minWidth: 0 },
  chRowTitle: { color: '#cbd5e1', fontSize: 12.5, fontWeight: '600' },
  chRowTitleActive: { color: '#a5b4fc', fontWeight: '700' },
  chRowSub: { color: C.textMuted, fontSize: 10.5, marginTop: 2 },
  badgeWrap: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  badgeText: { color: C.textMuted, fontSize: 9.5, fontWeight: '700' },
  favBtn: { padding: 4 },

  // Grid Card
  gridCard: {
    flex: 1, margin: 4, padding: 10,
    alignItems: 'center', textAlign: 'center',
    borderRadius: 12, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border,
    minHeight: 135, position: 'relative',
  },
  gridCardActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    borderColor: C.primary,
  },
  gridLogoWrap: {
    width: 60, height: 50, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  gridLogo: { width: '85%', height: '85%' },
  gridTitle: {
    color: '#cbd5e1', fontSize: 11.5, fontWeight: '600',
    textAlign: 'center', lineHeight: 15,
  },
  gridTitleActive: { color: '#a5b4fc', fontWeight: '700' },
  gridSub: { color: C.textMuted, fontSize: 10, marginTop: 3, textAlign: 'center' },
  gridBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  gridFavBtn: {
    position: 'absolute', top: 6, right: 6,
    padding: 3,
  },

  tvFocused: { borderColor: C.primary, borderWidth: 2, backgroundColor: 'rgba(99,102,241,0.1)' },

  // Modal Bouquet
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: '75%', paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  modalScroll: { paddingHorizontal: 12 },
  modalItem: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  modalItemActive: { backgroundColor: C.primaryDim, borderRadius: 8 },
  modalItemText: { color: C.textMuted, fontSize: 13, fontWeight: '500' },
  modalItemTextActive: { color: '#a5b4fc', fontWeight: '700' },
});
