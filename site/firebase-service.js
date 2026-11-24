/**
 * BOKK TV — Firebase Cloud Firestore Service
 * Gestion en temps réel des signalements, désactivations et statut des chaînes
 */

(function () {
    'use strict';

    const firebaseConfig = {
        apiKey: "AIzaSyCjLE8JX5n2CrtEwvX-SyYnjVeEgHkQJyM",
        authDomain: "bokk-tv.firebaseapp.com",
        projectId: "bokk-tv",
        storageBucket: "bokk-tv.firebasestorage.app",
        messagingSenderId: "443418260603",
        appId: "1:443418260603:web:ab318434ec88dd8e599ede"
    };

    let db = null;
    let isInitialized = false;
    let reportedChannelsCache = new Set();
    let disabledChannelsCache = new Set();

    try {
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isInitialized = true;
            console.log('[BOKK TV] 🔥 Firebase Firestore initialisé !');
        } else if (typeof firebase !== 'undefined' && firebase.apps.length) {
            db = firebase.firestore();
            isInitialized = true;
        }
    } catch (e) {
        console.warn('[BOKK TV] Erreur initialisation Firebase:', e);
    }

    // ── Signalement de chaîne HS ──
    async function reportBrokenChannel(channel, errorDetails = 'flux_indisponible') {
        if (!channel || !channel.id) return { success: false };
        reportedChannelsCache.add(String(channel.id));

        if (!isInitialized || !db) return { success: true, localOnly: true };

        try {
            const docRef = db.collection('reported_channels').doc(String(channel.id));
            const doc = await docRef.get();

            if (doc.exists) {
                await docRef.update({
                    reportCount: firebase.firestore.FieldValue.increment(1),
                    lastReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastError: errorDetails
                });
            } else {
                await docRef.set({
                    channelId: channel.id,
                    name: channel.name || 'Inconnue',
                    group: channel.group || channel.category || 'Général',
                    url: channel.url || '',
                    reportCount: 1,
                    firstReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastError: errorDetails,
                    status: 'reported'
                });
            }
            return { success: true };
        } catch (err) {
            console.warn('[BOKK TV] Erreur Firestore report:', err);
            return { success: false, error: err.message };
        }
    }

    // ── Récupérer les signalements ──
    async function getReportedChannels() {
        if (!isInitialized || !db) return [];
        try {
            const snapshot = await db.collection('reported_channels')
                .orderBy('reportCount', 'desc')
                .limit(300)
                .get();

            const reports = [];
            snapshot.forEach(doc => reports.push({ id: doc.id, ...doc.data() }));
            return reports;
        } catch (err) {
            console.warn('[BOKK TV] Erreur lecture reports:', err);
            return [];
        }
    }

    // ── Supprimer un signalement ──
    async function deleteReport(channelId) {
        if (!channelId) return;
        reportedChannelsCache.delete(String(channelId));
        if (isInitialized && db) {
            try {
                await db.collection('reported_channels').doc(String(channelId)).delete();
            } catch (e) {}
        }
    }

    // ── DÉSACTIVER UNE CHAÎNE POUR TOUS LES UTILISATEURS (ADMIN) ──
    async function disableChannel(channelId, channelData = {}) {
        if (!channelId) return { success: false };
        const idStr = String(channelId);
        disabledChannelsCache.add(idStr);

        if (!isInitialized || !db) return { success: true, localOnly: true };

        try {
            await db.collection('disabled_channels').doc(idStr).set({
                channelId: channelId,
                name: channelData.name || '',
                group: channelData.group || '',
                disabledAt: firebase.firestore.FieldValue.serverTimestamp(),
                reason: channelData.reason || 'admin_disabled'
            });
            return { success: true };
        } catch (err) {
            console.warn('[BOKK TV] Erreur disableChannel:', err);
            return { success: false, error: err.message };
        }
    }

    // ── RÉACTIVER UNE CHAÎNE (ADMIN) ──
    async function enableChannel(channelId) {
        if (!channelId) return { success: false };
        const idStr = String(channelId);
        disabledChannelsCache.delete(idStr);

        if (!isInitialized || !db) return { success: true };

        try {
            await db.collection('disabled_channels').doc(idStr).delete();
            return { success: true };
        } catch (err) {
            console.warn('[BOKK TV] Erreur enableChannel:', err);
            return { success: false, error: err.message };
        }
    }

    // ── Récupérer la liste des chaînes désactivées ──
    async function getDisabledChannels() {
        if (!isInitialized || !db) return Array.from(disabledChannelsCache);

        try {
            const snapshot = await db.collection('disabled_channels').get();
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.id);
                disabledChannelsCache.add(doc.id);
            });
            return list;
        } catch (err) {
            console.warn('[BOKK TV] Erreur getDisabledChannels:', err);
            return Array.from(disabledChannelsCache);
        }
    }

    // ── Écouter les chaînes désactivées en temps réel ──
    function listenDisabledChannels(callback) {
        if (!isInitialized || !db) return () => {};

        try {
            return db.collection('disabled_channels').onSnapshot(snapshot => {
                const disabledIds = new Set();
                snapshot.forEach(doc => disabledIds.add(String(doc.id)));
                disabledChannelsCache = disabledIds;
                if (typeof callback === 'function') {
                    callback(Array.from(disabledIds));
                }
            }, err => console.warn(err));
        } catch (e) {
            return () => {};
        }
    }

    // ── Écouter les signalements en temps réel ──
    function listenToReportedChannels(callback) {
        if (!isInitialized || !db) return () => {};

        try {
            return db.collection('reported_channels').onSnapshot(snapshot => {
                const reports = [];
                snapshot.forEach(doc => {
                    reports.push({ id: doc.id, ...doc.data() });
                    reportedChannelsCache.add(String(doc.id));
                });
                if (typeof callback === 'function') callback(reports);
            }, err => console.warn(err));
        } catch (e) {
            return () => {};
        }
    }


    // ── GESTION DES ABONNÉS / IDENTIFIANTS UNIQUE (ID) BASÉS SUR LE NUMÉRO ──

    /**
     * Valide et normalise un numéro de téléphone (Sénégal ou International)
     * Règle anti-chiffres au hasard et calcul direct de l'ID BOKK TV
     */
    function validateAndFormatPhone(raw) {
        if (!raw) return { valid: false, error: 'Numéro de téléphone requis.' };
        const trimmed = String(raw).trim();
        // Supprimer espaces, points, tirets, parenthèses
        let clean = trimmed.replace(/[\s\.\-\(\)]/g, '');
        if (clean.startsWith('00')) clean = '+' + clean.slice(2);

        // Détection format Sénégal
        let national = '';
        if (clean.startsWith('+221')) {
            national = clean.slice(4);
        } else if (clean.startsWith('221') && clean.length === 12) {
            national = clean.slice(3);
        } else if (/^(70|75|76|77|78)\d{7}$/.test(clean)) {
            national = clean;
        }

        if (national) {
            // Validation préfixe Sénégal : 70 (Expresso), 75 (Promobile), 76 (Free), 77 (Orange), 78 (Orange)
            if (!/^(70|75|76|77|78)\d{7}$/.test(national)) {
                return {
                    valid: false,
                    error: 'Numéro sénégalais invalide. Le numéro doit comporter 9 chiffres et commencer par 70, 75, 76, 77 ou 78.'
                };
            }
            // Détection de faux numéros (séries de chiffres identiques : 777777777, 000000000, 111111111)
            if (/^(\d)\1{8}$/.test(national) || /^7[0-8](\d)\1{6}$/.test(national)) {
                return { valid: false, error: 'Numéro non valide (suite de chiffres suspects ou répétitifs).' };
            }

            return {
                valid: true,
                isSenegal: true,
                national: national,
                e164: '+221' + national,
                display: national.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
                id: 'BK-' + national
            };
        }

        // Format International avec indicatif (+) suivi de 8 à 15 chiffres valides
        if (/^\+[1-9]\d{7,14}$/.test(clean)) {
            const digits = clean.replace(/\D/g, '');
            if (/^(\d)\1{7,}$/.test(digits)) {
                return { valid: false, error: 'Numéro international non valide (chiffres répétés).' };
            }
            return {
                valid: true,
                isSenegal: false,
                national: digits,
                e164: clean,
                display: clean,
                id: 'BK-' + digits
            };
        }

        return {
            valid: false,
            error: 'Format invalide. Entrez un numéro sénégalais (ex: 77 123 45 67) ou international (+33...).'
        };
    }

    function generateSubscriberId(phoneVal) {
        if (phoneVal && phoneVal.id) return phoneVal.id;
        const num = Math.floor(1000 + Math.random() * 9000);
        return 'BK-' + num;
    }

    async function registerSubscriber(prenom, phone = '') {
        const cleanPrenom = (prenom || '').trim();
        if (!cleanPrenom) return { success: false, error: 'prenom_required' };

        // 1. Validation stricte du numéro de téléphone
        const phoneVal = validateAndFormatPhone(phone);
        if (!phoneVal.valid) {
            return { success: false, error: phoneVal.error || 'phone_invalid' };
        }

        const id = phoneVal.id; // Ex: "BK-771234567"
        const cleanPhone = phoneVal.national;

        // 2. Règle "Un compte = Un numéro" : vérifier si le compte existe déjà
        if (isInitialized && db) {
            try {
                // Recherche par ID direct
                const docRef = db.collection('subscribers').doc(id);
                const doc = await docRef.get();
                if (doc.exists) {
                    const data = doc.data();
                    const expDate = data.expiresAt ? (typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : new Date(data.expiresAt)) : new Date();
                    const isExpired = expDate.getTime() < Date.now();
                    const existingSub = {
                        id: doc.id,
                        prenom: data.prenom || cleanPrenom,
                        phone: data.phone || cleanPhone,
                        phoneDisplay: phoneVal.display,
                        createdAt: formatFirestoreTimestamp(data.createdAt),
                        expiresAt: expDate.toISOString(),
                        status: isExpired ? 'expired' : (data.status || 'active')
                    };
                    try {
                        localStorage.setItem('bokk_subscriber', JSON.stringify(existingSub));
                        localStorage.setItem('bokk_sub_id', existingSub.id);
                    } catch (e) {}
                    console.log('[BOKK TV] 🔄 Compte existant retrouvé pour ce numéro:', id);
                    return { success: true, subscriber: existingSub, alreadyExists: true };
                }

                // Recherche alternative par champ 'phone'
                const phoneQuery = await db.collection('subscribers').where('phone', '==', cleanPhone).limit(1).get();
                if (!phoneQuery.empty) {
                    const foundDoc = phoneQuery.docs[0];
                    const data = foundDoc.data();
                    const expDate = data.expiresAt ? (typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : new Date(data.expiresAt)) : new Date();
                    const isExpired = expDate.getTime() < Date.now();
                    const existingSub = {
                        id: foundDoc.id,
                        prenom: data.prenom || cleanPrenom,
                        phone: data.phone || cleanPhone,
                        phoneDisplay: phoneVal.display,
                        createdAt: formatFirestoreTimestamp(data.createdAt),
                        expiresAt: expDate.toISOString(),
                        status: isExpired ? 'expired' : (data.status || 'active')
                    };
                    try {
                        localStorage.setItem('bokk_subscriber', JSON.stringify(existingSub));
                        localStorage.setItem('bokk_sub_id', existingSub.id);
                    } catch (e) {}
                    console.log('[BOKK TV] 🔄 Compte existant retrouvé par téléphone:', foundDoc.id);
                    return { success: true, subscriber: existingSub, alreadyExists: true };
                }
            } catch (err) {
                console.warn('[BOKK TV] Erreur vérification compte existant:', err);
            }
        }

        // 3. Nouveau compte : création avec 30 jours offerts
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const subData = {
            id: id,
            prenom: cleanPrenom,
            phone: cleanPhone,
            phoneDisplay: phoneVal.display,
            phoneE164: phoneVal.e164,
            createdAt: (isInitialized && db) ? firebase.firestore.FieldValue.serverTimestamp() : now.toISOString(),
            expiresAt: (isInitialized && db) ? firebase.firestore.Timestamp.fromDate(expiresAt) : expiresAt.toISOString(),
            status: 'active'
        };
        console.log('[BOKK TV] ✨ Création nouvel abonné unique:', id, cleanPrenom, cleanPhone);

        if (isInitialized && db) {
            try {
                await db.collection('subscribers').doc(id).set(subData);
            } catch (e) {
                console.warn('[BOKK TV] Erreur Firestore register:', e);
            }
        }

        const localData = {
            id,
            prenom: cleanPrenom,
            phone: cleanPhone,
            phoneDisplay: phoneVal.display,
            phoneE164: phoneVal.e164,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            status: 'active'
        };
        try {
            localStorage.setItem('bokk_subscriber', JSON.stringify(localData));
            localStorage.setItem('bokk_sub_id', id);
        } catch (e) {}

        return { success: true, subscriber: localData, isNew: true };
    }

    async function loginSubscriber(idOrPhone) {
        const raw = (idOrPhone || '').trim();
        if (!raw) return { success: false, error: 'id_required' };

        // Déterminer les clés de recherche possibles
        let directKey = raw.toUpperCase();
        let phoneSearch = '';

        // Si l'utilisateur saisit un numéro (avec ou sans espaces), calculer l'ID BK-<phone>
        const phoneVal = validateAndFormatPhone(raw);
        if (phoneVal.valid) {
            directKey = phoneVal.id; // Ex: "BK-771234567"
            phoneSearch = phoneVal.national;
        } else {
            // Nettoyage au cas où il a tapé "BK-77..." ou "77..."
            const digits = raw.replace(/\D/g, '');
            if (digits.length >= 6) {
                phoneSearch = digits;
                if (!directKey.startsWith('BK-')) {
                    directKey = 'BK-' + digits;
                }
            }
        }

        if (!isInitialized || !db) {
            try {
                const local = JSON.parse(localStorage.getItem('bokk_subscriber') || 'null');
                if (local && (local.id.toUpperCase() === directKey || (local.phone && local.phone === phoneSearch))) {
                    return { success: true, subscriber: local };
                }
            } catch(e) {}
            return { success: false, error: 'not_found' };
        }

        try {
            // 1. Tenter par ID direct (BK-771234567 ou BK-XXXX)
            let doc = await db.collection('subscribers').doc(directKey).get();

            // 2. Si non trouvé et qu'un numéro existe, chercher par where('phone', '==', phoneSearch)
            if (!doc.exists && phoneSearch) {
                const qSnap = await db.collection('subscribers').where('phone', '==', phoneSearch).limit(1).get();
                if (!qSnap.empty) {
                    doc = qSnap.docs[0];
                }
            }

            // 3. Si toujours non trouvé, tenter recherche insensible à la casse ou clé brute
            if (!doc.exists && directKey !== raw.toUpperCase()) {
                const rawDoc = await db.collection('subscribers').doc(raw.toUpperCase()).get();
                if (rawDoc.exists) doc = rawDoc;
            }

            if (!doc.exists) {
                return { success: false, error: 'not_found' };
            }

            const data = doc.data();
            const expDate = data.expiresAt ? (typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : new Date(data.expiresAt)) : new Date();
            const isExpired = expDate.getTime() < Date.now();

            const sub = {
                id: doc.id,
                prenom: data.prenom || 'Abonné',
                phone: data.phone || phoneSearch || '',
                phoneDisplay: data.phoneDisplay || data.phone || '',
                createdAt: formatFirestoreTimestamp(data.createdAt),
                expiresAt: expDate.toISOString(),
                status: isExpired ? 'expired' : (data.status || 'active')
            };

            try {
                localStorage.setItem('bokk_subscriber', JSON.stringify(sub));
                localStorage.setItem('bokk_sub_id', sub.id);
            } catch(e) {}

            return { success: true, subscriber: sub };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function getCurrentSubscriber() {
        try {
            return JSON.parse(localStorage.getItem('bokk_subscriber') || 'null');
        } catch (e) {
            return null;
        }
    }

    function logoutSubscriber() {
        try {
            localStorage.removeItem('bokk_subscriber');
            localStorage.removeItem('bokk_sub_id');
        } catch (e) {}
    }

    function formatFirestoreTimestamp(val) {
        if (!val) return '';
        try {
            if (typeof val.toDate === 'function') return val.toDate().toISOString();
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'string') return val;
        } catch (e) {}
        return '';
    }

    async function renewSubscriber(id, days = 30) {
        if (!id || !isInitialized || !db) return { success: false };
        try {
            const docRef = db.collection('subscribers').doc(String(id));
            const doc = await docRef.get();
            if (!doc.exists) return { success: false, error: 'not_found' };

            const data = doc.data();
            let baseDate = new Date();
            if (data.expiresAt) {
                const curExp = (typeof data.expiresAt.toDate === 'function') ? data.expiresAt.toDate() : new Date(data.expiresAt);
                if (curExp.getTime() > Date.now()) {
                    baseDate = curExp;
                }
            }
            const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

            await docRef.update({
                expiresAt: firebase.firestore.Timestamp.fromDate(newExpiry),
                status: 'active',
                lastRenewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, newExpiry: newExpiry.toISOString() };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function updateSubscriberStatus(id, newStatus) {
        if (!id || !isInitialized || !db) return { success: false };
        try {
            await db.collection('subscribers').doc(String(id)).update({
                status: newStatus
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function deleteSubscriber(id) {
        if (!id || !isInitialized || !db) return { success: false };
        try {
            await db.collection('subscribers').doc(String(id)).delete();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function clearActiveSession(id) {
        if (!id || !isInitialized || !db) return { success: false };
        try {
            await db.collection('subscribers').doc(String(id)).update({
                activeSessionId: '',
                activeDeviceName: ''
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function listenSubscribers(callback) {
        if (!isInitialized || !db) return () => {};
        try {
            return db.collection('subscribers')
                .onSnapshot(snapshot => {
                    const list = [];
                    snapshot.forEach(doc => {
                        const d = doc.data() || {};
                        list.push({
                            id: doc.id,
                            prenom: d.prenom || '',
                            phone: d.phone || '',
                            createdAt: formatFirestoreTimestamp(d.createdAt),
                            expiresAt: formatFirestoreTimestamp(d.expiresAt),
                            status: d.status || 'active',
                            activeSessionId: d.activeSessionId || '',
                            activeDeviceName: d.activeDeviceName || '',
                            lastActiveAt: formatFirestoreTimestamp(d.lastActiveAt)
                        });
                    });
                    // Tri en mémoire par date décroissante
                    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                    if (typeof callback === 'function') callback(list);
                }, err => console.warn('[BOKK TV] Erreur listenSubscribers:', err));
        } catch (e) {
            console.warn('[BOKK TV] Exception listenSubscribers:', e);
            return () => {};
        }
    }

    function listenSubscriber(id, callback) {
        if (!id || !isInitialized || !db) return () => {};
        try {
            return db.collection('subscribers').doc(String(id))
                .onSnapshot(doc => {
                    if (doc.exists) {
                        const d = doc.data() || {};
                        const subObj = {
                            id: doc.id,
                            prenom: d.prenom || '',
                            phone: d.phone || '',
                            createdAt: formatFirestoreTimestamp(d.createdAt),
                            expiresAt: formatFirestoreTimestamp(d.expiresAt),
                            status: d.status || 'active'
                        };
                        if (typeof callback === 'function') callback(subObj);
                    }
                }, err => console.warn('[BOKK TV] Erreur listenSubscriber:', err));
        } catch (e) {
            return () => {};
        }
    }

    async function getPaywallConfig() {
        if (!isInitialized || !db) return { paywallEnabled: false };
        try {
            const doc = await db.collection('app_config').doc('paywall').get();
            if (doc.exists) return doc.data();
            return { paywallEnabled: false };
        } catch (e) {
            return { paywallEnabled: false };
        }
    }

    async function setPaywallConfig(enabled) {
        if (!isInitialized || !db) return { success: false };
        try {
            await db.collection('app_config').doc('paywall').set({
                paywallEnabled: !!enabled,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ── GESTION DES PLAYLISTS M3U ADMIN (AJOUT DE NOUVELLES CHAÎNES) ──

    async function saveM3uPlaylist(name, url, channels) {
        if (!isInitialized || !db) return { success: false, error: 'Firebase non disponible' };
        if (!channels || !channels.length) return { success: false, error: 'Aucune chaîne à sauvegarder' };

        try {
            const playlistId = 'm3u_' + Date.now();
            const cleanName = (name || 'Playlist M3U').trim();
            const cleanUrl = (url || '').trim();

            // 1. Sauvegarder la métadonnée de la playlist
            await db.collection('m3u_playlists').doc(playlistId).set({
                id: playlistId,
                name: cleanName,
                url: cleanUrl,
                channelCount: channels.length,
                enabled: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 2. Sauvegarder les chaînes par morceaux de 300 pour garantir la rapidité et la limite Firestore 1MB
            const CHUNK_SIZE = 300;
            const chunkPromises = [];
            for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
                const chunk = channels.slice(i, i + CHUNK_SIZE);
                const chunkIdx = Math.floor(i / CHUNK_SIZE);
                chunkPromises.push(
                    db.collection('m3u_playlists').doc(playlistId)
                      .collection('chunks').doc(String(chunkIdx))
                      .set({
                          chunkIndex: chunkIdx,
                          channelsJson: JSON.stringify(chunk)
                      })
                );
            }
            await Promise.all(chunkPromises);

            console.log(`[BOKK TV] 💾 Playlist M3U enregistrée: "${cleanName}" (${channels.length} chaînes)`);
            return { success: true, playlistId: playlistId, channelCount: channels.length };
        } catch (err) {
            console.error('[BOKK TV] Erreur saveM3uPlaylist:', err);
            return { success: false, error: err.message };
        }
    }

    async function getM3uPlaylists() {
        if (!isInitialized || !db) return [];
        try {
            const snapshot = await db.collection('m3u_playlists').get();
            const list = [];
            snapshot.forEach(doc => {
                const d = doc.data() || {};
                list.push({
                    id: doc.id,
                    name: d.name || 'Playlist',
                    url: d.url || '',
                    channelCount: d.channelCount || 0,
                    enabled: d.enabled !== false,
                    createdAt: formatFirestoreTimestamp(d.createdAt),
                    updatedAt: formatFirestoreTimestamp(d.updatedAt)
                });
            });
            list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            return list;
        } catch (err) {
            console.warn('[BOKK TV] Erreur getM3uPlaylists:', err);
            return [];
        }
    }

    async function toggleM3uPlaylist(playlistId, enabled) {
        if (!playlistId || !isInitialized || !db) return { success: false };
        try {
            await db.collection('m3u_playlists').doc(String(playlistId)).update({
                enabled: !!enabled,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function deleteM3uPlaylist(playlistId) {
        if (!playlistId || !isInitialized || !db) return { success: false };
        try {
            // Supprimer les chunks
            const chunksSnap = await db.collection('m3u_playlists').doc(String(playlistId)).collection('chunks').get();
            const delPromises = [];
            chunksSnap.forEach(cd => delPromises.push(cd.ref.delete()));
            await Promise.all(delPromises);

            // Supprimer le doc parent
            await db.collection('m3u_playlists').doc(String(playlistId)).delete();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    function listenM3uPlaylists(callback) {
        if (!isInitialized || !db) return () => {};
        try {
            return db.collection('m3u_playlists')
                .onSnapshot(snapshot => {
                    const list = [];
                    snapshot.forEach(doc => {
                        const d = doc.data() || {};
                        list.push({
                            id: doc.id,
                            name: d.name || 'Playlist',
                            url: d.url || '',
                            channelCount: d.channelCount || 0,
                            enabled: d.enabled !== false,
                            createdAt: formatFirestoreTimestamp(d.createdAt),
                            updatedAt: formatFirestoreTimestamp(d.updatedAt)
                        });
                    });
                    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                    if (typeof callback === 'function') callback(list);
                }, err => console.warn('[BOKK TV] Erreur listenM3uPlaylists:', err));
        } catch (e) {
            return () => {};
        }
    }

    async function getActiveM3uChannels() {
        if (!isInitialized || !db) return [];
        try {
            const playlistsSnap = await db.collection('m3u_playlists').where('enabled', '==', true).get();
            if (playlistsSnap.empty) return [];

            const allChannels = [];
            const chunkPromises = [];

            playlistsSnap.forEach(doc => {
                chunkPromises.push(
                    doc.ref.collection('chunks').get().then(cs => {
                        cs.forEach(cd => {
                            const data = cd.data();
                            if (data && data.channelsJson) {
                                try {
                                    const parsed = JSON.parse(data.channelsJson);
                                    if (Array.isArray(parsed)) allChannels.push(...parsed);
                                } catch (e) {}
                            }
                        });
                    })
                );
            });

            await Promise.all(chunkPromises);
            return allChannels;
        } catch (err) {
            console.warn('[BOKK TV] Erreur getActiveM3uChannels:', err);
            return [];
        }
    }

    function listenActiveM3uChannels(callback) {
        if (!isInitialized || !db) return () => {};
        try {
            return db.collection('m3u_playlists').onSnapshot(async () => {
                const channels = await getActiveM3uChannels();
                if (typeof callback === 'function') callback(channels);
            }, err => console.warn('[BOKK TV] Erreur listenActiveM3uChannels:', err));
        } catch (e) {
            return () => {};
        }
    }

    // ── Gestion des Déclarations de Paiements Wave ──
    async function submitPaymentClaim(claimData) {
        if (!isInitialized || !db) return { success: false, error: 'Firebase non initialisé' };
        try {
            const subId = String(claimData.subscriberId || '').trim();
            const payer = String(claimData.payerPhone || '').trim();
            if (!subId) return { success: false, error: 'Compte BOKK TV requis' };
            if (!payer) return { success: false, error: 'Numéro Wave payeur requis' };

            const claimId = `${subId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
            await db.collection('payment_claims').doc(claimId).set({
                claimId: claimId,
                subscriberId: subId,
                subscriberName: claimData.subscriberName || '',
                payerPhone: payer,
                plan: claimData.plan || '1m',
                amount: Number(claimData.amount) || 3000,
                days: Number(claimData.days) || 30,
                txId: (claimData.txId || claimData.waveRef || '').trim(),
                autoCreated: claimData.autoCreated !== false, // Vrai par défaut au clic sur Payer
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('[BOKK TV] 💰 Intention de paiement Wave enregistrée:', claimId, subId, payer);
            return { success: true, claimId: claimId };
        } catch (e) {
            console.error('[BOKK TV] Erreur submitPaymentClaim:', e);
            return { success: false, error: e.message };
        }
    }

    function listenPaymentClaims(callback) {
        if (!isInitialized || !db) return () => {};
        try {
            return db.collection('payment_claims')
                .onSnapshot(snapshot => {
                    const list = [];
                    snapshot.forEach(doc => {
                        const d = doc.data() || {};
                        list.push({
                            id: doc.id,
                            claimId: d.claimId || doc.id,
                            subscriberId: d.subscriberId || '',
                            subscriberName: d.subscriberName || '',
                            payerPhone: d.payerPhone || '',
                            plan: d.plan || '1m',
                            amount: d.amount || 3000,
                            days: d.days || 30,
                            txId: d.txId || '',
                            status: d.status || 'pending',
                            createdAt: formatFirestoreTimestamp(d.createdAt),
                            approvedAt: formatFirestoreTimestamp(d.approvedAt),
                            rejectedAt: formatFirestoreTimestamp(d.rejectedAt)
                        });
                    });
                    // Tri par date décroissante
                    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                    if (typeof callback === 'function') callback(list);
                }, err => console.warn('[BOKK TV] Erreur listenPaymentClaims:', err));
        } catch (e) {
            console.warn('[BOKK TV] Exception listenPaymentClaims:', e);
            return () => {};
        }
    }

    async function approvePaymentClaim(claimId, subscriberId, days = 30) {
        if (!claimId || !isInitialized || !db) return { success: false };
        try {
            const renewRes = await renewSubscriber(subscriberId, days);
            if (!renewRes.success) {
                console.warn('[BOKK TV] Erreur renewSubscriber dans approvePaymentClaim:', renewRes.error);
            }

            await db.collection('payment_claims').doc(String(claimId)).update({
                status: 'approved',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (e) {
            console.error('[BOKK TV] Erreur approvePaymentClaim:', e);
            return { success: false, error: e.message };
        }
    }

    async function rejectPaymentClaim(claimId, reason = '') {
        if (!claimId || !isInitialized || !db) return { success: false };
        try {
            await db.collection('payment_claims').doc(String(claimId)).update({
                status: 'rejected',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectReason: reason
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    window.BokkFirebase = {
        isReady: () => isInitialized,
        reportBroken: reportBrokenChannel,
        getReports: getReportedChannels,
        deleteReport: deleteReport,
        listenReports: listenToReportedChannels,
        disableChannel: disableChannel,
        enableChannel: enableChannel,
        getDisabledChannels: getDisabledChannels,
        listenDisabledChannels: listenDisabledChannels,
        isDisabled: (id) => disabledChannelsCache.has(String(id)),
        isReported: (id) => reportedChannelsCache.has(String(id)),

        // Gestion des abonnés & ID
        validatePhone: validateAndFormatPhone,
        registerSubscriber: registerSubscriber,
        loginSubscriber: loginSubscriber,
        getCurrentSubscriber: getCurrentSubscriber,
        logoutSubscriber: logoutSubscriber,
        renewSubscriber: renewSubscriber,
        updateSubscriberStatus: updateSubscriberStatus,
        deleteSubscriber: deleteSubscriber,
        clearActiveSession: clearActiveSession,
        listenSubscribers: listenSubscribers,
        listenSubscriber: listenSubscriber,
        getPaywallConfig: getPaywallConfig,
        setPaywallConfig: setPaywallConfig,

        // Gestion des réclamations de paiements Wave (Option C)
        submitPaymentClaim: submitPaymentClaim,
        listenPaymentClaims: listenPaymentClaims,
        approvePaymentClaim: approvePaymentClaim,
        rejectPaymentClaim: rejectPaymentClaim,

        // Gestion des playlists M3U Admin
        saveM3uPlaylist: saveM3uPlaylist,
        getM3uPlaylists: getM3uPlaylists,
        toggleM3uPlaylist: toggleM3uPlaylist,
        deleteM3uPlaylist: deleteM3uPlaylist,
        listenM3uPlaylists: listenM3uPlaylists,
        getActiveM3uChannels: getActiveM3uChannels,
        listenActiveM3uChannels: listenActiveM3uChannels
    };

})();
