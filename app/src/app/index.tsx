// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Mobile & Smart TV 100% Native
// Moteur natif : expo-video (ExoPlayer Android / AVPlayer iOS)
// Design Premium : Glassmorphism, Carrousel Hero, Zapping Rapide
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Alert,
  Pressable
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import channelsAll, { Channel, CATEGORIES } from '../data/channels';
import { ChannelCard } from '../components/ChannelCard';
import { NativePlayer } from '../components/NativePlayer';
import { AccountModal } from '../components/AccountModal';
import { StorageService } from '../services/storage';
import { FirebaseService, Subscriber } from '../services/firebase';

// Chaînes vedettes pour le carrousel Hero à l'accueil
const FEATURED_HIGHLIGHTS = [
  {
    name: 'RTS 1 Sénégal',
    desc: 'Direct National • Journal Télévisé & Séries Sénégalaises',
    badge: 'DIRECT HD',
    category: 'senegal',
    logo: 'https://i.ibb.co/6P26Qk7/rts1.png',
    filterKey: 'senegal',
  },
  {
    name: 'Canal+ Sport',
    desc: 'Football Européen • Premier League, UEFA & Grands Rendez-vous',
    badge: 'LIVE 1080p',
    category: 'sport',
    logo: 'https://i.ibb.co/3WkmFmC/canal-sport.png',
    filterKey: 'sport',
  },
  {
    name: 'beIN Sports 1',
    desc: 'Ligue des Champions, LaLiga, Serie A & Émissions en Direct',
    badge: '4K ULTRA',
    category: 'sport',
    logo: 'https://i.ibb.co/b3w664b/bein1.png',
    filterKey: 'sport',
  },
  {
    name: 'France 2 Direct',
    desc: 'Actualités, Magazines & Cinéma Francophone en Haute Définition',
    badge: 'FHD 1080p',
    category: 'francophone',
    logo: 'https://i.ibb.co/1K2WkQG/france2.png',
    filterKey: 'francophone',
  }
];

export default function NativeBokkApp() {
  const { width } = useWindowDimensions();

  // État lecteur & chaîne active
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  // Vue active de navigation (accueil, tv, sports, favoris)
  const [activeNavTab, setActiveNavTab] = useState<'home' | 'tv' | 'sport' | 'favoris'>('home');

  // Affichage : Grille moderne ou Liste compacte
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filtres & recherche
  const [selectedCategory, setSelectedCategory] = useState<string>('tous');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Index du carrousel Hero
  const [heroIndex, setHeroIndex] = useState<number>(0);

  // Données utilisateur & favoris
  const [favorites, setFavorites] = useState<string[]>([]);
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [m3uChannels, setM3uChannels] = useState<Channel[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isInitLoaded, setIsInitLoaded] = useState<boolean>(false);

  const flatListRef = useRef<FlatList>(null);

  // Fusion des chaînes de base et des playlists M3U Cloud ajoutées par l'admin
  const allChannels = useMemo(() => {
    if (!m3uChannels.length) return channelsAll;
    return [...channelsAll, ...m3uChannels];
  }, [channelsAll, m3uChannels]);

  // Détermination du nombre de colonnes (Smartphone: 2 en Grille / 1 en Liste, Tablettes: 3 à 5)
  const numColumns = useMemo(() => {
    if (viewMode === 'list') return 1;
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    if (width >= 480) return 3;
    return 2;
  }, [width, viewMode]);

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
      } catch {
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
      if (activeChannel) {
        setActiveChannel(null);
        return true;
      }
      if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        return true;
      }
      if (activeNavTab !== 'home') {
        setActiveNavTab('home');
        setSelectedCategory('tous');
        return true;
      }
      if (selectedCategory !== 'tous') {
        setSelectedCategory('tous');
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [activeChannel, isSearchOpen, activeNavTab, selectedCategory]);

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
      'Pour regarder la télévision en direct en illimité, activez votre Pass Gratuit (1 mois offert) ou entrez votre ID personnel.',
      [
        { text: 'Activer mon Pass', onPress: () => setIsAccountModalOpen(true) },
        { text: 'Fermer', style: 'cancel' }
      ]
    );
  }, []);

  // Navigation via la barre flottante du bas
  const handleNavTabPress = (tab: 'home' | 'tv' | 'sport' | 'favoris') => {
    setActiveNavTab(tab);
    if (tab === 'home') {
      setSelectedCategory('tous');
    } else if (tab === 'sport') {
      setSelectedCategory('sport');
    } else if (tab === 'favoris') {
      setSelectedCategory('favoris');
    }
  };

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

  // Chaînes similaires pour le zapping rapide quand le lecteur est ouvert
  const relatedZappingChannels = useMemo(() => {
    if (!activeChannel) return [];
    const cat = (activeChannel.category || '').toLowerCase();
    return allChannels
      .filter((c) => String(c.id) !== String(activeChannel.id) && (c.category || '').toLowerCase() === cat)
      .slice(0, 16);
  }, [activeChannel, allChannels]);

  // Zapping suivant / précédent
  const handleNextChannel = useCallback(() => {
    if (!activeChannel || filteredChannels.length === 0) return;
    const curIdx = filteredChannels.findIndex((c) => String(c.id) === String(activeChannel.id));
    const nextIdx = (curIdx + 1) % filteredChannels.length;
    setActiveChannel(filteredChannels[nextIdx]);
  }, [activeChannel, filteredChannels]);

  const handlePrevChannel = useCallback(() => {
    if (!activeChannel || filteredChannels.length === 0) return;
    const curIdx = filteredChannels.findIndex((c) => String(c.id) === String(activeChannel.id));
    const prevIdx = (curIdx - 1 + filteredChannels.length) % filteredChannels.length;
    setActiveChannel(filteredChannels[prevIdx]);
  }, [activeChannel, filteredChannels]);

  // Utilisateur enregistré et actif ?
  const isRegisteredUser = Boolean(subscriber && subscriber.status === 'active');

  // Lancement rapide depuis le Hero
  const handleLaunchHero = () => {
    const hero = FEATURED_HIGHLIGHTS[heroIndex];
    // Chercher la chaîne correspondante dans la liste
    const found = allChannels.find((c) => c.name.toLowerCase().includes(hero.name.toLowerCase().split(' ')[0]));
    if (found) {
      setActiveChannel(found);
    } else {
      setSelectedCategory(hero.filterKey);
    }
  };

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
          viewMode={viewMode}
        />
      );
    },
    [activeChannel, favorites, handleSelectChannel, handleToggleFavorite, viewMode]
  );

  const keyExtractor = useCallback((item: Channel) => String(item.id), []);

  const currentHero = FEATURED_HIGHLIGHTS[heroIndex];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── HEADER PREMIUM BOKK TV ── */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBold}>BOKK</Text>
            <Text style={styles.logoSub}>TV</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>DIRECT</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Bascule Grille / Liste */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setViewMode((m) => (m === 'grid' ? 'list' : 'grid'))}
            accessibilityLabel="Changer de vue"
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list' : 'grid'}
              size={18}
              color="#cbd5e1"
            />
          </TouchableOpacity>

          {/* Bouton Recherche */}
          <TouchableOpacity
            style={[styles.headerIconBtn, isSearchOpen && styles.headerIconBtnActive]}
            onPress={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
            accessibilityLabel="Recherche"
          >
            <Ionicons
              name={isSearchOpen ? 'close' : 'search'}
              size={18}
              color={isSearchOpen ? '#e50914' : '#cbd5e1'}
            />
          </TouchableOpacity>

          {/* Bouton Mon Pass / Compte */}
          <TouchableOpacity
            style={[styles.accountBtn, isRegisteredUser ? styles.accountBtnVip : styles.accountBtnFree]}
            onPress={() => setIsAccountModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRegisteredUser ? 'ribbon' : 'person-circle-outline'}
              size={16}
              color={isRegisteredUser ? '#22c55e' : '#f59e0b'}
            />
            <Text style={[styles.accountBtnText, isRegisteredUser && styles.accountBtnTextVip]}>
              {subscriber ? subscriber.prenom || subscriber.id : 'Pass VIP'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── BARRE DE RECHERCHE FLOTTANTE DÉPLIABLE ── */}
      {isSearchOpen && (
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={18} color="#64748b" style={styles.searchIcon} />
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
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── LECTEUR VIDÉO NATIF DOCKÉ ── */}
      {activeChannel ? (
        <View style={styles.playerWrapper}>
          <NativePlayer
            channel={activeChannel}
            onClose={handleClosePlayer}
            onPreviewLockTriggered={handlePreviewLock}
            isRegistered={isRegisteredUser}
            onNextChannel={handleNextChannel}
            onPrevChannel={handlePrevChannel}
          />

          {/* ── BANDEAU DE ZAPPING RAPIDE ── */}
          {relatedZappingChannels.length > 0 && (
            <View style={styles.zappingStrip}>
              <Text style={styles.zappingLabel}>ZAPPING RAPIDE :</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zappingScroll}>
                {relatedZappingChannels.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.zappingPill}
                    onPress={() => handleSelectChannel(c)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="play" size={10} color="#e50914" />
                    <Text style={styles.zappingPillText} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : activeNavTab === 'home' && !searchQuery ? (
        /* ── HERO SPOTLIGHT BILLBOARD (Style Netflix / myCANAL) ── */
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={['#1c0c12', '#121626', '#090c14']}
            style={styles.heroCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadgePill}>
                <View style={styles.heroLiveDot} />
                <Text style={styles.heroBadgeText}>{currentHero.badge}</Text>
              </View>

              <View style={styles.heroIndicators}>
                {FEATURED_HIGHLIGHTS.map((_, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setHeroIndex(idx)}
                    style={[styles.heroDot, idx === heroIndex && styles.heroDotActive]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{currentHero.name}</Text>
              <Text style={styles.heroDesc} numberOfLines={2}>
                {currentHero.desc}
              </Text>

              <View style={styles.heroActionsRow}>
                <TouchableOpacity
                  style={styles.heroWatchBtn}
                  onPress={handleLaunchHero}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={16} color="#000" />
                  <Text style={styles.heroWatchBtnText}>Regarder en direct</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroExploreBtn}
                  onPress={() => setSelectedCategory(currentHero.filterKey)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="compass-outline" size={16} color="#fff" />
                  <Text style={styles.heroExploreBtnText}>Explorer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      {/* ── BARRE DE CATÉGORIES ── */}
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
                onPress={() => {
                  setSelectedCategory(cat.key);
                  if (activeNavTab !== 'tv' && activeNavTab !== 'home') {
                    setActiveNavTab('tv');
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={13}
                  color={isSelected ? '#ffffff' : '#94a3b8'}
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

      {/* ── SOUS-TITRE / COMPTEUR DE CHAÎNES ── */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {filteredChannels.length} {filteredChannels.length > 1 ? 'chaînes disponibles' : 'chaîne disponible'}
          {selectedCategory !== 'tous' ? ` • ${selectedCategory.toUpperCase()}` : ''}
        </Text>
        <Text style={styles.metaModeHint}>
          Mode : {viewMode === 'grid' ? 'Grille' : 'Liste'}
        </Text>
      </View>

      {/* ── GRILLE / LISTE DES CHAÎNES (FLATLIST FLUIDE 60 FPS) ── */}
      {!isInitLoaded ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Chargement des flux BOKK TV...</Text>
        </View>
      ) : filteredChannels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="tv-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Aucune chaîne trouvée</Text>
          <Text style={styles.emptyDesc}>
            {searchQuery
              ? `Aucun résultat pour « ${searchQuery} »`
              : selectedCategory === 'favoris'
              ? 'Aucune chaîne dans vos favoris. Touchez l’étoile ⭐ sur une chaîne pour l’ajouter ici.'
              : 'Aucune chaîne disponible dans cette sélection.'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          key={`${viewMode}-${numColumns}`} // Re-render propre si l'on change entre Grille et Liste
          data={filteredChannels}
          renderItem={renderChannelItem}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          contentContainerStyle={[styles.gridContent, { paddingBottom: 100 }]}
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── BARRE DE NAVIGATION FLOTTANTE DU BAS (Style Reezn / iOS) ── */}
      <View style={styles.bottomNavContainer}>
        <View style={styles.bottomNavPill}>
          <TouchableOpacity
            style={[styles.bottomNavItem, activeNavTab === 'home' && styles.bottomNavItemActive]}
            onPress={() => handleNavTabPress('home')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeNavTab === 'home' ? 'home' : 'home-outline'}
              size={19}
              color={activeNavTab === 'home' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.bottomNavLabel, activeNavTab === 'home' && styles.bottomNavLabelActive]}>
              Accueil
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bottomNavItem, activeNavTab === 'tv' && styles.bottomNavItemActive]}
            onPress={() => handleNavTabPress('tv')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeNavTab === 'tv' ? 'tv' : 'tv-outline'}
              size={19}
              color={activeNavTab === 'tv' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.bottomNavLabel, activeNavTab === 'tv' && styles.bottomNavLabelActive]}>
              Direct TV
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bottomNavItem, activeNavTab === 'sport' && styles.bottomNavItemActive]}
            onPress={() => handleNavTabPress('sport')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeNavTab === 'sport' ? 'football' : 'football-outline'}
              size={19}
              color={activeNavTab === 'sport' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.bottomNavLabel, activeNavTab === 'sport' && styles.bottomNavLabelActive]}>
              Sports
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.bottomNavItem, activeNavTab === 'favoris' && styles.bottomNavItemActive]}
            onPress={() => handleNavTabPress('favoris')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeNavTab === 'favoris' ? 'star' : 'star-outline'}
              size={19}
              color={activeNavTab === 'favoris' ? '#ffffff' : '#64748b'}
            />
            <Text style={[styles.bottomNavLabel, activeNavTab === 'favoris' && styles.bottomNavLabelActive]}>
              Favoris
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setIsAccountModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="person-circle-outline"
              size={20}
              color={isRegisteredUser ? '#22c55e' : '#f59e0b'}
            />
            <Text style={styles.bottomNavLabel}>
              Mon ID
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
    backgroundColor: '#07090e',
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: '#0c0f17',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBold: {
    fontSize: 21,
    fontWeight: '900',
    color: '#e50914',
    letterSpacing: -0.4,
  },
  logoSub: {
    fontSize: 21,
    fontWeight: '900',
    color: '#ffffff',
    marginLeft: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e50914',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#e50914',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderColor: '#e50914',
  },
  accountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 5,
  },
  accountBtnFree: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  accountBtnVip: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  accountBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#f8fafc',
  },
  accountBtnTextVip: {
    color: '#22c55e',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111522',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    paddingVertical: 0,
  },
  playerWrapper: {
    width: '100%',
    backgroundColor: '#000',
  },
  zappingStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0a0d14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  zappingLabel: {
    color: '#64748b',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  zappingScroll: {
    gap: 6,
  },
  zappingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 5,
  },
  zappingPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 120,
  },

  // ── Hero Spotlight ──
  heroContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  heroLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroDotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  heroContent: {
    marginTop: 4,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
    marginBottom: 12,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroWatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  heroWatchBtnText: {
    color: '#000000',
    fontSize: 12.5,
    fontWeight: '800',
  },
  heroExploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  heroExploreBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Catégories ──
  categoryBarWrap: {
    height: 44,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  categoryScroll: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10141f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryPillActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  catIcon: {
    marginRight: 5,
  },
  catText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  catTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  metaModeHint: {
    fontSize: 11,
    color: '#475569',
  },
  gridContent: {
    paddingHorizontal: 7,
    paddingTop: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  emptyDesc: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Navigation Bar Flottante ──
  bottomNavContainer: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  bottomNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(12, 16, 26, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 30,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 12,
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 18,
    minWidth: 54,
    gap: 2,
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.25)',
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  bottomNavLabelActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
