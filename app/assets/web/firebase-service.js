/**
 * BOKK TV — Firebase Cloud Firestore Service
 * Gestion en temps réel des signalements de chaînes et synchronisation Cloud
 */

(function () {
    'use strict';

    // Configuration Firebase fournie
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
    let brokenChannelsCache = new Set();

    // Initialisation
    try {
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isInitialized = true;
            console.log('[BOKK TV] 🔥 Firebase Firestore initialisé avec succès !');
        } else if (typeof firebase !== 'undefined' && firebase.apps.length) {
            db = firebase.firestore();
            isInitialized = true;
        }
    } catch (e) {
        console.warn('[BOKK TV] Impossible d\'initialiser Firebase Firestore:', e);
    }

    /**
     * Signaler une chaîne qui ne fonctionne pas
     * @param {Object} channel { id, name, group, url }
     * @param {string} errorDetails motif (ex: network_error, 404, direct)
     */
    async function reportBrokenChannel(channel, errorDetails = 'flux_indisponible') {
        if (!channel || !channel.id) return { success: false, error: 'invalid_channel' };

        // Enregistrement local immédiat
        reportedChannelsCache.add(String(channel.id));

        if (!isInitialized || !db) {
            console.warn('[BOKK TV] Firebase non connecté, signalement gardé en local');
            saveLocalReport(channel, errorDetails);
            return { success: true, localOnly: true };
        }

        try {
            const docRef = db.collection('reported_channels').doc(String(channel.id));
            const doc = await docRef.get();

            if (doc.exists) {
                // Incrémenter le nombre de signalements
                await docRef.update({
                    reportCount: firebase.firestore.FieldValue.increment(1),
                    lastReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastError: errorDetails
                });
            } else {
                // Créer le signalement
                await docRef.set({
                    channelId: channel.id,
                    name: channel.name || 'Inconnue',
                    group: channel.group || channel.category || 'Général',
                    url: channel.url || '',
                    reportCount: 1,
                    firstReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastReportedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastError: errorDetails,
                    status: 'reported' // 'reported' | 'confirmed_broken' | 'resolved'
                });
            }

            console.log(`[BOKK TV] ✅ Signalement envoyé à Firebase pour #${channel.id} ${channel.name}`);
            return { success: true };
        } catch (err) {
            console.warn('[BOKK TV] Erreur envoi signalement Firebase:', err);
            saveLocalReport(channel, errorDetails);
            return { success: false, error: err.message };
        }
    }

    /**
     * Récupérer toutes les chaînes signalées depuis Firestore
     */
    async function getReportedChannels() {
        if (!isInitialized || !db) {
            return getLocalReports();
        }

        try {
            const snapshot = await db.collection('reported_channels')
                .orderBy('reportCount', 'desc')
                .limit(200)
                .get();

            const reports = [];
            snapshot.forEach(doc => {
                reports.push({ id: doc.id, ...doc.data() });
            });
            return reports;
        } catch (err) {
            console.warn('[BOKK TV] Erreur lecture Firestore:', err);
            return getLocalReports();
        }
    }

    /**
     * Supprimer un signalement (si la chaîne refonctionne)
     */
    async function deleteReport(channelId) {
        if (!channelId) return;
        reportedChannelsCache.delete(String(channelId));

        if (isInitialized && db) {
            try {
                await db.collection('reported_channels').doc(String(channelId)).delete();
            } catch (e) {
                console.warn(e);
            }
        }
    }

    // Sauvegarde de secours en LocalStorage
    function saveLocalReport(channel, errorDetails) {
        try {
            const list = JSON.parse(localStorage.getItem('bokk_reported_channels') || '[]');
            const exists = list.find(item => item.id === channel.id);
            if (exists) {
                exists.count = (exists.count || 1) + 1;
                exists.lastReport = new Date().toISOString();
            } else {
                list.push({
                    id: channel.id,
                    name: channel.name,
                    group: channel.group,
                    error: errorDetails,
                    count: 1,
                    date: new Date().toISOString()
                });
            }
            localStorage.setItem('bokk_reported_channels', JSON.stringify(list));
        } catch (e) {}
    }

    function getLocalReports() {
        try {
            return JSON.parse(localStorage.getItem('bokk_reported_channels') || '[]');
        } catch (e) {
            return [];
        }
    }

    // Écoute en temps réel des signalements
    function listenToReportedChannels(callback) {
        if (!isInitialized || !db) return () => {};

        try {
            return db.collection('reported_channels')
                .onSnapshot(snapshot => {
                    const reports = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        reports.push({ id: doc.id, ...data });
                        reportedChannelsCache.add(String(doc.id));
                        if (data.status === 'confirmed_broken' || data.reportCount >= 3) {
                            brokenChannelsCache.add(String(doc.id));
                        }
                    });
                    if (typeof callback === 'function') {
                        callback(reports);
                    }
                }, err => {
                    console.warn('[BOKK TV] Erreur écoute snapshot:', err);
                });
        } catch (e) {
            return () => {};
        }
    }

    // Exposer l'API globale
    window.BokkFirebase = {
        isReady: () => isInitialized,
        reportBroken: reportBrokenChannel,
        getReports: getReportedChannels,
        deleteReport: deleteReport,
        listenReports: listenToReportedChannels,
        isReported: (channelId) => reportedChannelsCache.has(String(channelId)),
        isConfirmedBroken: (channelId) => brokenChannelsCache.has(String(channelId))
    };

})();

