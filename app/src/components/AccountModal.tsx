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
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Subscriber, FirebaseService, validatePhone } from '../services/firebase';
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
  const [focusedPlan, setFocusedPlan] = useState<string | null>(null);
  const [focusedActionBtn, setFocusedActionBtn] = useState<string | null>(null);

  // Détection Smart TV & TV Box (Android TV ou grand écran paysage)
  const { width, height } = useWindowDimensions();
  const isTvDevice = Platform.isTV || (width >= 850 && width > height);

  const deviceName = StorageService.getDeviceName();

  const handleAuth = async () => {
    const val = validatePhone(phone);
    if (!val.valid) {
      Alert.alert('Numéro Invalide', val.error || 'Veuillez saisir votre numéro de téléphone (ex: 77 123 45 67).');
      return;
    }

    setIsLoading(true);
    const res = await FirebaseService.loginOrRegisterWithPhone(phone, prenom);
    setIsLoading(false);

    if (res.subscriber) {
      onSubscriberUpdated(res.subscriber);
      if (res.isExisting) {
        Alert.alert(
          'Bon retour sur BOKK TV !',
          `Bienvenue ${res.subscriber.prenom} !\nVotre compte (${res.subscriber.id}) est activé.\n(1 seul écran simultané)`
        );
      } else {
        Alert.alert(
          'Accès BOKK TV Validé !',
          `Bienvenue ${res.subscriber.prenom} !\nVotre ID est : ${res.subscriber.id}\n(30 jours offerts • 1 seul écran simultané)`
        );
      }
      onClose();
    } else {
      Alert.alert('Erreur', res.error || 'Impossible de valider votre numéro. Vérifiez votre connexion internet.');
    }
  };

  const handleSelectWavePlan = (planKey: '1m' | '3m' | '12m', amount: number, days: number) => {
    const subId = subscriber?.id || (subscriber?.phone ? `BK-${subscriber.phone}` : (phone ? `BK-${phone.replace(/\D/g, '')}` : ''));
    const subName = subscriber?.prenom || prenom || 'Abonné';
    const payerPhone = subscriber?.phone || phone || '';

    if (!subId || !payerPhone) {
      Alert.alert('Numéro Requis', 'Veuillez saisir votre numéro de téléphone pour associer votre règlement à votre compte.');
      return;
    }

    // 1. Notification automatique à l'administrateur dans Firestore
    FirebaseService.submitPaymentClaim({
      subscriberId: subId,
      subscriberName: subName,
      payerPhone: payerPhone,
      plan: planKey,
      amount,
      days,
      autoCreated: true,
    }).catch(() => {});

    const waveUrl = `https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=${amount}`;
    const planLabel = `${days === 365 ? '12 mois' : days === 90 ? '3 mois' : '1 mois'} – ${amount.toLocaleString('fr-FR')} F`;

    if (isTvDevice) {
      setTvQrPlan({ url: waveUrl, label: planLabel });
      Alert.alert(
        'Demande transmise à l\'administrateur !',
        `Votre demande pour le compte ${subId} est enregistrée chez l'administrateur. Scannez le QR Code Wave affiché à l'écran pour finaliser le règlement.`
      );
    } else {
      Alert.alert(
        'Demande transmise à l\'administrateur !',
        `Votre intention de renouvellement (${planLabel}) pour le compte ${subId} a été transmise.\nOuverture de l'application Wave...`,
        [
          {
            text: 'Ouvrir Wave',
            onPress: () => {
              Linking.openURL(waveUrl).catch(() => {
                Alert.alert('Erreur', "Impossible d'ouvrir le lien de paiement Wave.");
              });
            }
          }
        ]
      );
    }
  };

  const handleLogout = async () => {
    await StorageService.removeSubscriber();
    onSubscriberUpdated(null);
    onClose();
  };

  // Déclaration de paiement Wave (Option C)
  const [claimPlan, setClaimPlan] = useState<'1m' | '3m' | '12m'>('1m');
  const [claimPayerPhone, setClaimPayerPhone] = useState(subscriber?.phone || '');
  const [claimTxId, setClaimTxId] = useState('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimStatusMsg, setClaimStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmitClaim = async () => {
    const payer = claimPayerPhone.trim();
    if (!payer) {
      Alert.alert('Numéro Requis', 'Veuillez saisir le numéro Wave ayant effectué le paiement.');
      return;
    }

    setIsSubmittingClaim(true);
    setClaimStatusMsg(null);

    const subId = subscriber?.phone || subscriber?.id || phone || '';
    const subName = subscriber?.prenom || prenom || 'Abonné';

    const planAmountMap = {
      '1m': { amount: 3000, days: 30 },
      '3m': { amount: 7500, days: 90 },
      '12m': { amount: 25000, days: 365 },
    };

    const { amount, days } = planAmountMap[claimPlan];

    const res = await FirebaseService.submitPaymentClaim({
      subscriberId: subId,
      subscriberName: subName,
      payerPhone: payer,
      plan: claimPlan,
      amount,
      days,
      txId: claimTxId.trim(),
    });

    setIsSubmittingClaim(false);

    if (res.success) {
      setClaimStatusMsg({
        type: 'success',
        text: '✅ Déclaration transmise ! Votre compte sera crédité dès vérification par l\'administrateur.',
      });
      Alert.alert(
        'Paiement Déclaré !',
        `Votre déclaration pour le compte ${subId} (Payeur: ${payer}) a été envoyée. L'activation se fait en 1 clic dans l'administration.`
      );
    } else {
      setClaimStatusMsg({
        type: 'error',
        text: res.error || 'Erreur lors de l\'envoi. Réessayez.',
      });
    }
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
            <Pressable
              focusable={true}
              accessible={true}
              onFocus={() => setFocusedActionBtn('close')}
              onBlur={() => setFocusedActionBtn((p) => (p === 'close' ? null : p))}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                focusedActionBtn === 'close' && styles.closeBtnFocused,
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color={focusedActionBtn === 'close' ? '#38bdf8' : '#94a3b8'} />
            </Pressable>
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
                    <Pressable
                      focusable={true}
                      accessible={true}
                      onFocus={() => setFocusedPlan('1m')}
                      onBlur={() => setFocusedPlan((p) => (p === '1m' ? null : p))}
                      style={({ pressed }) => [
                        styles.planCard,
                        focusedPlan === '1m' && styles.planCardFocused,
                        pressed && { opacity: 0.85 }
                      ]}
                      onPress={() => handleSelectWavePlan('1m', 3000, 30)}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="time-outline" size={16} color={focusedPlan === '1m' ? '#38bdf8' : '#94a3b8'} />
                        <Text style={[styles.planDuration, focusedPlan === '1m' && { color: '#ffffff' }]}>1 mois</Text>
                        <Text style={styles.planPrice}>3 000 F</Text>
                      </View>
                      <View style={[styles.planWaveBadge, focusedPlan === '1m' && styles.planWaveBadgeFocused]}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </Pressable>

                    {/* 3 mois – 7 500 F (économie 1500F) */}
                    <Pressable
                      focusable={true}
                      accessible={true}
                      onFocus={() => setFocusedPlan('3m')}
                      onBlur={() => setFocusedPlan((p) => (p === '3m' ? null : p))}
                      style={({ pressed }) => [
                        styles.planCard,
                        styles.planCardPopular,
                        focusedPlan === '3m' && styles.planCardFocused,
                        pressed && { opacity: 0.85 }
                      ]}
                      onPress={() => handleSelectWavePlan('3m', 7500, 90)}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="flame" size={16} color={focusedPlan === '3m' ? '#38bdf8' : '#f59e0b'} />
                        <View style={styles.planRow}>
                          <Text style={[styles.planDuration, focusedPlan === '3m' && { color: '#ffffff' }]}>3 mois</Text>
                          <View style={styles.savingsPill}>
                            <Text style={styles.savingsText}>Éco 1 500F</Text>
                          </View>
                        </View>
                        <Text style={styles.planPrice}>7 500 F</Text>
                      </View>
                      <View style={[styles.planWaveBadge, styles.planWaveBadgePopular, focusedPlan === '3m' && styles.planWaveBadgeFocused]}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </Pressable>

                    {/* 12 mois – 25 000 F (économie 11000F) */}
                    <Pressable
                      focusable={true}
                      accessible={true}
                      onFocus={() => setFocusedPlan('12m')}
                      onBlur={() => setFocusedPlan((p) => (p === '12m' ? null : p))}
                      style={({ pressed }) => [
                        styles.planCard,
                        focusedPlan === '12m' && styles.planCardFocused,
                        pressed && { opacity: 0.85 }
                      ]}
                      onPress={() => handleSelectWavePlan('12m', 25000, 365)}
                    >
                      <View style={styles.planInfo}>
                        <Ionicons name="trophy" size={16} color={focusedPlan === '12m' ? '#38bdf8' : '#22c55e'} />
                        <View style={styles.planRow}>
                          <Text style={[styles.planDuration, focusedPlan === '12m' && { color: '#ffffff' }]}>12 mois</Text>
                          <View style={styles.savingsPill}>
                            <Text style={styles.savingsText}>Éco 11 000F</Text>
                          </View>
                        </View>
                        <Text style={styles.planPrice}>25 000 F</Text>
                      </View>
                      <View style={[styles.planWaveBadge, focusedPlan === '12m' && styles.planWaveBadgeFocused]}>
                        <Text style={styles.planWaveText}>{isTvDevice ? 'QR Code' : 'Wave →'}</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>

                {/* ── FORMULAIRE DE DÉCLARATION WAVE (OPTION C) ── */}
                <View style={styles.claimBox}>
                  <View style={styles.claimHeaderRow}>
                    <Ionicons name="receipt-outline" size={16} color="#38bdf8" />
                    <Text style={styles.claimTitle}>Déclarer un paiement Wave effectué</Text>
                  </View>
                  <Text style={styles.claimSubtitle}>
                    Vous avez payé depuis votre Wave ou celui d'un proche ? Déclarez-le pour validation immédiate :
                  </Text>

                  {/* Choix du plan payé */}
                  <View style={styles.claimPlanRow}>
                    {(['1m', '3m', '12m'] as const).map((p) => {
                      const isSel = claimPlan === p;
                      const label = p === '1m' ? '1 Mois (3 000 F)' : p === '3m' ? '3 Mois (7 500 F)' : '12 Mois (25 000 F)';
                      return (
                        <Pressable
                          key={p}
                          focusable={true}
                          onPress={() => setClaimPlan(p)}
                          style={[styles.claimPlanPill, isSel && styles.claimPlanPillActive]}
                        >
                          <Text style={[styles.claimPlanText, isSel && styles.claimPlanTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Numéro Wave ayant payé */}
                  <Text style={styles.claimInputLabel}>Numéro Wave qui a envoyé l'argent :</Text>
                  <View style={styles.claimInputWrap}>
                    <Ionicons name="call-outline" size={15} color="#94a3b8" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.claimInput}
                      value={claimPayerPhone}
                      onChangeText={setClaimPayerPhone}
                      placeholder="Ex: 77 123 45 67"
                      placeholderTextColor="#64748b"
                      keyboardType="phone-pad"
                    />
                  </View>

                  {/* Réf Wave / TxID optionnel */}
                  <Text style={styles.claimInputLabel}>Réf de transaction ou Note Wave (optionnel) :</Text>
                  <View style={styles.claimInputWrap}>
                    <Ionicons name="pricetag-outline" size={15} color="#94a3b8" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.claimInput}
                      value={claimTxId}
                      onChangeText={setClaimTxId}
                      placeholder="Ex: TX-987654 ou Nom"
                      placeholderTextColor="#64748b"
                    />
                  </View>

                  {/* Bouton de validation */}
                  <Pressable
                    focusable={true}
                    disabled={isSubmittingClaim}
                    onPress={handleSubmitClaim}
                    style={({ pressed }) => [
                      styles.claimSubmitBtn,
                      isSubmittingClaim && { opacity: 0.6 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {isSubmittingClaim ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                        <Text style={styles.claimSubmitBtnText}>Valider mon paiement Wave</Text>
                      </>
                    )}
                  </Pressable>

                  {claimStatusMsg && (
                    <Text
                      style={[
                        styles.claimStatusText,
                        claimStatusMsg.type === 'error' && { color: '#ef4444' },
                      ]}
                    >
                      {claimStatusMsg.text}
                    </Text>
                  )}
                </View>

                <Pressable
                  focusable={true}
                  accessible={true}
                  onFocus={() => setFocusedActionBtn('wa')}
                  onBlur={() => setFocusedActionBtn((p) => (p === 'wa' ? null : p))}
                  style={({ pressed }) => [
                    styles.whatsappBtn,
                    focusedActionBtn === 'wa' && styles.actionBtnFocused,
                    pressed && { opacity: 0.85 }
                  ]}
                  onPress={handleWhatsApp}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25d366" />
                  <Text style={styles.whatsappText}>WhatsApp Support (+221 78 305 55 20)</Text>
                </Pressable>

                <Pressable
                  focusable={true}
                  accessible={true}
                  onFocus={() => setFocusedActionBtn('logout')}
                  onBlur={() => setFocusedActionBtn((p) => (p === 'logout' ? null : p))}
                  style={({ pressed }) => [
                    styles.logoutBtn,
                    focusedActionBtn === 'logout' && styles.actionBtnFocused,
                    pressed && { opacity: 0.8 }
                  ]}
                  onPress={handleLogout}
                >
                  <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                  <Text style={styles.logoutText}>Changer de compte / Déconnexion</Text>
                </Pressable>
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

                <Pressable
                  focusable={true}
                  accessible={true}
                  onFocus={() => setFocusedActionBtn('submit')}
                  onBlur={() => setFocusedActionBtn((p) => (p === 'submit' ? null : p))}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    isLoading && styles.btnDisabled,
                    focusedActionBtn === 'submit' && styles.actionBtnFocused,
                    pressed && { opacity: 0.85 }
                  ]}
                  onPress={handleAuth}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Activer mon Accès Gratuit</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={styles.helperFooter}>
                Si vous avez déjà un compte avec ce numéro, votre abonnement sera automatiquement restauré sur cet appareil.
              </Text>
            </View>
          )}

          {/* POPUP PLEIN ÉCRAN QR CODE DIRECT SANS AUCUN SCROLL SUR TV ET MOBILE */}
          {tvQrPlan && (
            <View style={styles.tvQrModalOverlay}>
              <View style={styles.tvQrModalCard}>
                <View style={styles.tvQrHeaderRow}>
                  <Ionicons name="qr-code" size={24} color="#38bdf8" />
                  <Text style={styles.tvQrTitle}>Paiement Direct Wave</Text>
                </View>
                <Text style={styles.tvQrPlan}>{tvQrPlan.label}</Text>
                <View style={styles.tvQrImageWrap}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(tvQrPlan.url)}&bgcolor=ffffff&color=000000&margin=8`,
                    }}
                    style={styles.tvQrImage}
                  />
                </View>
                <Text style={styles.tvQrInstruction}>
                  Pointez l'appareil photo ou l'application Wave de votre smartphone vers ce QR code pour valider votre Pass.
                </Text>
                <Pressable
                  focusable={true}
                  hasTVPreferredFocus={true}
                  onFocus={() => setFocusedActionBtn('qrClose')}
                  onBlur={() => setFocusedActionBtn((p) => (p === 'qrClose' ? null : p))}
                  style={({ pressed }) => [
                    styles.tvQrCloseBtn,
                    focusedActionBtn === 'qrClose' && styles.tvQrCloseBtnFocused,
                    pressed && { opacity: 0.8 }
                  ]}
                  onPress={() => setTvQrPlan(null)}
                >
                  <Text style={styles.tvQrCloseBtnText}>✕ Fermer le QR Code</Text>
                </Pressable>
              </View>
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
  // ── Focus & Overlay QR Code ──
  planCardFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: '#13283c',
    transform: [{ scale: 1.04 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  planWaveBadgeFocused: {
    backgroundColor: '#38bdf8',
  },
  closeBtnFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  actionBtnFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: '#13283c',
    transform: [{ scale: 1.03 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  tvQrModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7, 9, 14, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 100,
  },
  tvQrModalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#38bdf8',
    padding: 22,
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 16,
  },
  tvQrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tvQrImageWrap: {
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 12,
  },
  tvQrCloseBtn: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  tvQrCloseBtnFocused: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    backgroundColor: '#0284c7',
    transform: [{ scale: 1.05 }],
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  tvQrCloseBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  // ─── Déclaration de paiement Wave ───
  claimBox: {
    backgroundColor: '#0c1322',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  claimHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  claimTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
  },
  claimSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 10,
  },
  claimPlanRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  claimPlanPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#161f36',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimPlanPillActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
  },
  claimPlanText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  claimPlanTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  claimInputLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  claimInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161f36',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    height: 38,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  claimInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12.5,
    paddingVertical: 0,
  },
  claimSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    height: 40,
    marginTop: 4,
  },
  claimSubmitBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  claimStatusText: {
    color: '#22c55e',
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
