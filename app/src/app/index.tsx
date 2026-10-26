import React, { useRef, useState, useCallback } from 'react';
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

// URL officielle BOKK TV Smart TV & Android TV 1080p
const TV_ONLINE_URL = 'https://bokktv.vercel.app/tv';

// Injection de script pour garantir la suppression totale de tout bouton de téléchargement ou raccourci inutile
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

  // Gestion du bouton physique Retour (Télécommande TV / Android)
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
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar hidden={true} />

      {/* Sur navigateur Web (Preview Expo Web) */}
      {Platform.OS === 'web' ? (
        <View style={StyleSheet.absoluteFill}>
          <iframe
            src={TV_ONLINE_URL}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#06090e' }}
            allow="autoplay; fullscreen; picture-in-picture"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setLoadError(true);
            }}
          />
        </View>
      ) : (
        /* Sur Android TV / Fire TV Native (WebView) */
        <WebView
          ref={webViewRef}
          source={{ uri: TV_ONLINE_URL }}
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
          onNavigationStateChange={(navState: { canGoBack: boolean }) => {
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
          userAgent="Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BOKKTV-App/2.0 TV"
          scalesPageToFit={false}
        />
      )}

      {/* Écran de chargement initial */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>BOKK TV Smart TV...</Text>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#06090e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 14,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#06090e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 40,
    gap: 14,
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  errorSub: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#6366f1',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
