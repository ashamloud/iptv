// ═══════════════════════════════════════════════════════════════
// BOKK TV — Lecteur Vidéo Natif (Design Inspiré de Netflix)
// Contrôles Cinématiques, Glassmorphism, Auto-Hide, Compatible TV
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  TouchableWithoutFeedback
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';
import { resolveStreamUrl } from '../services/stream';
import { FirebaseService, Subscriber } from '../services/firebase';
import { StorageService } from '../services/storage';

interface NativePlayerProps {
  channel: Channel;
  onClose: () => void;
  onPreviewLockTriggered?: () => void;
  isRegistered?: boolean;
  subscriber?: Subscriber | null;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
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

export function NativePlayer({
  channel,
  onClose,
  onPreviewLockTriggered,
  isRegistered = false,
  subscriber,
  onNextChannel,
  onPrevChannel
}: NativePlayerProps) {
  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [streamSource, setStreamSource] = useState(() => buildVideoSource(channel, false));
  const [isReported, setIsReported] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);

  // Contrôles Netflix : affichage temporisé & lecture
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);

  const previewTimerRef = useRef<any>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const sessionIdRef = useRef<string>('');

  const player = useVideoPlayer(streamSource, (p) => {
    p.loop = false;
    p.play();
  });

  // Réinitialiser le timer d'auto-masquage des contrôles Netflix
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
        }, 10000);
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
  }, [subscriber, channel.id]);

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

  // Écouter les changements d'état du lecteur expo-video
  useEffect(() => {
    const subStatus = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        setHasError(true);
        setIsBuffering(false);
        if (!useProxy) {
          setStatusMessage('Échec direct, test du flux de secours...');
          handleRetryWithProxy();
        } else {
          setStatusMessage('Signal source temporairement indisponible.');
        }
      } else if (status === 'readyToPlay') {
        setHasError(false);
        setIsBuffering(false);
        setStatusMessage('');
      } else if (status === 'loading') {
        setIsBuffering(true);
      }
    });

    const subPlaying = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });

    return () => {
      subStatus.remove();
      subPlaying.remove();
    };
  }, [player, useProxy]);

  // Recharger le flux si la chaîne change
  useEffect(() => {
    setUseProxy(false);
    setConcurrencyError(null);
    const nextSource = buildVideoSource(channel, false);
    setStreamSource(nextSource);
    setHasError(false);
    setIsBuffering(true);
    setIsReported(false);
    setStatusMessage('');
    player.replace(nextSource);
    player.play();
    setIsPlaying(true);
    resetControlsTimeout();

    // Règle d'aperçu pour les non enregistrés
    if (!isRegistered && onPreviewLockTriggered) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        player.pause();
        onPreviewLockTriggered();
      }, 4000);
    }

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [channel.id, isRegistered]);

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

  const handleRetryDirect = () => {
    setHasError(false);
    setUseProxy(false);
    setIsBuffering(true);
    setStatusMessage('Reconnexion directe...');
    const retryChannel = {
      ...channel,
      url: channel.fallbackUrl || channel.url
    };
    const nextSource = buildVideoSource(retryChannel, false);
    setStreamSource(nextSource);
    player.replace(nextSource);
    player.play();
  };

  const handleRetryWithProxy = useCallback(() => {
    setHasError(false);
    setUseProxy(true);
    setIsBuffering(true);
    setStatusMessage('Connexion via flux de secours...');
    const nextSource = buildVideoSource(channel, true);
    setStreamSource(nextSource);
    player.replace(nextSource);
    player.play();
  }, [channel, player]);

  const logoUri = channel.logo && channel.logo.startsWith('http') ? channel.logo : null;

  return (
    <View style={styles.container}>
      {/* ── Surface Vidéo Plein Écran (Cliquable pour afficher/masquer contrôles) ── */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill}>
          <VideoView
            player={player}
            style={styles.video}
            nativeControls={false}
            allowsPictureInPicture
            contentFit="contain"
          />
        </View>
      </TouchableWithoutFeedback>

      {/* ── Spinner Netflix de chargement ── */}
      {isBuffering && !hasError && !concurrencyError && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View style={styles.netflixSpinnerWrap}>
            <ActivityIndicator size="large" color="#e50914" />
            <Text style={styles.spinnerText}>BOKK TV</Text>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ── OVERLAY NETFLIX : CONTRÔLES HAUT, MILIEU, BAS ── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showControls && !hasError && !concurrencyError && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* ── 1. HEADER NETFLIX (Gradient Haut) ── */}
          <LinearGradient
            colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.6)', 'transparent']}
            style={styles.topGradient}
            pointerEvents="box-none"
          >
            <View style={styles.topBar}>
              <View style={styles.titleGroup}>
                <TouchableOpacity
                  style={styles.backCircleBtn}
                  onPress={onClose}
                  hitSlop={8}
                  focusable={true}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>

                {logoUri ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.channelLogoThumb}
                    contentFit="contain"
                  />
                ) : (
                  <View style={styles.logoThumbFallback}>
                    <Ionicons name="tv" size={14} color="#e50914" />
                  </View>
                )}

                <View style={styles.channelMeta}>
                  <View style={styles.nameRow}>
                    <Text style={styles.channelName} numberOfLines={1}>
                      {channel.name}
                    </Text>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveBadgeText}>DIRECT</Text>
                    </View>
                    <View style={styles.qualityPill}>
                      <Text style={styles.qualityPillText}>
                        {channel.badge || 'HD'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.channelCategory} numberOfLines={1}>
                    {channel.group || channel.category || 'Direct TV'}
                    {useProxy ? ' • Proxy Secours' : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.topActions}>
                {/* Bouton Signaler HS */}
                <TouchableOpacity
                  style={[styles.reportBtn, isReported && styles.reportBtnDone]}
                  onPress={handleReport}
                  activeOpacity={0.8}
                  focusable={true}
                >
                  <Ionicons
                    name={isReported ? 'checkmark-circle' : 'warning-outline'}
                    size={14}
                    color={isReported ? '#22c55e' : '#cbd5e1'}
                  />
                  <Text style={[styles.reportText, isReported && styles.reportTextDone]}>
                    {isReported ? 'Signalé' : 'Signaler'}
                  </Text>
                </TouchableOpacity>

                {/* Bouton Fermer Lecteur */}
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={10}
                  focusable={true}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          {/* ── 2. CENTRE NETFLIX : ZAPPING & GROS BOUTON PLAY/PAUSE ── */}
          <View style={styles.centerControls} pointerEvents="box-none">
            {/* Chaîne Précédente */}
            {onPrevChannel && (
              <Pressable
                style={({ pressed, focused }: any) => [
                  styles.netflixNavBtn,
                  focused && styles.tvFocused,
                  pressed && styles.btnPressed
                ]}
                onPress={() => {
                  resetControlsTimeout();
                  onPrevChannel();
                }}
                focusable={true}
                hitSlop={10}
              >
                <Ionicons name="play-skip-back" size={22} color="#ffffff" />
              </Pressable>
            )}

            {/* Gros Bouton Central Play/Pause Style Netflix */}
            <Pressable
              style={({ pressed, focused }: any) => [
                styles.netflixPlayPauseBtn,
                focused && styles.tvFocused,
                pressed && styles.playBtnPressed
              ]}
              onPress={handleTogglePlayPause}
              focusable={true}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={34}
                color="#ffffff"
                style={!isPlaying && { marginLeft: 3 }}
              />
            </Pressable>

            {/* Chaîne Suivante */}
            {onNextChannel && (
              <Pressable
                style={({ pressed, focused }: any) => [
                  styles.netflixNavBtn,
                  focused && styles.tvFocused,
                  pressed && styles.btnPressed
                ]}
                onPress={() => {
                  resetControlsTimeout();
                  onNextChannel();
                }}
                focusable={true}
                hitSlop={10}
              >
                <Ionicons name="play-skip-forward" size={22} color="#ffffff" />
              </Pressable>
            )}
          </View>

          {/* ── 3. BAS NETFLIX : BARRE DE PROGRESSION EN DIRECT & ACTIONS ── */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
            style={styles.bottomGradient}
            pointerEvents="box-none"
          >
            {/* Ligne rouge Netflix continue pour le Live */}
            <View style={styles.liveProgressBar}>
              <View style={styles.liveProgressFill} />
              <View style={styles.liveKnob} />
            </View>

            <View style={styles.bottomBarRow}>
              {/* Statut du flux et bascule Secours */}
              <TouchableOpacity
                style={styles.streamModePill}
                onPress={() => {
                  resetControlsTimeout();
                  if (useProxy) handleRetryDirect();
                  else handleRetryWithProxy();
                }}
                activeOpacity={0.8}
                focusable={true}
              >
                <Ionicons
                  name={useProxy ? 'shield-checkmark' : 'flash'}
                  size={12}
                  color={useProxy ? '#60a5fa' : '#22c55e'}
                />
                <Text style={styles.streamModeText}>
                  {useProxy ? 'Flux Secours Actif' : 'Connexion Directe'}
                </Text>
              </TouchableOpacity>

              <View style={styles.bottomRightActions}>
                {/* Couper / Activer le son */}
                <TouchableOpacity
                  style={styles.bottomIconBtn}
                  onPress={handleToggleMute}
                  hitSlop={8}
                  focusable={true}
                >
                  <Ionicons
                    name={isMuted ? 'volume-mute' : 'volume-high'}
                    size={20}
                    color="#ffffff"
                  />
                </TouchableOpacity>

                {/* Zapping rapide suivant */}
                {onNextChannel && (
                  <TouchableOpacity
                    style={styles.bottomIconBtn}
                    onPress={() => {
                      resetControlsTimeout();
                      onNextChannel();
                    }}
                    hitSlop={8}
                    focusable={true}
                  >
                    <Ionicons name="play-forward-outline" size={19} color="#ffffff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* ── 4. OVERLAY ERREUR NETFLIX STYLE ── */}
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
                onPress={handleRetryWithProxy}
                activeOpacity={0.85}
                focusable={true}
              >
                <Ionicons name="shield-checkmark" size={15} color="#fff" />
                <Text style={styles.primaryModalBtnText}>Tester le Secours</Text>
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

      {/* ── 5. OVERLAY CONCURRENCE : 1 SEUL ÉCRAN SIMULTANÉ (SOLUTION 3) ── */}
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

const { width } = Dimensions.get('window');
const playerHeight = Math.min(width * (9 / 16), 300);

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
  netflixSpinnerWrap: {
    alignItems: 'center',
    gap: 8,
  },
  spinnerText: {
    color: '#e50914',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // ── Gradient Haut ──
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  backCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelLogoThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  logoThumbFallback: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelMeta: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  channelName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e50914',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  qualityPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  qualityPillText: {
    color: '#94a3b8',
    fontSize: 8.5,
    fontWeight: '700',
  },
  channelCategory: {
    color: '#94a3b8',
    fontSize: 10.5,
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Contrôles Centraux Netflix ──
  centerControls: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  netflixPlayPauseBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(229, 9, 20, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  playBtnPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: '#b80710',
  },
  netflixNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 24, 36, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: 'rgba(40, 48, 68, 0.9)',
  },
  tvFocused: {
    borderColor: '#00d2ff',
    borderWidth: 2.5,
    transform: [{ scale: 1.1 }],
    shadowColor: '#00d2ff',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },

  // ── Gradient Bas ──
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 14,
  },
  liveProgressBar: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginBottom: 8,
    position: 'relative',
    overflow: 'visible',
  },
  liveProgressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 2,
  },
  liveKnob: {
    position: 'absolute',
    right: 0,
    top: -3.5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    shadowColor: '#e50914',
    shadowRadius: 4,
    shadowOpacity: 0.8,
    elevation: 4,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streamModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  streamModeText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '700',
  },
  bottomRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modales d'erreur & Concurrence Style Netflix ──
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
