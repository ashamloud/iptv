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
  Pressable,
  Linking,
  AppState,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import channelsAll, { Channel, CATEGORIES } from '../data/channels';
import { ChannelCard } from '../components/ChannelCard';
import { NativePlayer } from '../components/NativePlayer';
import { AccountModal } from '../components/AccountModal';
import { TvSidebar } from '../components/TvSidebar';
import { MatchHeaderTicker } from '../components/MatchHeaderTicker';
import { MatchesService, MatchItem } from '../services/matches';
import { StorageService } from '../services/storage';
import { FirebaseService, Subscriber, AdminMessage } from '../services/firebase';

interface CategoryPillProps {
  cat: { key: string; label: string; icon: string };
  isSelected: boolean;
  onSelect: () => void;
}

function CategoryPillItem({ cat, isSelected, onSelect }: CategoryPillProps) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      focusable={true}
      accessible={true}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={({ pressed }) => [
        styles.categoryPill,
        isSelected && styles.categoryPillActive,
        isFocused && styles.categoryPillFocused,
        pressed && styles.categoryPillPressed
      ]}
      onPress={onSelect}
    >
      <Ionicons
        name={cat.icon as any}
        size={13}
        color={isFocused ? '#ffffff' : isSelected ? '#ffffff' : '#94a3b8'}
        style={styles.catIcon}
      />
      <Text style={[styles.catText, isSelected && styles.catTextActive, isFocused && styles.catTextFocused]}>
        {cat.label}
      </Text>
    </Pressable>
  );
}

interface RecentWatchedItemProps {
  channel: Channel;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}

function RecentWatchedItem({ channel, hasTVPreferredFocus, onPress }: RecentWatchedItemProps) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      focusable={true}
      accessible={true}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={({ pressed }) => [
        styles.recentCard,
        isFocused && styles.recentCardFocused,
        pressed && styles.recentCardPressed
      ]}
      onPress={onPress}
    >
      <View style={[styles.recentLogoWrap, isFocused && styles.recentLogoWrapFocused]}>
        {channel.logo && channel.logo.startsWith('http') ? (
          <Image
            source={{ uri: channel.logo }}
            style={styles.recentLogo}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <Ionicons name="tv-outline" size={18} color={isFocused ? '#38bdf8' : '#e50914'} />
        )}
      </View>
      <Text style={[styles.recentName, isFocused && styles.recentNameFocused]} numberOfLines={1}>
        {channel.name}
      </Text>
    </Pressable>
  );
}

export default function NativeBokkApp() {
  const { width, height } = useWindowDimensions();
  const isTvMode = Platform.isTV || (width >= 850 && width > height);

  // État lecteur & chaîne active
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState<boolean>(false);

  // Vue active de navigation (accueil, tv, sports, favoris)
  const [activeNavTab, setActiveNavTab] = useState<'home' | 'tv' | 'sport' | 'favoris'>('home');

  // Affichage : Grille moderne ou Liste compacte
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filtres & recherche
  const [selectedCategory, setSelectedCategory] = useState<string>('tous');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Données utilisateur, favoris, synchronisation admin & matchs
  const [favorites, setFavorites] = useState<string[]>([]);
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [disabledNames, setDisabledNames] = useState<string[]>([]);
  const [m3uChannels, setM3uChannels] = useState<Channel[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isInitLoaded, setIsInitLoaded] = useState<boolean>(false);

  // Historique des dernières chaînes regardées
  const [lastWatched, setLastWatched] = useState<string[]>([]);

  // État messagerie admin
  const [adminMessage, setAdminMessage] = useState<AdminMessage | null>(null);
  const seenMsgIds = useRef<Set<string>>(new Set());

  const flatListRef = useRef<FlatList>(null);

  // ── Index de focus TV D-Pad pour la grille des chaînes ──
  const tvFocusIndexRef = useRef<number>(0);
  // State pour forcer le re-render de la carte sélectionnée (surbrillance visible)
  const [tvFocusedIndex, setTvFocusedIndex] = useState<number>(-1);

  // Fusion des chaînes de base et des playlists M3U Cloud ajoutées par l'admin
  const allChannels = useMemo(() => {
    if (!m3uChannels.length) return channelsAll;
    return [...channelsAll, ...m3uChannels];
  }, [channelsAll, m3uChannels]);

  // Détermination du nombre de colonnes (Smartphone: 2 en Grille, Tablettes: 3 à 5, Smart TV / TV Box: 5)
  const numColumns = useMemo(() => {
    if (viewMode === 'list') return 1;
    if (isTvMode || width >= 1200) return 5;
    if (width >= 1024) return 4;
    if (width >= 768) return 3;
    if (width >= 480) return 3;
    return 2;
  }, [width, viewMode, isTvMode]);

  // ── Synchronisation Temps Réel avec le Panneau Admin ──
  const syncAdminData = useCallback(async () => {
    try {
      const [disabledData, cloudM3u] = await Promise.all([
        FirebaseService.getDisabledChannels(),
        FirebaseService.getM3uChannels()
      ]);
      setDisabledIds(disabledData.ids);
      setDisabledNames(disabledData.names);
      setM3uChannels(cloudM3u);
      // Mettre à jour le cache des chaînes désactivées
      await StorageService.setCachedDisabledIds(disabledData.ids, disabledData.names);
    } catch {}
  }, []);

  // ── Vérification des Messages Admin (popup) ──
  const syncAdminMessages = useCallback(async (phone: string = '') => {
    try {
      const msgs = await FirebaseService.getAdminMessages(phone);
      if (!msgs.length) return;
      // Afficher le premier message non encore vu
      const unseen = msgs.find(m => !seenMsgIds.current.has(m.id));
      if (unseen) {
        seenMsgIds.current.add(unseen.id);
        setAdminMessage(unseen);
      }
    } catch {}
  }, []);

  // ── Chargement des Chocs & Matchs Sportifs ──
  const syncMatches = useCallback(async () => {
    try {
      const liveMatches = await MatchesService.getLiveAndUpcomingMatches();
      if (liveMatches && liveMatches.length > 0) {
        setMatches(liveMatches);
      }
    } catch {}
  }, []);

  // Action Pull-to-refresh de l'utilisateur
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([syncAdminData(), syncMatches()]);
    setIsRefreshing(false);
  }, [syncAdminData, syncMatches]);

  // Initialisation : Favoris, Session Abonné, Chaînes désactivées, Chaînes M3U Cloud, Matchs
  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      try {
        // Essayer d'abord le cache des chaînes désactivées (< 5 min)
        const cachedDisabled = await StorageService.getCachedDisabledIds();

        const [favs, sub, lastWatchedIds, cloudM3u, liveMatches] = await Promise.all([
          StorageService.getFavorites(),
          StorageService.getSubscriber(),
          StorageService.getLastWatched(),
          FirebaseService.getM3uChannels(),
          MatchesService.getLiveAndUpcomingMatches()
        ]);

        let disabledData: { ids: string[]; names: string[] };
        if (cachedDisabled) {
          disabledData = { ids: cachedDisabled.ids, names: cachedDisabled.names };
        } else {
          disabledData = await FirebaseService.getDisabledChannels();
          await StorageService.setCachedDisabledIds(disabledData.ids, disabledData.names);
        }

        if (isMounted) {
          setFavorites(favs);
          setSubscriber(sub);
          setLastWatched(lastWatchedIds);
          setDisabledIds(disabledData.ids);
          setDisabledNames(disabledData.names);
          setM3uChannels(cloudM3u);
          if (liveMatches && liveMatches.length > 0) setMatches(liveMatches);
          setIsInitLoaded(true);
        }

        // Alerte d'expiration proactive (une fois par jour)
        if (sub && sub.expiresAt && isMounted) {
          const waveUrl = 'https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=3000';
          const expMs = new Date(sub.expiresAt).getTime();
          const msRemaining = expMs - Date.now();
          const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
          const todayStr = new Date().toISOString().split('T')[0];
          const alertedDate = await AsyncStorage.getItem('bokk_expiry_alerted_date');

          if (alertedDate !== todayStr) {
            if (daysRemaining <= 0) {
              await AsyncStorage.setItem('bokk_expiry_alerted_date', todayStr);
              Alert.alert(
                '⏰ Abonnement expiré',
                'Votre abonnement a expiré. Renouvelez pour continuer à profiter de BOKK TV.',
                [
                  { text: 'Renouveler via Wave', onPress: () => Linking.openURL(waveUrl).catch(() => {}) },
                  { text: 'Fermer', style: 'cancel' }
                ]
              );
            } else if (daysRemaining <= 3) {
              await AsyncStorage.setItem('bokk_expiry_alerted_date', todayStr);
              Alert.alert(
                '⚠️ Abonnement bientôt expiré',
                `Votre abonnement expire dans ${daysRemaining} jour(s). Renouvelez maintenant pour ne pas perdre l'accès.`,
                [
                  { text: 'Renouveler via Wave', onPress: () => Linking.openURL(waveUrl).catch(() => {}) },
                  { text: 'Plus tard', style: 'cancel' }
                ]
              );
            }
          }
        }

        // Vérification de validité de l'abonné auprès de Firebase
        if (sub && sub.id) {
          const remoteStatus = await FirebaseService.checkSubscriberStatus(sub.id);
          if (remoteStatus && isMounted) {
            if (remoteStatus.status === 'suspended') {
              setSubscriber((prev) => (prev ? { ...prev, status: 'suspended' } : null));
              Alert.alert('Compte suspendu', 'Votre abonnement a été suspendu par l\'administrateur.');
            }
          }
          // Vérifier les messages admin pour cet abonné
          if (isMounted) syncAdminMessages(sub.id);
        } else {
          // Vérifier les messages broadcast (sans compte)
          if (isMounted) syncAdminMessages('');
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

  // ── Polling discret en arrière-plan (suspendu pendant la lecture vidéo pour 100% de fluidité) ──
  useEffect(() => {
    if (activeChannel) return;

    const adminInterval = setInterval(() => {
      syncAdminData();
    }, 180000); // 3 minutes hors lecture

    const matchesInterval = setInterval(() => {
      syncMatches();
    }, 120000); // 2 minutes

    const msgInterval = setInterval(() => {
      syncAdminMessages(subscriber?.id || '');
    }, 90000);

    return () => {
      clearInterval(adminInterval);
      clearInterval(matchesInterval);
      clearInterval(msgInterval);
    };
  }, [syncAdminData, syncMatches, syncAdminMessages, subscriber?.id, activeChannel]);

  // ── Re-sync dès que l'application repasse au premier plan (Foreground) ──
  useEffect(() => {
    const subApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncAdminData();
        syncMatches();
        syncAdminMessages(subscriber?.id || '');
      }
    });
    return () => subApp.remove();
  }, [syncAdminData, syncMatches, syncAdminMessages, subscriber]);

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
    if (isTvMode) {
      setIsPlayerFullscreen(true);
    }
    // Enregistrer dans l'historique des dernières chaînes regardées
    StorageService.addLastWatched(String(channel.id)).then(() => {
      StorageService.getLastWatched().then(ids => setLastWatched(ids));
    });
  }, [isTvMode]);

  // Fermeture du lecteur
  const handleClosePlayer = useCallback(() => {
    setActiveChannel(null);
    setIsPlayerFullscreen(false);
    setTimeout(() => {
      syncAdminData();
    }, 500);
  }, [syncAdminData]);

  // Déclenchement de la restriction / expiration de visionnage
  const handlePreviewLock = useCallback(() => {
    setIsAccountModalOpen(true);
    if (!subscriber) {
      // Utilisateur non connecté : invitation à s'inscrire GRATUITEMENT (zéro bouton Wave)
      Alert.alert(
        'Créez votre compte gratuit',
        'Inscrivez-vous gratuitement avec votre numéro de téléphone pour profiter de 30 jours offerts et débloquer toutes vos chaînes en direct.',
        [
          { text: 'Créer mon compte (Gratuit)', onPress: () => setIsAccountModalOpen(true) },
          { text: 'Fermer', style: 'cancel' }
        ]
      );
    } else {
      // Utilisateur DÉJÀ connecté mais expiré : proposition de renouvellement Wave
      Alert.alert(
        'Abonnement expiré',
        `Votre période d'abonnement pour le compte ${subscriber.phone || subscriber.id} est terminée. Renouvelez votre accès (3 000 F / mois) via Wave pour continuer à regarder vos chaînes.`,
        [
          {
            text: 'Renouveler avec Wave (3 000 F)',
            onPress: () => {
              Linking.openURL('https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=3000').catch(() => {});
            }
          },
          {
            text: 'Support WhatsApp',
            onPress: () => {
              Linking.openURL('https://wa.me/221783055520?text=' + encodeURIComponent(`Bonjour BOKK TV, je souhaite renouveler mon compte ${subscriber.phone || subscriber.id} après paiement.`)).catch(() => {});
            }
          },
          { text: 'Fermer', style: 'cancel' }
        ]
      );
    }
  }, [subscriber]);

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
    const disabledNameSet = new Set(disabledNames);

    return allChannels.filter((ch) => {
      // Exclure chaînes désactivées par l'admin (par ID ou par nom)
      if (disabledSet.has(String(ch.id))) return false;
      if (disabledNameSet.has(ch.name.toLowerCase().trim())) return false;

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
  }, [allChannels, disabledIds, disabledNames, selectedCategory, favorites, searchQuery]);

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

  // ── Navigation D-Pad & Touches Télécommande TV (CH+/CH-, médias) ──
  // Gère la navigation dans la grille QUAND le lecteur est fermé.
  // Quand le lecteur est ouvert, NativePlayer gère ses propres keycodes.
  useEffect(() => {
    if (!isTvMode) return;

    const KEYCODE_CHANNEL_UP   = 166;
    const KEYCODE_CHANNEL_DOWN = 167;
    const KEYCODE_MEDIA_NEXT   = 87;
    const KEYCODE_MEDIA_PREV   = 88;
    const KEYCODE_DPAD_CENTER  = 23;
    const KEYCODE_ENTER        = 66;

    const handleKeyDown = (evt: any) => {
      const keyCode = evt?.keyCode ?? evt?.nativeEvent?.keyCode;
      if (!keyCode) return;

      // Si le lecteur est ouvert : NativePlayer gère déjà le zapping
      if (activeChannel) return;

      const total = filteredChannels.length;
      if (total === 0) return;

      let idx = tvFocusIndexRef.current;

      switch (keyCode) {
        case KEYCODE_CHANNEL_UP:
        case KEYCODE_MEDIA_PREV:
          idx = (idx - 1 + total) % total;
          tvFocusIndexRef.current = idx;
          setTvFocusedIndex(idx);
          flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
          break;

        case KEYCODE_CHANNEL_DOWN:
        case KEYCODE_MEDIA_NEXT:
          idx = (idx + 1) % total;
          tvFocusIndexRef.current = idx;
          setTvFocusedIndex(idx);
          flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
          break;

        case KEYCODE_DPAD_CENTER:
        case KEYCODE_ENTER:
          if (filteredChannels[idx]) {
            setTvFocusedIndex(-1);
            handleSelectChannel(filteredChannels[idx]);
          }
          break;

        default:
          break;
      }
    };

    const sub = DeviceEventEmitter.addListener('onKeyDown', handleKeyDown);
    return () => sub.remove();
  }, [isTvMode, activeChannel, filteredChannels, handleSelectChannel]);

  // Utilisateur enregistré et actif ?
  const isRegisteredUser = Boolean(subscriber && subscriber.status === 'active');

  // Clic sur un choc sportif du Header Ticker -> Lancement direct de la chaîne sportive
  const handleSelectMatch = useCallback(
    (match: MatchItem) => {
      const matchQuery = (match.channels || '').toLowerCase();
      let found = allChannels.find((c) => {
        const name = c.name.toLowerCase();
        if (matchQuery.includes('canal+') && (name.includes('canal+ sport') || name.includes('canal+ foot') || name.includes('canal+ 360'))) {
          return true;
        }
        if (matchQuery.includes('bein') && (name.includes('bein') || name.includes('bei̇n'))) {
          return true;
        }
        return false;
      });

      if (!found) {
        found = allChannels.find((c) => (c.category || '').toLowerCase() === 'sport');
      }

      if (found) {
        setActiveChannel(found);
      } else {
        setSelectedCategory('sport');
        setActiveNavTab('sport');
      }
    },
    [allChannels]
  );

  // Chaînes récemment regardées (max 8)
  const recentWatchedChannels = useMemo(() => {
    if (!lastWatched.length) return [];
    const map = new Map(allChannels.map((c) => [String(c.id), c]));
    return lastWatched
      .map((id) => map.get(String(id)))
      .filter((c): c is Channel => Boolean(c))
      .slice(0, 8);
  }, [allChannels, lastWatched]);

  const showRecentWatched =
    lastWatched.length > 0 &&
    activeNavTab === 'home' &&
    selectedCategory === 'tous' &&
    !searchQuery &&
    recentWatchedChannels.length > 0;

  // Rendu de chaque carte de chaîne
  const renderChannelItem = useCallback(
    ({ item, index }: { item: Channel; index: number }) => {
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
          hasTVPreferredFocus={Platform.isTV && index === 0 && !showRecentWatched}
          isTvSelected={isTvMode && index === tvFocusedIndex}
        />
      );
    },
    [activeChannel, favorites, handleSelectChannel, handleToggleFavorite, viewMode, showRecentWatched, tvFocusedIndex, isTvMode]
  );

  const keyExtractor = useCallback((item: Channel) => String(item.id), []);

  return (
    <SafeAreaView style={styles.safeArea} edges={isPlayerFullscreen ? [] : ['top', 'left', 'right']}>
      <StatusBar style="light" hidden={isPlayerFullscreen} />

      <View style={isTvMode ? styles.tvRootRow : styles.mobileRootCol}>
        {/* ── SIDEBAR VERTICALE SMART TV (Uniquement sur Smart TV & Écran large, hors plein écran) ── */}
        {isTvMode && !isPlayerFullscreen && (
          <TvSidebar
            activeTab={activeNavTab}
            onSelectTab={handleNavTabPress}
            onOpenAccount={() => setIsAccountModalOpen(true)}
            isRegistered={isRegisteredUser}
            subscriber={subscriber}
            isSearchOpen={isSearchOpen}
            onToggleSearch={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
          />
        )}

        {/* ── CONTENU PRINCIPAL DE L'APPLICATION ── */}
        <View style={isTvMode ? styles.tvContentArea : styles.mobileContentArea}>
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
                accessible={true}
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
                accessible={true}
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
                accessible={true}
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

          {/* ── TICKER MATCHS & CHOCS DU JOUR (STYLE SPORT NATIF) ── */}
          {!activeChannel && matches.length > 0 && !searchQuery && (
            <MatchHeaderTicker matches={matches} onSelectMatch={handleSelectMatch} />
          )}

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

          {/* ── LECTEUR VIDÉO NATIF (DOCKÉ / PLEIN ÉCRAN) ── */}
          {activeChannel ? (
            <View style={[styles.playerWrapper, isPlayerFullscreen && styles.playerWrapperFullscreen]}>
              <NativePlayer
                channel={activeChannel}
                onClose={handleClosePlayer}
                onPreviewLockTriggered={handlePreviewLock}
                isRegistered={isRegisteredUser}
                subscriber={subscriber}
                onNextChannel={handleNextChannel}
                onPrevChannel={handlePrevChannel}
                isFavorite={favorites.includes(String(activeChannel.id))}
                onToggleFavorite={() => handleToggleFavorite(activeChannel.id)}
                isFullscreen={isPlayerFullscreen}
                onToggleFullscreen={(fs) => setIsPlayerFullscreen(fs)}
              />

              {/* ── BANDEAU DE ZAPPING RAPIDE (Masqué en plein écran) ── */}
              {!isPlayerFullscreen && relatedZappingChannels.length > 0 && (
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
                  <CategoryPillItem
                    key={cat.key}
                    cat={cat}
                    isSelected={isSelected}
                    onSelect={() => {
                      setSelectedCategory(cat.key);
                      if (activeNavTab !== 'tv' && activeNavTab !== 'home') {
                        setActiveNavTab('tv');
                      }
                    }}
                  />
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

          {/* ── HISTORIQUE "DERNIÈRES CHAÎNES REGARDÉES" ── */}
          {isInitLoaded && showRecentWatched && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>▶ Vues récemment</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentScroll}
              >
                {recentWatchedChannels.map((ch, idx) => (
                  <RecentWatchedItem
                    key={`recent-${ch.id}`}
                    channel={ch}
                    hasTVPreferredFocus={Platform.isTV && idx === 0}
                    onPress={() => handleSelectChannel(ch)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

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
              key={`${viewMode}-${numColumns}`}
              data={filteredChannels}
              renderItem={renderChannelItem}
              keyExtractor={keyExtractor}
              numColumns={numColumns}
              contentContainerStyle={[styles.gridContent, { paddingBottom: isTvMode ? 30 : 100 }]}
              initialNumToRender={isTvMode ? 25 : 18}
              maxToRenderPerBatch={isTvMode ? 30 : 24}
              windowSize={isTvMode ? 10 : 7}
              // Sur Android TV : NE PAS clip les sous-vues (sinon le focus D-Pad saute)
              removeClippedSubviews={!isTvMode && Platform.OS === 'android'}
              showsVerticalScrollIndicator={false}
              // Fallback sécurisé si scrollToIndex échoue (item pas encore rendu)
              onScrollToIndexFailed={({ index }) => {
                flatListRef.current?.scrollToOffset({
                  offset: index * 160,
                  animated: true,
                });
              }}
              refreshControl={
                isTvMode ? undefined : (
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor="#e50914"
                    colors={['#e50914', '#0070f3']}
                  />
                )
              }
            />
          )}
        </View>
      </View>

      {/* ── BARRE DE NAVIGATION FLOTTANTE DU BAS (UNIQUEMENT SUR MOBILE ET HORS PLEIN ÉCRAN) ── */}
      {!isTvMode && !isPlayerFullscreen && (
        <View style={styles.bottomNavContainer}>
          <View style={styles.bottomNavPill}>
            <TouchableOpacity
              accessible={true}
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
              accessible={true}
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
              accessible={true}
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
              accessible={true}
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
              accessible={true}
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
      )}

      {/* ── MODALE COMPTE & PASS VIP ── */}
      <AccountModal
        visible={isAccountModalOpen}
        subscriber={subscriber}
        onClose={() => setIsAccountModalOpen(false)}
        onSubscriberUpdated={(sub) => setSubscriber(sub)}
      />

      {/* ── POPUP MESSAGE ADMIN ── */}
      {adminMessage && (
        <View style={styles.msgOverlay}>
          <View style={styles.msgBox}>
            <View style={styles.msgHeader}>
              <Text style={styles.msgIcon}>📢</Text>
              <Text style={styles.msgTitle}>{adminMessage.title}</Text>
            </View>
            <Text style={styles.msgBody}>{adminMessage.body}</Text>
            <TouchableOpacity
              style={styles.msgOkBtn}
              onPress={() => setAdminMessage(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.msgOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  tvRootRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#07090e',
  },
  mobileRootCol: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#07090e',
  },
  tvContentArea: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  mobileContentArea: {
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
  playerWrapperFullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    backgroundColor: '#000000',
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
  categoryPillFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2,
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    transform: [{ scale: 1.08 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 10,
  },
  categoryPillPressed: {
    transform: [{ scale: 0.96 }],
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
  catTextFocused: {
    color: '#38bdf8',
    fontWeight: '900',
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
  // ── Historique Vues Récemment ──
  recentSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
  },
  recentTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  recentScroll: {
    gap: 10,
    paddingRight: 14,
  },
  recentCard: {
    width: 78,
    backgroundColor: '#111522',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recentCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: '#0f172a',
    transform: [{ scale: 1.08 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
  },
  recentCardPressed: {
    transform: [{ scale: 0.96 }],
  },
  recentLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#171d2c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    overflow: 'hidden',
  },
  recentLogoWrapFocused: {
    borderColor: '#38bdf8',
    backgroundColor: '#13283c',
  },
  recentLogo: {
    width: '80%',
    height: '80%',
  },
  recentName: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  recentNameFocused: {
    color: '#38bdf8',
    fontWeight: '800',
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
  // ── Popup Message Admin ──
  msgOverlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 99999,
    padding: 24,
  },
  msgBox: {
    backgroundColor: '#12141c',
    borderRadius: 20,
    padding: 24,
    width: '100%' as const,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  msgHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
    gap: 10,
  },
  msgIcon: {
    fontSize: 26,
  },
  msgTitle: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: '#ffffff',
    flex: 1,
  },
  msgBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#c8cdd8',
    marginBottom: 22,
  },
  msgOkBtn: {
    backgroundColor: '#e50914',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center' as const,
  },
  msgOkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
});
