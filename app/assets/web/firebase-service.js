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


    // ── GESTION DES ABONNÉS / IDENTIFIANTS UNIQUE (ID) ──

    function generateSubscriberId() {
        const num = Math.floor(1000 + Math.random() * 9000);
        return 'BK-' + num;
    }

    async function registerSubscriber(prenom, phone = '') {
        const cleanPrenom = (prenom || '').trim();
        if (!cleanPrenom) return { success: false, error: 'prenom_required' };

        const id = generateSubscriberId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const subData = {
            id: id,
            prenom: cleanPrenom,
            phone: (phone || '').trim(),
            createdAt: firebase ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
            expiresAt: firebase ? firebase.firestore.Timestamp.fromDate(expiresAt) : expiresAt,
            status: 'active'
        };

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
            phone: (phone || '').trim(),
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            status: 'active'
        };
        try {
            localStorage.setItem('bokk_subscriber', JSON.stringify(localData));
            localStorage.setItem('bokk_sub_id', id);
        } catch (e) {}

        return { success: true, subscriber: localData };
    }

    async function loginSubscriber(id) {
        const cleanId = (id || '').trim().toUpperCase();
        if (!cleanId) return { success: false, error: 'id_required' };

        if (!isInitialized || !db) {
            try {
                const local = JSON.parse(localStorage.getItem('bokk_subscriber') || 'null');
                if (local && local.id.toUpperCase() === cleanId) {
                    return { success: true, subscriber: local };
                }
            } catch(e) {}
            return { success: false, error: 'not_found' };
        }

        try {
            const doc = await db.collection('subscribers').doc(cleanId).get();
            if (!doc.exists) {
                return { success: false, error: 'not_found' };
            }
            const data = doc.data();
            const expDate = data.expiresAt ? data.expiresAt.toDate() : new Date();
            const isExpired = expDate.getTime() < Date.now();

            const sub = {
                id: doc.id,
                prenom: data.prenom || 'Abonné',
                phone: data.phone || '',
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
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

    async function renewSubscriber(id, days = 30) {
        if (!id || !isInitialized || !db) return { success: false };
        try {
            const docRef = db.collection('subscribers').doc(String(id));
            const doc = await docRef.get();
            if (!doc.exists) return { success: false, error: 'not_found' };

            const data = doc.data();
            let baseDate = new Date();
            if (data.expiresAt) {
                const curExp = data.expiresAt.toDate();
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

    function listenSubscribers(callback) {
        if (!isInitialized || !db) return () => {};
        try {
            return db.collection('subscribers')
                .orderBy('createdAt', 'desc')
                .limit(500)
                .onSnapshot(snapshot => {
                    const list = [];
                    snapshot.forEach(doc => {
                        const d = doc.data();
                        list.push({
                            id: doc.id,
                            prenom: d.prenom || '',
                            phone: d.phone || '',
                            createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : '',
                            expiresAt: d.expiresAt ? d.expiresAt.toDate().toISOString() : '',
                            status: d.status || 'active'
                        });
                    });
                    if (typeof callback === 'function') callback(list);
                }, err => console.warn(err));
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
        registerSubscriber: registerSubscriber,
        loginSubscriber: loginSubscriber,
        getCurrentSubscriber: getCurrentSubscriber,
        logoutSubscriber: logoutSubscriber,
        renewSubscriber: renewSubscriber,
        updateSubscriberStatus: updateSubscriberStatus,
        deleteSubscriber: deleteSubscriber,
        listenSubscribers: listenSubscribers,
        getPaywallConfig: getPaywallConfig,
        setPaywallConfig: setPaywallConfig
    };

})();
