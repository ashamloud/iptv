import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  BackHandler,
  Platform,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// URL officielle Smart TV BOKK TV
const TV_ONLINE_URL = 'https://bokktv.vercel.app/tv';

// Injection de script pour garantir la suppression totale de tout élément superflu
const INJECTED_JS = `
  (function() {
    var style = document.createElement('style');
    style.innerHTML = '.btn-apk, #btn-shortcuts, #btn-theater-header { display: none !important; }';
    document.head.appendChild(style);
    document.body.classList.add('is-native-app');
  })();
  true;
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const activeUrl = TV_ONLINE_URL;

  // Gestion de la touche physique Retour (Android / Télécommande TV)
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [canGoBack]);

  const handleRetry = useCallback(() => {
    setLoadError(false);
    setIsLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={isTV ? [] : ['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#06090e" hidden={isTV} />

      {/* Sur navigateur Web (preview Expo Web) */}
      {Platform.OS === 'web' ? (
        <View style={StyleSheet.absoluteFill}>
          <iframe
            key={activeUrl}
            src={activeUrl}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#06090e' }}
            allow="autoplay; fullscreen; picture-in-picture"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setLoadError(true);
            }}
          />
          {/* Bouton de bascule Preview TV / Mobile lors du test sur navigateur */}
          <View style={styles.previewToggleBar}>
            <TouchableOpacity
              style={[styles.toggleBtn, !tvModePreview && styles.toggleBtnActive]}
              onPress={() => setTvModePreview(false)}
            >
              <Text style={styles.toggleText}>📱 Mobile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, tvModePreview && styles.toggleBtnActive]}
              onPress={() => setTvModePreview(true)}
            >
              <Text style={styles.toggleText}>📺 Smart TV</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Sur Application Mobile & Android TV Native (WebView) */
        <WebView
          ref={webViewRef}
          source={{ uri: activeUrl }}
          style={styles.webview}
          // Configuration vidéo et média haute performance
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          cacheEnabled={true}
          injectedJavaScript={INJECTED_JS}
          allowsBackForwardNavigationGestures={true}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onLoadStart={() => {
            setLoadError(false);
            setIsLoading(true);
          }}
          onLoadEnd={() => {
            setIsLoading(false);
          }}
          onError={() => {
            setIsLoading(false);
            setLoadError(true);
          }}
          userAgent={
            isTV
              ? "Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BOKKTV-App/2.0 TV"
              : "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 BOKKTV-App/2.0"
          }
          scalesPageToFit={false}
        />
      )}

      {/* Écran de chargement initial */}
      {isLoading && (
        <View style={[styles.loadingOverlay, { pointerEvents: 'none' }]}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>
            {isTV || tvModePreview ? 'BOKK TV Smart TV...' : 'BOKK TV en cours de chargement...'}
          </Text>
        </View>
      )}

      {/* Écran d'erreur en cas de coupure réseau */}
      {loadError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Connexion interrompue</Text>
          <Text style={styles.errorSub}>
            Impossible de charger le service. Vérifiez votre connexion Internet.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06090e',
  },
  webview: {
    flex: 1,
    backgroundColor: '#06090e',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#06090e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 14,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#06090e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 30,
    gap: 12,
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  errorSub: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#6366f1',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewToggleBar: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 30,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 100,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  toggleBtnActive: {
    backgroundColor: '#6366f1',
  },
  toggleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
