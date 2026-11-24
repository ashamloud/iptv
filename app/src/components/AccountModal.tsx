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
  Clipboard,
  ScrollView,
  Image,
  Platform,
  useWindowDimensions,
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
  const [tvQrPlan, setTvQrPlan] = useState<null | { url: string; label: string }>(null);

  // Détection Smart TV & TV Box (Android TV ou grand écran paysage)
  const { width, height } = useWindowDimensions();
  const isTvDevice = Platform.isTV || (width >= 850 && width > height);

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
  let formattedExpDate = '';
  let isExpired = false;
  if (subscriber?.expiresAt) {
    const exp = new Date(subscriber.expiresAt);
    const expTime = exp.getTime();
    daysRemaining = Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining <= 0;

    const d = String(exp.getDate()).padStart(2, '0');
    const m = String(exp.getMonth() + 1).padStart(2, '0');
    const y = exp.getFullYear();
    formattedExpDate = `${d}/${m}/${y}`;
  }

  const initial = (subscriber?.prenom || subscriber?.phone || subscriber?.id || 'B').trim().charAt(0).toUpperCase();

  const countdownText = isExpired
    ? `⚠️ Expiré depuis ${Math.abs(daysRemaining)} jour${Math.abs(daysRemaining) > 1 ? 's' : ''}`
    : `Expire le ${formattedExpDate || '30j'} (dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''})`;

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
            /* Profil Connecté avec Carte Membre 1 Écran & Profil Enrichi */
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
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
                    <View style={[styles.statusBadge, (subscriber.status === 'suspended' || isExpired) && styles.statusSuspended]}>
                      <Text style={[styles.statusText, (subscriber.status === 'suspended' || isExpired) && styles.statusTextSuspended]}>
                        {subscriber.status === 'suspended'
                          ? '● SUSPENDU'
                          : isExpired
                          ? '● EXPIRÉ'
                          : `● ACTIF (${daysRemaining}J)`}
                      </Text>
                    </View>
                  </View>

                  {/* Avatar circulaire + Nom + Compte à rebours dynamique */}
                  <View style={styles.profileRow}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={styles.passName}>{subscriber.prenom || 'Abonné'}</Text>
                      <Text style={[styles.countdownText, isExpired && styles.countdownTextExpired]}>
                        {countdownText}
                      </Text>
                    </View>
                  </View>

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

                {/* Section Plans de renouvellement (3 options Wave) */}
                <View style={styles.renewalPlansBox}>
                  <View style={styles.paymentHeader}>
                    <Ionicons name="sparkles" size={16} color="#38bdf8" />
                    <Text style={styles.paymentTitle}>Plans de renouvellement</Text>
                  </View>
                  <Text style={styles.paymentDesc}>
                    Renouvelez instantanément votre abonnement via Wave :
                  </Text>

                  <View style={styles.plansContainer}>
                    {/* 1 mois – 3 000 F */}
                    <TouchableOpacity
                      style={styles.planCard}
                      onPress={() => {
                        const url = 'https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=3000';
                        if (isTvDevice) {
                          setTvQrPlan(tvQrPlan?.url === url ? null : { url, label: '1 mois – 3 000 F' });
                        } else {
                          Linking.openURL(url).catch(() => Alert.alert('Erreur', "Impossible d'ouvrir Wave."));
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="time-outline" size={16} color="#38bdf8" />
                        <Text style={styles.planDuration}>1 mois</Text>
                        <Text style={styles.planPrice}>3 000 F</Text>
                      </View>
                      <View style={styles.planWaveBadge}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* 3 mois – 7 500 F (économie 1500F) */}
                    <TouchableOpacity
                      style={[styles.planCard, styles.planCardPopular]}
                      onPress={() => {
                        const url = 'https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=7500';
                        if (isTvDevice) {
                          setTvQrPlan(tvQrPlan?.url === url ? null : { url, label: '3 mois – 7 500 F' });
                        } else {
                          Linking.openURL(url).catch(() => Alert.alert('Erreur', "Impossible d'ouvrir Wave."));
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="flame" size={16} color="#f59e0b" />
                        <View style={styles.planRow}>
                          <Text style={styles.planDuration}>3 mois</Text>
                          <View style={styles.savingsPill}>
                            <Text style={styles.savingsText}>Éco 1 500F</Text>
                          </View>
                        </View>
                        <Text style={styles.planPrice}>7 500 F</Text>
                      </View>
                      <View style={[styles.planWaveBadge, styles.planWaveBadgePopular]}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* 12 mois – 25 000 F (économie 11000F) */}
                    <TouchableOpacity
                      style={styles.planCard}
                      onPress={() => {
                        const url = 'https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=25000';
                        if (isTvDevice) {
                          setTvQrPlan(tvQrPlan?.url === url ? null : { url, label: '12 mois – 25 000 F' });
                        } else {
                          Linking.openURL(url).catch(() => Alert.alert('Erreur', "Impossible d'ouvrir Wave."));
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="trophy" size={16} color="#22c55e" />
                        <View style={styles.planRow}>
                          <Text style={styles.planDuration}>12 mois</Text>
                          <View style={styles.savingsPill}>
                            <Text style={styles.savingsText}>Éco 11 000F</Text>
                          </View>
                        </View>
                        <Text style={styles.planPrice}>25 000 F</Text>
                      </View>
                      <View style={styles.planWaveBadge}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* QR Code affiché sur TV après sélection d'un plan */}
                    {isTvDevice && tvQrPlan && (
                      <View style={styles.tvQrBox}>
                        <Text style={styles.tvQrTitle}>📱 Scannez avec votre téléphone</Text>
                        <Text style={styles.tvQrPlan}>{tvQrPlan.label}</Text>
                        <Image
                          source={{
                            uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tvQrPlan.url)}&bgcolor=ffffff&color=000000&margin=10`,
                          }}
                          style={styles.tvQrImage}
                        />
                        <Text style={styles.tvQrInstruction}>
                          Ouvrez l'appareil photo de votre téléphone et pointez-le vers ce QR code pour payer avec Wave.
                        </Text>
                        <TouchableOpacity focusable={true} style={styles.tvQrClose} onPress={() => setTvQrPlan(null)}>
                          <Text style={styles.tvQrCloseText}>✕ Fermer le QR Code</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsApp} activeOpacity={0.85}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
                  <Text style={styles.whatsappText}>WhatsApp Support (+221 78 305 55 20)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                  <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                  <Text style={styles.logoutText}>Changer de compte / Déconnexion</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* Formulaire Authentification Numéro Unique (100% Gratuit) */
            <View style={styles.body}>
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>🎁 1 Mois d'accès Offert !</Text>
                <Text style={styles.noticeText}>
                  L'inscription est gratuite et réservée à 1 seul écran à la fois. Entrez votre numéro pour activer votre compte.
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
                      <Text style={styles.primaryBtnText}>Activer mon Accès Gratuit</Text>
                    </>
                  )}
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
  modalScroll: {
    maxHeight: 520,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 10,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  countdownText: {
    color: '#38bdf8',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 2,
  },
  countdownTextExpired: {
    color: '#f87171',
  },
  renewalPlansBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  plansContainer: {
    gap: 8,
    marginTop: 8,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111625',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  planCardPopular: {
    borderColor: 'rgba(56, 189, 248, 0.45)',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  planInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planDuration: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  planPrice: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  savingsPill: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  savingsText: {
    color: '#22c55e',
    fontSize: 9.5,
    fontWeight: '800',
  },
  planWaveBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  planWaveBadgePopular: {
    backgroundColor: '#0284c7',
  },
  planWaveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
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
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
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
    color: '#38bdf8',
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
    backgroundColor: '#0284c7',
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
  // ─── TV QR Code ───
  tvQrBox: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    padding: 20,
    alignItems: 'center',
  },
  tvQrTitle: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  tvQrPlan: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
    opacity: 0.85,
  },
  tvQrImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  tvQrInstruction: {
    color: '#94a3b8',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
    maxWidth: 280,
  },
  tvQrClose: {
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tvQrCloseText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
});
