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
        isReported: (id) => reportedChannelsCache.has(String(id))
    };

})();
