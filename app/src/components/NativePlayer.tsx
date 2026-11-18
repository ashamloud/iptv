import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';
import { resolveStreamUrl } from '../services/stream';
import { FirebaseService } from '../services/firebase';

interface NativePlayerProps {
  channel: Channel;
  onClose: () => void;
  onPreviewLockTriggered?: () => void;
  isRegistered?: boolean;
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
  onNextChannel,
  onPrevChannel
}: NativePlayerProps) {
  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [streamSource, setStreamSource] = useState(() => buildVideoSource(channel, false));
  const [isReported, setIsReported] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const previewTimerRef = useRef<any>(null);

  const player = useVideoPlayer(streamSource, (p) => {
    p.loop = false;
    p.play();
  });

  // Écouter les erreurs de lecture
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        setHasError(true);
        // Si la connexion directe a échoué et qu'on n'est pas encore sur le proxy, suggérer le secours
        if (!useProxy) {
          setStatusMessage('Échec direct, test du flux de secours...');
          handleRetryWithProxy();
        } else {
          setStatusMessage('Flux source temporairement indisponible.');
        }
      } else if (status === 'readyToPlay') {
        setHasError(false);
        setStatusMessage('');
      }
    });

    return () => {
      sub.remove();
    };
  }, [player, useProxy]);

  // Recharger le flux si la chaîne change
  useEffect(() => {
    setUseProxy(false);
    const nextSource = buildVideoSource(channel, false);
    setStreamSource(nextSource);
    setHasError(false);
    setIsReported(false);
    setStatusMessage('');
    player.replace(nextSource);
    player.play();

    // Règle des 3 secondes si visiteur non enregistré
    if (!isRegistered && onPreviewLockTriggered) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        player.pause();
        onPreviewLockTriggered();
      }, 3500);
    }

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
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
    setStatusMessage('Connexion via flux de secours...');
    const nextSource = buildVideoSource(channel, true);
    setStreamSource(nextSource);
    player.replace(nextSource);
    player.play();
  }, [channel, player]);

  const logoUri = channel.logo && channel.logo.startsWith('http') ? channel.logo : null;

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        allowsPictureInPicture
        contentFit="contain"
      />

      {/* Top Header Overlay avec dégradé cinématique */}
      <LinearGradient
        colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
        style={styles.topGradient}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <View style={styles.titleGroup}>
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
              </View>
              <Text style={styles.channelCategory} numberOfLines={1}>
                {channel.group || channel.category}
                {useProxy ? ' • Secours Actif' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.topActions}>
            {/* Boutons Zapping Rapide (Chaîne Préc. / Chaîne Suiv.) */}
            {onPrevChannel && (
              <TouchableOpacity
                style={styles.zapBtn}
                onPress={onPrevChannel}
                hitSlop={8}
                accessibilityLabel="Chaîne précédente"
              >
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>
            )}

            {onNextChannel && (
              <TouchableOpacity
                style={styles.zapBtn}
                onPress={onNextChannel}
                hitSlop={8}
                accessibilityLabel="Chaîne suivante"
              >
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Bouton Signaler HS */}
            <TouchableOpacity
              style={[styles.reportBtn, isReported && styles.reportBtnDone]}
              onPress={handleReport}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isReported ? 'checkmark-circle' : 'warning-outline'}
                size={13}
                color={isReported ? '#22c55e' : '#f87171'}
              />
              <Text style={[styles.reportText, isReported && styles.reportTextDone]}>
                {isReported ? 'Signalé' : 'Signaler'}
              </Text>
            </TouchableOpacity>

            {/* Bouton Fermer */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Fermer le lecteur"
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Overlay Erreur avec options de secours */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="alert-circle" size={32} color="#e50914" />
            </View>
            <Text style={styles.errorTitle}>Signal indisponible</Text>
            <Text style={styles.errorDesc}>
              {statusMessage || 'Le serveur diffuseur de cette chaîne ne répond pas.'}
            </Text>

            <View style={styles.errorActionsRow}>
              <TouchableOpacity
                style={styles.retrySecoursBtn}
                onPress={handleRetryWithProxy}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark" size={15} color="#fff" />
                <Text style={styles.retrySecoursText}>Relancer (Secours)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.retryDirectBtn}
                onPress={handleRetryDirect}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={15} color="#cbd5e1" />
                <Text style={styles.retryDirectText}>Direct</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportBtnAction}
                onPress={handleReport}
                activeOpacity={0.8}
              >
                <Text style={styles.reportBtnActionText}>Signaler HS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');
const playerHeight = Math.min(width * (9 / 16), 280);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: playerHeight,
    backgroundColor: '#000000',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  channelLogoThumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  logoThumbFallback: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
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
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e50914',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    gap: 3,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  channelCategory: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zapBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reportBtnDone: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  reportText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '700',
  },
  reportTextDone: {
    color: '#22c55e',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(5, 8, 15, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 10,
  },
  errorCard: {
    alignItems: 'center',
    maxWidth: 320,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#121622',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  errorIconWrap: {
    marginBottom: 6,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorDesc: {
    color: '#94a3b8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 15,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retrySecoursBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e50914',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retrySecoursText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  retryDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryDirectText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  reportBtnAction: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  reportBtnActionText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
