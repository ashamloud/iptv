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
import { resolveStreamUrlAsync, buildStreamHeaders } from '../services/stream';
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

function isStreamHls(uri: string, channel?: Channel, forceHls: boolean = false): boolean {
  if (forceHls) return true;
  const lower = (uri || '').toLowerCase();
  if (lower.includes('.m3u8') || lower.includes('m3u')) return true;
  if (lower.includes('.ts') || lower.endsWith('.mpegts')) return false;
  if (channel?.type === 'ts') return false;
  if (channel?.type === 'hls') return true;
  return false;
}

async function buildVideoSourceAsync(
  channel: Channel,
  options: { useProxy?: boolean; bypassDns?: boolean; forceHls?: boolean } = {}
) {
  const { useProxy = false, bypassDns = false, forceHls = false } = options;
  const uri = await resolveStreamUrlAsync(channel.url, channel, useProxy, bypassDns);
  const isHls = isStreamHls(uri, channel, forceHls);
  const headers = buildStreamHeaders(channel, uri);
  return {
    uri,
    headers,
    useCaching: false,
    contentType: (isHls ? 'hls' : 'auto') as 'hls' | 'auto',
  };
}

// ── Configuration Pro IPTV Anti-Calage (Spécial Connexion 1.5 Mbps & Direct MPEG-TS/HLS) ──
// 1. preferredForwardBufferDuration: 30s :
//    Constitue un coussin profond pour absorber les micro-coupures et variations réseau.
// 2. minBufferForPlayback: 3.5s :
//    Attend 3.5s de tampon sain au démarrage ET après toute micro-coupure (bufferForPlaybackAfterRebufferMs)
//    afin d'éviter le cycle infini "démarre avec 1s -> se vide -> recale".
// 3. waitsToMinimizeStalling: true (iOS) :
//    AVPlayer stabilise la lecture avant d'afficher l'image sans figer inutilement.
// 4. prioritizeTimeOverSizeThreshold: true :
//    Garantit les 30s de buffer indépendamment du débit vidéo.
const OPTIMAL_BUFFER_CONFIG = {
  preferredForwardBufferDuration: 30,
  minBufferForPlayback: 3.5,
  maxBufferBytes: 0,
  waitsToMinimizeStalling: true,
  prioritizeTimeOverSizeThreshold: true,
};

type QualityPreset = 'eco' | 'hd' | 'max';

function getResolutionCap(preset: QualityPreset): { width: number; height: number } | null {
  if (preset === 'eco') return { width: 854, height: 480 };   // ≤ ~1.2 Mbps (Fluide garanti à 1.5 Mbps)
  if (preset === 'hd') return { width: 1280, height: 720 };   // ≤ ~2.2 Mbps
  return null;                                                // Auto illimité
}

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

interface ModalActionBtnProps {
  onPress: () => void;
  style?: any;
  focusedStyle?: any;
  hasTVPreferredFocus?: boolean;
  children: React.ReactNode;
}

function ModalActionBtn({
  onPress,
  style,
  focusedStyle,
  hasTVPreferredFocus,
  children
}: ModalActionBtnProps) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      focusable={true}
      accessible={true}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        isFocused && styles.modalBtnFocused,
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
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('eco');
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
  const stallWatchdogRef = useRef<any>(null);
  const autoRetryCountRef = useRef<number>(0);
  const liveReconnectCountRef = useRef<number>(0);
  const hasAutoSwitchedBackupRef = useRef<boolean>(false);
  const hasTriedBypassDnsRef = useRef<boolean>(false);
  const hasTriedForceHlsRef = useRef<boolean>(false);
  const hasStartedPlayingRef = useRef<boolean>(false);
  const lastErrorTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(true);
  isPlayingRef.current = isPlaying;
  const sessionIdRef = useRef<string>('');
  const videoViewRef = useRef<any>(null);
  const isRegisteredRef = useRef<boolean>(isRegistered);
  isRegisteredRef.current = isRegistered;

  const isVodItem = String(channel.id || '').startsWith('vod_') || channel.category === 'cinema';

  // Source initiale null : tout chargement passe UNIQUEMENT par applySourceToPlayer()
  // Cela élimine définitivement le double appel réseau / double connexion simultané sur Xtream (max_connections=1)
  const player = useVideoPlayer(
    null as any,
    (p) => {
      p.loop = false;
      p.staysActiveInBackground = true;
      try {
        p.bufferOptions = OPTIMAL_BUFFER_CONFIG;
        p.maxResolution = getResolutionCap('eco');
      } catch { }
    },
    {
      videoChangeFrameRateStrategy: 'off',
    }
  );

  const applySourceToPlayer = useCallback(async (
    targetChan: Channel,
    options: { useProxy?: boolean; bypassDns?: boolean; forceHls?: boolean; useFallbackUrl?: boolean } = {}
  ) => {
    const effectiveChan = options.useFallbackUrl && targetChan.fallbackUrl
      ? { ...targetChan, url: targetChan.fallbackUrl }
      : targetChan;
    const nextSource = await buildVideoSourceAsync(effectiveChan, options);
    try {
      player.bufferOptions = OPTIMAL_BUFFER_CONFIG;
      player.maxResolution = getResolutionCap(qualityPreset);
    } catch { }
    try {
      if (typeof player.replaceAsync === 'function') {
        await player.replaceAsync(nextSource);
      } else {
        player.replace(nextSource);
      }
    } catch {
      player.replace(nextSource);
    }
    player.play();
  }, [player, qualityPreset]);

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
  // Sur Android TV, lorsque les contrôles ou les modales sont visibles, le focus natif
  // D-Pad doit naviguer librement entre les boutons sans être intercepté.
  useEffect(() => {
    if (!Platform.isTV && Platform.OS !== 'android') return;

    const KEYCODE_CHANNEL_UP = 166; // CH+ (télécommande)
    const KEYCODE_CHANNEL_DOWN = 167; // CH-
    const KEYCODE_MEDIA_NEXT = 87;  // >>|
    const KEYCODE_MEDIA_PREV = 88;  // |<<
    const KEYCODE_DPAD_RIGHT = 22;  // → (zapping rapide en lecture)
    const KEYCODE_DPAD_LEFT = 21;  // ←
    const KEYCODE_DPAD_UP = 19;  // ↑ (afficher contrôles)
    const KEYCODE_DPAD_DOWN = 20;  // ↓ (afficher contrôles)

    const handleKeyDown = (evt: any) => {
      const keyCode = evt?.keyCode ?? evt?.nativeEvent?.keyCode;
      if (!keyCode) return;

      // RÈGLE ESSENTIELLE TV : Si les contrôles ou une boîte de dialogue sont visibles,
      // laisser le système de focus natif Android TV déplacer le cadre bleu entre les boutons !
      if (showControls || hasError || concurrencyError) {
        return;
      }

      // En lecture vidéo pure (contrôles masqués) :
      switch (keyCode) {
        case KEYCODE_CHANNEL_UP:
        case KEYCODE_MEDIA_NEXT:
        case KEYCODE_DPAD_RIGHT:
          // Chaîne suivante (zapping direct)
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
        case KEYCODE_DPAD_DOWN:
          // Réveiller l'interface et afficher les contrôles avec focus
          resetControlsTimeout();
          break;
        default:
          break;
      }
    };

    // Écouter via DeviceEventEmitter (disponible sur Expo TV natif)
    const sub = DeviceEventEmitter.addListener('onKeyDown', handleKeyDown);
    return () => sub.remove();
  }, [showControls, hasError, concurrencyError, onNextChannel, onPrevChannel, resetControlsTimeout]);

  const handleTogglePiP = async () => {
    resetControlsTimeout();
    try {
      if (videoViewRef.current?.startPictureInPicture) {
        await videoViewRef.current.startPictureInPicture();
      }
    } catch { }
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

  const handleCycleQuality = useCallback(() => {
    resetControlsTimeout();
    setQualityPreset((prev) => {
      const next: QualityPreset = prev === 'eco' ? 'hd' : prev === 'hd' ? 'max' : 'eco';
      try {
        player.maxResolution = getResolutionCap(next);
      } catch { }
      return next;
    });
  }, [player, resetControlsTimeout]);

  const clearBufferingTimers = useCallback(() => {
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    if (stallWatchdogRef.current) {
      clearTimeout(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }
  }, []);

  const handleRetryDirect = useCallback(async () => {
    setHasError(false);
    setUseProxy(false);
    setIsBuffering(true);
    setStatusMessage('Reconnexion directe...');
    await applySourceToPlayer(activeCandidate, {
      useProxy: false,
      bypassDns: hasTriedBypassDnsRef.current,
      forceHls: hasTriedForceHlsRef.current,
      useFallbackUrl: true,
    });
  }, [activeCandidate, applySourceToPlayer]);

  const handleRetryWithProxy = useCallback(async () => {
    setHasError(false);
    setUseProxy(true);
    setIsBuffering(true);
    setStatusMessage('Connexion de secours...');
    await applySourceToPlayer(activeCandidate, {
      useProxy: true,
      bypassDns: false,
      forceHls: hasTriedForceHlsRef.current,
    });
  }, [activeCandidate, applySourceToPlayer]);

  // Basculer manuellement ou automatiquement sur la chaîne de secours (même nom)
  const handleSwitchBackupStream = useCallback(async () => {
    resetControlsTimeout();
    if (candidateChannels.length > 1) {
      const nextIdx = (candidateIndex + 1) % candidateChannels.length;
      setCandidateIndex(nextIdx);
      const targetChan = candidateChannels[nextIdx];
      hasTriedBypassDnsRef.current = false;
      hasTriedForceHlsRef.current = false;
      setUseProxy(false);
      setStatusMessage(`Flux alternatif (${nextIdx + 1}/${candidateChannels.length}) : ${targetChan.name}...`);
      setIsBuffering(true);
      setHasError(false);
      try {
        await applySourceToPlayer(targetChan, { useProxy: false });
        setIsPlaying(true);
      } catch {
        setHasError(true);
      }
    } else {
      handleRetryWithProxy();
    }
  }, [candidateChannels, candidateIndex, applySourceToPlayer, resetControlsTimeout, handleRetryWithProxy]);

  // Procédure graduée de récupération anti-calage / coupure
  // ⚠️ RÈGLE NATIF : NE JAMAIS utiliser le proxy Vercel pour les live streams sur app mobile.
  // Le proxy ajoute 200-400ms de latence ET a un timeout 30s qui cause des coupures périodiques.
  // L'app native (Android/iOS) n'a PAS de restriction CORS → connexion directe toujours possible.
  const recoverFromFailureOrStall = useCallback(async (reason: 'error' | 'stall' | 'eof') => {
    clearBufferingTimers();
    const now = Date.now();
    if (now - lastErrorTimeRef.current < 2500) return;
    lastErrorTimeRef.current = now;

    // EOF sur direct MPEG-TS : le serveur coupe proprement (Xtream envoie un segment de fin).
    // → Reconnexion silencieuse DIRECTE (jamais via proxy pour éviter le cycle timeout 30s).
    // Illimité pour les lives : un live ne "finit" jamais normalement, c'est toujours une coupure réseau.
    if (reason === 'eof' && !isVodItem) {
      liveReconnectCountRef.current += 1;
      setIsBuffering(true);
      setStatusMessage('Reconnexion directe...');
      // Toujours en direct, jamais proxy sur EOF
      await applySourceToPlayer(activeCandidate, {
        useProxy: false,
        bypassDns: hasTriedBypassDnsRef.current,
        forceHls: hasTriedForceHlsRef.current,
      });
      return;
    }

    // Étape 1 : Bascule sur flux de secours si plusieurs sources pour la chaîne
    if (candidateChannels.length > 1 && !hasAutoSwitchedBackupRef.current) {
      hasAutoSwitchedBackupRef.current = true;
      setStatusMessage(`Basculement vers flux alternatif (${candidateChannels.length} sources)...`);
      setIsBuffering(true);
      setTimeout(() => { handleSwitchBackupStream(); }, 600);
      return;
    }

    // Étape 2 : Contournement IP directe (bypass DNS FAI) — uniquement barrelastv
    if (!hasTriedBypassDnsRef.current && (activeCandidate.url || '').includes('barrelastv.ottcst.org')) {
      hasTriedBypassDnsRef.current = true;
      setStatusMessage('Optimisation route directe...');
      setIsBuffering(true);
      await applySourceToPlayer(activeCandidate, { useProxy: false, bypassDns: true, forceHls: hasTriedForceHlsRef.current });
      return;
    }

    // Étape 3 : Forcer HLS si flux TS redirige vers .m3u8
    if (!hasTriedForceHlsRef.current && activeCandidate.type === 'ts' && !(activeCandidate.url || '').includes('.ts')) {
      hasTriedForceHlsRef.current = true;
      setStatusMessage('Adaptation du format de flux...');
      setIsBuffering(true);
      await applySourceToPlayer(activeCandidate, { useProxy: false, bypassDns: hasTriedBypassDnsRef.current, forceHls: true });
      return;
    }

    // Étape 4 : URL miroir (fallbackUrl)
    if (autoRetryCountRef.current < 1 && activeCandidate.fallbackUrl && activeCandidate.fallbackUrl !== activeCandidate.url) {
      autoRetryCountRef.current += 1;
      setStatusMessage('Reconnexion sur serveur miroir...');
      setIsBuffering(true);
      setTimeout(() => { handleRetryDirect(); }, 800);
      return;
    }

    // Étape 5 : Dernière tentative — connexion directe fraîche (reset complet, toujours sans proxy)
    // Sur mobile natif, le proxy Vercel est pire que la connexion directe (timeout 30s garanti).
    if (autoRetryCountRef.current < 2) {
      autoRetryCountRef.current += 1;
      hasTriedBypassDnsRef.current = false;
      hasTriedForceHlsRef.current = false;
      setStatusMessage('Reconnexion au serveur...');
      setIsBuffering(true);
      await applySourceToPlayer(activeCandidate, { useProxy: false });
      return;
    }

    setHasError(true);
    setIsBuffering(false);
    setStatusMessage('Signal indisponible. Vérifiez votre connexion ou changez de chaîne.');
  }, [clearBufferingTimers, isVodItem, activeCandidate, candidateChannels.length, applySourceToPlayer, handleSwitchBackupStream, handleRetryDirect]);

  // Écouter les changements d'état du lecteur expo-video + Watchdog anti-calage 10s + Auto-reconnexion Direct
  useEffect(() => {
    const startStallWatchdog = () => {
      if (stallWatchdogRef.current) clearTimeout(stallWatchdogRef.current);
      stallWatchdogRef.current = setTimeout(() => {
        if (!concurrencyError && !hasError && isPlayingRef.current) {
          console.warn('[BOKK TV] Watchdog 10s déclenché (tampon bloqué), récupération automatique...');
          recoverFromFailureOrStall('stall');
        }
      }, 10500);
    };

    const subStatus = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        recoverFromFailureOrStall('error');
      } else if (status === 'idle') {
        // Sur un flux direct MPEG-TS, une coupure TCP propre déclenche STATE_ENDED -> 'idle'
        if (!isVodItem && hasStartedPlayingRef.current && !hasError) {
          recoverFromFailureOrStall('eof');
        }
      } else if (status === 'readyToPlay') {
        clearBufferingTimers();
        autoRetryCountRef.current = 0;
        hasStartedPlayingRef.current = true;
        setHasError(false);
        setIsBuffering(false);
        setStatusMessage('');
      } else if (status === 'loading') {
        if (!bufferingTimerRef.current) {
          bufferingTimerRef.current = setTimeout(() => {
            setIsBuffering(true);
          }, 900);
        }
        startStallWatchdog();
      }
    });

    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
      if (playing) {
        clearBufferingTimers();
        autoRetryCountRef.current = 0;
        liveReconnectCountRef.current = 0;
        hasStartedPlayingRef.current = true;
        setIsBuffering(false);
      }
    });

    const subEnded = player.addListener('playToEnd', () => {
      if (!isVodItem && !hasError) {
        recoverFromFailureOrStall('eof');
      }
    });

    return () => {
      subStatus.remove();
      subPlaying.remove();
      subEnded.remove();
      clearBufferingTimers();
    };
  }, [player, isVodItem, hasError, concurrencyError, clearBufferingTimers, recoverFromFailureOrStall]);

  // Recharger le flux UNIQUEMENT si la chaîne change (une seule requête HTTP propre)
  useEffect(() => {
    let isCancelled = false;
    autoRetryCountRef.current = 0;
    liveReconnectCountRef.current = 0;
    hasAutoSwitchedBackupRef.current = false;
    hasTriedBypassDnsRef.current = false;
    hasTriedForceHlsRef.current = false;
    hasStartedPlayingRef.current = false;
    lastErrorTimeRef.current = 0;
    clearBufferingTimers();
    setUseProxy(false);
    setConcurrencyError(null);
    setHasError(false);
    setIsBuffering(true);
    setIsReported(false);
    setStatusMessage('');
    setCandidateIndex(0);

    async function initChannelPlayback() {
      if (isCancelled) return;
      await applySourceToPlayer(channel, { useProxy: false });
      if (isCancelled) return;
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
      clearBufferingTimers();
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
          surfaceType="surfaceView"
        />
      </Pressable>

      {/* ── Spinner BOKK TV de chargement ── */}
      {isBuffering && !hasError && !concurrencyError && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View style={styles.spinnerWrap}>
            <ActivityIndicator size="large" color="#e50914" />
            <Text style={styles.spinnerText}>{statusMessage || 'BOKK TV'}</Text>
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
                {/* Plafond Qualité Anti-Calage (Éco 1.5M 480p / HD 720p / Max) */}
                <PlayerButton
                  style={styles.streamModePill}
                  onPress={handleCycleQuality}
                  accessibilityLabel="Changer la qualité adaptative"
                >
                  <Ionicons
                    name="speedometer-outline"
                    size={12}
                    color={qualityPreset === 'eco' ? '#f59e0b' : qualityPreset === 'hd' ? '#38bdf8' : '#22c55e'}
                  />
                  <Text style={styles.streamModeText}>
                    {qualityPreset === 'eco' ? 'Éco 1.5M' : qualityPreset === 'hd' ? '720p' : 'Auto Max'}
                  </Text>
                </PlayerButton>

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

              {/* Centre : Direct TV — Pas de barre de progression trompeuse */}
              <View style={styles.dockLiveCenterWrap}>
                <View style={styles.dockLiveBadge}>
                  <View style={styles.dockLiveDot} />
                  <Text style={styles.dockLiveText}>EN DIRECT</Text>
                </View>
                <Text style={styles.dockChannelNameText} numberOfLines={1}>
                  {activeCandidate.name}
                </Text>
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
              <ModalActionBtn
                hasTVPreferredFocus={true}
                style={styles.primaryModalBtn}
                onPress={handleSwitchBackupStream}
              >
                <Ionicons name="swap-horizontal" size={15} color="#fff" />
                <Text style={styles.primaryModalBtnText}>
                  {candidateChannels.length > 1
                    ? `Tester Secours (${candidateIndex + 1}/${candidateChannels.length})`
                    : 'Tester le Secours'}
                </Text>
              </ModalActionBtn>

              <ModalActionBtn
                style={styles.secondaryModalBtn}
                onPress={handleRetryDirect}
              >
                <Ionicons name="refresh" size={15} color="#cbd5e1" />
                <Text style={styles.secondaryModalBtnText}>Réessayer Direct</Text>
              </ModalActionBtn>

              <ModalActionBtn
                style={styles.ghostModalBtn}
                onPress={handleReport}
              >
                <Text style={styles.ghostModalBtnText}>Signaler</Text>
              </ModalActionBtn>
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
              <ModalActionBtn
                hasTVPreferredFocus={true}
                style={styles.primaryModalBtn}
                onPress={handleReclaimSession}
              >
                <Ionicons name="play" size={15} color="#fff" />
                <Text style={styles.primaryModalBtnText}>Regarder ici (Prendre la main)</Text>
              </ModalActionBtn>

              <ModalActionBtn
                style={styles.secondaryModalBtn}
                onPress={onClose}
              >
                <Text style={styles.secondaryModalBtnText}>Fermer</Text>
              </ModalActionBtn>
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
  dockLiveCenterWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  dockLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(229, 9, 20, 0.25)',
    borderWidth: 1,
    borderColor: '#e50914',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dockLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  dockLiveText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dockChannelNameText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 220,
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
  modalBtnFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: '#0284c7',
    transform: [{ scale: 1.08 }],
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 12,
  },
});
