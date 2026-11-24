// ═══════════════════════════════════════════════════════════════
// BOKK TV — Lecteur Vidéo Natif
// Contrôles Intégrés au Dock Inférieur, Plein Écran, Compatible TV
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  TouchableWithoutFeedback,
  BackHandler,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';
import { resolveStreamUrl, resolveStreamUrlAsync } from '../services/stream';
import { FirebaseService, Subscriber } from '../services/firebase';
import { StorageService } from '../services/storage';

export interface NativePlayerProps {
  channel: Channel;
  onClose: () => void;
  onPreviewLockTriggered?: () => void;
  isRegistered?: boolean;
  subscriber?: Subscriber | null;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: (fullscreen: boolean) => void;
}

function buildVideoSource(channel: Channel, useProxy: boolean = false) {
  const uri = resolveStreamUrl(channel.url, channel, useProxy);
  const headers: Record<string, string> = {
    'User-Agent': (channel && channel.userAgent) || 'IPTVSmartersPro',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };
  if (channel && channel.referrer) {
    headers['Referer'] = channel.referrer;
  }
  return { uri, headers };
}

async function buildVideoSourceAsync(channel: Channel, useProxy: boolean = false) {
  const uri = await resolveStreamUrlAsync(channel.url, channel, useProxy);
  const headers: Record<string, string> = {
    'User-Agent': (channel && channel.userAgent) || 'IPTVSmartersPro',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };
  if (channel && channel.referrer) {
    headers['Referer'] = channel.referrer;
  }
  return { uri, headers };
}

// ── Configuration Équilibrée Direct & Zéro Calage ──
// 12s de buffer anticipé : 2x plus proche du direct réel (évite les 25-30s de décalage),
// tout en offrant le coussin parfait pour absorber les micro-variations de connexion 3G/4G/Wi-Fi sans AUCUN calage.
// 1.5s de buffer minimal : démarrage ultra-rapide et décodeurs vidéo toujours stables.
const OPTIMAL_BUFFER_CONFIG = {
  preferredForwardBufferDuration: 12,
  minBufferForPlayback: 1.5,
  waitsToMinimizeStalling: true,
  prioritizeTimeOverSizeThreshold: true,
};

interface PlayerButtonProps {
  style?: any;
  focusedStyle?: any;
  onPress: () => void;
  children: React.ReactNode;
  hasTVPreferredFocus?: boolean;
  accessibilityLabel?: string;
  hitSlop?: any;
}

function PlayerButton({
  style,
  focusedStyle,
  onPress,
  children,
  hasTVPreferredFocus,
  accessibilityLabel,
  hitSlop
}: PlayerButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      focusable={true}
      accessible={true}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        style,
        isFocused && styles.ctrlFocused,
        isFocused && focusedStyle,
        pressed && styles.ctrlPressed
      ]}
    >
      {children}
    </Pressable>
  );
}

export function NativePlayer({
  channel,
  onClose,
  onPreviewLockTriggered,
  isRegistered = false,
  subscriber,
  onNextChannel,
  onPrevChannel,
  isFavorite = false,
  onToggleFavorite,
  isFullscreen,
  onToggleFullscreen
}: NativePlayerProps) {
  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const isPlayerFullscreen = isFullscreen !== undefined ? isFullscreen : internalFullscreen;

  // ── Chaînes de secours & multi-flux (regroupement des chaînes de même nom) ──
  const candidateChannels = useMemo(() => {
    return [channel, ...(channel.backupChannels || [])];
  }, [channel]);

  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const activeCandidate = candidateChannels[candidateIndex] || channel;

  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [streamSource, setStreamSource] = useState(() => buildVideoSource(channel, false));
  const [isReported, setIsReported] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);

  // Contrôles : affichage temporisé & lecture
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);

  const previewTimerRef = useRef<any>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const bufferingTimerRef = useRef<any>(null);
  const sessionIdRef = useRef<string>('');
  const videoViewRef = useRef<any>(null);
  const isRegisteredRef = useRef<boolean>(isRegistered);
  isRegisteredRef.current = isRegistered;

  const player = useVideoPlayer(streamSource, (p) => {
    p.loop = false;
    p.staysActiveInBackground = true;
    try {
      p.bufferOptions = OPTIMAL_BUFFER_CONFIG;
    } catch {}
    p.play();
  });

  // Réinitialiser le timer d'auto-masquage des contrôles
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    setShowControls(true);
    hideControlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4500);
  }, []);

  const toggleControls = () => {
    if (showControls) {
      setShowControls(false);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    } else {
      resetControlsTimeout();
    }
  };

  const handleTogglePlayPause = () => {
    resetControlsTimeout();
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleToggleMute = () => {
    resetControlsTimeout();
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    player.muted = nextMute;
  };

  const handleToggleFullscreen = () => {
    resetControlsTimeout();
    const nextVal = !isPlayerFullscreen;
    if (onToggleFullscreen) {
      onToggleFullscreen(nextVal);
    } else {
      setInternalFullscreen(nextVal);
    }
  };

  // Gestion de la touche Retour sur Smart TV : quitter le plein écran sans fermer l'app
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (isPlayerFullscreen) {
        if (onToggleFullscreen) {
          onToggleFullscreen(false);
        } else {
          setInternalFullscreen(false);
        }
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [isPlayerFullscreen, onToggleFullscreen]);

  // ── Interception des touches TV (CH+, CH-, Médias, D-Pad) via KeyEvent ──
  // Fonctionne sur Android TV / TV Box via le module natif TVKeyEventHandler (Expo TV)
  // Keycodes Android : https://developer.android.com/reference/android/view/KeyEvent
  useEffect(() => {
    if (!Platform.isTV && Platform.OS !== 'android') return;

    const KEYCODE_CHANNEL_UP   = 166; // CH+ (télécommande)
    const KEYCODE_CHANNEL_DOWN = 167; // CH-
    const KEYCODE_MEDIA_NEXT   = 87;  // >>|
    const KEYCODE_MEDIA_PREV   = 88;  // |<<
    const KEYCODE_DPAD_RIGHT   = 22;  // → (zapping rapide en lecture)
    const KEYCODE_DPAD_LEFT    = 21;  // ←
    const KEYCODE_DPAD_UP      = 19;  // ↑ (volume ou zapping)
    const KEYCODE_DPAD_DOWN    = 20;  // ↓

    const handleKeyDown = (evt: any) => {
      const keyCode = evt?.keyCode ?? evt?.nativeEvent?.keyCode;
      if (!keyCode) return;

      switch (keyCode) {
        case KEYCODE_CHANNEL_UP:
        case KEYCODE_MEDIA_NEXT:
        case KEYCODE_DPAD_RIGHT:
          // Chaîne suivante
          if (onNextChannel) {
            onNextChannel();
            resetControlsTimeout();
          }
          break;
        case KEYCODE_CHANNEL_DOWN:
        case KEYCODE_MEDIA_PREV:
        case KEYCODE_DPAD_LEFT:
          // Chaîne précédente
          if (onPrevChannel) {
            onPrevChannel();
            resetControlsTimeout();
          }
          break;
        case KEYCODE_DPAD_UP:
          // Volume + (si muet, démuet d'abord)
          if (isMuted) {
            setIsMuted(false);
            player.muted = false;
          }
          break;
        case KEYCODE_DPAD_DOWN:
          // Mute
          setIsMuted(true);
          player.muted = true;
          break;
        default:
          break;
      }
    };

    // Écouter via DeviceEventEmitter (disponible sur Expo TV natif)
    const sub = DeviceEventEmitter.addListener('onKeyDown', handleKeyDown);
    return () => sub.remove();
  }, [onNextChannel, onPrevChannel, isMuted, player, resetControlsTimeout]);

  const handleTogglePiP = async () => {
    resetControlsTimeout();
    try {
      if (videoViewRef.current?.startPictureInPicture) {
        await videoViewRef.current.startPictureInPicture();
      }
    } catch {}
  };

  // ── Solution 3 : Verrouillage Session Unique (1 Écran Simultané) ──
  useEffect(() => {
    let intervalId: any = null;
    let isCancelled = false;

    async function initSession() {
      if (subscriber && subscriber.id) {
        const deviceId = await StorageService.getDeviceId();
        const deviceName = StorageService.getDeviceName();
        const sessionId = `sess_${deviceId}_${Date.now()}`;
        sessionIdRef.current = sessionId;

        await FirebaseService.claimActiveSession(subscriber.id, sessionId, deviceName);

        // Espacement à 35s pour laisser 100% de la bande passante au streaming vidéo
        intervalId = setInterval(async () => {
          if (isCancelled) return;
          const res = await FirebaseService.verifyActiveSession(subscriber.id, sessionIdRef.current);
          if (!res.isValid) {
            player.pause();
            if (res.isSuspended) {
              setConcurrencyError("Votre compte a été suspendu par l'administrateur.");
            } else if (res.otherDevice) {
              setConcurrencyError(
                `Lecture interrompue : ce compte diffuse actuellement sur « ${res.otherDevice} ». Votre formule BOKK TV est limitée à 1 écran à la fois.`
              );
            }
          } else {
            setConcurrencyError(null);
          }
        }, 35000);
      }
    }

    initSession();

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (subscriber && subscriber.id && sessionIdRef.current) {
        FirebaseService.releaseActiveSession(subscriber.id, sessionIdRef.current);
      }
    };
  }, [subscriber?.id, channel.id]);

  const handleReclaimSession = async () => {
    if (!subscriber || !subscriber.id) return;
    const deviceId = await StorageService.getDeviceId();
    const deviceName = StorageService.getDeviceName();
    const sessionId = `sess_${deviceId}_${Date.now()}`;
    sessionIdRef.current = sessionId;

    await FirebaseService.claimActiveSession(subscriber.id, sessionId, deviceName);
    setConcurrencyError(null);
    player.play();
    setIsPlaying(true);
  };

  const handleRetryDirect = useCallback(async () => {
    setHasError(false);
    setUseProxy(false);
    setIsBuffering(true);
    setStatusMessage('Reconnexion directe...');
    const retryChannel = {
      ...activeCandidate,
      url: activeCandidate.fallbackUrl || activeCandidate.url
    };
    const nextSource = await buildVideoSourceAsync(retryChannel, false);
    setStreamSource(nextSource);
    player.replace(nextSource);
    try {
      player.bufferOptions = OPTIMAL_BUFFER_CONFIG;
    } catch {}
    player.play();
  }, [activeCandidate, player]);

  const handleRetryWithProxy = useCallback(async () => {
    setHasError(false);
    setUseProxy(true);
    setIsBuffering(true);
    setStatusMessage('Connexion de secours...');
    const nextSource = await buildVideoSourceAsync(activeCandidate, true);
    setStreamSource(nextSource);
    player.replace(nextSource);
    try {
      player.bufferOptions = OPTIMAL_BUFFER_CONFIG;
    } catch {}
    player.play();
  }, [activeCandidate, player]);

  // Basculer manuellement ou automatiquement sur la chaîne de secours (même nom)
  const handleSwitchBackupStream = useCallback(async () => {
    resetControlsTimeout();
    if (candidateChannels.length > 1) {
      const nextIdx = (candidateIndex + 1) % candidateChannels.length;
      setCandidateIndex(nextIdx);
      const targetChan = candidateChannels[nextIdx];
      setStatusMessage(`Flux alternatif (${nextIdx + 1}/${candidateChannels.length}) : ${targetChan.name}...`);
      setIsBuffering(true);
      setHasError(false);
      try {
        const nextSrc = await buildVideoSourceAsync(targetChan, false);
        setStreamSource(nextSrc);
        player.replace(nextSrc);
        try {
          player.bufferOptions = OPTIMAL_BUFFER_CONFIG;
        } catch {}
        player.play();
        setIsPlaying(true);
      } catch {
        setHasError(true);
      }
    } else {
      handleRetryWithProxy();
    }
  }, [candidateChannels, candidateIndex, player, resetControlsTimeout, handleRetryWithProxy]);

  // Écouter les changements d'état du lecteur expo-video (avec debouncing anti-coupure)
  useEffect(() => {
    const subStatus = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        if (bufferingTimerRef.current) {
          clearTimeout(bufferingTimerRef.current);
          bufferingTimerRef.current = null;
        }
        setHasError(true);
        setIsBuffering(false);

        // Si une chaîne de secours avec le même nom existe et n'a pas encore été essayée : basculer automatiquement
        if (candidateChannels.length > 1 && candidateIndex < candidateChannels.length - 1) {
          const nextIdx = candidateIndex + 1;
          setStatusMessage(`Flux principal indisponible, basculement sur le flux de secours (${nextIdx + 1}/${candidateChannels.length})...`);
          setTimeout(() => {
            handleSwitchBackupStream();
          }, 800);
        } else if (!useProxy && channel.fallbackUrl && channel.fallbackUrl !== channel.url) {
          setStatusMessage('Basculement sur flux alternatif...');
          handleRetryDirect();
        } else if (!useProxy) {
          setStatusMessage('Test du flux de secours...');
          handleRetryWithProxy();
        } else {
          setStatusMessage('Signal source temporairement indisponible.');
        }
      } else if (status === 'readyToPlay') {
        if (bufferingTimerRef.current) {
          clearTimeout(bufferingTimerRef.current);
          bufferingTimerRef.current = null;
        }
        setHasError(false);
        setIsBuffering(false);
        setStatusMessage('');
      } else if (status === 'loading') {
        // Debounce de 1500ms : n'affiche le chargement que si le buffering est réel
        // Évite tout clignotement ou écran noir lors des transitions de segments HLS
        if (!bufferingTimerRef.current) {
          bufferingTimerRef.current = setTimeout(() => {
            setIsBuffering(true);
          }, 1500);
        }
      }
    });

    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
      if (playing) {
        if (bufferingTimerRef.current) {
          clearTimeout(bufferingTimerRef.current);
          bufferingTimerRef.current = null;
        }
        setIsBuffering(false);
      }
    });

    return () => {
      subStatus.remove();
      subPlaying.remove();
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
    };
  }, [player, useProxy, channel, candidateChannels, candidateIndex, handleSwitchBackupStream, handleRetryDirect, handleRetryWithProxy]);

  // Recharger le flux UNIQUEMENT si la chaîne change (élimine le double chargement des 3 secondes)
  useEffect(() => {
    let isCancelled = false;
    setUseProxy(false);
    setConcurrencyError(null);
    setHasError(false);
    setIsBuffering(true);
    setIsReported(false);
    setStatusMessage('');
    setCandidateIndex(0);

    async function initChannelPlayback() {
      const nextSource = await buildVideoSourceAsync(channel, false);
      if (isCancelled) return;
      setStreamSource(nextSource);
      player.replace(nextSource);
      try {
        player.bufferOptions = OPTIMAL_BUFFER_CONFIG;
      } catch {}
      player.play();
      setIsPlaying(true);
      resetControlsTimeout();
    }

    initChannelPlayback();

    // Règle d'aperçu UNIQUEMENT pour les visiteurs non connectés (30 secondes continues)
    if (!isRegisteredRef.current && onPreviewLockTriggered) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        player.pause();
        onPreviewLockTriggered();
      }, 30000);
    }

    return () => {
      isCancelled = true;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      if (bufferingTimerRef.current) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
    };
  }, [channel.id]);

  const handleReport = async () => {
    if (isReported) return;
    const ok = await FirebaseService.reportChannel(channel);
    if (ok) {
      setIsReported(true);
      Alert.alert(
        'Signalement transmis',
        `Le problème sur "${channel.name}" a été envoyé à l'administrateur.`
      );
    }
  };

  const logoUri = (activeCandidate.logo && activeCandidate.logo.startsWith('http'))
    ? activeCandidate.logo
    : (channel.logo && channel.logo.startsWith('http'))
    ? channel.logo
    : null;

  return (
    <View style={[styles.container, isPlayerFullscreen && styles.containerFullscreen]}>
      {/* ── Surface Vidéo Plein Écran (Cliquable avec télécommande OK pour afficher contrôles) ── */}
      <Pressable
        onPress={toggleControls}
        focusable={!showControls}
        hasTVPreferredFocus={Platform.isTV && !showControls}
        style={StyleSheet.absoluteFill}
      >
        <VideoView
          ref={videoViewRef}
          player={player}
          style={styles.video}
          nativeControls={false}
          allowsPictureInPicture
          contentFit="contain"
        />
      </Pressable>

      {/* ── Spinner BOKK TV de chargement ── */}
      {isBuffering && !hasError && !concurrencyError && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View style={styles.spinnerWrap}>
            <ActivityIndicator size="large" color="#e50914" />
            <Text style={styles.spinnerText}>BOKK TV</Text>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ── OVERLAY DES CONTRÔLES (DESIGN DOCK INFÉRIEUR INTÉGRÉ) ── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showControls && !hasError && !concurrencyError && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* ── 1. HEADER SUPÉRIEUR DISCRET (Retour, Statut flux & Fermer) ── */}
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.35)', 'transparent']}
            style={styles.topGradient}
            pointerEvents="box-none"
          >
            <View style={styles.topBar}>
              <PlayerButton
                style={styles.backCircleBtn}
                onPress={onClose}
                hitSlop={10}
                accessibilityLabel="Fermer ou quitter le lecteur"
              >
                <Ionicons name="chevron-back" size={22} color="#ffffff" />
              </PlayerButton>

              <View style={styles.topRightActions}>
                {/* Mode Secours / Direct */}
                <PlayerButton
                  style={styles.streamModePill}
                  onPress={() => {
                    resetControlsTimeout();
                    if (useProxy) handleRetryDirect();
                    else handleRetryWithProxy();
                  }}
                >
                  <Ionicons
                    name={useProxy ? 'shield-checkmark' : 'flash'}
                    size={12}
                    color={useProxy ? '#60a5fa' : '#22c55e'}
                  />
                  <Text style={styles.streamModeText}>
                    {useProxy ? 'Secours Actif' : 'Direct'}
                  </Text>
                </PlayerButton>

                {/* Bouton Signaler */}
                <PlayerButton
                  style={[styles.reportBtn, isReported && styles.reportBtnDone]}
                  onPress={handleReport}
                >
                  <Ionicons
                    name={isReported ? 'checkmark-circle' : 'warning-outline'}
                    size={14}
                    color={isReported ? '#22c55e' : '#cbd5e1'}
                  />
                  <Text style={[styles.reportText, isReported && styles.reportTextDone]}>
                    {isReported ? 'Signalé' : 'Signaler'}
                  </Text>
                </PlayerButton>

                {/* Bouton Fermer */}
                <PlayerButton
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={18} color="#ffffff" />
                </PlayerButton>
              </View>
            </View>
          </LinearGradient>

          {/* ── 2. DOCK INFÉRIEUR COMPLET (Style de référence avec couleurs d'origine) ── */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.96)']}
            style={styles.bottomDock}
            pointerEvents="box-none"
          >
            {/* LIGNE 1 DU DOCK : LOGO, NOM DE CHAÎNE, BADGES & ÉTOILE FAVORI */}
            <View style={styles.dockTopRow}>
              <View style={styles.dockMetaLeft}>
                {logoUri ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.dockLogo}
                    contentFit="contain"
                  />
                ) : (
                  <View style={styles.dockLogoFallback}>
                    <Ionicons name="tv" size={16} color="#e50914" />
                  </View>
                )}

                <View style={styles.dockMetaTextCol}>
                  <Text style={styles.dockChannelName} numberOfLines={1}>
                    {activeCandidate.name}
                  </Text>
                  <View style={styles.dockBadgesRow}>
                    {/* Badge Catégorie (ex: FRANCOPHONE, SPORT, SÉNÉGAL) */}
                    <View style={styles.badgeCategory}>
                      <Text style={styles.badgeCategoryText}>
                        {(activeCandidate.category || activeCandidate.group || 'GÉNÉRAL').toUpperCase()}
                      </Text>
                    </View>

                    {/* Badge Qualité (ex: FHD, 1080p, HD) */}
                    <View style={styles.badgeQuality}>
                      <Text style={styles.badgeQualityText}>
                        {activeCandidate.badge || 'FHD'}
                      </Text>
                    </View>

                    {/* Badge Direct avec point vert */}
                    <View style={styles.badgeLive}>
                      <View style={styles.liveGreenDot} />
                      <Text style={styles.badgeLiveText}>DIRECT</Text>
                    </View>

                    {/* BOUTON TESTER LE SECOURS (Si plusieurs flux pour ce même nom) */}
                    {candidateChannels.length > 1 && (
                      <PlayerButton
                        style={styles.backupStreamBtn}
                        onPress={handleSwitchBackupStream}
                        hitSlop={8}
                        accessibilityLabel="Tester le flux de secours"
                      >
                        <Ionicons name="swap-horizontal" size={12} color="#38bdf8" />
                        <Text style={styles.backupStreamBtnText}>
                          Flux {candidateIndex + 1}/{candidateChannels.length} (Secours)
                        </Text>
                      </PlayerButton>
                    )}
                  </View>
                </View>
              </View>

              {/* Bouton Favori Étoile à droite */}
              {onToggleFavorite && (
                <PlayerButton
                  style={[styles.dockFavBtn, isFavorite && styles.dockFavBtnActive]}
                  onPress={() => {
                    resetControlsTimeout();
                    onToggleFavorite();
                  }}
                  hitSlop={10}
                  accessibilityLabel="Ajouter aux favoris"
                >
                  <Ionicons
                    name={isFavorite ? 'star' : 'star-outline'}
                    size={20}
                    color={isFavorite ? '#f59e0b' : '#ffffff'}
                  />
                </PlayerButton>
              )}
            </View>

            {/* LIGNE 2 DU DOCK : CONTRÔLES (PREV, PLAY ROUGE, NEXT, MUTE, SCRUBBER, PIP & PLEIN ÉCRAN) */}
            <View style={styles.dockControlsRow}>
              {/* Groupe Gauche : Zapping Prev, Play/Pause Rouge BOKK, Zapping Next, Mute */}
              <View style={styles.dockControlsLeft}>
                {onPrevChannel && (
                  <PlayerButton
                    style={styles.circleCtrlBtn}
                    onPress={() => {
                      resetControlsTimeout();
                      onPrevChannel();
                    }}
                    hitSlop={8}
                    accessibilityLabel="Chaîne précédente"
                  >
                    <Ionicons name="play-skip-back" size={17} color="#ffffff" />
                  </PlayerButton>
                )}

                {/* Bouton Play/Pause Rouge BOKK d'Origine */}
                <PlayerButton
                  style={styles.mainPlayPauseBtn}
                  onPress={handleTogglePlayPause}
                  accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={22}
                    color="#ffffff"
                    style={!isPlaying && { marginLeft: 2 }}
                  />
                </PlayerButton>

                {onNextChannel && (
                  <PlayerButton
                    style={styles.circleCtrlBtn}
                    onPress={() => {
                      resetControlsTimeout();
                      onNextChannel();
                    }}
                    hitSlop={8}
                    accessibilityLabel="Chaîne suivante"
                  >
                    <Ionicons name="play-skip-forward" size={17} color="#ffffff" />
                  </PlayerButton>
                )}

                {/* Bouton Son Mute / Unmute */}
                <PlayerButton
                  style={styles.circleCtrlBtn}
                  onPress={handleToggleMute}
                  hitSlop={8}
                  accessibilityLabel={isMuted ? 'Activer le son' : 'Couper le son'}
                >
                  <Ionicons
                    name={isMuted ? 'volume-mute' : 'volume-high'}
                    size={18}
                    color="#ffffff"
                  />
                </PlayerButton>
              </View>

              {/* Centre : Scrubber / Ligne Rouge en Direct avec Bouton Blanc */}
              <View style={styles.dockScrubberWrap}>
                <View style={styles.scrubberTrack}>
                  <View style={styles.scrubberFill} />
                  <View style={styles.scrubberThumb} />
                </View>
              </View>

              {/* Groupe Droite : PiP & BOUTON PLEIN ÉCRAN */}
              <View style={styles.dockControlsRight}>
                {/* Bouton PiP (Picture-in-Picture) */}
                <PlayerButton
                  style={styles.circleCtrlBtn}
                  onPress={handleTogglePiP}
                  hitSlop={8}
                  accessibilityLabel="Picture in Picture"
                >
                  <Ionicons name="albums-outline" size={18} color="#ffffff" />
                </PlayerButton>

                {/* ── BOUTON PLEIN ÉCRAN (FOCUS PAR DÉFAUT SUR TÉLÉCOMMANDE TV) ── */}
                <PlayerButton
                  hasTVPreferredFocus={true}
                  style={[
                    styles.fullscreenBtn,
                    isPlayerFullscreen && styles.fullscreenBtnActive
                  ]}
                  focusedStyle={styles.fullscreenBtnFocused}
                  onPress={handleToggleFullscreen}
                  hitSlop={10}
                  accessibilityLabel={isPlayerFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                >
                  <Ionicons
                    name={isPlayerFullscreen ? 'contract-outline' : 'expand-outline'}
                    size={22}
                    color="#ffffff"
                  />
                </PlayerButton>
              </View>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* ── OVERLAY ERREUR SIGNAL ── */}
      {hasError && !concurrencyError && (
        <View style={styles.netflixModalOverlay}>
          <View style={styles.netflixModalCard}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="alert" size={28} color="#e50914" />
            </View>
            <Text style={styles.netflixModalTitle}>Signal Temporairement Indisponible</Text>
            <Text style={styles.netflixModalDesc}>
              {statusMessage || 'Le serveur émetteur de cette chaîne ne répond pas actuellement.'}
            </Text>

            <View style={styles.netflixModalBtnRow}>
              <TouchableOpacity
                style={styles.primaryModalBtn}
                onPress={handleSwitchBackupStream}
                activeOpacity={0.85}
                focusable={true}
              >
                <Ionicons name="swap-horizontal" size={15} color="#fff" />
                <Text style={styles.primaryModalBtnText}>
                  {candidateChannels.length > 1
                    ? `Tester Secours (${candidateIndex + 1}/${candidateChannels.length})`
                    : 'Tester le Secours'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryModalBtn}
                onPress={handleRetryDirect}
                activeOpacity={0.85}
                focusable={true}
              >
                <Ionicons name="refresh" size={15} color="#cbd5e1" />
                <Text style={styles.secondaryModalBtnText}>Réessayer Direct</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ghostModalBtn}
                onPress={handleReport}
                activeOpacity={0.85}
                focusable={true}
              >
                <Text style={styles.ghostModalBtnText}>Signaler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── OVERLAY CONCURRENCE : 1 SEUL ÉCRAN SIMULTANÉ (SOLUTION 3) ── */}
      {concurrencyError && (
        <View style={styles.netflixModalOverlay}>
          <View style={styles.netflixModalCard}>
            <View style={styles.concurrencyIconCircle}>
              <Ionicons name="tv" size={28} color="#f59e0b" />
            </View>
            <Text style={styles.netflixModalTitle}>Quelqu'un d'autre regarde BOKK TV</Text>
            <Text style={styles.netflixModalDesc}>{concurrencyError}</Text>

            <View style={styles.netflixModalBtnRow}>
              <TouchableOpacity
                style={styles.primaryModalBtn}
                onPress={handleReclaimSession}
                activeOpacity={0.85}
                focusable={true}
              >
                <Ionicons name="play" size={15} color="#fff" />
                <Text style={styles.primaryModalBtnText}>Regarder ici (Prendre la main)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryModalBtn}
                onPress={onClose}
                activeOpacity={0.85}
                focusable={true}
              >
                <Text style={styles.secondaryModalBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const { width: windowWidth } = Dimensions.get('window');
const playerHeight = Math.min(windowWidth * (9 / 16), 300);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: playerHeight,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  containerFullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    backgroundColor: '#000000',
    borderBottomWidth: 0,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  spinnerWrap: {
    alignItems: 'center',
    gap: 8,
  },
  spinnerText: {
    color: '#e50914',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // ── Barre Supérieure ──
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  streamModeText: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '700',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  reportBtnDone: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  reportText: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '700',
  },
  reportTextDone: {
    color: '#22c55e',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Dock Inférieur Intégré (Capture de référence) ──
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  dockTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dockMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  dockLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dockLogoFallback: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockMetaTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dockChannelName: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  dockBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  badgeCategory: {
    backgroundColor: 'rgba(229, 9, 20, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeCategoryText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeQuality: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeQualityText: {
    color: '#cbd5e1',
    fontSize: 8.5,
    fontWeight: '800',
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  liveGreenDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#22c55e',
  },
  badgeLiveText: {
    color: '#22c55e',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  backupStreamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  backupStreamBtnText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dockFavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockFavBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#f59e0b',
  },

  // ── Ligne 2 : Contrôles de Lecture & Plein Écran ──
  dockControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dockControlsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  mainPlayPauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  circleCtrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  playPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#b80710',
  },
  ctrlFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: 'rgba(56, 189, 248, 0.28)',
    transform: [{ scale: 1.15 }],
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 10,
  },
  dockScrubberWrap: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    position: 'relative',
    justifyContent: 'center',
  },
  scrubberFill: {
    width: '94%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e50914',
  },
  scrubberThumb: {
    position: 'absolute',
    left: '92%',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 3,
  },
  dockControlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullscreenBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenBtnActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.45)',
    borderColor: '#e50914',
  },
  fullscreenBtnFocused: {
    borderColor: '#38bdf8',
    backgroundColor: '#0284c7',
    transform: [{ scale: 1.2 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 14,
  },

  // ── Modales d'erreur & Concurrence ──
  netflixModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 99,
  },
  netflixModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#121624',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 16,
  },
  errorIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  concurrencyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  netflixModalTitle: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  netflixModalDesc: {
    color: '#94a3b8',
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
  },
  netflixModalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e50914',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryModalBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  secondaryModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  secondaryModalBtnText: {
    color: '#cbd5e1',
    fontSize: 11.5,
    fontWeight: '600',
  },
  ghostModalBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  ghostModalBtnText: {
    color: '#94a3b8',
    fontSize: 11,
  },
});
