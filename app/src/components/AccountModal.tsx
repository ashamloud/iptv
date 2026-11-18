import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Subscriber, FirebaseService } from '../services/firebase';

interface AccountModalProps {
  visible: boolean;
  subscriber: Subscriber | null;
  onClose: () => void;
  onSubscriberUpdated: (sub: Subscriber | null) => void;
}

export function AccountModal({
  visible,
  subscriber,
  onClose,
  onSubscriberUpdated
}: AccountModalProps) {
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const [prenom, setPrenom] = useState('');
  const [phone, setPhone] = useState('');
  const [loginId, setLoginId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!prenom.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir votre prénom.');
      return;
    }
    setIsLoading(true);
    const sub = await FirebaseService.registerSubscriber(prenom, phone);
    setIsLoading(false);
    if (sub) {
      onSubscriberUpdated(sub);
      Alert.alert('Félicitations !', `Votre ID BOKK TV est : ${sub.id}\n(1 mois d'accès offert)`);
      onClose();
    } else {
      Alert.alert('Erreur', 'Impossible de créer votre ID.');
    }
  };

  const handleLogin = async () => {
    if (!loginId.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir votre ID (ex: BK-4821).');
      return;
    }
    setIsLoading(true);
    const sub = await FirebaseService.loginSubscriber(loginId);
    setIsLoading(false);
    if (sub) {
      onSubscriberUpdated(sub);
      Alert.alert('Bon retour !', `ID ${sub.id} validé avec succès.`);
      onClose();
    } else {
      Alert.alert('ID Introuvable', 'Vérifiez votre identifiant.');
    }
  };

  const handleLogout = () => {
    onSubscriberUpdated(null);
    onClose();
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`Bonjour, mon ID BOKK TV est ${subscriber?.id || ''} (${subscriber?.prenom || ''}).`);
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {});
  };

  let daysRemaining = 30;
  if (subscriber?.expiresAt) {
    const exp = new Date(subscriber.expiresAt).getTime();
    daysRemaining = Math.max(0, Math.ceil((exp - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerEmoji}>🎟️</Text>
              <Text style={styles.headerTitle}>Mon ID & Abonnement</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {subscriber ? (
            /* Profil Connecté */
            <View style={styles.body}>
              <View style={styles.passCard}>
                <View style={styles.passHeader}>
                  <Text style={styles.passLabel}>PASS MEMBRE BOKK TV</Text>
                  <View style={[styles.statusBadge, subscriber.status === 'suspended' && styles.statusSuspended]}>
                    <Text style={styles.statusText}>
                      {subscriber.status === 'suspended' ? '● SUSPENDU' : `● ACTIF (${daysRemaining}J)`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.passName}>{subscriber.prenom}</Text>

                <View style={styles.passFooter}>
                  <View>
                    <Text style={styles.idLabel}>VOTRE ID UNIQUE</Text>
                    <Text style={styles.idValue}>{subscriber.id}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
                <Text style={styles.whatsappText}>Support WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutText}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Formulaire Inscription / Connexion */
            <View style={styles.body}>
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>
                  🎁 <Text style={{ fontWeight: '700' }}>Accès Gratuit !</Text> Entrez simplement votre prénom pour obtenir votre ID personnel et profiter de 1 mois de stream offert.
                </Text>
              </View>

              {tab === 'register' ? (
                <View>
                  <Text style={styles.label}>Votre Prénom</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Moussa, Fatou..."
                    placeholderTextColor="#6b7280"
                    value={prenom}
                    onChangeText={setPrenom}
                  />

                  <Text style={styles.label}>WhatsApp (Optionnel)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: +221 77 123 45 67"
                    placeholderTextColor="#6b7280"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />

                  <TouchableOpacity
                    style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                    onPress={handleRegister}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Obtenir mon ID BOKK</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setTab('login')} style={styles.switchBtn}>
                    <Text style={styles.switchText}>Vous avez déjà un ID ? Connectez-vous</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.label}>Votre Identifiant BOKK (ID)</Text>
                  <TextInput
                    style={[styles.input, styles.inputUppercase]}
                    placeholder="Ex: BK-4821"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="characters"
                    value={loginId}
                    onChangeText={setLoginId}
                  />

                  <TouchableOpacity
                    style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                    onPress={handleLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Valider mon ID</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setTab('register')} style={styles.switchBtn}>
                    <Text style={styles.switchText}>⬅ Créer un nouvel identifiant</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f121d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEmoji: {
    fontSize: 18,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 20,
  },
  passCard: {
    backgroundColor: '#161b2c',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
    marginBottom: 16,
  },
  passHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  passLabel: {
    color: '#e50914',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusBadge: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusSuspended: {
    backgroundColor: 'rgba(230,57,70,0.2)',
  },
  statusText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  passName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },
  passFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  idLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '700',
  },
  idValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.3)',
    backgroundColor: 'rgba(37,211,102,0.08)',
    marginBottom: 10,
  },
  whatsappText: {
    color: '#25d366',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(230,57,70,0.3)',
  },
  logoutText: {
    color: '#e63946',
    fontSize: 13,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: 'rgba(229,9,20,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: {
    color: '#f3f4f6',
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    height: 44,
    backgroundColor: '#0a0d14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 14,
  },
  inputUppercase: {
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 16,
  },
  primaryBtn: {
    height: 44,
    backgroundColor: '#e50914',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  switchBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  switchText: {
    color: '#9ca3af',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});

