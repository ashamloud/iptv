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

// URL de production synchronisée avec le site web
const ONLINE_URL = 'https://bokktv.vercel.app';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Gestion du bouton retour Android
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#06090e" />

      <WebView
        ref={webViewRef}
        source={{ uri: ONLINE_URL }}
        style={styles.webview}
        // Configuration vidéo et média
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        cacheEnabled={true}
        // Navigation & performance
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
        // Optimisation rendu web mobile
        userAgent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 BOKKTV-App/2.0"
        scalesPageToFit={false}
      />

      {/* Écran de chargement initial */}
      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>BOKK TV en cours de chargement...</Text>
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
});
