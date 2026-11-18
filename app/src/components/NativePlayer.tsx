import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../data/channels';
import { resolveStreamUrl } from '../services/stream';
import { FirebaseService } from '../services/firebase';

interface NativePlayerProps {
  channel: Channel;
  onClose: () => void;
  onPreviewLockTriggered?: () => void;
  isRegistered?: boolean;
}

export function NativePlayer({
  channel,
  onClose,
  onPreviewLockTriggered,
  isRegistered = false
}: NativePlayerProps) {
  const [streamUrl, setStreamUrl] = useState(() => resolveStreamUrl(channel.url, channel));
  const [isReported, setIsReported] = useState(false);
  const [hasError, setHasError] = useState(false);
  const previewTimerRef = useRef<any>(null);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.play();
  });

  // Recharger le flux si la chaîne change
  useEffect(() => {
    const nextUrl = resolveStreamUrl(channel.url, channel);
    setStreamUrl(nextUrl);
    setHasError(false);
    setIsReported(false);
    player.replace(nextUrl);
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
      Alert.alert('Signalement envoyé', `Merci ! Le problème sur "${channel.name}" a été transmis à l'administrateur.`);
    }
  };

  const handleRetry = () => {
    setHasError(false);
    const nextUrl = resolveStreamUrl(channel.fallbackUrl || channel.url, channel);
    setStreamUrl(nextUrl);
    player.replace(nextUrl);
    player.play();
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        allowsPictureInPicture
        contentFit="contain"
      />

      {/* Header Overlay */}
      <View style={styles.topBar}>
        <View style={styles.titleGroup}>
          <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{channel.badge || 'LIVE'}</Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.reportBtn, isReported && styles.reportBtnDone]}
            onPress={handleReport}
          >
            <Ionicons name="warning-outline" size={14} color="#fff" />
            <Text style={styles.reportText}>{isReported ? 'Signalé' : 'Signaler HS'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay Erreur */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={36} color="#e50914" />
          <Text style={styles.errorTitle}>Flux momentanément indisponible</Text>
          <Text style={styles.errorDesc}>Le diffuseur source ne répond pas.</Text>
          <View style={styles.errorRow}>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtnAction} onPress={handleReport}>
              <Text style={styles.reportBtnActionText}>Signaler HS</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const { width } = Dimensions.get('window');
const playerHeight = Math.min(width * (9 / 16), 260);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: playerHeight,
    backgroundColor: '#000',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  channelName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '70%',
  },
  badge: {
    backgroundColor: '#e50914',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
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
    backgroundColor: 'rgba(229,9,20,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reportBtnDone: {
    backgroundColor: 'rgba(16,185,129,0.25)',
    borderColor: 'rgba(16,185,129,0.5)',
  },
  reportText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  errorDesc: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 12,
  },
  errorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  retryBtn: {
    backgroundColor: '#e50914',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  reportBtnAction: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reportBtnActionText: {
    color: '#fff',
    fontSize: 12,
  },
});

