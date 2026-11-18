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
  Alert,
  Clipboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Subscriber, FirebaseService } from '../services/firebase';
import { StorageService } from '../services/storage';

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
  const [phone, setPhone] = useState('');
  const [prenom, setPrenom] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showProlongInfo, setShowProlongInfo] = useState(false);

  const deviceName = StorageService.getDeviceName();

  const handleAuth = async () => {
    if (!phone.trim()) {
      Alert.alert('Numéro Requis', 'Veuillez saisir votre numéro de téléphone (ex: 77 123 45 67).');
      return;
    }

    setIsLoading(true);
    const sub = await FirebaseService.loginOrRegisterWithPhone(phone, prenom);
    setIsLoading(false);

    if (sub) {
      onSubscriberUpdated(sub);
      Alert.alert(
        'Accès BOKK TV Validé !',
        `Bienvenue ${sub.prenom} !\nVotre numéro ${sub.phone} est maintenant activé.\n(1 seul écran simultané)`
      );
      onClose();
    } else {
      Alert.alert('Erreur', 'Impossible de valider votre numéro. Vérifiez votre connexion internet.');
    }
  };

  const handleLogout = async () => {
    await StorageService.removeSubscriber();
    onSubscriberUpdated(null);
    onClose();
  };

  const WAVE_PAY_URL = 'https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=3000';
  const WHATSAPP_PHONE = '221783055520';

  const handleCopyId = () => {
    if (subscriber?.phone || subscriber?.id) {
      Clipboard.setString(subscriber.phone || subscriber.id);
      Alert.alert('Copié !', 'Votre numéro BOKK TV a été copié dans le presse-papiers.');
    }
  };

  const handleWavePay = () => {
    Linking.openURL(WAVE_PAY_URL).catch(() => {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le lien de paiement Wave.');
    });
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Bonjour BOKK TV, mon compte est lié au numéro ${subscriber?.phone || subscriber?.id || phone || ''} (${subscriber?.prenom || prenom || ''}). Je vous contacte au sujet de mon abonnement.`
    );
    Linking.openURL(`https://wa.me/${WHATSAPP_PHONE}?text=${text}`).catch(() => {
      Alert.alert('Erreur', 'Impossible d\'ouvrir WhatsApp.');
    });
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
              <Ionicons name="tv-outline" size={20} color="#e50914" />
              <Text style={styles.headerTitle}>Pass 1 Écran & Abonnement</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {subscriber ? (
            /* Profil Connecté avec Carte Membre 1 Écran */
            <View style={styles.body}>
              <LinearGradient
                colors={['#1c1017', '#121626', '#0a0d16']}
                style={styles.passCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.passHeader}>
                  <View style={styles.passChip}>
                    <Ionicons name="hardware-chip-outline" size={16} color="#e50914" />
                    <Text style={styles.passLabel}>BOKK TV • 1 ÉCRAN</Text>
                  </View>
                  <View style={[styles.statusBadge, subscriber.status === 'suspended' && styles.statusSuspended]}>
                    <Text style={[styles.statusText, subscriber.status === 'suspended' && styles.statusTextSuspended]}>
                      {subscriber.status === 'suspended' ? '● SUSPENDU' : `● ACTIF (${daysRemaining}J)`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.passName}>{subscriber.prenom}</Text>

                <View style={styles.passFooter}>
                  <View>
                    <Text style={styles.idLabel}>NUMÉRO LIÉ AU COMPTE</Text>
                    <Text style={styles.idValue}>{subscriber.phone || subscriber.id}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyPill} onPress={handleCopyId} activeOpacity={0.8}>
                    <Ionicons name="copy-outline" size={13} color="#fff" />
                    <Text style={styles.copyPillText}>Copier</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.deviceRow}>
                  <Ionicons name="phone-portrait-outline" size={12} color="#94a3b8" />
                  <Text style={styles.deviceText}>Appareil actuel : {deviceName}</Text>
                </View>
              </LinearGradient>

              <View style={styles.ruleNotice}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#22c55e" />
                <Text style={styles.ruleNoticeText}>
                  Règle 1 Écran : Si vous lancez une vidéo sur un autre appareil, la lecture se mettra automatiquement en pause ici.
                </Text>
              </View>

              {/* Section Prolonger / Renouveler la date d'expiration */}
              {(daysRemaining <= 0 || showProlongInfo) ? (
                <View style={styles.paymentBox}>
                  <View style={styles.paymentHeader}>
                    <Ionicons name="time-outline" size={16} color="#00d2ff" />
                    <Text style={styles.paymentTitle}>Prolonger l'abonnement (3 000 F / mois)</Text>
                  </View>
                  <Text style={styles.paymentDesc}>
                    Veuillez Payer TerangaJob 3.000F avec Wave en cliquant sur le lien ci-dessous. Ajoutez cet expéditeur à vos contacts pour rendre le lien cliquable. Après paiement, veuillez patienter quelques instants (2h max) pour l'activation.
                  </Text>
                  <TouchableOpacity style={styles.waveBtn} onPress={handleWavePay} activeOpacity={0.85}>
                    <Ionicons name="card-outline" size={16} color="#fff" />
                    <Text style={styles.waveBtnText}>Payer 3 000 F avec Wave</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.waveBtn, { marginBottom: 12 }]}
                  onPress={() => setShowProlongInfo(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={styles.waveBtnText}>Prolonger la date d'expiration (Wave)</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
                <Text style={styles.whatsappText}>WhatsApp Support (+221 78 305 55 20)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                <Text style={styles.logoutText}>Changer de compte / Déconnexion</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Formulaire Authentification Numéro Unique */
            <View style={styles.body}>
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>🎁 1 Mois d'accès Offert !</Text>
                <Text style={styles.noticeText}>
                  1 compte est réservé à 1 seul écran à la fois. Entrez simplement votre numéro de téléphone pour activer votre accès.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Numéro de Téléphone (WhatsApp / Mobile)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="call-outline" size={18} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 77 123 45 67 ou +221..."
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    autoFocus
                  />
                </View>

                <Text style={styles.label}>Votre Prénom</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Moussa, Fatou, Ibrahima..."
                    placeholderTextColor="#64748b"
                    value={prenom}
                    onChangeText={setPrenom}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={handleAuth}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Activer / Valider mon Compte</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Bouton de paiement Wave direct sans texte inutile */}
                <TouchableOpacity
                  style={[styles.waveBtn, { marginTop: 10 }]}
                  onPress={handleWavePay}
                  activeOpacity={0.85}
                >
                  <Ionicons name="card-outline" size={16} color="#fff" />
                  <Text style={styles.waveBtnText}>Payer avec Wave (3 000 F)</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.helperFooter}>
                Si vous avez déjà un compte avec ce numéro, votre abonnement sera automatiquement restauré sur cet appareil.
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0c0f17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 18,
  },
  passCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
    marginBottom: 12,
  },
  passHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  passChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  passLabel: {
    color: '#e50914',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  statusBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusSuspended: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  statusText: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '800',
  },
  statusTextSuspended: {
    color: '#f87171',
  },
  passName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  passFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  idLabel: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  idValue: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  deviceText: {
    color: '#94a3b8',
    fontSize: 10.5,
  },
  ruleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  ruleNoticeText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 15,
  },
  paymentBox: {
    backgroundColor: 'rgba(0, 210, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 255, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  paymentTitle: {
    color: '#00d2ff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  paymentDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  waveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0070f3',
  },
  waveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.35)',
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
    marginBottom: 8,
  },
  whatsappText: {
    color: '#25d366',
    fontWeight: '700',
    fontSize: 12.5,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  logoutText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
  },
  noticeBox: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noticeTitle: {
    color: '#e50914',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  noticeText: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 10,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111522',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    paddingVertical: 0,
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 44,
    backgroundColor: '#e50914',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13.5,
  },
  helperFooter: {
    color: '#64748b',
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 6,
  },
});
