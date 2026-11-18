// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Mobile & Smart TV 100% Native
// Moteur natif : expo-video (ExoPlayer Android / AVPlayer iOS)
// Sans WebView • Fast Streaming • Synchronisation temps réel
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  BackHandler,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Alert
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import channelsAll, { Channel, CATEGORIES } from '../data/channels';
import { ChannelCard } from '../components/ChannelCard';
import { NativePlayer } from '../components/NativePlayer';
import { AccountModal } from '../components/AccountModal';
import { StorageService } from '../services/storage';
import { FirebaseService, Subscriber } from '../services/firebase';

export default function NativeBokkApp() {
  const { width } = useWindowDimensions();

  // État lecteur & chaîne active
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  // Filtres & recherche
  const [selectedCategory, setSelectedCategory] = useState<string>('tous');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Données utilisateur & favoris
  const [favorites, setFavorites] = useState<string[]>([]);
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [m3uChannels, setM3uChannels] = useState<Channel[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isInitLoaded, setIsInitLoaded] = useState<boolean>(false);

  // Fusion des chaînes de base et des playlists M3U ajoutées par l'administrateur
  const allChannels = useMemo(() => {
    if (!m3uChannels.length) return channelsAll;
    return [...channelsAll, ...m3uChannels];
  }, [channelsAll, m3uChannels]);

  // Détermination du nombre de colonnes (Smartphones: 2, Tablettes/TV: 3 à 5)
  const numColumns = useMemo(() => {
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 480) return 3;
    return 2;
  }, [width]);

  // Initialisation : Favoris, Session Abonné, Chaînes désactivées, Chaînes M3U Cloud
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      try {
        const [favs, sub, disabled, cloudM3u] = await Promise.all([
          StorageService.getFavorites(),
          StorageService.getSubscriber(),
          FirebaseService.getDisabledChannels(),
          FirebaseService.getM3uChannels()
        ]);

        if (isMounted) {
          setFavorites(favs);
          setSubscriber(sub);
          setDisabledIds(disabled);
          setM3uChannels(cloudM3u);
          setIsInitLoaded(true);
        }

        // Vérification de validité de l'abonné auprès de Firebase
        if (sub && sub.id) {
          const remoteStatus = await FirebaseService.checkSubscriberStatus(sub.id);
          if (remoteStatus && isMounted) {
            if (remoteStatus.status === 'suspended') {
              setSubscriber((prev) => prev ? { ...prev, status: 'suspended' } : null);
              Alert.alert('Compte suspendu', 'Votre abonnement a été suspendu par l\'administrateur.');
            }
          }
        }
      } catch (err) {
        if (isMounted) setIsInitLoaded(true);
      }
    }

    initApp();

    return () => {
      isMounted = false;
    };
  }, []);

  // Gestion du bouton retour physique (Android / Télécommande Smart TV)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      // 1. Si la vidéo tourne, on ferme le lecteur en priorité
      if (activeChannel) {
        setActiveChannel(null);
        return true;
      }
      // 2. Si la recherche est ouverte, on la ferme
      if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        return true;
      }
      // 3. Si la catégorie n'est pas 'tous', on revient à 'tous'
      if (selectedCategory !== 'tous') {
        setSelectedCategory('tous');
        return true;
      }
      return false; // Quitter l'application
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [activeChannel, isSearchOpen, selectedCategory]);

  // Bascule favori
  const handleToggleFavorite = useCallback(async (channelId: string | number) => {
    const nextFavs = await StorageService.toggleFavorite(channelId);
    setFavorites(nextFavs);
  }, []);

  // Sélection d'une chaîne
  const handleSelectChannel = useCallback((channel: Channel) => {
    setActiveChannel(channel);
  }, []);

  // Fermeture du lecteur
  const handleClosePlayer = useCallback(() => {
    setActiveChannel(null);
  }, []);

  // Déclenchement de la restriction 3s (pour les visiteurs non enregistrés)
  const handlePreviewLock = useCallback(() => {
    setIsAccountModalOpen(true);
    Alert.alert(
      'Aperçu gratuit terminé',
      'Pour regarder la télévision en direct illimité, activez votre Pass Gratuit (1 mois offert) ou connectez votre identifiant.',
      [
        { text: 'Activer mon Pass', onPress: () => setIsAccountModalOpen(true) },
        { text: 'Fermer', style: 'cancel' }
      ]
    );
  }, []);

  // Filtrage ultra-rapide des chaînes
  const filteredChannels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const disabledSet = new Set(disabledIds);

    return allChannels.filter((ch) => {
      // Exclure chaînes désactivées par l'admin
      if (disabledSet.has(String(ch.id))) return false;

      // Filtre catégorie
      if (selectedCategory === 'favoris') {
        if (!favorites.includes(String(ch.id))) return false;
      } else if (selectedCategory !== 'tous') {
        const catKey = (ch.category || '').toLowerCase();
        const grpKey = (ch.group || '').toLowerCase();
        if (!catKey.includes(selectedCategory) && !grpKey.includes(selectedCategory)) {
          return false;
        }
      }

      // Filtre recherche textuelle
      if (query) {
        const nameMatch = ch.name.toLowerCase().includes(query);
        const groupMatch = ch.group ? ch.group.toLowerCase().includes(query) : false;
        const countryMatch = ch.country ? ch.country.toLowerCase().includes(query) : false;
        return nameMatch || groupMatch || countryMatch;
      }

      return true;
    });
  }, [allChannels, disabledIds, selectedCategory, favorites, searchQuery]);

  // Utilisateur enregistré et actif ?
  const isRegisteredUser = Boolean(subscriber && subscriber.status === 'active');

  // Rendu de chaque carte de chaîne
  const renderChannelItem = useCallback(
    ({ item }: { item: Channel }) => {
      const isPlaying = activeChannel ? String(activeChannel.id) === String(item.id) : false;
      const isFav = favorites.includes(String(item.id));

      return (
        <ChannelCard
          channel={item}
          isPlaying={isPlaying}
          isFavorite={isFav}
          onPress={() => handleSelectChannel(item)}
          onToggleFavorite={() => handleToggleFavorite(item.id)}
        />
      );
    },
    [activeChannel, favorites, handleSelectChannel, handleToggleFavorite]
  );

  const keyExtractor = useCallback((item: Channel) => String(item.id), []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── HEADER BOKK TV ── */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBold}>BOKK</Text>
            <Text style={styles.logoSub}>TV</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>DIRECT</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Bouton Recherche */}
          <TouchableOpacity
            style={[styles.headerIconBtn, isSearchOpen && styles.headerIconBtnActive]}
            onPress={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
            accessibilityLabel="Rechercher une chaîne"
          >
            <Ionicons
              name={isSearchOpen ? 'close' : 'search'}
              size={20}
              color={isSearchOpen ? '#e50914' : '#f0f3f8'}
            />
          </TouchableOpacity>

          {/* Bouton Compte / VIP */}
          <TouchableOpacity
            style={[styles.accountBtn, isRegisteredUser ? styles.accountBtnVip : styles.accountBtnFree]}
            onPress={() => setIsAccountModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRegisteredUser ? 'ribbon' : 'person-circle-outline'}
              size={18}
              color={isRegisteredUser ? '#22c55e' : '#f59e0b'}
            />
            <Text style={[styles.accountBtnText, isRegisteredUser && styles.accountBtnTextVip]}>
              {subscriber ? subscriber.prenom || subscriber.id : 'Pass Gratuit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── BARRE DE RECHERCHE DÉPLIABLE ── */}
      {isSearchOpen && (
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={18} color="#8a94a6" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une chaîne (Canal+, beIN, RTS, TF1...)"
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color="#8a94a6" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── LECTEUR VIDÉO NATIF DOCKÉ ── */}
      {activeChannel && (
        <View style={styles.playerContainer}>
          <NativePlayer
            channel={activeChannel}
            onClose={handleClosePlayer}
            onPreviewLockTriggered={handlePreviewLock}
            isRegistered={isRegisteredUser}
          />
        </View>
      )}

      {/* ── SELECTEUR DE CATÉGORIES ── */}
      <View style={styles.categoryBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillActive
                ]}
                onPress={() => setSelectedCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isSelected ? '#ffffff' : '#8a94a6'}
                  style={styles.catIcon}
                />
                <Text style={[styles.catText, isSelected && styles.catTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── INDICATEUR DE RÉSULTATS ── */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {filteredChannels.length} {filteredChannels.length > 1 ? 'chaînes disponibles' : 'chaîne disponible'}
          {selectedCategory !== 'tous' ? ` • ${selectedCategory.toUpperCase()}` : ''}
        </Text>
      </View>

      {/* ── GRILLE DES CHAÎNES (FLATLIST FLUIDE 60 FPS) ── */}
      {!isInitLoaded ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Chargement du bouquet BOKK TV...</Text>
        </View>
      ) : filteredChannels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="tv-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Aucune chaîne trouvée</Text>
          <Text style={styles.emptyDesc}>
            {searchQuery
              ? `Aucun résultat pour « ${searchQuery} »`
              : 'Aucune chaîne dans cette catégorie'}
          </Text>
        </View>
      ) : (
        <FlatList
          key={numColumns} // Re-render propre si l'écran pivote
          data={filteredChannels}
          renderItem={renderChannelItem}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          contentContainerStyle={styles.gridContent}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── MODALE COMPTE & PASS VIP ── */}
      <AccountModal
        visible={isAccountModalOpen}
        subscriber={subscriber}
        onClose={() => setIsAccountModalOpen(false)}
        onSubscriberUpdated={(sub) => setSubscriber(sub)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0c10',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#0d1017',
    borderBottomWidth: 1,
    borderBottomColor: '#1a2233',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBold: {
    fontSize: 22,
    fontWeight: '900',
    color: '#e50914',
    letterSpacing: -0.5,
  },
  logoSub: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    marginLeft: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#e50914',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#161b26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  accountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  accountBtnFree: {
    backgroundColor: '#1b2230',
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  accountBtnVip: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  accountBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f0f3f8',
  },
  accountBtnTextVip: {
    color: '#22c55e',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121622',
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  playerContainer: {
    width: '100%',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2433',
  },
  categoryBarWrap: {
    height: 48,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#141a26',
  },
  categoryScroll: {
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121622',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  categoryPillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  catIcon: {
    marginRight: 6,
  },
  catText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a94a6',
  },
  catTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  metaRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  gridContent: {
    paddingHorizontal: 10,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8a94a6',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f0f3f8',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
