// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Controller
// HLS.js Engine, Channel Navigation, Favorites, Player Controls & UI
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // Détection de l'application native / PWA (Masquer le bouton APK et raccourcis desktop)
    if (navigator.userAgent.includes('BOKKTV-App') || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        if (document.body) document.body.classList.add('is-native-app');
        else document.addEventListener('DOMContentLoaded', () => document.body.classList.add('is-native-app'));
    }

    // Catalogue des chaînes (résolu depuis window.channels, window.CHANNELS ou global)
    var resolvedChannels = (typeof window !== 'undefined' && Array.isArray(window.channels) && window.channels.length > 0)
        ? window.channels
        : ((typeof window !== 'undefined' && Array.isArray(window.CHANNELS) && window.CHANNELS.length > 0)
            ? window.CHANNELS
            : ((typeof window !== 'undefined' && window.channels) || (typeof globalThis !== 'undefined' && globalThis.channels) || []));

    // ── Déduplication & Liaison des Flux de Secours (Regroupement des chaînes de même nom) ──
    function groupChannelsWithBackups(rawList) {
        const map = new Map();
        for (let i = 0; i < rawList.length; i++) {
            const ch = rawList[i];
            if (!ch || !ch.name) continue;
            const cleanName = ch.name
                .toLowerCase()
                .replace(/\b(fhd|hd|hevc|4k|uhd|sd|raw|50fps|h265|h264|1080p|720p)\b/gi, '')
                .replace(/[\(\)\[\]\-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const cat = (ch.category || ch.group || 'general').toLowerCase();
            const key = cleanName + '__' + cat;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...ch, backupChannels: [] });
            } else {
                if (existing.url !== ch.url) {
                    if (!existing.backupChannels) existing.backupChannels = [];
                    if (!existing.backupChannels.some(b => b.url === ch.url)) {
                        existing.backupChannels.push(ch);
                    }
                }
            }
        }
        return Array.from(map.values()).map((ch, idx) => ({ ...ch, index: idx }));
    }

    var channels = Array.isArray(resolvedChannels) ? groupChannelsWithBackups(resolvedChannels) : [];

    // ── Métadonnées des catégories (découverte automatique selon les liens) ──
    const CATEGORY_METADATA = {
        'playlist':     { label: 'Ma Playlist',          icon: '',   order: 0.1 },
        'senegal':      { label: 'Sénégal',               icon: '',   order: 1 },
        'francophone':  { label: 'France & TNT',          icon: '',   order: 2 },
        'sport':        { label: 'Sport Direct',          icon: '',   order: 3 },
        'cinema':       { label: 'Films & Séries',        icon: '',   order: 4 },
        'info':         { label: 'Actualités & Info',     icon: '',   order: 5 },
        'afrique':      { label: 'Afrique',               icon: '',   order: 6 },
        'documentaire': { label: 'Documentaire',          icon: '',   order: 7 },
        'jeunesse':     { label: 'Jeunesse',              icon: '',   order: 8 },
        'music':        { label: 'Musique',               icon: '',   order: 9 },
        'uk':           { label: 'UK & USA',              icon: '',   order: 10 },
        'espagne':      { label: 'Espagne',               icon: '',   order: 11 },
        'allemagne':    { label: 'Allemagne',             icon: '',   order: 12 },
        'italie':       { label: 'Italie',                icon: '',   order: 13 },
        'turquie':      { label: 'Turquie',               icon: '',   order: 14 },
        'albanie':      { label: 'Albanie',               icon: '',   order: 15 },
        'exyu':         { label: 'Ex-Yougoslavie',        icon: '',   order: 16 },
        'adulte':       { label: 'Adulte (+18)',           icon: '',   order: 98 },
        'monde':        { label: 'International',          icon: '',   order: 99 }
    };

    // ── État de l'application ──
    let currentIndex = -1;
    let currentCategory = 'tous';
    let currentBouquet = 'all';
    let currentQuery = '';
    let isGridView = localStorage.getItem('bokk_tv_view') === 'grid';
    let hlsInstance = null;
    let mpegtsInstance = null;
    let isTryingFallback = false;
    let webStallWatchdog = null;
    let channelLoadSeq = 0;
    const acanDirectUrlCache = new Map();
    let renderedCount = 0;
    const BATCH_SIZE = 80;
    let currentFiltered = [];
    let userManuallySelectedCategory = false;

    // ── Gestion des favoris via localStorage ──
    function getFavorites() {
        try {
            return JSON.parse(localStorage.getItem('bokk_tv_favorites') || '[]');
        } catch (e) {
            return [];
        }
    }

    function isFavorite(channelId) {
        return getFavorites().includes(channelId);
    }

    function toggleFavorite(channelId, e) {
        if (e) e.stopPropagation();
        const favs = getFavorites();
        const idx = favs.indexOf(channelId);
        let added = false;
        if (idx >= 0) {
            favs.splice(idx, 1);
        } else {
            favs.push(channelId);
            added = true;
        }
        localStorage.setItem('bokk_tv_favorites', JSON.stringify(favs));

        // Toast feedback
        const ch = channels.find(c => c.id === channelId);
        const name = ch ? ch.name : 'Chaîne';
        showToast(added ? `"${name}" ajoutée aux favoris` : `Retirée des favoris`);

        // Mettre à jour l'affichage
        updateFavButtons();
        if (currentCategory === 'favoris') {
            renderChannelList();
        }
        updateCategoryCounts();
    }

    // ── Toast Notifications ──
    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ── Sélecteurs DOM ──
    const videoEl        = document.getElementById('hls-video');
    const iframeEl       = document.getElementById('video-iframe');
    const playerContainer= document.getElementById('player-container');
    const placeholderEl  = document.getElementById('player-placeholder');
    const loaderEl       = document.getElementById('player-loader');
    const errorEl        = document.getElementById('player-error');
    const errorMsgEl     = document.getElementById('error-message-text');
    const channelListEl  = document.getElementById('channel-list');
    const searchInput    = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const categoriesBar  = document.getElementById('categories-bar');
    const bouquetFilter  = document.getElementById('bouquet-filter');
    const channelCountEl = document.getElementById('channel-count-text');
    const nowPlayingTitle= document.getElementById('now-playing-title');

    // Contrôles du lecteur
    const ctrlPlay       = document.getElementById('ctrl-play');
    const playIcon       = document.getElementById('play-icon');
    const pauseIcon      = document.getElementById('pause-icon');
    const ctrlPrev       = document.getElementById('ctrl-prev');
    const ctrlNext       = document.getElementById('ctrl-next');
    const ctrlMute       = document.getElementById('ctrl-mute');
    const volHighIcon    = document.getElementById('vol-high-icon');
    const volMutedIcon   = document.getElementById('vol-muted-icon');
    const volumeSlider   = document.getElementById('volume-slider');
    const ctrlFullscreen = document.getElementById('ctrl-fullscreen');
    const fsExpandIcon   = document.getElementById('fs-expand-icon');
    const fsShrinkIcon   = document.getElementById('fs-shrink-icon');
    const ctrlTheater    = document.getElementById('ctrl-theater');
    const btnTheaterHdr  = document.getElementById('btn-theater-header');
    const ctrlPip        = document.getElementById('ctrl-pip');
    const playerFavBtn   = document.getElementById('player-fav-btn');

    // Métadonnées chaîne dans le lecteur
    const playerLogo     = document.getElementById('player-channel-logo');
    const playerName     = document.getElementById('player-channel-name');
    const playerCat      = document.getElementById('player-channel-cat');
    const playerBadge    = document.getElementById('player-channel-badge');

    // Vues et modales
    const btnViewList    = document.getElementById('btn-view-list');
    const btnViewGrid    = document.getElementById('btn-view-grid');
    const btnShortcuts   = document.getElementById('btn-shortcuts');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const btnCloseModal  = document.getElementById('btn-close-modal');
    const btnRetry       = document.getElementById('btn-retry');
    const btnFallback    = document.getElementById('btn-fallback');
    const btnBackupStream = document.getElementById('btn-backup-stream');
    const playerStreamSwitchBtn = document.getElementById('player-stream-switch-btn');

    // Qualité et réseau
    const qualitySelectorEl = document.getElementById('quality-selector');
    const netSpeedBadge     = document.getElementById('net-speed-badge');
    let   estimatedBwKbps   = 500;   // estimation initiale prudente (500 Kbps)
    let   forcedQuality     = -1;    // -1 = auto, 0..n = index level HLS.js

    // ── Masquer/Afficher les états du lecteur ──
    function showPlayerLoader() {
        if (loaderEl) loaderEl.classList.add('active');
        if (errorEl) errorEl.classList.remove('active');
        if (placeholderEl) placeholderEl.style.display = 'none';
    }

    function hidePlayerLoader() {
        if (loaderEl) loaderEl.classList.remove('active');
    }

    // ── Gestion et masquage automatique des chaînes non fonctionnelles ──
    const BROKEN_CHANNELS_KEY = 'bokk_broken_channels';
    function getBrokenChannelIds() {
        try {
            return JSON.parse(localStorage.getItem(BROKEN_CHANNELS_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function markChannelAsBroken(channel, index) {
        if (!channel) return;
        const bId = String(channel.id || channel.url);
        const brokenList = getBrokenChannelIds();
        if (!brokenList.includes(bId)) {
            brokenList.push(bId);
            try { localStorage.setItem(BROKEN_CHANNELS_KEY, JSON.stringify(brokenList)); } catch {}
        }
        channel._broken = true;

        showToast(`"${channel.name}" ne répond pas — masquée.`);

        // Supprimer immédiatement du catalogue actif
        const chIdx = channels.findIndex(c => (c.id && c.id === channel.id) || c.url === channel.url);
        if (chIdx !== -1) {
            channels.splice(chIdx, 1);
        }

        renderChannelList(true);

        // Zapper automatiquement sur la chaîne suivante
        setTimeout(() => {
            const filtered = getFilteredChannels();
            if (filtered.length > 0) {
                const nextIdx = Math.min(Math.max(0, index), filtered.length - 1);
                loadChannel(filtered[nextIdx].index);
            }
        }, 1000);
    }

    // ── Gestion et commutation des flux de secours ──
    function handleSwitchBackupStream(channel, idx) {
        if (!channel) return;
        const backups = channel.backupChannels || [];
        if (backups.length === 0) {
            showToast('Aucun flux alternatif pour cette chaîne.');
            return;
        }

        if (!channel._originalUrl) {
            channel._originalUrl = channel.url;
            channel._originalFallbackUrl = channel.fallbackUrl || channel.url;
        }

        const currentSub = channel._activeBackupIndex || 0;
        const total = backups.length + 1;
        const nextSub = (currentSub + 1) % total;
        channel._activeBackupIndex = nextSub;

        if (nextSub === 0) {
            channel.url = channel._originalUrl;
            channel.fallbackUrl = channel._originalFallbackUrl;
        } else {
            const backup = backups[nextSub - 1];
            channel.url = backup.url;
            channel.fallbackUrl = backup.fallbackUrl || backup.url;
        }

        updateStreamSwitchPill(channel);
        showToast(`Flux ${nextSub + 1}/${total} en cours...`);
        clearPlayerOverlays();
        loadChannel(idx >= 0 ? idx : currentIndex, false, 0);
    }

    function updateStreamSwitchPill(channel) {
        if (!playerStreamSwitchBtn) return;
        if (channel && channel.backupChannels && channel.backupChannels.length > 0) {
            const total = channel.backupChannels.length + 1;
            const current = (channel._activeBackupIndex || 0) + 1;
            playerStreamSwitchBtn.style.display = 'inline-flex';
            playerStreamSwitchBtn.innerHTML = `<span>Flux ${current}/${total}${current > 1 ? ' (Secours)' : ''}</span>`;
            playerStreamSwitchBtn.onclick = (e) => {
                e.stopPropagation();
                handleSwitchBackupStream(channel, currentIndex);
            };
        } else {
            playerStreamSwitchBtn.style.display = 'none';
        }
    }

    // Compteur d'échecs par chaîne — on ne supprime qu'après 3 échecs consécutifs
    const _failCount = {};
    function showPlayerError(msg, channel = null, index = -1) {
        hidePlayerLoader();
        const activeCh = channel || (currentIndex >= 0 ? channels[currentIndex] : null);

        // Activer le bouton "Tester le secours" si un flux alternatif existe
        if (btnBackupStream) {
            if (activeCh && activeCh.backupChannels && activeCh.backupChannels.length > 0) {
                btnBackupStream.style.display = 'inline-flex';
                btnBackupStream.onclick = () => {
                    handleSwitchBackupStream(activeCh, index >= 0 ? index : currentIndex);
                };
            } else {
                btnBackupStream.style.display = 'none';
            }
        }

        if (channel) {
            const cKey = String(channel.id || channel.url);
            _failCount[cKey] = (_failCount[cKey] || 0) + 1;
            if (_failCount[cKey] >= 3) {
                delete _failCount[cKey];
                markChannelAsBroken(channel, index);
            } else {
                // Pas encore broken : afficher l'erreur normalement
                if (errorEl) {
                    errorEl.classList.add('active');
                    if (errorMsgEl) errorMsgEl.textContent = msg || 'Ce flux est temporairement indisponible.';
                }
            }
            return;
        }
        if (errorEl) {
            errorEl.classList.add('active');
            if (errorMsgEl) errorMsgEl.textContent = msg || 'Ce flux est temporairement indisponible.';
        }
    }

    function clearPlayerOverlays() {
        hidePlayerLoader();
        if (errorEl) errorEl.classList.remove('active');
        if (placeholderEl) placeholderEl.style.display = 'none';
        if (btnBackupStream) btnBackupStream.style.display = 'none';
    }

    // ── Destruction propre des instances de lecture actives ──
    let streamPreviewTimer = null;
    let isStreamPreviewLocked = false;

    function isUserRegisteredAndActive() {
        if (!window.BokkFirebase || typeof window.BokkFirebase.getCurrentSubscriber !== 'function') return false;
        const sub = window.BokkFirebase.getCurrentSubscriber();
        if (!sub || !sub.id) return false;
        if (sub.status === 'suspended') return false;
        if (sub.expiresAt) {
            const exp = new Date(sub.expiresAt).getTime();
            if (exp < Date.now()) return false;
        }
        return true;
    }

    function startStreamPreviewTimer() {
        if (streamPreviewTimer) {
            clearTimeout(streamPreviewTimer);
            streamPreviewTimer = null;
        }

        // Si l'utilisateur est déjà inscrit et actif, aucun blocage
        if (isUserRegisteredAndActive()) {
            return;
        }

        // Aperçu de 3 secondes pour les visiteurs non inscrits
        streamPreviewTimer = setTimeout(() => {
            triggerRegistrationLock();
        }, 3000);
    }

    function triggerRegistrationLock() {
        if (isUserRegisteredAndActive()) return;

        // Pause vidéo
        if (videoEl) {
            try { videoEl.pause(); } catch (e) {}
        }
        if (hlsInstance) {
            try { hlsInstance.stopLoad(); } catch (e) {}
        }

        isStreamPreviewLocked = true;

        const sub = window.BokkFirebase && typeof window.BokkFirebase.getCurrentSubscriber === 'function'
            ? window.BokkFirebase.getCurrentSubscriber()
            : null;

        const isRegisteredButExpired = sub && sub.id && sub.expiresAt && (new Date(sub.expiresAt).getTime() < Date.now());

        const accountModal = document.getElementById('account-modal');
        const modalTitle = document.getElementById('account-modal-title');
        const modalSub = document.getElementById('account-modal-sub');
        const noticeBox = document.getElementById('account-auth-notice');
        const noticeText = document.getElementById('account-auth-notice-text');
        const viewAuth = document.getElementById('account-view-auth');
        const viewProfile = document.getElementById('account-view-profile');
        const tabRegister = document.getElementById('auth-tab-register');
        const tabLogin = document.getElementById('auth-tab-login');

        if (isRegisteredButExpired) {
            // L'utilisateur est DÉJÀ CONNECTÉ, mais son abonnement est expiré.
            // On affiche son profil avec les 3 options de renouvellement Wave
            if (viewAuth) viewAuth.style.display = 'none';
            if (viewProfile) viewProfile.style.display = 'block';
            if (modalTitle) {
                modalTitle.innerHTML = '<span style="color:var(--live-red);">⏰</span> Abonnement expiré';
            }
            if (modalSub) {
                modalSub.textContent = 'Renouvelez votre compte pour continuer à regarder';
            }
        } else {
            // L'utilisateur N'EST PAS ENCORE CONNECTÉ.
            // Inscription 100% GRATUITE sans aucun message ni bouton Wave !
            if (viewAuth) viewAuth.style.display = 'block';
            if (viewProfile) viewProfile.style.display = 'none';
            if (tabRegister) tabRegister.style.display = 'block';
            if (tabLogin) tabLogin.style.display = 'none';

            if (modalTitle) {
                modalTitle.innerHTML = '<span style="color:var(--brand);">🎁</span> Créez votre compte gratuit';
            }
            if (modalSub) {
                modalSub.textContent = '30 jours offerts pour débloquer toutes les chaînes';
            }
            if (noticeBox && noticeText) {
                noticeBox.style.background = 'rgba(0, 112, 243, 0.08)';
                noticeBox.style.borderColor = 'rgba(0, 112, 243, 0.25)';
                noticeText.innerHTML = '🎁 <strong>Inscription 100% Gratuite (30 jours offerts)</strong><br>' +
                    'Renseignez votre prénom et votre numéro de téléphone (Sénégal 70, 75, 76, 77, 78 ou International). Votre numéro devient votre identifiant BOKK TV unique (1 compte = 1 écran).';
            }
        }

        if (accountModal) {
            accountModal.style.display = 'flex';
        }
    }

    function openAccountModalInWelcomeMode() {
        if (isUserRegisteredAndActive()) return;

        isStreamPreviewLocked = false;
        const accountModal = document.getElementById('account-modal');
        const modalTitle = document.getElementById('account-modal-title');
        const modalSub = document.getElementById('account-modal-sub');
        const noticeBox = document.getElementById('account-auth-notice');
        const noticeText = document.getElementById('account-auth-notice-text');
        const viewAuth = document.getElementById('account-view-auth');
        const viewProfile = document.getElementById('account-view-profile');
        const tabRegister = document.getElementById('auth-tab-register');
        const tabLogin = document.getElementById('auth-tab-login');

        if (viewAuth) viewAuth.style.display = 'block';
        if (viewProfile) viewProfile.style.display = 'none';
        if (tabRegister) tabRegister.style.display = 'block';
        if (tabLogin) tabLogin.style.display = 'none';

        if (modalTitle) {
            modalTitle.innerHTML = '<span style="color:var(--brand);">👋</span> Bienvenue sur BOKK TV !';
        }
        if (modalSub) {
            modalSub.textContent = 'Obtenez votre ID personnel sans mot de passe';
        }
        if (noticeBox && noticeText) {
            noticeBox.style.background = 'rgba(0, 112, 243, 0.08)';
            noticeBox.style.borderColor = 'rgba(0, 112, 243, 0.25)';
            noticeText.innerHTML = '🎁 <strong>1 Mois de Streaming 100% Offert !</strong><br>Entrez votre prénom et votre numéro de téléphone (Sénégal 70, 75, 76, 77, 78 ou International). Votre numéro devient votre ID personnel unique.';
        }

        if (accountModal) {
            accountModal.style.display = 'flex';
        }
    }

    function clearWebStallWatchdog() {
        if (webStallWatchdog) {
            clearTimeout(webStallWatchdog);
            webStallWatchdog = null;
        }
    }

    function destroyActivePlayer() {
        clearWebStallWatchdog();
        if (streamPreviewTimer) {
            clearTimeout(streamPreviewTimer);
            streamPreviewTimer = null;
        }
        if (hlsInstance) {
            try { hlsInstance.destroy(); } catch (e) {}
            hlsInstance = null;
        }
        if (mpegtsInstance) {
            try {
                mpegtsInstance.pause();
                mpegtsInstance.unload();
                mpegtsInstance.detachMediaElement();
                mpegtsInstance.destroy();
            } catch (e) {}
            mpegtsInstance = null;
        }
    }

    // ── Gestionnaire de lecture automatique infaillible (Bypass Autoplay Policy) ──
    let userHasInteracted = false;
    let mutedAutoplayToastShown = false;

    function enableAudioOnFirstGesture() {
        userHasInteracted = true;
        // Unmute video on every interaction (handles channel switches after first load)
        if (videoEl && videoEl.muted) {
            videoEl.muted = false;
            videoEl.volume = parseFloat(localStorage.getItem('bokk_volume') || '1');
            if (volHighIcon) volHighIcon.style.display = 'block';
            if (volMutedIcon) volMutedIcon.style.display = 'none';
            if (volumeSlider) volumeSlider.value = videoEl.volume;
        }
    }
    // Keep listeners always active (not removed) so every channel switch gets unmuted
    window.addEventListener('click', enableAudioOnFirstGesture, true);
    window.addEventListener('touchstart', enableAudioOnFirstGesture, true);
    window.addEventListener('keydown', enableAudioOnFirstGesture, true);

    // Restore unmuted state immediately when loading a channel if user already interacted
    function ensureUnmuted() {
        if (userHasInteracted && videoEl && videoEl.muted) {
            videoEl.muted = false;
            videoEl.volume = parseFloat(localStorage.getItem('bokk_volume') || '1');
            if (volHighIcon) volHighIcon.style.display = 'block';
            if (volMutedIcon) volMutedIcon.style.display = 'none';
            if (volumeSlider) volumeSlider.value = videoEl.volume;
        }
    }

    function attemptAutoPlay(playerEngine = null) {
        clearPlayerOverlays();

        // Toujours démarrer en sourdine pour éviter l'AbortError (politique autoplay navigateur)
        // On unmute dès la lecture confirmée si l'utilisateur a déjà interagi
        videoEl.muted = true;

        const doPlay = () => {
            if (playerEngine && typeof playerEngine.play === 'function') {
                return playerEngine.play();
            }
            return videoEl.play();
        };

        const promise = doPlay();
        if (promise && typeof promise.then === 'function') {
            promise.then(() => {
                clearPlayerOverlays();
                // Unmute immédiatement si l'utilisateur a déjà cliqué/touché
                if (userHasInteracted) {
                    videoEl.muted = false;
                    videoEl.volume = parseFloat(localStorage.getItem('bokk_volume') || '1');
                } else if (!mutedAutoplayToastShown) {
                    mutedAutoplayToastShown = true;
                    showToast('Lecture automatique active — Cliquez pour le son');
                }
                startStreamPreviewTimer();
            }).catch((err) => {
                console.warn('[BOKK TV] Échec lecture automatique muette :', err && err.message);
                clearPlayerOverlays();
                if (!mutedAutoplayToastShown) {
                    mutedAutoplayToastShown = true;
                    showToast('Lecture automatique active — Touchez pour le son');
                }
            });
        }
    }

    // ── Détecteur de vitesse réseau ──
    // Mesure la bande passante réelle en téléchargeant un fichier test
    async function measureNetworkSpeed() {
        try {
            const isPort8080 = window.location.port === '8080';
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const isFile  = window.location.protocol === 'file:';

            let testUrl;
            if (isPort8080) {
                testUrl = '/speedtest';
            } else if (isLocal || isFile) {
                testUrl = `http://${window.location.hostname || '127.0.0.1'}:8080/speedtest`;
            } else {
                // En production: pas de serveur local, on utilise navigator.connection si dispo
                if (navigator.connection && navigator.connection.downlink) {
                    const mbps = navigator.connection.downlink;
                    estimatedBwKbps = Math.round(mbps * 1000);
                    _applySpeedBadge(estimatedBwKbps);
                }
                return;
            }

            const t0 = performance.now();
            const resp = await fetch(testUrl, { cache: 'no-store' });
            if (!resp.ok) return;
            const buf = await resp.arrayBuffer();
            const elapsed = (performance.now() - t0) / 1000; // secondes
            const bytes = buf.byteLength;
            const kbps = Math.round((bytes * 8) / elapsed / 1000);

            estimatedBwKbps = kbps;
            _applySpeedBadge(kbps);
            console.log(`[BOKK TV] Vitesse connexion mesurée : ${kbps} Kbps`);

            // Ajuster l'estimation ABR initiale de HLS.js si un flux est en cours
            if (hlsInstance) {
                // Ne pas changer le level forcé manuellement
                if (forcedQuality === -1) {
                    hlsInstance.bandwidthEstimate = kbps * 1000;
                }
            }
        } catch (e) {
            console.warn('[BOKK TV] Mesure vitesse impossible :', e.message);
        }
    }

    function _applySpeedBadge(kbps) {
        if (!netSpeedBadge) return;
        let label, cls;
        if (kbps >= 4000) {
            label = `${Math.round(kbps / 1000 * 10) / 10} Mbps`;
            cls = 'speed-fast';
        } else if (kbps >= 1000) {
            label = `${Math.round(kbps / 1000 * 10) / 10} Mbps`;
            cls = 'speed-ok';
        } else {
            label = `${kbps} Kbps`;
            cls = 'speed-slow';
        }
        netSpeedBadge.textContent = label;
        netSpeedBadge.className = `badge-tag net-speed-badge ${cls}`;
        netSpeedBadge.style.display = '';
    }

    // ── Contrôle manuel de la qualité HLS & MPEG-TS (tri réel par débit) ──
    function getSortedHlsLevelIndices(levels) {
        if (!levels || !levels.length) return [];
        return levels
            .map((lvl, idx) => ({ idx, bw: lvl.bitrate || 0 }))
            .sort((a, b) => a.bw - b.bw);
    }

    function pickBestEcoLevelIndex(levels, maxKbps = 1400) {
        const sorted = getSortedHlsLevelIndices(levels);
        if (!sorted.length) return -1;
        const limitBps = maxKbps * 1000;
        let best = sorted[0].idx; // Le plus léger garanti en plancher
        for (const item of sorted) {
            if (item.bw > 0 && item.bw <= limitBps) {
                best = item.idx;
            }
        }
        return best;
    }

    function setQualityLevel(levelKey) {
        forcedQuality = levelKey;
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === String(levelKey));
        });

        if (mpegtsInstance && currentIndex !== -1) {
            const ch = channels[currentIndex];
            if (ch && ch.fallbackUrl && ch.fallbackUrl !== ch.url) {
                if (levelKey === 'sd') {
                    showToast('Flux SD / Débit Économique activé');
                    loadChannel(currentIndex, true, 0);
                } else {
                    showToast('Flux HD / Haute Définition activé');
                    loadChannel(currentIndex, false, 0);
                }
                return;
            }
        }

        if (!hlsInstance) return;
        const levels = hlsInstance.levels || [];
        const sorted = getSortedHlsLevelIndices(levels);
        if (!sorted.length) return;

        if (levelKey === -1 || levelKey === '-1') {
            // Mode AUTO : ABR libre mais plafonné si débit mesuré <= 2 Mbps
            hlsInstance.autoLevelCapping = (estimatedBwKbps <= 2000) ? pickBestEcoLevelIndex(levels, 1450) : -1;
            hlsInstance.currentLevel = -1;
            hlsInstance.nextLevel    = -1;
            showToast('Qualité : Auto (Adaptatif)');
        } else if (levelKey === 'sd') {
            const sdIdx = sorted[0].idx;
            hlsInstance.autoLevelCapping = sdIdx;
            hlsInstance.currentLevel = sdIdx;
            hlsInstance.loadLevel    = sdIdx;
            showToast('Qualité forcée : Éco / Fluide (1.5M)');
        } else if (levelKey === 'hd') {
            const hdIdx = sorted[sorted.length - 1].idx;
            hlsInstance.autoLevelCapping = -1;
            hlsInstance.currentLevel = hdIdx;
            hlsInstance.loadLevel    = hdIdx;
            showToast('Qualité forcée : Haute Définition');
        }
    }

    // ── Domaines HTTPS HLS compatibles CORS directs (zéro latence proxy) ──
    const DIRECT_CORS_HLS_HOSTS = [
        'stream.sen-gt.com',
        'acangroup.org',
        'acan.group',
        'amagi.tv',
        'infomaniak.com',
        'evrideo.tv',
        'pro-fhi.net',
        'goccn.cloud',
        'streamlock.net',
        'ottera.tv',
        'akamaized.net',
        'secdn.net',
        'mangomolo.com',
    ];

    function isDirectCorsHttpsHls(rawUrl) {
        if (!rawUrl || !rawUrl.startsWith('https://')) return false;
        const lower = rawUrl.toLowerCase();
        return DIRECT_CORS_HLS_HOSTS.some(h => lower.includes(h));
    }

    const ACAN_SHORTCUTS = {
        rts1: 26, rts2: 32, rts3: 42, rts4: 51, rts5: 52,
        sentv: 2, '2stv': 29, leraltv: 35, walftv: 33, walf: 33
    };

    async function resolveDirectAcanUrl(key) {
        const lower = (key || '').toLowerCase().trim();
        if (!ACAN_SHORTCUTS[lower]) return null;
        const cached = acanDirectUrlCache.get(lower);
        if (cached && (Date.now() - cached.time < 240000)) {
            return cached.url;
        }
        try {
            const cid = ACAN_SHORTCUTS[lower];
            const r = await fetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, { cache: 'no-store' });
            if (r.ok) {
                const d = await r.json();
                const direct = d.web_url || d.direct_url || d.android_url;
                if (direct) {
                    acanDirectUrlCache.set(lower, { url: direct, time: Date.now() });
                    return direct;
                }
            }
        } catch (e) {}
        try {
            const isPort8080 = (window.location.port === '8080');
            const isLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (!isPort8080 && !isLocal) {
                const r2 = await fetch(`/api/proxy?url=${encodeURIComponent(lower)}&resolve=1`, { cache: 'no-store' });
                if (r2.ok) {
                    const d2 = await r2.json();
                    if (d2 && d2.url) {
                        acanDirectUrlCache.set(lower, { url: d2.url, time: Date.now() });
                        return d2.url;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    // Proxy BOKK TV : Direct HTTPS CORS prioritaire, puis Vercel Edge API / Serveur Python local
    function resolveStreamUrl(rawUrl, stage = 0, channel = null) {
        if (!rawUrl) return '';

        const isPort8080 = (window.location.port === '8080');
        const isLocalHost = (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '[::1]'
        );
        const isFileProtocol = (window.location.protocol === 'file:');
        const fallbackLocalHost = (window.location.hostname && window.location.hostname !== '') ? window.location.hostname : '127.0.0.1';

        if (rawUrl.startsWith('/')) {
            if (isPort8080 || (!isLocalHost && !isFileProtocol)) return rawUrl;
            return `http://${fallbackLocalHost}:8080${rawUrl}`;
        }
        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;

        let extraParams = '';
        const ua = (channel && channel.userAgent) ? channel.userAgent : 'IPTVSmartersPro';
        extraParams += `&ua=${encodeURIComponent(ua)}`;
        if (channel && channel.referrer) extraParams += `&ref=${encodeURIComponent(channel.referrer)}`;

        const isProduction = !isPort8080 && !isLocalHost && !isFileProtocol;

        // Pour les flux HTTPS HLS compatibles CORS : jouer EN DIRECT au Stage 0 (évite la surcharge Vercel)
        if (stage === 0 && isDirectCorsHttpsHls(rawUrl)) {
            return rawUrl;
        }

        // ── EN PRODUCTION : Vercel Edge API Proxy ──
        if (isProduction) {
            if (stage === 0) {
                return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
            }
            if (stage === 1) {
                return isDirectCorsHttpsHls(rawUrl)
                    ? `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`
                    : rawUrl;
            }
            return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }

        // ── EN LOCAL (port 8080 avec serveur Python local illimité) ──
        let proxyBase = '/proxy';
        if (!isPort8080) proxyBase = `http://${fallbackLocalHost}:8080/proxy`;

        if (stage === 1 && !isDirectCorsHttpsHls(rawUrl)) {
            return rawUrl;
        }
        return `${proxyBase}?url=${encodeURIComponent(rawUrl)}${extraParams}`;
    }

    // ── Historique des Dernières Chaînes Regardées ──
    function addToLastWatched(channelId) {
        if (!channelId) return;
        try {
            const idStr = String(channelId);
            let list = JSON.parse(localStorage.getItem('bokk_last_watched') || '[]');
            list = list.filter(id => String(id) !== idStr);
            list.unshift(idStr);
            if (list.length > 10) list = list.slice(0, 10);
            localStorage.setItem('bokk_last_watched', JSON.stringify(list));
            renderRecentChannels();
        } catch(e) {}
    }

    function renderRecentChannels() {
        const section = document.getElementById('recent-channels-section');
        const row = document.getElementById('recent-channels-row');
        if (!section || !row) return;
        try {
            const list = JSON.parse(localStorage.getItem('bokk_last_watched') || '[]');
            if (!list || list.length === 0) {
                section.style.display = 'none';
                return;
            }
            const recentChs = list.map(id => channels.find(c => String(c.id) === String(id))).filter(Boolean);
            if (recentChs.length === 0) {
                section.style.display = 'none';
                return;
            }
            section.style.display = 'block';
            row.innerHTML = recentChs.slice(0, 8).map(ch => {
                const idx = channels.indexOf(ch);
                const logo = ch.logo || 'favicon.png';
                return `
                <div class="recent-ch-card" data-index="${idx}" style="flex-shrink:0; width:100px; background:#10131b; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 6px; text-align:center; cursor:pointer; transition:transform 0.15s, border-color 0.15s;">
                    <img src="${logo}" alt="" onerror="this.src='favicon.png'" style="width:34px; height:34px; object-fit:contain; border-radius:6px; margin:0 auto 4px; display:block;">
                    <div style="font-size:0.7rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.name}</div>
                </div>`;
            }).join('');

            row.querySelectorAll('.recent-ch-card').forEach(card => {
                card.onclick = () => {
                    const idx = parseInt(card.dataset.index, 10);
                    if (!isNaN(idx)) loadChannel(idx);
                };
            });
        } catch(e) {
            section.style.display = 'none';
        }
    }

    // ── Bannière d'alerte d'expiration (non-bloquante) ──
    function checkExpiryBanner() {
        if (sessionStorage.getItem('bokk_expiry_banner_closed') === 'true') return;
        if (!window.BokkFirebase || typeof window.BokkFirebase.getCurrentSubscriber !== 'function') return;
        const sub = window.BokkFirebase.getCurrentSubscriber();
        if (!sub || !sub.expiresAt) return;
        const exp = new Date(sub.expiresAt).getTime();
        const now = Date.now();
        const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        
        const banner = document.getElementById('bokk-expiry-banner');
        const bannerText = document.getElementById('bokk-expiry-banner-text');
        const closeBtn = document.getElementById('btn-close-expiry-banner');
        if (!banner || !bannerText) return;

        if (daysLeft > 0 && daysLeft <= 3) {
            bannerText.innerHTML = `⚠️ Votre abonnement BOKK TV expire dans <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong>.`;
            banner.style.display = 'flex';
        } else if (daysLeft <= 0) {
            bannerText.innerHTML = `⚠️ Votre abonnement BOKK TV est <strong>expiré</strong>.`;
            banner.style.display = 'flex';
        }

        if (closeBtn) {
            closeBtn.onclick = () => {
                banner.style.display = 'none';
                sessionStorage.setItem('bokk_expiry_banner_closed', 'true');
            };
        }
    }

    // ── Chargement d'une chaîne (Support Dual Engine MPEG-TS & HLS Anti-Calage Pro) ──
    async function loadChannel(index, useFallback = false, retryStage = 0) {
        if (index < 0 || index >= channels.length) return;
        const loadSeq = ++channelLoadSeq;
        const channel = channels[index];
        currentIndex = index;
        isTryingFallback = useFallback;
        addToLastWatched(channel.id);

        // Révéler le lecteur vidéo dès qu'une chaîne est sélectionnée
        revealPlayer();

        // Détruire tout lecteur actif (HLS ou MPEG-TS)
        destroyActivePlayer();

        // Nettoyer les anciens gestionnaires sur videoEl pour éviter l'accumulation d'écouteurs
        videoEl.onplaying = null;
        videoEl.onloadeddata = null;
        videoEl.oncanplay = null;
        videoEl.onwaiting = null;
        videoEl.onstalled = null;
        videoEl.onended = null;

        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.style.display = 'none';

        iframeEl.src = 'about:blank';
        iframeEl.style.display = 'none';

        // Mise à jour de l'UI
        showPlayerLoader();
        if (nowPlayingTitle) nowPlayingTitle.textContent = channel.name;
        if (playerName) playerName.textContent = channel.name;
        updateStreamSwitchPill(channel);
        if (playerLogo) {
            playerLogo.src = getValidChannelLogo(channel);
            playerLogo.onerror = function() {
                this.onerror = null;
                this.src = DEFAULT_TV_LOGO;
            };
        }

        // ── Mise à jour EPG en direct (Programme actuel) ──
        const epgBox   = document.getElementById('player-epg-box');
        const epgTitle = document.getElementById('player-epg-title');
        const epgBar   = document.getElementById('player-epg-bar');
        const epgTime  = document.getElementById('player-epg-time');
        if (window.BokkEPG && epgBox) {
            const prog = window.BokkEPG.getCurrentProgram(channel.name);
            if (prog) {
                epgBox.style.display = 'flex';
                if (epgTitle) {
                    const catBadge = prog.category ? ` [${prog.category}]` : '';
                    epgTitle.textContent = `${prog.title}${catBadge}`;
                    if (prog.desc) epgTitle.title = prog.desc;
                }
                if (epgBar) epgBar.style.width = `${prog.progress}%`;
                if (epgTime) {
                    const nextInfo = prog.nextTitle ? ` • Suiv. : ${prog.nextTitle} (${prog.nextStart})` : '';
                    epgTime.textContent = `${prog.start} - ${prog.end} (${prog.progress}%)${nextInfo}`;
                }
            } else {
                epgBox.style.display = 'none';
            }
        }
        if (playerCat) playerCat.textContent = channel.category.toUpperCase();
        if (playerBadge) playerBadge.textContent = channel.badge || 'HD';

        updateFavButtons();
        highlightActiveChannel();
        ensureUnmuted();

        const playerWrapper = document.getElementById('player-wrapper');
        if (playerWrapper && playerWrapper.style.display === 'none') {
            playerWrapper.style.display = 'block';
        }

        revealPlayer();
        const nowPlayingPill = document.getElementById('now-playing-pill');
        if (nowPlayingPill) nowPlayingPill.style.display = 'flex';
        if (typeof updateQuickZappingBar === 'function') {
            updateQuickZappingBar();
        }

        let activeUrl = (useFallback && channel.fallbackUrl) ? channel.fallbackUrl : channel.url;

        // Résolution directe ACAN (RTS/SEN TV/2sTV) sans passer par le proxy Vercel pour zéro latence
        const lowerRaw = (activeUrl || '').toLowerCase().trim();
        if (ACAN_SHORTCUTS[lowerRaw] && retryStage === 0) {
            const directAcan = await resolveDirectAcanUrl(lowerRaw);
            if (loadSeq !== channelLoadSeq) return;
            if (directAcan) activeUrl = directAcan;
        }

        const lowerUrl = (activeUrl || '').toLowerCase().split('?')[0];

        // Détection précise du type de flux IPTV
        let streamType = 'hls';
        if (activeUrl.includes('embed') || activeUrl.includes('youtube.com') || activeUrl.includes('dailymotion.com')) {
            streamType = 'embed';
        } else if (lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.mpegts')) {
            streamType = 'ts';
        } else if (lowerUrl.endsWith('.m3u8') || activeUrl.toLowerCase().includes('.m3u8')) {
            streamType = 'hls';
        } else if (channel.type === 'ts' && !channel._forceHls) {
            streamType = 'ts';
        } else if (channel.type === 'hls' || channel._forceHls) {
            streamType = 'hls';
        }

        const finalUrl = resolveStreamUrl(activeUrl, retryStage, channel);
        const absoluteFinalUrl = finalUrl.startsWith('/') ? (window.location.origin + finalUrl) : finalUrl;
        console.log(`[BOKK TV] Chargement chaîne: "${channel.name}" [${streamType.toUpperCase()}] (Stage: ${retryStage}) URL:`, absoluteFinalUrl);

        // Watchdog anti-calage web (8.5s bloqué en waiting/stalled => relance ou bascule automatique)
        const armStallWatchdog = (onStallFn) => {
            clearWebStallWatchdog();
            webStallWatchdog = setTimeout(() => {
                if (loadSeq === channelLoadSeq && !videoEl.paused) {
                    console.warn('[BOKK TV Web Watchdog] Tampon figé > 8.5s, récupération automatique...');
                    onStallFn();
                }
            }, 8500);
        };

        if (streamType === 'embed') {
            iframeEl.style.display = 'block';
            iframeEl.src = finalUrl;
            iframeEl.onload = () => {
                clearPlayerOverlays();
            };
        } else if (streamType === 'ts') {
            // ── LECTEUR MPEG-TS PRO (Tampon 512 KB + Reconnexion transparente Vercel 30s) ──
            videoEl.style.display = 'block';

            if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
                mpegtsInstance = mpegts.createPlayer({
                    type: 'mse',
                    isLive: true,
                    url: absoluteFinalUrl
                }, {
                    enableWorker: false,
                    lazyLoad: false,
                    liveBufferLatencyChasing: false,
                    liveBufferLatencyMaxLatency: 12.0,
                    liveBufferLatencyMinRemain: 2.0,
                    enableStashBuffer: true,
                    stashInitialSize: 512,               // 512 Ko (~3s de tampon réel à 1.5 Mbps → zéro micro-calage)
                    autoCleanupSourceBuffer: true,
                    autoCleanupMaxBackwardDuration: 25,
                    autoCleanupMinBackwardDuration: 12
                });

                mpegtsInstance.attachMediaElement(videoEl);
                mpegtsInstance.load();

                if (qualitySelectorEl) {
                    qualitySelectorEl.style.display = (channel.fallbackUrl && channel.fallbackUrl !== channel.url) ? 'flex' : 'none';
                    const qHd = document.getElementById('q-hd');
                    const qSd = document.getElementById('q-sd');
                    const qAuto = document.getElementById('q-auto');
                    if (qHd && qSd) {
                        qHd.classList.toggle('active', !useFallback);
                        qSd.classList.toggle('active', !!useFallback);
                        if (qAuto) qAuto.classList.remove('active');
                    }
                }

                const triggerTsRecovery = () => {
                    if (loadSeq !== channelLoadSeq) return;
                    destroyActivePlayer();
                    if (channel.fallbackUrl && channel.fallbackUrl !== channel.url && !useFallback) {
                        loadChannel(index, true, 0);
                    } else if (retryStage < 2) {
                        loadChannel(index, useFallback, retryStage + 1);
                    } else if (!channel._forceHls && !lowerUrl.endsWith('.ts')) {
                        // Certains flux Xtream redirigent vers du .m3u8 (chaînes FAST)
                        channel._forceHls = true;
                        loadChannel(index, false, 0);
                    } else if (channel.backupChannels && channel.backupChannels.length > 0 && !channel._triedBackup) {
                        channel._triedBackup = true;
                        const backupCh = channel.backupChannels[0];
                        channel.url = backupCh.url;
                        channel.fallbackUrl = backupCh.fallbackUrl || backupCh.url;
                        loadChannel(index, false, 0);
                    } else {
                        showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                    }
                };

                videoEl.onplaying = () => { clearWebStallWatchdog(); clearPlayerOverlays(); startStreamPreviewTimer(); };
                videoEl.onloadeddata = () => clearPlayerOverlays();
                videoEl.oncanplay = () => clearPlayerOverlays();
                videoEl.onwaiting = () => armStallWatchdog(triggerTsRecovery);
                videoEl.onstalled = () => armStallWatchdog(triggerTsRecovery);
                // Vercel coupe les fonctions serverless à 30s -> reconnexion transparente sur flux direct
                videoEl.onended = () => {
                    if (loadSeq === channelLoadSeq) {
                        console.log('[BOKK TV] Flux TS terminé (coupure serveur/proxy), reconnexion continue...');
                        loadChannel(index, useFallback, 0);
                    }
                };

                attemptAutoPlay(mpegtsInstance);

                mpegtsInstance.on(mpegts.Events.LOADING_COMPLETE, () => {
                    if (loadSeq === channelLoadSeq) {
                        console.log('[BOKK TV] Flux TS fermé par le serveur/proxy, reconnexion transparente...');
                        loadChannel(index, useFallback, 0);
                    }
                });

                mpegtsInstance.on(mpegts.Events.ERROR, (type, detail) => {
                    console.warn(`[BOKK TV] Erreur MPEG-TS (${type}, ${detail}, Stage ${retryStage}) sur ${finalUrl}`);
                    triggerTsRecovery();
                });
            } else {
                videoEl.src = finalUrl;
                videoEl.play().catch(() => {});
            }
        } else {
            // ── LECTEUR HLS (.M3U8) ANTI-CALAGE 1.5 MBPS ──
            videoEl.style.display = 'block';

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    startLevel: -1,                    // Sélectionné proprement par débit réel dans MANIFEST_PARSED
                    capLevelToPlayerSize: true,
                    liveSyncDurationCount: 3,          // ~8-12s de coussin stable anti-calage
                    liveMaxLatencyDurationCount: 8,
                    backBufferLength: 12,
                    maxBufferLength: 25,               // 25s d'avance tampon pour absorber 100% des baisses 1.5 Mbps
                    maxMaxBufferLength: 45,
                    maxBufferSize: 50 * 1000 * 1000,
                    maxBufferHole: 1.0,
                    highBufferWatchdogPeriod: 2,
                    manifestLoadingTimeOut: 9000,
                    manifestLoadingMaxRetry: 4,
                    manifestLoadingRetryDelay: 500,
                    levelLoadingTimeOut: 9000,
                    levelLoadingMaxRetry: 4,
                    fragLoadingTimeOut: 12000,
                    fragLoadingMaxRetry: 6,
                    fragLoadingRetryDelay: 500,
                    xhrSetup: function(xhr) {
                        xhr.setRequestHeader('Accept', '*/*');
                    },
                    abrEwmaDefaultEstimate: 950000,    // Calibré prudent (950 kbps) pour éviter le choix 1080p 5Mbps au départ
                    abrBandWidthFactor: 0.65,
                    abrBandWidthUpFactor: 0.5,
                    startFragPrefetch: true,
                    progressive: true,
                    nudgeMaxRetry: 8,
                    nudgeOffset: 0.2,
                    maxStarvationDelay: 4
                });

                const triggerHlsRecovery = () => {
                    if (loadSeq !== channelLoadSeq) return;
                    destroyActivePlayer();
                    if (channel.fallbackUrl && !useFallback && channel.fallbackUrl !== channel.url) {
                        loadChannel(index, true, 0);
                    } else if (retryStage < 3) {
                        loadChannel(index, useFallback, retryStage + 1);
                    } else if (channel.backupChannels && channel.backupChannels.length > 0 && !channel._triedBackup) {
                        channel._triedBackup = true;
                        const backupCh = channel.backupChannels[0];
                        channel.url = backupCh.url;
                        channel.fallbackUrl = backupCh.fallbackUrl || backupCh.url;
                        loadChannel(index, false, 0);
                    } else {
                        showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                    }
                };

                videoEl.onloadeddata = () => clearPlayerOverlays();
                videoEl.oncanplay = () => clearPlayerOverlays();
                videoEl.onplaying = () => { clearWebStallWatchdog(); clearPlayerOverlays(); startStreamPreviewTimer(); };
                videoEl.onwaiting = () => armStallWatchdog(triggerHlsRecovery);
                videoEl.onstalled = () => armStallWatchdog(triggerHlsRecovery);

                hlsInstance.loadSource(finalUrl);
                hlsInstance.attachMedia(videoEl);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                    clearPlayerOverlays();
                    const levels = data.levels || [];

                    if (qualitySelectorEl) {
                        qualitySelectorEl.style.display = levels.length > 1 ? 'flex' : 'none';
                    }

                    if (forcedQuality !== -1) {
                        setTimeout(() => setQualityLevel(forcedQuality), 150);
                    } else if (levels.length > 1) {
                        // Toujours démarrer sur la piste <= 1.4 Mbps la mieux adaptée (évite 1080p 4.2 Mbps en index 0)
                        const ecoIdx = pickBestEcoLevelIndex(levels, Math.min(estimatedBwKbps || 1400, 1450));
                        if (ecoIdx !== -1) {
                            hlsInstance.startLevel = ecoIdx;
                            hlsInstance.currentLevel = ecoIdx;
                            // Si débit <= 2 Mbps, plafonner l'ABR pour ne pas sauter en 1080p puis caler
                            if (estimatedBwKbps <= 2000) {
                                hlsInstance.autoLevelCapping = ecoIdx;
                            }
                        }
                        hlsInstance.bandwidthEstimate = Math.min(estimatedBwKbps || 1200, 1400) * 1000;
                    }

                    attemptAutoPlay(videoEl);
                });

                hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
                    if (data && data.audioTracks && data.audioTracks.length > 1) {
                        const tracks = data.audioTracks;
                        const aacIndex = tracks.findIndex(t => {
                            const n = (t.name || '').toLowerCase();
                            const c = (t.audioCodec || '').toLowerCase();
                            return c.includes('mp4a') || c.includes('aac') || n.includes('stereo') || n.includes('aac') || (!n.includes('dolby') && !n.includes('5.1') && !c.includes('ec-3') && !c.includes('ac-3'));
                        });
                        if (aacIndex !== -1 && aacIndex !== hlsInstance.audioTrack) {
                            hlsInstance.audioTrack = aacIndex;
                        }
                    }
                });

                hlsInstance.on(Hls.Events.ERROR, (_, data) => {
                    if (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall') {
                        if (hlsInstance) {
                            // Baisser vers le niveau de débit immédiatement inférieur selon le tri réel
                            if (hlsInstance.autoLevelEnabled && hlsInstance.levels && hlsInstance.levels.length > 1) {
                                const sorted = getSortedHlsLevelIndices(hlsInstance.levels);
                                const pos = sorted.findIndex(x => x.idx === hlsInstance.currentLevel);
                                if (pos > 0) {
                                    hlsInstance.currentLevel = sorted[pos - 1].idx;
                                }
                            }
                            hlsInstance.startLoad();
                        }
                        return;
                    }

                    if (data.details === 'bufferAddCodecError' && data.mimeType && data.mimeType.includes('audio')) {
                        if (hlsInstance.audioTracks && hlsInstance.audioTracks.length > 1) {
                            hlsInstance.audioTrack = (hlsInstance.audioTrack + 1) % hlsInstance.audioTracks.length;
                            return;
                        }
                    }

                    if (data.fatal) {
                        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            try {
                                hlsInstance.recoverMediaError();
                            } catch (e) {
                                try {
                                    hlsInstance.swapAudioCodec();
                                    hlsInstance.recoverMediaError();
                                } catch (e2) {
                                    triggerHlsRecovery();
                                }
                            }
                        } else {
                            triggerHlsRecovery();
                        }
                    }
                });
            } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                videoEl.src = finalUrl;
                videoEl.onloadedmetadata = () => attemptAutoPlay(videoEl);
            } else {
                showPlayerError('Votre navigateur ne prend pas en charge la lecture de ce flux.');
            }
        }
    }

    // ── Navigation entre chaînes ──
    function playNextChannel() {
        const filtered = getFilteredChannels();
        if (!filtered.length) return;
        const currentInFiltered = filtered.findIndex(c => c.index === currentIndex);
        const nextIdx = (currentInFiltered + 1) % filtered.length;
        loadChannel(filtered[nextIdx].index);
    }

    function playPrevChannel() {
        const filtered = getFilteredChannels();
        if (!filtered.length) return;
        const currentInFiltered = filtered.findIndex(c => c.index === currentIndex);
        const prevIdx = (currentInFiltered - 1 + filtered.length) % filtered.length;
        loadChannel(filtered[prevIdx].index);
    }

    // ── Détection de correspondance catégorie (dynamique selon liens/pays/groupes) ──
    function isChannelInCategory(ch, catKey, favs) {
        if (catKey === 'tous') return true;
        if (catKey === 'favoris') return favs.includes(ch.id);
        const chCat = (ch.category || '').toLowerCase();
        if (chCat === catKey.toLowerCase()) return true;
        if (ch.country && ch.country.toLowerCase() === catKey.toLowerCase()) return true;
        if (ch.group && ch.group.toLowerCase().includes(catKey.toLowerCase())) return true;
        if (catKey === 'senegal') return (chCat === 'senegal' || ch.country === 'SN' || (ch.group && ch.group.toLowerCase().includes('sénégal')));
        if (catKey === 'francophone') return (chCat === 'francophone' || ch.country === 'FR' || (ch.group && (ch.group.includes('FR |') || ch.group.toLowerCase().includes('france'))));
        if (catKey === 'sport') return (chCat === 'sport' || (ch.group && (ch.group.toLowerCase().includes('sport') || ch.group.includes('DAZN') || ch.group.includes('FOOT'))));
        if (catKey === 'cinema') return (chCat === 'cinema' || (ch.group && (ch.group.toLowerCase().includes('ciné') || ch.group.toLowerCase().includes('film') || ch.group.toLowerCase().includes('movie') || ch.group.toLowerCase().includes('serie'))));
        if (catKey === 'uk') return (ch.country === 'UK' || ch.country === 'US' || chCat === 'uk' || (ch.group && (ch.group.includes('UK |') || ch.group.includes('USA'))));
        if (catKey === 'espagne') return (ch.country === 'ES' || chCat === 'espagne' || (ch.group && ch.group.includes('ES |')));
        if (catKey === 'allemagne') return (ch.country === 'DE' || chCat === 'allemagne' || (ch.group && (ch.group.includes('DE |') || ch.group.includes('GERMANY'))));
        if (catKey === 'italie') return (ch.country === 'IT' || chCat === 'italie' || (ch.group && ch.group.includes('IT |')));
        return false;
    }

    // ── Filtrage des chaînes ──
    function getFilteredChannels() {
        const query = currentQuery.trim().toLowerCase();
        const favs = getFavorites();

        return channels
            .map((ch, index) => ({ ...ch, index }))
            .filter(ch => {
                // Masquer automatiquement les flux désactivés par l'administrateur dans Firebase
                if (window.BokkFirebase && window.BokkFirebase.isDisabled(ch.id)) {
                    return false;
                }

                // En mode recherche textuelle : recherche globale instantanée sur les 6 039 chaînes
                if (query) {
                    const text = `${ch.name} ${ch.group || ''} ${ch.desc || ''} ${ch.category || ''} ${ch.country || ''}`.toLowerCase();
                    return text.includes(query);
                }

                // Filtre Bouquet / Catégorie IPTV
                if (currentBouquet !== 'all' && ch.group !== currentBouquet) {
                    return false;
                }

                // Filtre Catégorie Principale
                if (!isChannelInCategory(ch, currentCategory, favs)) {
                    return false;
                }

                return true;
            });
    }

    // ── Remplissage du sélecteur de bouquets (groupes M3U automatiques) ──
    function populateBouquetFilter() {
        if (!bouquetFilter) return;
        const groups = new Map();
        channels.forEach(ch => {
            const g = ch.group || ch.desc;
            if (g) {
                groups.set(g, (groups.get(g) || 0) + 1);
            }
        });

        bouquetFilter.innerHTML = `<option value="all">Tous les bouquets M3U (${channels.length.toLocaleString('fr-FR')} chaînes)</option>`;
        const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
        sortedGroups.forEach(([grp, count]) => {
            const opt = document.createElement('option');
            opt.value = grp;
            opt.textContent = `${grp} (${count})`;
            if (grp === currentBouquet) opt.selected = true;
            bouquetFilter.appendChild(opt);
        });

        bouquetFilter.onchange = (e) => {
            currentBouquet = e.target.value;
            renderChannelList(true);
        };
    }

    // ── Découverte dynamique des catégories présentes dans les liens ──
    function getDynamicCategories() {
        const catMap = new Map();
        catMap.set('tous', { key: 'tous', label: 'Toutes les chaînes', icon: '',   count: channels.length, order: 0 });

        const favs = getFavorites();
        const favCount = channels.filter(ch => favs.includes(ch.id)).length;
        if (favCount > 0) {
            catMap.set('favoris', { key: 'favoris', label: '⭐ Favoris', icon: '⭐', count: favCount, order: 0.5 });
        }

        channels.forEach(ch => {
            const rawCat = (ch.category || 'monde').toLowerCase();
            if (!catMap.has(rawCat)) {
                const meta = CATEGORY_METADATA[rawCat] || {
                    label: rawCat.charAt(0).toUpperCase() + rawCat.slice(1),
                    icon: '',
                    order: 50
                };
                catMap.set(rawCat, {
                    key: rawCat,
                    label: meta.label,
                    icon: meta.icon,
                    count: 0,
                    order: meta.order || 50
                });
            }
            catMap.get(rawCat).count += 1;
        });

        return Array.from(catMap.values())
            .filter(c => c.count > 0 || c.key === 'tous')
            .sort((a, b) => a.order - b.order);
    }

    // ── Rendu de la barre des catégories dynamiques ──
    function renderCategories() {
        if (!categoriesBar) return;
        categoriesBar.innerHTML = '';

        const dynamicCategories = getDynamicCategories();

        dynamicCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-pill' + (cat.key === currentCategory ? ' active' : '');
            btn.dataset.category = cat.key;

            btn.innerHTML = `
                <span>${cat.label}</span>
                <span class="cat-pill-count">${cat.count.toLocaleString('fr-FR')}</span>
            `;

            btn.onclick = () => {
                userManuallySelectedCategory = true;
                currentCategory = cat.key;
                document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderChannelList(true);
            };

            categoriesBar.appendChild(btn);
        });

        const activePill = categoriesBar.querySelector('.cat-pill.active');
        if (activePill) {
            setTimeout(() => {
                activePill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            }, 100);
        }
    }

    function getCategoryCount(catKey) {
        if (catKey === 'tous') return channels.length;
        const favs = getFavorites();
        return channels.filter(ch => isChannelInCategory(ch, catKey, favs)).length;
    }

    function updateCategoryCounts() {
        const dynamicCategories = getDynamicCategories();
        document.querySelectorAll('.cat-pill').forEach(btn => {
            const catKey = btn.dataset.category;
            const countEl = btn.querySelector('.cat-pill-count');
            if (countEl && catKey) {
                const found = dynamicCategories.find(c => c.key === catKey);
                countEl.textContent = (found ? found.count : getCategoryCount(catKey)).toLocaleString('fr-FR');
            }
        });
    }

    // ── Générateur de badge SVG personnalisé haute fidélité pour chaînes sans logo ──
    const LOGO_PALETTES = [
        ['#4f46e5', '#7c3aed'], // Indigo / Violet
        ['#059669', '#10b981'], // Vert émeraude (Sport)
        ['#dc2626', '#f97316'], // Rouge / Orange
        ['#2563eb', '#06b6d4'], // Bleu / Cyan (News/Général)
        ['#7c2d12', '#d97706'], // Ambre / Bronze
        ['#be185d', '#ec4899'], // Rose / Framboise (Cinéma/Séries)
        ['#047857', '#eab308']  // Sénégal (Vert/Jaune)
    ];

    function getChannelInitials(name) {
        if (!name) return 'TV';
        let clean = name.replace(/^(FR\s*[-:|]\s*|SN\s*[-:|]\s*|UK\s*[-:|]\s*|US\s*[-:|]\s*)/i, '')
                        .replace(/\((Officiel|HD|FHD|4K|Direct)[^)]*\)/gi, '')
                        .replace(/\b(FHD|HD|HEVC|4K|UHD|SD|H265|RAW|1080p|720p)\b/gi, '')
                        .trim();
        if (!clean) clean = name;
        const words = clean.split(/[\s\-_.:/]+/).filter(w => w.length > 0);
        if (words.length === 1) {
            return words[0].slice(0, 3).toUpperCase();
        }
        if (words.length >= 2) {
            const first = words[0];
            if (first.length <= 3 && /^[A-Z0-9+]+$/i.test(first)) {
                return (first + (words[1] ? words[1][0] : '')).slice(0, 4).toUpperCase();
            }
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return clean.slice(0, 3).toUpperCase();
    }

    function generateLogoBadgeSvg(name, category = '') {
        const initials = getChannelInitials(name);
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i);
            hash |= 0;
        }
        const palIdx = Math.abs(hash) % LOGO_PALETTES.length;
        const [c1, c2] = LOGO_PALETTES[palIdx];
        
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <defs>
                <linearGradient id="g_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${c1}"/>
                    <stop offset="100%" stop-color="${c2}"/>
                </linearGradient>
            </defs>
            <rect width="100" height="100" rx="22" fill="url(#g_${Math.abs(hash)})"/>
            <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${initials.length > 3 ? '25' : (initials.length > 2 ? '29' : '36')}" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="-0.5">${initials}</text>
        </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    const DEFAULT_TV_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
        '<rect width="100" height="100" rx="22" fill="#1e293b"/>' +
        '<rect x="20" y="24" width="60" height="42" rx="6" fill="#0f172a" stroke="#475569" stroke-width="2.5"/>' +
        '<path d="M42 74 L58 74 M50 66 L50 74" stroke="#475569" stroke-width="3" stroke-linecap="round"/>' +
        '<polygon points="46,38 46,52 58,45" fill="#38bdf8"/>' +
        '</svg>'
    );

    function getValidChannelLogo(ch) {
        if (!ch) return DEFAULT_TV_LOGO;
        const dummyPatterns = ["uhd.png", "4k.png", "rawanduhd.png", "exflag.png", "frlog.png", "one_tv.png", "default_tv"];
        const hasDummy = ch.logo && dummyPatterns.some(p => ch.logo.toLowerCase().includes(p));
        if (!ch.logo || ch.logo.trim() === '' || hasDummy) {
            return getLogo(ch);
        }
        return ch.logo.trim();
    }

    // ── Base de logos officiels haute définition (tv-logos CDN & Wikimedia) ──
    const CHANNEL_LOGOS = {
        // Sénégal & Afrique
        'rts1':        'https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png',
        'rts2':        'https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png',
        '2stv':        'https://upload.wikimedia.org/wikipedia/fr/a/ab/2sTV_logo.png',
        'tfm':         'https://upload.wikimedia.org/wikipedia/fr/b/b5/TFM_logo.png',
        'sentv':       'https://sentv.sn/images/artwork.png',
        'walftv':      'https://upload.wikimedia.org/wikipedia/fr/8/84/Walf_FM_logo.jpg',
        'rti':         'https://upload.wikimedia.org/wikipedia/commons/2/2f/Logo_RTI_2021.svg',
        'africa24':    'https://upload.wikimedia.org/wikipedia/fr/6/6a/Logo_Africa_24.jpg',
        'traceafrica': 'https://upload.wikimedia.org/wikipedia/fr/c/c6/Traceafrica2022.png',
        'traceurban':  'https://upload.wikimedia.org/wikipedia/commons/e/eb/Trace_Urban_Logo.svg',
        'tv5monde':    'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tv5monde-fr.png',
        'france24':    'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-24-fr.png',

        // France TNT & Généralistes
        'tf1':         'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tf1-fr.png',
        'france2':     'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-2-fr.png',
        'france3':     'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-3-fr.png',
        'france4':     'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-4-fr.png',
        'france5':     'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-5-fr.png',
        'm6':          'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/m6-fr.png',
        'arte':        'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/arte-fr.png',
        'w9':          'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/w9-fr.png',
        'tmc':         'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tmc-fr.png',
        'tfx':         'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tfx-fr.png',
        'c8':          'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/c8-fr.png',
        'cstar':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cstar-fr.png',
        'gulli':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/gulli-fr.png',
        'bfmtv':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bfm-tv-fr.png',
        'cnews':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cnews-fr.png',
        'lci':         'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/lci-fr.png',
        'equipe':      'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/la-chaine-lequipe-fr.png',

        // Canal+ Groupe
        'canalplus':   'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-fr.png',
        'canalfoot':   'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-foot-fr.png',
        'canal360':    'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-360-fr.png',
        'canalsport':  'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-fr.png',
        'canalcinema': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-cinemas-fr.png',
        'canalboxoffice':'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-box-office-fr.png',
        'canalgrandecran':'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-grand-ecran-fr.png',
        'canalseries': 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-series-fr.png',

        // beIN Sports
        'bein1':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-1-french-fr.png',
        'bein2':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-2-french-fr.png',
        'bein3':       'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-3-french-fr.png',
        'bein':        'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png',

        // RMC Sport & Autres
        'rmc1':        'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-1-fr.png',
        'rmc2':        'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-2-fr.png',
        'rmc':         'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-fr.png',
        'eurosport1':  'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/eurosport-1-fr.png',
        'eurosport2':  'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/eurosport-2-fr.png',
        'campeones':   'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/liga-de-campeones-por-movistar-plus-es.png',
        'laligatv':    'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/laliga-tv-por-movistar-plus-es.png',
        'dazn':        'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/dazn-1-es.png',
        'skysports':   'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-hz-uk.png',
    };

    function getLogo(ch) {
        if (!ch) return DEFAULT_TV_LOGO;
        const name = ((ch.name || '') + ' ' + (ch.id || '')).toLowerCase();

        // Chaînes sénégalaises
        if (name.includes('rts') && (name.includes('1') || name.includes('sénégal') || name.includes('senegal'))) return CHANNEL_LOGOS['rts1'];
        if (name.includes('rts') && name.includes('2')) return CHANNEL_LOGOS['rts2'];
        if (name.includes('2stv') || name.includes('2s tv')) return CHANNEL_LOGOS['2stv'];
        if (/\btfm\b/.test(name)) return CHANNEL_LOGOS['tfm'];
        if (name.includes('sen tv') || name.includes('sentv')) return CHANNEL_LOGOS['sentv'];
        if (name.includes('walf')) return CHANNEL_LOGOS['walftv'];

        // Canal+ Sport & Live
        if (name.includes('canal+ foot') || name.includes('canal plus foot')) return CHANNEL_LOGOS['canalfoot'];
        if (name.includes('canal+ 360') || name.includes('sport 360')) return CHANNEL_LOGOS['canal360'];
        if (name.includes('canal+ sport') || name.includes('canal plus sport')) return CHANNEL_LOGOS['canalsport'];
        if (name.includes('canal+ box office')) return CHANNEL_LOGOS['canalboxoffice'];
        if (name.includes('canal+ cinema') || name.includes('cinémas')) return CHANNEL_LOGOS['canalcinema'];
        if (name.includes('canal+ grand ecran') || name.includes('grand écran')) return CHANNEL_LOGOS['canalgrandecran'];
        if (name.includes('canal+ series') || name.includes('séries')) return CHANNEL_LOGOS['canalseries'];
        if (name.includes('canal+') || name.includes('canal plus')) return CHANNEL_LOGOS['canalplus'];

        // beIN Sports
        if (name.includes('bein') && (name.includes('1') || name.includes('one'))) return CHANNEL_LOGOS['bein1'];
        if (name.includes('bein') && name.includes('2')) return CHANNEL_LOGOS['bein2'];
        if (name.includes('bein') && name.includes('3')) return CHANNEL_LOGOS['bein3'];
        if (name.includes('bein')) return CHANNEL_LOGOS['bein'];

        // RMC & Sports
        if (name.includes('rmc sport 1')) return CHANNEL_LOGOS['rmc1'];
        if (name.includes('rmc sport 2')) return CHANNEL_LOGOS['rmc2'];
        if (name.includes('rmc sport')) return CHANNEL_LOGOS['rmc'];
        if (name.includes('campeones')) return CHANNEL_LOGOS['campeones'];
        if (name.includes('laliga')) return CHANNEL_LOGOS['laligatv'];
        if (name.includes('dazn')) return CHANNEL_LOGOS['dazn'];
        if (name.includes('sky sport')) return CHANNEL_LOGOS['skysports'];
        if (name.includes('eurosport 2')) return CHANNEL_LOGOS['eurosport2'];
        if (name.includes('eurosport')) return CHANNEL_LOGOS['eurosport1'];
        if (name.includes('l\'equipe') || name.includes('lequipe')) return CHANNEL_LOGOS['equipe'];

        // France TNT
        if (/\btf1\b/.test(name)) return CHANNEL_LOGOS['tf1'];
        if (name.includes('france 2') || name.includes('france2')) return CHANNEL_LOGOS['france2'];
        if (name.includes('france 3') || name.includes('france3')) return CHANNEL_LOGOS['france3'];
        if (name.includes('france 4') || name.includes('france4')) return CHANNEL_LOGOS['france4'];
        if (name.includes('france 5') || name.includes('france5')) return CHANNEL_LOGOS['france5'];
        if (/\bm6\b/.test(name)) return CHANNEL_LOGOS['m6'];
        if (/\barte\b/.test(name)) return CHANNEL_LOGOS['arte'];
        if (/\bw9\b/.test(name)) return CHANNEL_LOGOS['w9'];
        if (/\btmc\b/.test(name)) return CHANNEL_LOGOS['tmc'];
        if (/\btfx\b/.test(name)) return CHANNEL_LOGOS['tfx'];
        if (/\bc8\b/.test(name)) return CHANNEL_LOGOS['c8'];
        if (/\bcstar\b/.test(name)) return CHANNEL_LOGOS['cstar'];
        if (/\bgulli\b/.test(name)) return CHANNEL_LOGOS['gulli'];
        if (name.includes('bfm')) return CHANNEL_LOGOS['bfmtv'];
        if (name.includes('cnews')) return CHANNEL_LOGOS['cnews'];
        if (name.includes('lci')) return CHANNEL_LOGOS['lci'];
        if (name.includes('france 24') || name.includes('france24')) return CHANNEL_LOGOS['france24'];
        if (name.includes('tv5')) return CHANNEL_LOGOS['tv5monde'];

        // Afrique
        if (name.includes('trace africa')) return CHANNEL_LOGOS['traceafrica'];
        if (name.includes('trace urban')) return CHANNEL_LOGOS['traceurban'];
        if (name.includes('africa 24') || name.includes('africa24')) return CHANNEL_LOGOS['africa24'];
        if (name.includes('rti')) return CHANNEL_LOGOS['rti'];

        return DEFAULT_TV_LOGO;
    }

    // ── Création d'une carte de chaîne ──
    function createChannelCard(ch) {
        // En-tête de section (ex: ##### FRANCE GENERAL FHD #####)
        if (ch.name.startsWith('###')) {
            const header = document.createElement('div');
            header.className = 'channel-section-header';
            header.textContent = ch.name.replace(/#/g, '').trim() || ch.group;
            return header;
        }

        const card = document.createElement('div');
        card.className = 'channel-card' + (ch.index === currentIndex ? ' active' : '');
        card.dataset.index = ch.index;

        const isFav = isFavorite(ch.id);
        const logoSrc = getValidChannelLogo(ch);

        let subText = ch.group || ch.desc || ch.category || 'Direct';
        if (window.BokkEPG) {
            const prog = window.BokkEPG.getCurrentProgram(ch.name);
            if (prog && prog.title && !prog.title.includes('24/7')) {
                subText = prog.title;
            }
        }

        card.innerHTML = `
            <div class="card-logo-wrap">
                <img class="card-logo" src="${logoSrc}" alt="${ch.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_TV_LOGO}';">
            </div>
            <div class="card-content">
                <div class="card-top">
                    <span class="card-title" title="${ch.name}">${ch.name}</span>
                    <span class="card-badge">${ch.badge || 'HD'}</span>
                    ${ch.backupChannels && ch.backupChannels.length > 0 ? `<span style="background:rgba(56,189,248,0.18); border:1px solid rgba(56,189,248,0.4); color:#38bdf8; font-size:0.65rem; font-weight:700; padding:1px 5px; border-radius:4px; margin-left:4px;">${ch.backupChannels.length + 1} flux</span>` : ''}
                </div>
                <div class="card-subtitle" title="${subText}">${subText}</div>
            </div>
            <div class="audio-waves">
                <span class="wave-bar"></span>
                <span class="wave-bar"></span>
                <span class="wave-bar"></span>
            </div>
            <button class="card-fav-btn ${isFav ? 'is-fav' : ''}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                <svg width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            </button>
        `;

        card.onclick = () => {
            enableAudioOnFirstGesture();
            loadChannel(ch.index);
        };

        const favBtn = card.querySelector('.card-fav-btn');
        if (favBtn) {
            favBtn.onclick = (e) => toggleFavorite(ch.id, e);
        }

        return card;
    }

    // ── Rendu par morceaux (Chunked Progressive Rendering) ──
    function renderNextBatch() {
        if (renderedCount >= currentFiltered.length) return;
        const nextBatch = currentFiltered.slice(renderedCount, renderedCount + BATCH_SIZE);
        const fragment = document.createDocumentFragment();

        nextBatch.forEach(ch => {
            fragment.appendChild(createChannelCard(ch));
        });

        channelListEl.appendChild(fragment);
        renderedCount += nextBatch.length;
    }

    // ── Rendu de la liste des chaînes ──
    function renderChannelList(resetScroll = true) {
        if (!channelListEl) return;
        currentFiltered = getFilteredChannels();

        if (channelCountEl) {
            channelCountEl.textContent = `${currentFiltered.length.toLocaleString('fr-FR')} chaîne${currentFiltered.length > 1 ? 's' : ''} disponible${currentFiltered.length > 1 ? 's' : ''}`;
        }

        if (resetScroll) {
            channelListEl.scrollTop = 0;
            channelListEl.innerHTML = '';
            renderedCount = 0;
        }

        channelListEl.className = 'channel-list-scroll' + (isGridView ? ' grid-mode' : '');

        if (currentFiltered.length === 0) {
            channelListEl.innerHTML = `
                <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
                    <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin: 0 auto 12px; opacity: 0.5;">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);">Aucune chaîne trouvée</p>
                    <p style="font-size: 0.75rem; margin-top: 4px;">Modifiez votre recherche ou sélectionnez un autre bouquet.</p>
                </div>
            `;
            return;
        }

        renderNextBatch();
    }

    // ── Mise en valeur de la chaîne active ──
    function highlightActiveChannel() {
        document.querySelectorAll('.channel-card').forEach(card => {
            const idx = parseInt(card.dataset.index, 10);
            const isActive = (idx === currentIndex);
            card.classList.toggle('active', isActive);
            card.classList.toggle('is-playing', isActive && !videoEl.paused);
        });
    }

    function updateFavButtons() {
        const currentChannel = channels[currentIndex];
        if (currentChannel && playerFavBtn) {
            const isFav = isFavorite(currentChannel.id);
            playerFavBtn.classList.toggle('is-fav', isFav);
            playerFavBtn.style.color = isFav ? 'var(--gold)' : '#fff';
            playerFavBtn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
        }

        document.querySelectorAll('.card-fav-btn').forEach(btn => {
            const card = btn.closest('.channel-card');
            if (!card) return;
            const idx = parseInt(card.dataset.index, 10);
            const ch = channels[idx];
            if (ch) {
                const isFav = isFavorite(ch.id);
                btn.classList.toggle('is-fav', isFav);
                btn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
            }
        });
    }

    // ── Plein Écran & Mode Cinéma (Compatible iOS Safari, iPadOS, Android & Desktop) ──
    function toggleFullscreen() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Sur iPhone/iPad : Safari n'implémente pas standard requestFullscreen() sur les <div>
        // mais implémente webkitEnterFullscreen() directement sur l'élément <video>
        if (isIOS && videoEl && videoEl.webkitEnterFullscreen) {
            if (videoEl.webkitDisplayingFullscreen) {
                if (videoEl.webkitExitFullscreen) videoEl.webkitExitFullscreen();
            } else {
                videoEl.webkitEnterFullscreen();
            }
            return;
        }

        // Standard HTML5 Fullscreen API (Android, PC, Mac Chrome/Edge/Firefox)
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (!fsEl) {
            const req = playerContainer.requestFullscreen || 
                        playerContainer.webkitRequestFullscreen || 
                        playerContainer.mozRequestFullScreen || 
                        playerContainer.msRequestFullscreen;

            if (req) {
                req.call(playerContainer).then(() => {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                }).catch(() => {
                    // Si le conteneur est refusé, essayer directement sur la vidéo
                    if (videoEl && videoEl.webkitEnterFullscreen) {
                        videoEl.webkitEnterFullscreen();
                    }
                });
            } else if (videoEl && videoEl.webkitEnterFullscreen) {
                videoEl.webkitEnterFullscreen();
            }
        } else {
            const exit = document.exitFullscreen || 
                         document.webkitExitFullscreen || 
                         document.mozCancelFullScreen || 
                         document.msExitFullscreen;
            if (exit) exit.call(document).catch(() => {});
        }
    }

    // Événements d'état plein écran (Standards + Webkit iOS)
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
        document.addEventListener(evt, () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            if (fsExpandIcon) fsExpandIcon.style.display = isFs ? 'none' : 'block';
            if (fsShrinkIcon) fsShrinkIcon.style.display = isFs ? 'block' : 'none';
            if (!isFs && screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock().catch(() => {});
            }
        });
    });

    if (videoEl) {
        videoEl.addEventListener('webkitbeginfullscreen', () => {
            if (fsExpandIcon) fsExpandIcon.style.display = 'none';
            if (fsShrinkIcon) fsShrinkIcon.style.display = 'block';
        });
        videoEl.addEventListener('webkitendfullscreen', () => {
            if (fsExpandIcon) fsExpandIcon.style.display = 'block';
            if (fsShrinkIcon) fsShrinkIcon.style.display = 'none';
        });
    }

    function toggleTheaterMode() {
        document.body.classList.toggle('theater-mode');
        const isTheater = document.body.classList.contains('theater-mode');
        if (btnTheaterHdr) btnTheaterHdr.classList.toggle('active', isTheater);
        showToast(isTheater ? 'Mode Cinéma activé' : 'Mode Cinéma désactivé');
    }

    // ── Événements de lecture vidéo ──
    videoEl.addEventListener('play', () => {
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'block';
        highlightActiveChannel();
    });

    videoEl.addEventListener('pause', () => {
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
        highlightActiveChannel();
    });

    videoEl.addEventListener('volumechange', () => {
        const isMuted = videoEl.muted || videoEl.volume === 0;
        if (volHighIcon) volHighIcon.style.display = isMuted ? 'none' : 'block';
        if (volMutedIcon) volMutedIcon.style.display = isMuted ? 'block' : 'none';
        if (volumeSlider) volumeSlider.value = isMuted ? 0 : videoEl.volume;
    });

    // ── Écouteurs des boutons de contrôles ──
    if (ctrlPlay) {
        ctrlPlay.onclick = () => {
            if (videoEl.paused) videoEl.play().catch(() => {});
            else videoEl.pause();
        };
    }

    if (ctrlPrev) ctrlPrev.onclick = playPrevChannel;
    if (ctrlNext) ctrlNext.onclick = playNextChannel;

    if (ctrlMute) {
        ctrlMute.onclick = () => {
            videoEl.muted = !videoEl.muted;
        };
    }

    if (volumeSlider) {
        volumeSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            videoEl.volume = val;
            videoEl.muted = (val === 0);
        };
    }

    if (ctrlFullscreen) ctrlFullscreen.onclick = toggleFullscreen;
    if (ctrlTheater) ctrlTheater.onclick = toggleTheaterMode;
    if (btnTheaterHdr) btnTheaterHdr.onclick = toggleTheaterMode;

    if (ctrlPip) {
        ctrlPip.onclick = async () => {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else if (videoEl.requestPictureInPicture) {
                    await videoEl.requestPictureInPicture();
                }
            } catch (err) {
                showToast('Image dans l\'image non disponible pour ce flux');
            }
        };
    }

    if (playerFavBtn) {
        playerFavBtn.onclick = () => {
            if (currentIndex >= 0 && channels[currentIndex]) {
                toggleFavorite(channels[currentIndex].id);
            }
        };
    }

    let controlsHideTimeout = null;
    function showPlayerControlsTemporarily() {
        if (!playerContainer) return;
        playerContainer.classList.add('show-controls');
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
        controlsHideTimeout = setTimeout(() => {
            playerContainer.classList.remove('show-controls');
        }, 4000);
    }

    if (playerContainer) {
        playerContainer.ondblclick = toggleFullscreen;

        // Clic sur le lecteur : relance la lecture si en pause (résout les écrans noirs dus à l'autoplay) et bascule les contrôles
        playerContainer.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.quality-selector')) {
                showPlayerControlsTemporarily();
                return;
            }
            // Si la vidéo est en pause ou bloquée par la politique autoplay du navigateur
            if (videoEl && videoEl.paused && currentIndex >= 0) {
                userHasInteracted = true;
                ensureUnmuted();
                videoEl.play().catch(() => {});
            }
            if (playerContainer.classList.contains('show-controls')) {
                playerContainer.classList.remove('show-controls');
                if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
            } else {
                showPlayerControlsTemporarily();
            }
        });
    }

    // Réessayer / Flux de secours
    if (btnRetry) {
        btnRetry.onclick = () => {
            if (currentIndex >= 0) loadChannel(currentIndex, false);
        };
    }

    if (btnFallback) {
        btnFallback.onclick = () => {
            if (currentIndex >= 0) loadChannel(currentIndex, true);
        };
    }

    // ── Recherche ──
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentQuery = e.target.value;
            if (searchClearBtn) searchClearBtn.classList.toggle('visible', !!currentQuery);
            if (currentQuery.trim() !== '') {
                const pc = document.getElementById('page-catalogue');
                if (pc && pc.style.display === 'none') {
                    if (window._bokkSwitchView) window._bokkSwitchView('catalogue', true);
                }
            }
            renderChannelList(true);
        };

        searchInput.onfocus = () => {
            if (searchInput.value.trim() !== '' && window._bokkSwitchView) {
                const pc = document.getElementById('page-catalogue');
                if (pc && pc.style.display === 'none') {
                    window._bokkSwitchView('catalogue', true);
                }
            }
        };

        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const pc = document.getElementById('page-catalogue');
                if (pc && pc.style.display === 'none' && window._bokkSwitchView) {
                    window._bokkSwitchView('catalogue', true);
                }
                renderChannelList(true);
                searchInput.blur();
            }
        };
    }

    if (searchClearBtn) {
        searchClearBtn.onclick = () => {
            currentQuery = '';
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            searchClearBtn.classList.remove('visible');
            renderChannelList(true);
        };
    }

    // ── Basculer entre Vue Liste et Vue Grille ──
    const appSidebar = document.getElementById('app-sidebar');

    if (btnViewList) {
        btnViewList.onclick = () => {
            isGridView = false;
            localStorage.setItem('bokk_tv_view', 'list');
            btnViewList.classList.add('active');
            if (btnViewGrid) btnViewGrid.classList.remove('active');
            document.body.classList.remove('grid-view-active');
            if (appSidebar) appSidebar.classList.remove('grid-expanded');
            renderChannelList();
        };
    }

    if (btnViewGrid) {
        btnViewGrid.onclick = () => {
            isGridView = true;
            localStorage.setItem('bokk_tv_view', 'grid');
            btnViewGrid.classList.add('active');
            if (btnViewList) btnViewList.classList.remove('active');
            document.body.classList.add('grid-view-active');
            if (appSidebar) appSidebar.classList.add('grid-expanded');
            renderChannelList();
        };
    }

    // ── Modale Raccourcis ──
    function openModal() {
        if (shortcutsModal) shortcutsModal.classList.add('active');
    }

    function closeModal() {
        if (shortcutsModal) shortcutsModal.classList.remove('active');
    }

    if (btnShortcuts) btnShortcuts.onclick = openModal;
    if (btnCloseModal) btnCloseModal.onclick = closeModal;
    if (shortcutsModal) {
        shortcutsModal.onclick = (e) => {
            if (e.target === shortcutsModal) closeModal();
        };
    }

    // ── Raccourcis clavier globaux ──
    document.addEventListener('keydown', (e) => {
        // Ignorer si l'utilisateur est dans un champ de saisie
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
            if (e.key === 'Escape' && document.activeElement === searchInput) {
                searchInput.blur();
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 't':
                e.preventDefault();
                toggleTheaterMode();
                break;
            case 'm':
                e.preventDefault();
                videoEl.muted = !videoEl.muted;
                break;
            case '/':
                e.preventDefault();
                if (searchInput) searchInput.focus();
                break;
            case '?':
                e.preventDefault();
                openModal();
                break;
            case 'escape':
                closeModal();
                closeM3uModal();
                break;
        }
    });

    // ═══════════════ GESTION PLAYLIST M3U / M3U8 ═══════════════
    const m3uModal        = document.getElementById('m3u-modal');
    const btnOpenM3u      = document.getElementById('btn-open-m3u');
    const btnCloseM3u     = document.getElementById('btn-close-m3u');
    const tabBtnUrl       = document.getElementById('tab-btn-url');
    const tabBtnFile      = document.getElementById('tab-btn-file');
    const paneUrl         = document.getElementById('pane-url');
    const paneFile        = document.getElementById('pane-file');
    const m3uUrlInput     = document.getElementById('m3u-url-input');
    const btnLoadM3uUrl   = document.getElementById('btn-load-m3u-url');
    const m3uFileInput    = document.getElementById('m3u-file-input');
    const btnLoadM3uFile  = document.getElementById('btn-load-m3u-file');
    const fileChosenText  = document.getElementById('file-chosen-text');
    const m3uActiveInfo   = document.getElementById('m3u-active-info');
    const m3uCustomCount  = document.getElementById('m3u-custom-count');
    const btnClearM3u     = document.getElementById('btn-clear-m3u');

    function openM3uModal() {
        if (m3uModal) {
            m3uModal.classList.add('active');
            updateM3uModalStatus();
        }
    }

    function closeM3uModal() {
        if (m3uModal) m3uModal.classList.remove('active');
    }

    function updateM3uModalStatus() {
        const custom = getCustomChannels();
        if (custom.length > 0) {
            if (m3uActiveInfo) m3uActiveInfo.style.display = 'flex';
            if (m3uCustomCount) m3uCustomCount.textContent = `${custom.length} chaîne(s) M3U active(s)`;
        } else {
            if (m3uActiveInfo) m3uActiveInfo.style.display = 'none';
        }
    }

    function getCustomChannels() {
        try {
            return JSON.parse(localStorage.getItem('bokk_custom_m3u') || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveCustomChannels(newChannels) {
        localStorage.setItem('bokk_custom_m3u', JSON.stringify(newChannels));
        applyCustomChannels();
        currentCategory = 'playlist';
        userManuallySelectedCategory = true;
        renderCategories();
        renderChannelList(true);
        renderRecentChannels();
        checkExpiryBanner();
        updateM3uModalStatus();
        showToast(`${newChannels.length.toLocaleString('fr-FR')} chaîne(s) importée(s) avec succès`);
        closeM3uModal();
    }

    function parseM3U(content) {
        const lines = content.split(/\r?\n/);
        const parsed = [];
        let cur = null;
        let idCounter = 3000;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
                const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
                const logo = logoMatch ? logoMatch[1] : '';

                const groupMatch = line.match(/group-title="([^"]+)"/i);
                const group = groupMatch ? groupMatch[1].trim() : 'playlist';

                const commaIdx = line.lastIndexOf(',');
                const name = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : `Chaîne ${idCounter}`;

                cur = {
                    id: idCounter++,
                    name: name,
                    category: 'playlist',
                    badge: 'M3U',
                    desc: group !== 'playlist' ? group : 'Ma Playlist',
                    logo: logo,
                    type: 'hls'
                };
            } else if (line.startsWith('http://') || line.startsWith('https://')) {
                if (cur) {
                    cur.url = line;
                    parsed.push(cur);
                    cur = null;
                }
            }
        }
        return parsed;
    }

    function applyCustomChannels() {
        const custom = getCustomChannels();
        // Nettoyer les précédents custom channels du tableau principal
        for (let i = channels.length - 1; i >= 0; i--) {
            if (channels[i].category === 'playlist') {
                channels.splice(i, 1);
            }
        }

        if (custom.length > 0) {
            channels.push(...custom);
        }
    }

    // Onglets M3U
    if (tabBtnUrl && tabBtnFile && paneUrl && paneFile) {
        tabBtnUrl.onclick = () => {
            tabBtnUrl.classList.add('active');
            tabBtnFile.classList.remove('active');
            paneUrl.classList.add('active');
            paneFile.classList.remove('active');
        };
        tabBtnFile.onclick = () => {
            tabBtnFile.classList.add('active');
            tabBtnUrl.classList.remove('active');
            paneFile.classList.add('active');
            paneUrl.classList.remove('active');
        };
    }

    if (btnOpenM3u) btnOpenM3u.onclick = openM3uModal;
    if (btnCloseM3u) btnCloseM3u.onclick = closeM3uModal;
    if (m3uModal) {
        m3uModal.onclick = (e) => {
            if (e.target === m3uModal) closeM3uModal();
        };
    }

    // Charger via URL
    if (btnLoadM3uUrl && m3uUrlInput) {
        btnLoadM3uUrl.onclick = async () => {
            const url = m3uUrlInput.value.trim();
            if (!url) {
                showToast('Veuillez entrer une URL M3U valide');
                return;
            }
            btnLoadM3uUrl.textContent = 'Chargement en cours...';
            btnLoadM3uUrl.disabled = true;

            try {
                // Détection intelligente d'un lien Xtream Codes / MegaTV
                if (url.includes('username=') && url.includes('password=')) {
                    showToast('Chargement des flux depuis le serveur IPTV...');
                    const uObj = new URL(url);
                    const user = uObj.searchParams.get('username');
                    const pass = uObj.searchParams.get('password');
                    const host = `${uObj.protocol}//${uObj.host}`;

                    const catRes = await fetch(resolveStreamUrl(`${host}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`));
                    const cats = await catRes.json();
                    const catMap = {};
                    cats.forEach(c => { catMap[c.category_id] = c.category_name; });

                    const streamRes = await fetch(resolveStreamUrl(`${host}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`));
                    const streams = await streamRes.json();

                    const parsed = streams.map(s => ({
                        id: s.stream_id,
                        name: s.name,
                        category: 'playlist',
                        group: catMap[s.category_id] || 'MegaTV',
                        desc: catMap[s.category_id] || 'MegaTV',
                        badge: s.name.includes('FHD') ? 'FHD' : (s.name.includes('4K') ? '4K' : 'HD'),
                        logo: s.stream_icon || '',
                        url: `${host}/live/${user}/${pass}/${s.stream_id}.m3u8`,
                        fallbackUrl: `${host}/live/${user}/${pass}/${s.stream_id}.ts`,
                        type: 'hls'
                    }));

                    btnLoadM3uUrl.textContent = 'Charger la playlist M3U';
                    btnLoadM3uUrl.disabled = false;
                    saveCustomChannels(parsed);
                    populateBouquetFilter();
                    return;
                }

                const fetchUrl = resolveStreamUrl(url);
                const res = await fetch(fetchUrl);
                if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
                const text = await res.text();
                const parsed = parseM3U(text);
                if (!parsed.length) {
                    showToast('Aucun flux trouvé dans ce fichier M3U');
                } else {
                    saveCustomChannels(parsed);
                    populateBouquetFilter();
                    m3uUrlInput.value = '';
                }
            } catch (err) {
                console.error(err);
                showToast('Erreur lors du chargement. Vérifiez l\'URL ou importez le fichier .m3u directement.');
            } finally {
                btnLoadM3uUrl.textContent = 'Charger la playlist M3U';
                btnLoadM3uUrl.disabled = false;
            }
        };
    }

    // Sélection de fichier
    if (m3uFileInput && fileChosenText) {
        m3uFileInput.onchange = () => {
            if (m3uFileInput.files && m3uFileInput.files[0]) {
                fileChosenText.textContent = `Fichier choisi : ${m3uFileInput.files[0].name}`;
            }
        };
    }

    // Importer fichier
    if (btnLoadM3uFile && m3uFileInput) {
        btnLoadM3uFile.onclick = () => {
            if (!m3uFileInput.files || !m3uFileInput.files[0]) {
                showToast('Veuillez d\'abord sélectionner un fichier .m3u');
                return;
            }
            const file = m3uFileInput.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const parsed = parseM3U(text);
                if (!parsed.length) {
                    showToast('Aucun flux détecté dans ce fichier');
                } else {
                    saveCustomChannels(parsed);
                }
            };
            reader.readAsText(file);
        };
    }

    // Supprimer playlist custom
    if (btnClearM3u) {
        btnClearM3u.onclick = () => {
            localStorage.removeItem('bokk_custom_m3u');
            applyCustomChannels();
            renderCategories();
            renderChannelList();
            updateM3uModalStatus();
            showToast('Playlist personnalisée supprimée');
        };
    }

    // ── Détection automatique du pays de l'utilisateur ──
    // (userManuallySelectedCategory déclaré dans les variables d'état globales)

    function detectUserCountry() {
        try {
            // 1. Fuseau horaire (instantané et 100% fiable côté client)
            const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
            if (tz.includes('dakar') || tz.includes('senegal')) {
                return 'senegal';
            }
            if (tz.includes('paris') || tz.includes('brussels') || tz.includes('abidjan') || 
                tz.includes('bamako') || tz.includes('conakry') || tz.includes('ouagadougou') ||
                tz.includes('douala') || tz.includes('libreville') || tz.includes('kinshasa') ||
                tz.includes('lome') || tz.includes('cotonou') || tz.includes('niamey')) {
                return 'francophone';
            }
            if (tz.includes('madrid') || tz.includes('canary')) {
                return 'espagne';
            }
            if (tz.includes('rome')) {
                return 'italie';
            }
            if (tz.includes('berlin') || tz.includes('vienna')) {
                return 'allemagne';
            }
            if (tz.includes('tirane') || tz.includes('pristina')) {
                return 'albanie';
            }
            if (tz.includes('london') || tz.includes('new_york') || tz.includes('chicago') || 
                tz.includes('los_angeles') || tz.includes('denver') || tz.includes('toronto') ||
                tz.includes('sydney') || tz.includes('auckland') || tz.includes('dublin')) {
                return 'uk';
            }

            // 2. Langue du navigateur
            const lang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
            if (lang.includes('-sn') || lang.startsWith('wo')) return 'senegal';
            if (lang.startsWith('fr')) return 'francophone';
            if (lang.startsWith('es')) return 'espagne';
            if (lang.startsWith('it')) return 'italie';
            if (lang.startsWith('de')) return 'allemagne';
            if (lang.startsWith('sq')) return 'albanie';
            if (lang.startsWith('en')) return 'uk';
        } catch (e) {
            console.warn('[BOKK TV] Erreur détection pays synchrone :', e);
        }
        return 'senegal'; // Par défaut : Sénégal
    }

    async function autoDetectUserCountryAsync() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('https://ipwho.is/', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                const code = (data.country_code || '').toUpperCase();
                console.log('[BOKK TV] Pays détecté par IP :', code, data.country);
                let detected = null;
                if (code === 'SN') detected = 'senegal';
                else if (['FR', 'BE', 'CH', 'LU', 'MC', 'CI', 'ML', 'GN', 'BF', 'BJ', 'TG', 'CM', 'GA', 'CD', 'CG', 'DZ', 'MA', 'TN'].includes(code)) {
                    detected = 'francophone';
                } else if (['US', 'GB', 'UK', 'CA', 'AU', 'NZ', 'IE'].includes(code)) {
                    detected = 'uk';
                } else if (['ES', 'MX', 'AR', 'CO', 'CL', 'PE'].includes(code)) {
                    detected = 'espagne';
                } else if (code === 'IT') {
                    detected = 'italie';
                } else if (['DE', 'AT'].includes(code)) {
                    detected = 'allemagne';
                } else if (['AL', 'XK'].includes(code)) {
                    detected = 'albanie';
                }

                if (detected && detected !== currentCategory && !userManuallySelectedCategory) {
                    console.log(`[BOKK TV] Mise à jour automatique de la catégorie vers : ${detected}`);
                    currentCategory = detected;
                    renderCategories();
                    renderChannelList(true);
                    playFirstChannelOfCategory(detected);
                }
            }
        } catch (e) {
            // Déjà géré par la détection synchrone
        }
    }

    function playFirstChannelOfCategory(catKey) {
        let chIdx = channels.findIndex(ch => ch.category === catKey && !ch.name.startsWith('###'));
        if (chIdx < 0) {
            chIdx = channels.findIndex(ch => !ch.name.startsWith('###'));
        }
        if (chIdx >= 0) {
            loadChannel(chIdx);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // BOKK TV — MOTEUR DE STREAMING & MATCH CENTER CANAL+ / NETFLIX
    // ═══════════════════════════════════════════════════════════════

    // ── Recherche de chaîne universelle par ID ou Nom ──
    function loadChannelByIdOrQuery(targetId, queryName = '') {
        let foundIdx = -1;
        if (targetId !== undefined && targetId !== null && targetId !== '') {
            const targetIdStr = String(targetId).trim();
            const targetIdNum = Number(targetId);
            foundIdx = channels.findIndex(c => 
                String(c.id).trim() === targetIdStr || 
                String(c.stream_id).trim() === targetIdStr ||
                (!isNaN(targetIdNum) && (c.id === targetIdNum || c.stream_id === targetIdNum))
            );
        }

        // Si non trouvé par ID direct, recherche intelligente par Nom
        if (foundIdx === -1 && queryName) {
            const qClean = queryName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (qClean) {
                foundIdx = channels.findIndex(c => {
                    const cClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return cClean.includes(qClean) || qClean.includes(cClean);
                });
            }
            if (foundIdx === -1) {
                // Recherche par mots-clés (en ignorant les symboles et badges)
                const tokens = queryName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2 && !['hd', 'fhd', '4k', 'live', 'direct'].includes(t));
                if (tokens.length > 0) {
                    foundIdx = channels.findIndex(c => {
                        const cLower = c.name.toLowerCase();
                        return tokens.every(t => cLower.includes(t));
                    });
                }
            }
        }

        if (foundIdx !== -1) {
            revealPlayer();
            loadChannel(foundIdx);
            return true;
        } else {
            showToast(`Canal "${queryName || targetId}" non disponible dans cette playlist.`);
            return false;
        }
    }

    // ── Moteur du Slider Hero Billboard ──
    let heroMatches = [];
    let heroCurrentIndex = 0;
    let heroAutoTimer = null;
    let heroIsPaused = false;
    let heroCleanTimer = null;

    // Détection stricte d'un événement passé ou expiré (selon l'heure exacte et le jour)
    function isMatchPassed(m, now = new Date()) {
        if (!m) return true;
        if (m.isFinished) return true;
        if (m.isLive) return false;

        const nowTs = now.getTime();

        // 1. Timestamp brut en secondes ou millisecondes
        if (m.rawDate) {
            const matchTs = m.rawDate < 10000000000 ? m.rawDate * 1000 : m.rawDate;
            if (matchTs + (2.25 * 3600 * 1000) < nowTs) {
                return true;
            }
            const matchDateObj = new Date(matchTs);
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfMatchDay = new Date(matchDateObj.getFullYear(), matchDateObj.getMonth(), matchDateObj.getDate()).getTime();
            if (startOfMatchDay < startOfToday) {
                return true;
            }
            return false;
        }

        // 2. Vérification textuelle de date (ex. "Dim. 8 Nov.", "2 nov", "Hier")
        if (m.date) {
            const dStr = m.date.toLowerCase();
            if (dStr.includes('hier') || dStr.includes('terminé')) return true;

            const numMatch = dStr.match(/(\d{1,2})\s*(nov|déc|dec|jan|fév|fev|mar|avr|mai|juin|juil|août|aout|sep|oct)/i);
            if (numMatch) {
                const dayNum = parseInt(numMatch[1], 10);
                const monthStr = numMatch[2].toLowerCase();
                const curMonth = now.getMonth(); // 10 = Nov
                const curDay = now.getDate();
                if (monthStr.startsWith('nov') && curMonth === 10) {
                    if (dayNum < curDay) return true;
                }
            }
        }
        return false;
    }

    // Purge automatique en temps réel des affiches du header dès qu'un match expire
    function cleanAndRefreshHeroMatches() {
        const all = (typeof window !== 'undefined' && Array.isArray(window.FEATURED_MATCHES))
            ? window.FEATURED_MATCHES
            : [];
        if (!all || all.length === 0) return;

        const now = new Date();
        const valid = all.filter(m => !isMatchPassed(m, now));

        const countChanged = valid.length !== (heroMatches ? heroMatches.length : 0);
        window.FEATURED_MATCHES = valid;
        heroMatches = valid;

        const billboard = document.getElementById('hero-billboard');
        if (heroMatches.length === 0) {
            if (billboard) billboard.style.display = 'none';
            return;
        } else {
            if (billboard) billboard.style.display = '';
        }

        if (heroCurrentIndex >= heroMatches.length) {
            heroCurrentIndex = 0;
        }

        if (countChanged) {
            renderHeroSlide(heroCurrentIndex);
            if (typeof renderMatchesScrollRow === 'function') {
                renderMatchesScrollRow(currentMatchFilter);
            }
        }
    }

    // ── Configuration du Hero Billboard (Slider interactif avec chaînes et défilement) ──
    function setupHeroBillboard() {
        const matches = (typeof window !== 'undefined' && Array.isArray(window.FEATURED_MATCHES))
            ? window.FEATURED_MATCHES
            : [];
        if (!matches || matches.length === 0) return;

        const now = new Date();
        heroMatches = matches.filter(m => !isMatchPassed(m, now));
        heroCurrentIndex = 0;

        if (heroCleanTimer) clearInterval(heroCleanTimer);
        heroCleanTimer = setInterval(cleanAndRefreshHeroMatches, 30000);

        const prevBtn = document.getElementById('hero-arrow-prev');
        const nextBtn = document.getElementById('hero-arrow-next');
        const billboard = document.getElementById('hero-billboard');

        if (prevBtn) {
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                prevHeroSlide();
            };
        }
        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                nextHeroSlide();
            };
        }

        // Pause de l'auto-rotation au survol
        if (billboard && !billboard._hoverBound) {
            billboard._hoverBound = true;
            billboard.addEventListener('mouseenter', () => { heroIsPaused = true; });
            billboard.addEventListener('mouseleave', () => { heroIsPaused = false; });

            // Support du swipe tactile — STRICTEMENT horizontal pour ne pas perturber le scroll de la page
            let touchStartX = 0, touchStartY = 0;
            billboard.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length > 0) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    heroIsPaused = true;
                }
            }, { passive: true });
            billboard.addEventListener('touchend', (e) => {
                heroIsPaused = false;
                if (e.changedTouches && e.changedTouches.length > 0) {
                    const dx = e.changedTouches[0].clientX - touchStartX;
                    const dy = e.changedTouches[0].clientY - touchStartY;
                    // Déclenche uniquement si geste intentionnel horizontal (au moins 2x plus horizontal que vertical)
                    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
                        if (dx > 0) prevHeroSlide();
                        else nextHeroSlide();
                    }
                }
            }, { passive: true });
        }

        // Rendu de la première slide
        renderHeroSlide(0);

        // Défilement automatique toutes les 7 secondes
        if (heroAutoTimer) clearInterval(heroAutoTimer);
        heroAutoTimer = setInterval(() => {
            if (!heroIsPaused) nextHeroSlide();
        }, 7000);
    }

    function nextHeroSlide() {
        if (!heroMatches || heroMatches.length === 0) return;
        renderHeroSlide((heroCurrentIndex + 1) % heroMatches.length);
    }

    function prevHeroSlide() {
        if (!heroMatches || heroMatches.length === 0) return;
        renderHeroSlide((heroCurrentIndex - 1 + heroMatches.length) % heroMatches.length);
    }

    function renderHeroSlide(index) {
        if (!heroMatches || heroMatches.length === 0) return;
        heroCurrentIndex = (index + heroMatches.length) % heroMatches.length;
        const match = heroMatches[heroCurrentIndex];
        if (!match) return;

        const heroBgImg    = document.getElementById('hero-bg-img');
        const heroHeadline = document.getElementById('hero-headline');
        const heroSub      = document.getElementById('hero-sub');
        const heroEyebrow  = document.getElementById('hero-eyebrow');
        const heroBtnWatch = document.getElementById('hero-btn-watch');
        const heroBtnMatches = document.getElementById('hero-btn-matches');
        const chipsContainer = document.getElementById('hero-channels-chips');
        const channelsBox  = document.getElementById('hero-channels-box');
        const tagsRow      = document.getElementById('hero-tags-row');
        const dotsEl       = document.getElementById('hero-dots');

        // Transition d'affiche d'arrière-plan en fondu
        if (heroBgImg && match.poster) {
            heroBgImg.classList.add('is-fading');
            setTimeout(() => {
                heroBgImg.style.backgroundImage = `url('${match.poster}')`;
                heroBgImg.classList.remove('is-fading');
            }, 180);
        }

        // En-tête / statut live ou date
        if (heroEyebrow) {
            const dot = heroEyebrow.querySelector('.hero-live-dot');
            const txt = heroEyebrow.querySelector('#hero-eyebrow-text') || heroEyebrow.querySelector('span:last-child');
            if (match.isLive) {
                if (dot) dot.style.display = 'inline-block';
                if (txt) txt.textContent = `EN DIRECT • ${match.liveMinute || match.score || ''}`;
            } else {
                if (dot) dot.style.display = 'none';
                if (txt) txt.textContent = `${match.competitionBadge || match.competition} • ${match.date} ${match.time}`;
            }
        }

        // Titre du match
        if (heroHeadline) {
            const teamAName = match.teamA ? match.teamA.name.toUpperCase() : 'ÉQUIPE A';
            const teamBName = match.teamB ? match.teamB.name.toUpperCase() : 'ÉQUIPE B';
            heroHeadline.innerHTML = `${teamAName} <span class="hero-vs">VS</span> ${teamBName}`;
        }

        // Sous-titre descriptif — court et lisible sur mobile
        if (heroSub) {
            const timeInfo = match.isLive ? 'En direct' : `${match.date} · ${match.time}`;
            heroSub.textContent = `${timeInfo} · HD & 4K`;
        }

        // Indication dynamique des chaînes de diffusion directe
        if (chipsContainer) {
            if (match.channels && match.channels.length > 0) {
                chipsContainer.innerHTML = match.channels.map(ch => `
                    <button class="hero-ch-chip" data-chid="${ch.id}" data-chname="${ch.name}">
                        <span class="hero-ch-badge">${ch.badge || ch.quality || 'HD'}</span>
                        <span>${ch.name}</span>
                    </button>
                `).join('');

                chipsContainer.querySelectorAll('.hero-ch-chip').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const chId = btn.dataset.chid;
                        const chName = btn.dataset.chname;
                        showToast(`Lancement de ${chName} (${match.title})`);
                        enableAudioOnFirstGesture();
                        revealPlayer();
                        loadChannelByIdOrQuery(chId, chName);
                    };
                });
                if (channelsBox) channelsBox.style.display = 'flex';
            } else {
                if (channelsBox) channelsBox.style.display = 'none';
            }
        }

        // Bouton Regarder en direct
        if (heroBtnWatch) {
            heroBtnWatch.onclick = () => {
                if (match.channels && match.channels.length > 0) {
                    const firstCh = match.channels[0];
                    showToast(`Lancement de ${firstCh.name} (${match.title})`);
                    enableAudioOnFirstGesture();
                    revealPlayer();
                    loadChannelByIdOrQuery(firstCh.id, firstCh.name);
                } else {
                    const sec = document.getElementById('section-matchs');
                    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };
        }

        // Bouton Voir tous les matchs
        if (heroBtnMatches && !heroBtnMatches._bound) {
            heroBtnMatches._bound = true;
            heroBtnMatches.onclick = () => {
                const sec = document.getElementById('section-matchs');
                if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
        }

        // Défilement latéral des tags / pills
        if (tagsRow) {
            tagsRow.innerHTML = heroMatches.map((m, idx) => {
                const isAct = idx === heroCurrentIndex;
                const isLive = m.isLive;
                const pillLabel = m.competitionBadge || m.stage || (m.teamA ? m.teamA.name.split(' ').slice(-1)[0] + ' - ' + m.teamB.name.split(' ').slice(-1)[0] : m.title);
                return `
                    <span class="hero-tag-pill ${isLive ? 'live-tag' : ''} ${isAct ? 'active' : ''}" data-idx="${idx}">
                        ${isLive ? '<span class="live-dot-sm"></span>' : ''} ${pillLabel}
                    </span>
                `;
            }).join('');

            tagsRow.querySelectorAll('.hero-tag-pill').forEach(pill => {
                pill.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(pill.dataset.idx, 10);
                    renderHeroSlide(idx);
                };
            });

            // Défilement doux du conteneur tagsRow vers la pastille active (JAMAIS scrollIntoView qui manipule la page !)
            const activePill = tagsRow.querySelector('.hero-tag-pill.active');
            if (activePill && tagsRow) {
                const targetLeft = activePill.offsetLeft - (tagsRow.clientWidth - activePill.clientWidth) / 2;
                tagsRow.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
            }
        }

        // Indicateurs de pagination (Dots)
        if (dotsEl) {
            dotsEl.innerHTML = heroMatches.map((_, idx) => `
                <span class="hero-dot ${idx === heroCurrentIndex ? 'active' : ''}" data-idx="${idx}"></span>
            `).join('');

            dotsEl.querySelectorAll('.hero-dot').forEach(dot => {
                dot.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(dot.dataset.idx, 10);
                    renderHeroSlide(idx);
                };
            });
        }
    }

    // ── Rendu du Match Center (Affiches des Grands Chocs) ──
    function renderMatchCenter(filter = 'all') {
        const matchesGrid = document.getElementById('matches-grid');
        const matchFilters = document.getElementById('match-filters');
        if (!matchesGrid) return;

        const matches = (typeof window !== 'undefined' && window.FEATURED_MATCHES) ? window.FEATURED_MATCHES : [];
        matchesGrid.innerHTML = '';

        const filtered = matches.filter(m => {
            if (filter === 'all') return true;
            return m.category === filter;
        });

        filtered.forEach(m => {
            const card = document.createElement('article');
            card.className = 'match-card';

            const statusClass = m.isLive ? 'live' : 'scheduled';
            const statusHtml = m.isLive 
                ? `<span class="match-status-pill live"><span class="live-dot"></span> DIRECT ${m.liveMinute || ''}</span>`
                : `<span class="match-status-pill scheduled">${m.date} • ${m.time}</span>`;

            card.innerHTML = `
                <div class="match-poster-header" style="background-image: url('${m.poster}');">
                    <div class="match-poster-overlay"></div>
                    <div class="match-top-row">
                        <span class="match-comp-pill">${m.competitionBadge || m.competition}</span>
                        ${statusHtml}
                    </div>
                    <div class="match-teams-showcase">
                        <div class="card-team">
                            <img src="${m.teamA.logo}" alt="${m.teamA.name}" class="card-team-logo" referrerpolicy="no-referrer" onerror="this.style.opacity='0.5';">
                            <span class="card-team-name">${m.teamA.name}</span>
                        </div>
                        <div class="match-center-badge">
                            <span class="match-score-badge">${m.score || 'VS'}</span>
                            ${m.isLive && m.liveMinute ? `<span class="match-minute-badge">${m.liveMinute}</span>` : ''}
                        </div>
                        <div class="card-team">
                            <img src="${m.teamB.logo}" alt="${m.teamB.name}" class="card-team-logo" referrerpolicy="no-referrer" onerror="this.style.opacity='0.5';">
                            <span class="card-team-name">${m.teamB.name}</span>
                        </div>
                    </div>
                </div>
                <div class="match-card-body">
                    <div>
                        <h3 class="match-card-title">${m.title}</h3>
                        <p class="match-card-stage">${m.stage}</p>
                    </div>
                    <p class="match-card-desc">${m.description}</p>
                    <div class="match-channels-box">
                        <span class="match-channels-label">Chaînes de diffusion directe :</span>
                        <div class="match-channels-list"></div>
                    </div>
                </div>
            `;

            // Boutons chaînes
            const chListEl = card.querySelector('.match-channels-list');
            (m.channels || []).forEach(ch => {
                const btn = document.createElement('button');
                btn.className = 'match-ch-btn';
                btn.innerHTML = `<span class="match-ch-quality">${ch.badge || 'HD'}</span> <span>▶ ${ch.name}</span>`;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showToast(`▶ Lancement de ${ch.name} (${m.title})`);
                    loadChannelByIdOrQuery(ch.id, ch.name);
                });
                chListEl.appendChild(btn);
            });

            // Clic sur l'ensemble de la carte lance la première chaîne
            card.addEventListener('click', () => {
                if (m.channels && m.channels.length > 0) {
                    showToast(`▶ Lancement de ${m.channels[0].name} (${m.title})`);
                    loadChannelByIdOrQuery(m.channels[0].id, m.channels[0].name);
                }
            });

            matchesGrid.appendChild(card);
        });

        // Gestionnaires des filtres
        if (matchFilters) {
            matchFilters.querySelectorAll('.filter-pill').forEach(btn => {
                btn.onclick = () => {
                    matchFilters.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderMatchCenter(btn.dataset.matchFilter);
                };
            });
        }
    }

    // ── Rendu des Carrousels Thématiques Horizontaux (Netflix Rows) ──
    function createCarouselCard(channel, index) {
        const card = document.createElement('div');
        card.className = 'carousel-card';
        card.dataset.index = index;

        const isFav = isFavorite(channel.id);
        const logoSrc = getValidChannelLogo(channel);
        const quality = channel.badge || (channel.name.includes('4K') ? '4K' : (channel.name.includes('FHD') ? '1080p' : 'HD'));

        let carouselSub = channel.group || channel.category || 'Direct';
        if (window.BokkEPG) {
            const prog = window.BokkEPG.getCurrentProgram(channel.name);
            if (prog && prog.title && !prog.title.includes('24/7')) {
                carouselSub = prog.title;
            }
        }

        card.innerHTML = `
            <div class="card-visual-box">
                <div class="card-badges-top">
                    <span class="card-badge-quality">${quality}</span>
                    <button class="card-fav-btn ${isFav ? 'active' : ''}" title="Ajouter aux favoris">
                        <svg width="14" height="14" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                </div>
                <img src="${logoSrc}" alt="${channel.name}" class="card-logo-img" loading="lazy" onerror="this.onerror=null; this.src='${DEFAULT_TV_LOGO}';">
                <div class="card-play-overlay">
                    <div class="play-bubble">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </div>
                </div>
            </div>
            <div class="card-info-box">
                <div class="card-channel-name" title="${channel.name}">${channel.name}</div>
                <div class="card-channel-sub" title="${carouselSub}">${carouselSub}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            enableAudioOnFirstGesture();
            revealPlayer();
            loadChannel(index);
        });

        const favBtn = card.querySelector('.card-fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(channel.id, e);
                const nowFav = isFavorite(channel.id);
                favBtn.classList.toggle('active', nowFav);
                const svg = favBtn.querySelector('svg');
                if (svg) svg.setAttribute('fill', nowFav ? 'currentColor' : 'none');
                updateFavoritesRow();
            });
        }

        return card;
    }

    function populateCarouselRow(trackId, filterFn, max = 24) {
        const track = document.getElementById(trackId);
        if (!track) return;
        track.innerHTML = '';

        let count = 0;
        for (let i = 0; i < channels.length && count < max; i++) {
            const ch = channels[i];
            if (ch.name.startsWith('###')) continue;
            if (window.BokkFirebase && window.BokkFirebase.isDisabled(ch.id)) continue;
            if (filterFn(ch)) {
                track.appendChild(createCarouselCard(ch, i));
                count++;
            }
        }
    }

    function updateFavoritesRow() {
        const row = document.getElementById('row-favoris');
        const track = document.getElementById('track-favoris');
        const countEl = document.getElementById('count-favoris');
        if (!row || !track) return;

        const favIds = getFavorites();
        if (favIds.length === 0) {
            row.style.display = 'none';
            return;
        }

        row.style.display = 'flex';
        track.innerHTML = '';
        let found = 0;
        favIds.forEach(id => {
            const idx = channels.findIndex(c => c.id === id);
            if (idx !== -1) {
                track.appendChild(createCarouselCard(channels[idx], idx));
                found++;
            }
        });
        if (countEl) countEl.textContent = `${found} favoris`;
    }

    function renderStreamingCarousels() {
        // Les carousels home sont maintenant gérés par renderHomeCarousels()
        // Cette fonction gère uniquement les favoris et les flèches de navigation

        // Favoris
        updateFavoritesRow();

        // Flèches de navigation carrousel
        document.querySelectorAll('.carousel-arrow').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const track = document.getElementById(targetId);
                if (!track) return;
                const isNext = btn.classList.contains('next');
                track.scrollBy({ left: isNext ? 460 : -460, behavior: 'smooth' });
            };
        });
    }

    // ── Quick Zapping Ribbon (Sous le lecteur) ──
    function updateQuickZappingBar() {
        const quickZappingScroll = document.getElementById('quick-zapping-scroll');
        if (!quickZappingScroll) return;
        quickZappingScroll.innerHTML = '';

        if (currentIndex < 0 || currentIndex >= channels.length) return;

        const start = Math.max(0, currentIndex - 5);
        const end = Math.min(channels.length, currentIndex + 7);

        for (let i = start; i < end; i++) {
            const ch = channels[i];
            if (ch.name.startsWith('###')) continue;

            const pill = document.createElement('button');
            pill.className = `zap-pill ${i === currentIndex ? 'active' : ''}`;
            pill.innerHTML = `<span style="font-size:0.65rem; opacity:0.7;">${ch.badge || 'HD'}</span> <span>${ch.name}</span>`;
            pill.onclick = () => loadChannel(i);
            quickZappingScroll.appendChild(pill);
        }
    }

    // ── Horloge Nav ──
    function updateNavClock() {
        const cl = document.getElementById('topnav-clock');
        if (!cl) return;
        const now = new Date();
        cl.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    }

    // ── Révéler le lecteur ──
    function revealPlayer() {
        const pw = document.getElementById('player-wrapper');
        if (pw) {
            pw.classList.remove('is-mini-pip');
            pw.style.display = 'block';
            // scrollIntoView supprimé — cause des sauts brusques sur mobile
            // On scroll seulement si le lecteur est hors champ
            const rect = pw.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
                pw.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    // ── Switcher de vues (page-home / page-catalogue) ──
        // ── VUE DÉCOUVRIR (Style Reezn / Netflix Mobile & Desktop) ──
    function renderDiscoverPage() {
        // 1. Grands Chocs en Vedette
        const matchesContainer = document.getElementById('discover-matches-container');
        if (matchesContainer) {
            matchesContainer.innerHTML = '';
            const allMatches = (typeof window !== 'undefined' && Array.isArray(window.FEATURED_MATCHES))
                ? window.FEATURED_MATCHES
                : [];
            const upcoming = allMatches.filter(m => !isMatchPassed(m)).slice(0, 6);
            if (upcoming.length > 0) {
                upcoming.forEach(m => {
                    const card = createMatchMiniCard(m);
                    matchesContainer.appendChild(card);
                });
            } else {
                matchesContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; padding:12px;">Aucun grand choc en attente pour le moment.</p>';
            }
        }

        // 2. Carrousel Cinéma & Séries
        populateCarouselRow('discover-cinema-row', c =>
            c.name && /cinema|ciné\+|ocs|action|warner|paramount|hbo/i.test(c.name),
        24);

        // 3. Carrousel Sénégal
        populateCarouselRow('discover-senegal-row', c =>
            (c.name && /rts|tfm|2stv|sen tv|walf|sunu/i.test(c.name)) ||
            (c.group && c.group.toLowerCase().includes('sénégal')),
        24);

        // 4. Carrousel Sports
        populateCarouselRow('discover-sports-row', c =>
            c.name && /bein|canal\+ sport|canal\+ foot|rmc|dazn|sky sport|m\+ laliga/i.test(c.name),
        24);

        // Bouton Zapping Surprise (lance une chaîne premium au hasard)
        const surpriseBtn = document.getElementById('discover-btn-surprise');
        if (surpriseBtn) {
            surpriseBtn.onclick = () => {
                const premiumKeywords = ['canal+', 'bein', 'tf1', 'rts', 'm6', 'arte', 'france 2'];
                const pool = channels.filter(c => premiumKeywords.some(k => (c.name || '').toLowerCase().includes(k)));
                const chosen = (pool.length > 0) ? pool[Math.floor(Math.random() * pool.length)] : channels[Math.floor(Math.random() * channels.length)];
                if (chosen) {
                    const idx = channels.indexOf(chosen);
                    showToast(`🎲 Zapping Surprise : ${chosen.name}`);
                    enableAudioOnFirstGesture();
                    revealPlayer();
                    loadChannel(idx >= 0 ? idx : 0);
                }
            };
        }

        // Bouton Toutes les Chaînes
        const liveTvBtn = document.getElementById('discover-btn-live-tv');
        if (liveTvBtn) {
            liveTvBtn.onclick = () => {
                switchView('tv');
            };
        }

        // Bouton Tout voir Chocs
        const seeAllMatchesBtn = document.getElementById('discover-see-all-matches');
        if (seeAllMatchesBtn) {
            seeAllMatchesBtn.onclick = () => {
                switchView('home');
                setTimeout(() => {
                    const sec = document.getElementById('section-matchs');
                    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            };
        }
    }

    // ── VUE MA LISTE (Favoris) ──
    function renderFavoritesPage() {
        const listEl = document.getElementById('favorites-channel-list');
        const emptyBox = document.getElementById('favorites-empty-box');
        const countSub = document.getElementById('fav-count-subtitle');
        if (!listEl) return;

        const favIds = getFavorites();
        if (favIds.length === 0) {
            listEl.innerHTML = '';
            if (emptyBox) emptyBox.style.display = 'block';
            if (countSub) countSub.textContent = '0 chaîne enregistrée';
            const goTvBtn = document.getElementById('fav-go-tv');
            if (goTvBtn) {
                goTvBtn.onclick = () => switchView('tv');
            }
            return;
        }

        if (emptyBox) emptyBox.style.display = 'none';
        listEl.innerHTML = '';
        let found = 0;
        const frag = document.createDocumentFragment();

        favIds.forEach(id => {
            const idx = channels.findIndex(c => c.id === id);
            if (idx !== -1) {
                frag.appendChild(createChannelCard(channels[idx]));
                found++;
            }
        });
        listEl.appendChild(frag);
        if (countSub) {
            countSub.textContent = `${found} chaîne${found > 1 ? 's' : ''} favorite${found > 1 ? 's' : ''}`;
        }
    }

    // ── Switcher de vues (home / tv / discover / favorites / catalogue) ──
    function setupViewSwitching() {
        const pageHome      = document.getElementById('page-home');
        const pageCatalogue = document.getElementById('page-catalogue');
        const pageDiscover  = document.getElementById('page-discover');
        const pageFavorites = document.getElementById('page-favorites');
        const pw            = document.getElementById('player-wrapper');

        function switchView(view, skipScroll = false) {
            // Mettre à jour les onglets actifs desktop et mobile
            document.querySelectorAll('.tmenu-item').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === view);
            });
            document.querySelectorAll('.mnav-item[data-view]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === view);
            });

            // Masquer toutes les vues
            if (pageHome) pageHome.style.display = 'none';
            if (pageCatalogue) pageCatalogue.style.display = 'none';
            if (pageDiscover) pageDiscover.style.display = 'none';
            if (pageFavorites) pageFavorites.style.display = 'none';

            if (view === 'home') {
                if (pageHome) pageHome.style.display = 'block';
                if (!skipScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (view === 'discover') {
                if (pageDiscover) pageDiscover.style.display = 'block';
                renderDiscoverPage();
                if (!skipScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (view === 'favorites') {
                if (pageFavorites) pageFavorites.style.display = 'block';
                renderFavoritesPage();
                if (!skipScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                // Vue TV / Catalogue
                if (pageCatalogue) pageCatalogue.style.display = 'block';
                if (!skipScroll) window.scrollTo({ top: 0, behavior: 'smooth' });

                // Activer la bonne catégorie selon l'onglet
                const catMap = {
                    'tv': 'tous',          // Sur TV : TOUTES les 6 039 chaînes sont là, plus de filtre forcé !
                    'live': 'tous',
                    'catalogue': 'tous',
                    'sport': 'sport',
                    'films': 'cinema',
                    'series': 'cinema',
                    'senegal': 'senegal'
                };
                const targetCat = catMap[view] || (view === 'tous' ? 'tous' : view);
                currentCategory = targetCat;
                userManuallySelectedCategory = true;
                renderCategories();
                renderChannelList(true);
            }
        }

        // Boutons du menu principal desktop & mobile
        document.querySelectorAll('.tmenu-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });

        document.querySelectorAll('.mnav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });

        // Recherche rapide dans la vue TV
        const catSearchInput = document.getElementById('catalogue-search-input');
        const catSearchClear = document.getElementById('catalogue-search-clear');
        if (catSearchInput) {
            catSearchInput.addEventListener('input', (e) => {
                currentQuery = e.target.value;
                if (catSearchClear) catSearchClear.style.display = currentQuery ? 'flex' : 'none';
                if (searchInput) searchInput.value = currentQuery;
                renderChannelList(true);
            });
            if (catSearchClear) {
                catSearchClear.addEventListener('click', () => {
                    catSearchInput.value = '';
                    currentQuery = '';
                    catSearchClear.style.display = 'none';
                    if (searchInput) searchInput.value = '';
                    renderChannelList(true);
                });
            }
        }

        // Bouton recherche sur mobile / topnav
        const topnavSearchToggle = document.getElementById('topnav-search-toggle');
        if (topnavSearchToggle) {
            topnavSearchToggle.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.focus();
                    const box = document.getElementById('topnav-search-box');
                    if (box) box.classList.toggle('active');
                }
            });
        }

        const mnavBtnSearch = document.getElementById('mnav-btn-search');
        if (mnavBtnSearch) {
            mnavBtnSearch.addEventListener('click', () => {
                switchView('tv');
                document.querySelectorAll('.mnav-item').forEach(b => b.classList.remove('active'));
                mnavBtnSearch.classList.add('active');
                if (searchInput) {
                    searchInput.focus();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        // Bouton Plus sur Mobile (Ouvre le bottom sheet)
        const mnavBtnMore = document.getElementById('mnav-btn-more');
        const moreSheetBackdrop = document.getElementById('more-sheet-backdrop');
        const moreSheetClose = document.getElementById('more-sheet-close');
        if (mnavBtnMore && moreSheetBackdrop) {
            mnavBtnMore.addEventListener('click', () => {
                moreSheetBackdrop.style.display = 'flex';
            });
            if (moreSheetClose) {
                moreSheetClose.addEventListener('click', () => {
                    moreSheetBackdrop.style.display = 'none';
                });
            }
            moreSheetBackdrop.addEventListener('click', (e) => {
                if (e.target === moreSheetBackdrop) {
                    moreSheetBackdrop.style.display = 'none';
                }
            });
        }

        // Détection de défilement pour passer le lecteur en mini-PIP (flottant)
        window.addEventListener('scroll', () => {
            if (!pw || pw.style.display === 'none' || (!hlsInstance && !mpegtsInstance && (!videoEl || videoEl.paused))) return;
            const scrollThreshold = 420;
            if (window.scrollY > scrollThreshold && !pw.classList.contains('is-mini-pip')) {
                pw.classList.add('is-mini-pip');
            } else if (window.scrollY <= scrollThreshold && pw.classList.contains('is-mini-pip')) {
                pw.classList.remove('is-mini-pip');
            }
        }, { passive: true });

        // Clic sur le mini-lecteur flottant pour remonter et le restaurer
        if (pw) {
            pw.addEventListener('click', (e) => {
                if (pw.classList.contains('is-mini-pip')) {
                    if (e.target.closest('#player-float-close') || e.target.closest('#player-close-btn') || e.target.closest('.ctrl-btn') || e.target.closest('button')) return;
                    pw.classList.remove('is-mini-pip');
                    pw.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        // Bouton fermer le lecteur flottant
        const playerFloatClose = document.getElementById('player-float-close');
        if (playerFloatClose) {
            playerFloatClose.addEventListener('click', (e) => {
                e.stopPropagation();
                const pw2 = document.getElementById('player-wrapper');
                if (pw2) {
                    pw2.classList.remove('is-mini-pip');
                    pw2.style.display = 'none';
                }
                destroyActivePlayer();
            });
        }

        // Exposer switchView globalement
        window._bokkSwitchView = switchView;
    }

    // ── EN DIRECT — Logos des grandes chaînes (style exact myCANAL) ──
    function renderLiveLogosRow() {
        const row = document.getElementById('live-logos-row');
        if (!row) return;
        row.innerHTML = '';

        // Chaînes EN DIRECT vedettes avec leurs IDs vérifiés 100% fonctionnels du catalogue
        const LIVE_FEATURED = [
            { id: 5,    name: 'RTS 1 Sénégal', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png' },
            { id: 13,   name: '2sTV Sénégal',  logo: 'https://upload.wikimedia.org/wikipedia/fr/a/ab/2sTV_logo.png' },
            { id: 2057, name: 'TF1',           logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tf1-fr.png' },
            { id: 2058, name: 'France 2',      logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-2-fr.png' },
            { id: 2059, name: 'France 3',      logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-3-fr.png' },
            { id: 2063, name: 'M6',            logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/m6-fr.png' },
            { id: 2066, name: 'W9',            logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/w9-fr.png' },
            { id: 2065, name: 'Arte',          logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/arte-fr.png' },
            { id: 98,   name: 'Canal+ Foot',   logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-foot-fr.png' },
            { id: 97,   name: 'Canal+ 360',    logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-360-fr.png' },
            { id: 2342, name: 'Canal+ Sport',  logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-fr.png' },
            { id: 2195, name: 'beIN Sports 1', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-1-french-fr.png' },
            { id: 2198, name: 'beIN Sports 2', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-2-french-fr.png' },
        ];

        LIVE_FEATURED.forEach(featured => {
            // Trouver l'index dans le tableau des chaînes
            const idx = channels.findIndex(c => c.id === featured.id || c.name.toLowerCase().includes(featured.name.toLowerCase()));

            const card = document.createElement('div');
            card.className = 'live-logo-card' + (idx === currentIndex ? ' now-playing' : '');
            card.title = featured.name;

            // Badge LIVE
            const badge = document.createElement('span');
            badge.className = 'live-channel-mini-badge';
            badge.textContent = 'LIVE';
            card.appendChild(badge);

            // Logo ou texte
            if (featured.logo) {
                const img = document.createElement('img');
                img.src = featured.logo;
                img.alt = featured.name;
                img.onerror = function() {
                    this.onerror = null;
                    this.remove();
                    const txt = document.createElement('span');
                    txt.className = 'logo-name-fallback';
                    txt.textContent = featured.name;
                    card.appendChild(txt);
                };
                card.appendChild(img);
            } else {
                const txt = document.createElement('span');
                txt.className = 'logo-name-fallback';
                txt.textContent = featured.name;
                card.appendChild(txt);
            }

            card.addEventListener('click', () => {
                enableAudioOnFirstGesture();
                revealPlayer();
                const freshIdx = channels.findIndex(c => c.id === featured.id || c.name.toLowerCase().includes(featured.name.toLowerCase()));
                if (freshIdx !== -1) {
                    loadChannel(freshIdx);
                } else {
                    loadChannelByIdOrQuery(featured.id, featured.name);
                }
                // Mettre à jour le highlight
                row.querySelectorAll('.live-logo-card').forEach(c => c.classList.remove('now-playing'));
                card.classList.add('now-playing');
            });

            row.appendChild(card);
        });
    }

    // ── À LA UNE — Poster cards par thème (style exact myCANAL) ──
    function renderUneCards() {
        const row = document.getElementById('une-cards-row');
        if (!row) return;
        row.innerHTML = '';

        const UNE_CATEGORIES = [
            {
                label: 'Ligue 1',
                img: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=600&q=80',
                view: 'sport',
                catKey: 'sport'
            },
            {
                label: 'Aventure',
                img: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=600&q=80',
                view: 'films',
                catKey: 'cinema'
            },
            {
                label: 'Action',
                img: 'https://images.unsplash.com/photo-1569701813229-33284b643e3c?auto=format&fit=crop&w=600&q=80',
                view: 'films',
                catKey: 'cinema'
            },
            {
                label: 'Comédie',
                img: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
                view: 'series',
                catKey: 'cinema'
            },
            {
                label: 'Documentaire',
                img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
                view: 'catalogue',
                catKey: 'documentaire'
            },
            {
                label: 'Sénégal',
                img: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=600&q=80',
                view: 'senegal',
                catKey: 'senegal'
            },
            {
                label: 'Football',
                img: 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=600&q=80',
                view: 'sport',
                catKey: 'sport'
            },
        ];

        UNE_CATEGORIES.forEach(cat => {
            const card = document.createElement('div');
            card.className = 'une-card';

            const bg = document.createElement('div');
            bg.className = 'une-card-bg';
            bg.style.backgroundImage = `url('${cat.img}')`;

            const overlay = document.createElement('div');
            overlay.className = 'une-card-overlay';

            const label = document.createElement('div');
            label.className = 'une-card-label';
            label.textContent = cat.label;

            card.appendChild(bg);
            card.appendChild(overlay);
            card.appendChild(label);

            card.addEventListener('click', () => {
                if (window._bokkSwitchView) window._bokkSwitchView(cat.view);
                setTimeout(() => {
                    if (cat.catKey && cat.catKey !== currentCategory) {
                        currentCategory = cat.catKey;
                        userManuallySelectedCategory = true;
                        renderCategories();
                        renderChannelList(true);
                    }
                }, 50);
            });

            row.appendChild(card);
        });
    }

    // ── Rendu des mini-cartes matchs (scroll row sur la home) ──
    let currentMatchFilter = 'all';

        // ── Création de carte pour match / grand événement ──
    function createMatchMiniCard(m) {
        const card = document.createElement('div');
        card.className = 'match-mini-card';

        const statusHtml = m.isLive
            ? `<span class="match-status-live"><span class="live-dot"></span> LIVE ${m.liveMinute || ''}</span>`
            : `<span class="match-status-scheduled">${m.date} • ${m.time}</span>`;

        const channelBtnsHtml = (m.channels || []).slice(0, 3).map(ch =>
            `<button class="mm-ch-btn" data-chid="${ch.id}" data-chname="${ch.name}">
                <span class="mm-ch-quality">${ch.badge || 'HD'}</span>
                ▶ ${ch.name}
            </button>`
        ).join('');

        const logoA = (m.teamA && m.teamA.logo) ? m.teamA.logo : 'favicon.png';
        const nameA = (m.teamA && m.teamA.name) ? m.teamA.name : 'Équipe A';
        const logoB = (m.teamB && m.teamB.logo) ? m.teamB.logo : 'favicon.png';
        const nameB = (m.teamB && m.teamB.name) ? m.teamB.name : 'Équipe B';

        card.innerHTML = `
            <div class="match-mini-poster" style="background-image: url('${m.poster || ''}');">
                <div class="match-mini-poster-overlay"></div>
                <div class="match-mini-toprow">
                    <span class="match-comp-badge">${m.competitionBadge || m.competition || 'Sport'}</span>
                    ${statusHtml}
                </div>
                <div class="match-mini-teams">
                    <div class="mm-team">
                        <img src="${logoA}" alt="${nameA}" class="mm-team-crest" onerror="this.style.opacity='0.4'">
                        <span class="mm-team-name">${nameA}</span>
                    </div>
                    <div class="mm-score">
                        <span class="mm-score-val">${m.score || 'VS'}</span>
                        ${m.isLive && m.liveMinute ? `<span class="mm-minute">${m.liveMinute}</span>` : ''}
                    </div>
                    <div class="mm-team">
                        <img src="${logoB}" alt="${nameB}" class="mm-team-crest" onerror="this.style.opacity='0.4'">
                        <span class="mm-team-name">${nameB}</span>
                    </div>
                </div>
            </div>
            <div class="match-mini-body">
                <div class="match-mini-title">${m.title || ''}</div>
                <div class="match-mini-channels">${channelBtnsHtml}</div>
            </div>
        `;

        // Clic sur les boutons de chaîne
        card.querySelectorAll('.mm-ch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const chId = parseInt(btn.dataset.chid, 10);
                const chName = btn.dataset.chname;
                showToast(`▶ ${chName} — ${m.title}`);
                enableAudioOnFirstGesture();
                revealPlayer();
                loadChannelByIdOrQuery(chId, chName);
            });
        });

        // Clic global sur la carte → première chaîne
        card.addEventListener('click', () => {
            if (m.channels && m.channels.length > 0) {
                const ch = m.channels[0];
                showToast(`▶ ${ch.name} — ${m.title}`);
                enableAudioOnFirstGesture();
                revealPlayer();
                loadChannelByIdOrQuery(ch.id, ch.name);
            }
        });

        return card;
    }

    function renderMatchesScrollRow(filter = currentMatchFilter) {
        currentMatchFilter = filter;
        const row = document.getElementById('matches-scroll-row');
        const countBadge = document.getElementById('matches-count-badge');
        const filterContainer = document.getElementById('match-time-filters');
        if (!row) return;

        const allMatches = (typeof window !== 'undefined' && Array.isArray(window.FEATURED_MATCHES))
            ? window.FEATURED_MATCHES
            : [];
        if (!allMatches || allMatches.length === 0) return;

        // Filtrage dynamique des événements pour connaître la programmation
        const filtered = allMatches.filter(m => {
            if (filter === 'all') return true;
            if (filter === 'live') return m.isLive;
            if (filter === 'today') {
                const d = (m.date || '').toLowerCase();
                return d.includes("aujourd'hui") || d.includes("ce soir");
            }
            if (filter === 'tomorrow') {
                return (m.date || '').toLowerCase().includes("demain");
            }
            if (filter === 'ucl') {
                const c = (m.competition || '').toLowerCase();
                return c.includes('champions') || c.includes('ucl');
            }
            if (filter === 'laliga') {
                return (m.competition || '').toLowerCase().includes('laliga');
            }
            return true;
        });

        // Mise à jour du compteur
        if (countBadge) {
            countBadge.textContent = `${filtered.length} affiche${filtered.length > 1 ? 's' : ''}`;
        }

        // Configuration des boutons de filtre par date / compétition
        if (filterContainer && !filterContainer._bound) {
            filterContainer._bound = true;
            filterContainer.querySelectorAll('.match-filter-pill').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    filterContainer.querySelectorAll('.match-filter-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderMatchesScrollRow(btn.dataset.filter);
                });
            });
        }

        row.innerHTML = '';
        if (filtered.length === 0) {
            row.innerHTML = `<div style="padding: 24px 16px; color: rgba(255,255,255,0.4); font-size: 0.85rem;">Aucun événement en direct ou programmé pour ce filtre.</div>`;
            return;
        }

        filtered.forEach(m => {
            row.appendChild(createMatchMiniCard(m));
        });
    }

    // ── Carousels thématiques — relie les IDs corrects du HTML ──
    function renderHomeCarousels() {
        // Sénégal
        populateCarouselRow('carousel-senegal', c =>
            (c.name && /rts|tfm|2stv|sen tv|walf|sunu/i.test(c.name)) ||
            (c.group && c.group.toLowerCase().includes('sénégal')),
        24);

        // Sport
        populateCarouselRow('carousel-sports', c =>
            c.name && /bein|canal\+ sport|canal\+ foot|rmc|dazn|sky sport|m\+ laliga/i.test(c.name),
        30);

        // Cinéma
        populateCarouselRow('carousel-cinema', c =>
            c.name && /cinema|ciné\+|ocs|action|warner|paramount|hbo/i.test(c.name),
        24);

        // France
        populateCarouselRow('carousel-france', c =>
            c.name && /\b(tf1|france 2|france 3|france 4|france 5|m6|w9|tmc|arte|c8|canal\+)\b/i.test(c.name),
        24);

        // Espagne
        populateCarouselRow('carousel-espagne', c =>
            (c.group && c.group.includes('ES|')) ||
            (c.name && /laliga|movistar/i.test(c.name)),
        24);
    }

    // ── Navigation et Défilement Fluide ──
    function setupNavScroll() {
        document.querySelectorAll('.nav-link[data-scroll]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.dataset.scroll;
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                }
            });
        });

        const brandHomeLink = document.getElementById('brand-home-link');
        if (brandHomeLink && !brandHomeLink._navScrollBound) {
            brandHomeLink._navScrollBound = true;
            brandHomeLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // DONNÉES LIVE RÉELLES — Scores, Affiches & Matchs en Direct
    // Source : API Officielle ESPN Sports (Mondial, Fiable, Temps Réel)
    // ═══════════════════════════════════════════════════════════════

    // ── Mapping dynamique et intelligent des chaînes BOKK TV ──
    // Synchronisé avec les IDs réels du catalogue 2 056 chaînes actives
    function getDynamicMatchChannels(leagueName, matchIndex = 0, teamA = '', teamB = '') {
        const tUpper = `${teamA} ${teamB}`.toUpperCase();

        if (leagueName === 'UEFA Champions League') {
            const uclChannels = [
                // Match 0 (Choc 1 : Arsenal vs Dortmund, etc.)
                [
                    { id: 98,  name: 'Canal+ Foot HD',        badge: 'FHD' },
                    { id: 109, name: 'beIN Sports 1 HD',     badge: 'FHD' },
                    { id: 89,  name: 'M+ Liga de Campeones', badge: 'HD'  },
                    { id: 136, name: 'beIN Sports 8K',       badge: '4K'  }
                ],
                // Match 1 (Choc 2 : Man City vs Napoli, etc.)
                [
                    { id: 97,  name: 'Canal+ 360 HD',        badge: 'FHD' },
                    { id: 110, name: 'beIN Sports 2 HD',     badge: 'FHD' },
                    { id: 90,  name: 'M+ Liga Campeones 2',  badge: 'HD'  },
                    { id: 137, name: 'Canal+ 8K',            badge: '4K'  }
                ],
                // Match 2 (Feyenoord vs Porto, etc.)
                [
                    { id: 99,  name: 'Canal+ Live 1',        badge: 'HD'  },
                    { id: 111, name: 'beIN Sports 3 HD',     badge: 'FHD' },
                    { id: 91,  name: 'M+ Liga Campeones 3',  badge: 'HD'  }
                ],
                // Match 3 (RB Leipzig vs Lens, etc.)
                [
                    { id: 100, name: 'Canal+ Live 2',        badge: 'HD'  },
                    { id: 112, name: 'beIN Sports 4 HD',     badge: 'FHD' },
                    { id: 92,  name: 'M+ Liga Campeones 4',  badge: 'HD'  }
                ],
                // Match 4 (Como vs AEK Athens, etc.)
                [
                    { id: 101, name: 'Canal+ Live 3',        badge: 'HD'  },
                    { id: 113, name: 'beIN Sports 5 HD',     badge: 'FHD' },
                    { id: 93,  name: 'M+ Liga Campeones 5',  badge: 'HD'  }
                ],
                // Match 5 (Galatasaray vs Aston Villa, etc.)
                [
                    { id: 102, name: 'Canal+ Live 4',        badge: 'HD'  },
                    { id: 114, name: 'beIN Sports 6 HD',     badge: 'FHD' },
                    { id: 94,  name: 'M+ Liga Campeones 6',  badge: 'HD'  }
                ],
                // Match 6
                [
                    { id: 103, name: 'Canal+ Live 5',        badge: 'HD'  },
                    { id: 115, name: 'beIN Sports 7 HD',     badge: 'FHD' },
                    { id: 95,  name: 'M+ Liga Campeones 7',  badge: 'HD'  }
                ],
                // Match 7
                [
                    { id: 104, name: 'Canal+ Live 6',        badge: 'HD'  },
                    { id: 116, name: 'beIN Sports 8 HD',     badge: 'FHD' },
                    { id: 96,  name: 'M+ Liga Campeones 8',  badge: 'HD'  }
                ]
            ];
            // Priorité absolue sur Canal+ Foot / Canal+ 360 si club français engagé
            if (/PSG|PARIS|LENS|BREST|MONACO|LILLE|MARSEILLE|LYON/.test(tUpper)) {
                return [
                    { id: 98,  name: 'Canal+ Foot HD',        badge: 'FHD' },
                    { id: 97,  name: 'Canal+ 360 HD',        badge: 'FHD' },
                    { id: 109, name: 'beIN Sports 1 HD',     badge: 'FHD' },
                    { id: 89,  name: 'M+ Liga de Campeones', badge: 'HD'  }
                ];
            }
            return uclChannels[matchIndex % uclChannels.length];
        }

        if (leagueName === 'LaLiga') {
            const laligaChannels = [
                // Match 0 (Clasico, Real Madrid, Barça, Atletico)
                [
                    { id: 1559, name: 'M+ LaLiga 4K',    badge: '4K'  },
                    { id: 1607, name: 'DAZN LaLiga 4K',  badge: '4K'  },
                    { id: 109,  name: 'beIN Sports 1 HD', badge: 'FHD' }
                ],
                // Match 1
                [
                    { id: 1560, name: 'M+ LaLiga HD',    badge: 'FHD' },
                    { id: 1608, name: 'DAZN LaLiga HD',  badge: 'HD'  },
                    { id: 110,  name: 'beIN Sports 2 HD', badge: 'FHD' }
                ],
                // Match 2
                [
                    { id: 1564, name: 'M+ LaLiga 2 4K',  badge: '4K'  },
                    { id: 1610, name: 'DAZN LaLiga 2 4K', badge: '4K' },
                    { id: 111,  name: 'beIN Sports 3 HD', badge: 'FHD' }
                ],
                // Match 3
                [
                    { id: 1566, name: 'M+ LaLiga 3 4K',  badge: '4K'  },
                    { id: 1612, name: 'DAZN 1 4K',       badge: '4K'  }
                ]
            ];
            return laligaChannels[matchIndex % laligaChannels.length];
        }

        if (leagueName === 'Premier League') {
            const plChannels = [
                [
                    { id: 97,  name: 'Canal+ 360 HD',      badge: 'FHD' },
                    { id: 109, name: 'beIN Sports 1 HD',   badge: 'FHD' },
                    { id: 120, name: 'Sky Sport Football', badge: 'FHD' }
                ],
                [
                    { id: 98,  name: 'Canal+ Foot HD',      badge: 'FHD' },
                    { id: 110, name: 'beIN Sports 2 HD',   badge: 'FHD' },
                    { id: 119, name: 'Sky Sport Uno',      badge: 'FHD' }
                ],
                [
                    { id: 99,  name: 'Canal+ Live 1',      badge: 'HD'  },
                    { id: 111, name: 'beIN Sports 3 HD',   badge: 'FHD' }
                ]
            ];
            return plChannels[matchIndex % plChannels.length];
        }

        if (leagueName === 'Serie A') {
            const saChannels = [
                [
                    { id: 119, name: 'Sky Sport Uno',      badge: 'FHD' },
                    { id: 110, name: 'beIN Sports 2 HD',   badge: 'FHD' },
                    { id: 97,  name: 'Canal+ 360 HD',      badge: 'FHD' }
                ],
                [
                    { id: 120, name: 'Sky Sport Football', badge: 'FHD' },
                    { id: 111, name: 'beIN Sports 3 HD',   badge: 'FHD' },
                    { id: 98,  name: 'Canal+ Foot HD',      badge: 'FHD' }
                ]
            ];
            return saChannels[matchIndex % saChannels.length];
        }

        if (leagueName === 'Bundesliga') {
            const blChannels = [
                [
                    { id: 110, name: 'beIN Sports 2 HD',   badge: 'FHD' },
                    { id: 97,  name: 'Canal+ 360 HD',      badge: 'FHD' },
                    { id: 118, name: 'Sky Sport Action',   badge: 'FHD' }
                ],
                [
                    { id: 111, name: 'beIN Sports 3 HD',   badge: 'FHD' },
                    { id: 98,  name: 'Canal+ Foot HD',      badge: 'FHD' }
                ]
            ];
            return blChannels[matchIndex % blChannels.length];
        }

        if (leagueName === 'Ligue 1') {
            return [
                { id: 98,  name: 'Canal+ Foot HD',   badge: 'FHD' },
                { id: 97,  name: 'Canal+ 360 HD',   badge: 'FHD' },
                { id: 109, name: 'beIN Sports 1 HD', badge: 'FHD' }
            ];
        }

        return [
            { id: 98,  name: 'Canal+ Foot HD',   badge: 'FHD' },
            { id: 109, name: 'beIN Sports 1 HD', badge: 'FHD' },
            { id: 97,  name: 'Canal+ 360 HD',   badge: 'FHD' }
        ];
    }

    // Poster de match cinématique par compétition
    function getMatchPoster(competition) {
        const posters = {
            'UEFA Champions League': 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80',
            'LaLiga':                'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?auto=format&fit=crop&w=1200&q=80',
            'Ligue 1':               'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
            'Premier League':        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=1200&q=80',
            'Serie A':               'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=80',
            'Bundesliga':            'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80',
        };
        return posters[competition] || 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=1200&q=80';
    }

    // Fetch des VRAIS matchs en direct et prochains chocs via API ESPN & serveur local
    async function fetchLiveMatchData() {
        try {
            // 1. Tenter d'abord de charger la base locale /api/matches (générée par update_matches.py)
            try {
                const localRes = await fetch('/api/matches', { signal: AbortSignal.timeout(3000) });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (Array.isArray(localData) && localData.length > 0) {
                        window.FEATURED_MATCHES = localData;
                        heroMatches = localData;
                        renderHeroSlide(heroCurrentIndex);
                        renderMatchesScrollRow(currentMatchFilter);
                    }
                }
            } catch (_) {}

            // 2. Récupérer les données fraîches en temps réel via l'API ESPN
            const leagues = [
                { slug: 'uefa.champions', name: 'UEFA Champions League', badge: 'CHAMPIONS LEAGUE' },
                { slug: 'fra.1',          name: 'Ligue 1',               badge: 'LIGUE 1' },
                { slug: 'esp.1',          name: 'LaLiga',                badge: 'LALIGA' },
                { slug: 'eng.1',          name: 'Premier League',        badge: 'PREMIER LEAGUE' },
                { slug: 'ita.1',          name: 'Serie A',               badge: 'SERIE A' },
                { slug: 'ger.1',          name: 'Bundesliga',            badge: 'BUNDESLIGA' }
            ];

            const espnMatches = [];
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);

            await Promise.allSettled(leagues.map(async (league) => {
                try {
                    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard`;
                    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
                    if (!res.ok) return;
                    const data = await res.json();
                    const events = data.events || [];

                    events.forEach((ev, evIdx) => {
                        const comp = (ev.competitions && ev.competitions[0]) ? ev.competitions[0] : null;
                        if (!comp || !comp.competitors || comp.competitors.length < 2) return;

                        const home = comp.competitors.find(c => c.homeAway === 'home') || comp.competitors[0];
                        const away = comp.competitors.find(c => c.homeAway === 'away') || comp.competitors[1];

                        const evDate = new Date(ev.date);
                        const state = comp.status && comp.status.type ? comp.status.type.state : 'pre';
                        const isLive = (state === 'in');
                        const isFinished = (state === 'post');

                        let liveMinute = null;
                        if (isLive) {
                            liveMinute = comp.status.type.detail || 'LIVE';
                        }

                        let scoreText = 'VS';
                        if (home.score !== undefined && away.score !== undefined && (isLive || isFinished)) {
                            scoreText = `${home.score} - ${away.score}`;
                        }

                        const channels = getDynamicMatchChannels(league.name, evIdx, home.team.displayName, away.team.displayName);

                        // Calcul précis Aujourd'hui / Demain / Date
                        const isEvToday = (evDate.getDate() === now.getDate() && evDate.getMonth() === now.getMonth() && evDate.getFullYear() === now.getFullYear());
                        const isEvTomorrow = (evDate.getDate() === tomorrow.getDate() && evDate.getMonth() === tomorrow.getMonth() && evDate.getFullYear() === tomorrow.getFullYear());

                        // RÈGLE ABSOLUE : EXCLURE STRICTEMENT TOUT MATCH PASSÉ OU TERMINÉ
                        const nowTs = Date.now();
                        if (isFinished || (evDate.getTime() < nowTs - 7200000 && !isLive)) {
                            return;
                        }

                        let dateStr = evDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                        if (isEvToday) dateStr = "Aujourd'hui";
                        else if (isEvTomorrow) dateStr = "Demain";

                        const timeStr = evDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

                        espnMatches.push({
                            id: `espn-${ev.id}`,
                            title: `${home.team.displayName} vs ${away.team.displayName}`,
                            competition: league.name,
                            competitionBadge: league.badge,
                            category: 'football',
                            teamA: {
                                name: home.team.displayName,
                                logo: home.team.logo || DEFAULT_TV_LOGO
                            },
                            teamB: {
                                name: away.team.displayName,
                                logo: away.team.logo || DEFAULT_TV_LOGO
                            },
                            poster: getMatchPoster(league.name),
                            score: scoreText,
                            date: dateStr,
                            time: timeStr,
                            isLive: isLive,
                            isFinished: false,
                            liveMinute: liveMinute,
                            stage: comp.notes && comp.notes[0] ? comp.notes[0].headline : league.name,
                            description: `${home.team.displayName} contre ${away.team.displayName} en direct sur BOKK TV.`,
                            channels: channels,
                            rawDate: evDate.getTime()
                        });
                    });
                } catch (_) {}
            }));

            if (espnMatches.length > 0) {
                const existing = (typeof window !== 'undefined' && Array.isArray(window.FEATURED_MATCHES))
                    ? window.FEATURED_MATCHES.filter(m => !m.id.startsWith('espn-'))
                    : [];

                const combined = [...existing];
                const seenTitles = new Set(combined.map(m => m.title.toLowerCase()));

                for (const em of espnMatches) {
                    if (!seenTitles.has(em.title.toLowerCase())) {
                        combined.push(em);
                        seenTitles.add(em.title.toLowerCase());
                    }
                }

                // Filtrer pour ne garder STRICTEMENT que les événements en direct ou à venir
                const nowTs = Date.now();
                const upcomingOnly = combined.filter(m => m.isLive || (m.rawDate >= nowTs - 7200000 && !m.isFinished));

                upcomingOnly.sort((a, b) => {
                    if (a.isLive && !b.isLive) return -1;
                    if (!a.isLive && b.isLive) return 1;
                    return (a.rawDate || nowTs) - (b.rawDate || nowTs);
                });

                window.FEATURED_MATCHES = upcomingOnly;
                heroMatches = upcomingOnly;

                // Rafraîchir l'interface
                renderHeroSlide(heroCurrentIndex);
                renderMatchesScrollRow(currentMatchFilter);

                console.log(`[BOKK TV] ${combined.length} événements sportifs synchronisés en direct.`);
            }
        } catch (e) {
            console.warn('[BOKK TV] Erreur API Live :', e.message);
        }

        // Rafraîchissement automatique toutes les 60 secondes (scores, minutes live & nouveaux chocs)
        setTimeout(fetchLiveMatchData, 60 * 1000);
    }

    // Mise à jour du Hero avec un match live réel (depuis API ESPN)
    function updateHeroBillboardFromLiveData(match) {
        if (!match) return;
        const existsIdx = heroMatches.findIndex(m => m.id === match.id || m.title === match.title);
        if (existsIdx >= 0) {
            heroMatches[existsIdx] = match;
            if (existsIdx === heroCurrentIndex) renderHeroSlide(heroCurrentIndex);
        } else {
            heroMatches.unshift(match);
            renderHeroSlide(0);
        }
    }

    // ── Initialisation ──
        // ── GESTIONNAIRE DE SIGNALEMENT FIREBASE CLOUD FIRESTORE ──
    function setupFirebaseReporting() {
        const btnReportBroken = document.getElementById('btn-report-broken');
        const playerReportBtn = document.getElementById('player-report-btn');
        const moreActionReports = document.getElementById('more-action-reports');
        const reportsModal = document.getElementById('reports-modal');
        const btnCloseReports = document.getElementById('btn-close-reports');
        const btnRefreshReports = document.getElementById('btn-refresh-reports');
        const btnCopyReports = document.getElementById('btn-copy-reports');
        const reportsListContainer = document.getElementById('reports-list-container');
        const moreReportBadge = document.getElementById('more-report-badge');
        const moreSheetBackdrop = document.getElementById('more-sheet-backdrop');

        // Mettre à jour le badge du nombre de signalements
        async function updateReportsBadge(reports) {
            try {
                const list = reports || (window.BokkFirebase ? await window.BokkFirebase.getReports() : []);
                if (moreReportBadge) {
                    if (list.length > 0) {
                        moreReportBadge.style.display = 'inline-block';
                        moreReportBadge.textContent = list.length;
                    } else {
                        moreReportBadge.style.display = 'none';
                    }
                }
            } catch (e) {}
        }

        // Afficher la liste des chaînes signalées dans le modal
        async function loadReportsModalList() {
            if (!reportsListContainer) return;
            reportsListContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:20px;">Chargement depuis Firebase...</p>';

            let reports = [];
            if (window.BokkFirebase) {
                reports = await window.BokkFirebase.getReports();
            }

            if (!reports || reports.length === 0) {
                reportsListContainer.innerHTML = `
                    <div style="text-align:center; padding:30px 16px; color:var(--text-muted);">
                        <div style="font-size:2rem; margin-bottom:8px;">🎉</div>
                        <p style="font-size:0.9rem; font-weight:700; color:#fff;">Aucune chaîne signalée</p>
                        <p style="font-size:0.75rem; margin-top:4px;">Toutes les chaînes testées fonctionnent ou aucun problème n'a été remonté.</p>
                    </div>
                `;
                updateReportsBadge([]);
                return;
            }

            updateReportsBadge(reports);
            reportsListContainer.innerHTML = '';

            reports.forEach(r => {
                const row = document.createElement('div');
                row.className = 'report-item-row';
                const count = r.reportCount || r.count || 1;
                const chId = r.channelId || r.id;

                row.innerHTML = `
                    <div class="report-item-left">
                        <span class="report-id-pill">#${chId}</span>
                        <div class="report-item-info">
                            <span class="report-ch-name">${r.name || 'Chaîne inconnue'}</span>
                            <span class="report-ch-sub">${r.group || 'Direct'}</span>
                        </div>
                    </div>
                    <div class="report-item-right">
                        <span class="report-badge-count" title="${count} signalement(s)">${count} ⚠️</span>
                        <button class="report-btn-test" data-chid="${chId}">Tester</button>
                        <button class="report-btn-del" data-chid="${chId}" title="Supprimer le signalement">✕</button>
                    </div>
                `;

                // Bouton Tester
                const testBtn = row.querySelector('.report-btn-test');
                if (testBtn) {
                    testBtn.onclick = () => {
                        if (reportsModal) reportsModal.style.display = 'none';
                        const idx = channels.findIndex(c => String(c.id) === String(chId));
                        if (idx >= 0) {
                            revealPlayer();
                            loadChannel(idx);
                        } else {
                            showToast(`Chaîne #${chId} introuvable dans le catalogue.`);
                        }
                    };
                }

                // Bouton Supprimer le signalement
                const delBtn = row.querySelector('.report-btn-del');
                if (delBtn) {
                    delBtn.onclick = async () => {
                        if (window.BokkFirebase) {
                            await window.BokkFirebase.deleteReport(chId);
                        }
                        row.remove();
                        showToast(`Signalement #${chId} supprimé`);
                        loadReportsModalList();
                    };
                }

                reportsListContainer.appendChild(row);
            });
        }

        // Action bouton "Signaler HS" sur l'écran d'erreur
        if (btnReportBroken) {
            btnReportBroken.addEventListener('click', async () => {
                const cur = channels[currentIndex];
                if (!cur) return;
                btnReportBroken.disabled = true;
                btnReportBroken.innerHTML = '<span>Envoi à Firebase...</span>';

                if (window.BokkFirebase) {
                    await window.BokkFirebase.reportBroken(cur, 'erreur_lecture');
                }

                btnReportBroken.innerHTML = '<span>✅ Signalé HS</span>';
                btnReportBroken.classList.add('reported');
                showToast(`⚠️ Chaîne #${cur.id} ${cur.name} enregistrée dans Firebase !`);
                updateReportsBadge();
            });
        }

        // Action bouton "Signaler" dans le bandeau du lecteur
        if (playerReportBtn) {
            playerReportBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cur = channels[currentIndex];
                if (!cur) return;
                playerReportBtn.classList.add('reported');

                if (window.BokkFirebase) {
                    await window.BokkFirebase.reportBroken(cur, 'signalement_manuel');
                }

                showToast(`⚠️ Chaîne #${cur.id} ${cur.name} signalée comme HS`);
                updateReportsBadge();
            });
        }

        // Ouvrir le modal depuis le menu Plus
        if (moreActionReports) {
            moreActionReports.addEventListener('click', () => {
                if (moreSheetBackdrop) moreSheetBackdrop.style.display = 'none';
                if (reportsModal) {
                    reportsModal.style.display = 'flex';
                    loadReportsModalList();
                }
            });
        }

        if (btnCloseReports && reportsModal) {
            btnCloseReports.addEventListener('click', () => {
                reportsModal.style.display = 'none';
            });
            reportsModal.addEventListener('click', (e) => {
                if (e.target === reportsModal) reportsModal.style.display = 'none';
            });
        }

        if (btnRefreshReports) {
            btnRefreshReports.addEventListener('click', () => {
                loadReportsModalList();
            });
        }

        // Bouton Copier la liste pour l'assistant
        if (btnCopyReports) {
            btnCopyReports.addEventListener('click', async () => {
                let reports = [];
                if (window.BokkFirebase) {
                    reports = await window.BokkFirebase.getReports();
                }

                if (!reports || reports.length === 0) {
                    showToast('Aucune chaîne signalée pour l\'instant.');
                    return;
                }

                const ids = reports.map(r => r.channelId || r.id);
                const textLines = [
                    `📋 LISTE DES CHAÎNES SIGNALÉES HS DANS FIREBASE (Total: ${reports.length}) :`,
                    `IDs: [${ids.join(', ')}]`,
                    '',
                    'Détails :',
                    ...reports.map(r => `- #${r.channelId || r.id} : ${r.name} (${r.group || 'Direct'}) [Signalé ${r.reportCount || 1}x]`)
                ].join('\n');

                try {
                    await navigator.clipboard.writeText(textLines);
                    showToast('📋 Liste copiée ! Tu peux maintenant la coller dans le chat.');
                } catch (err) {
                    const ta = document.createElement('textarea');
                    ta.value = textLines;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('📋 Liste copiée !');
                }
            });
        }

        // Écouter les mises à jour Firebase en temps réel (signalements et désactivations)
        if (window.BokkFirebase) {
            if (typeof window.BokkFirebase.listenReports === 'function') {
                window.BokkFirebase.listenReports((reports) => {
                    updateReportsBadge(reports);
                });
            }
            if (typeof window.BokkFirebase.listenDisabledChannels === 'function') {
                window.BokkFirebase.listenDisabledChannels((disabledIds) => {
                    console.log(`[BOKK TV] 🔥 Synchronisation Firebase : ${disabledIds.length} chaînes masquées`);
                    renderChannelList(false);
                    renderHomeCarousels();
                    if (typeof renderLiveLogosRow === 'function') renderLiveLogosRow();

                    // Si la chaîne en cours est masquée par l'administrateur, arrêt immédiat
                    if (currentIndex !== -1 && channels[currentIndex] && window.BokkFirebase.isDisabled(channels[currentIndex].id)) {
                        destroyActivePlayer();
                        showPlayerError('Cette chaîne a été temporairement désactivée par l\'administrateur.');
                    }
                });
            }
        } else {
            updateReportsBadge();
        }
    }


    function setupSubscriberAccount() {
        const btnOpenAccount = document.getElementById('btn-open-account');
        const moreActionAccount = document.getElementById('more-action-account');
        const accountModal = document.getElementById('account-modal');
        const btnCloseAccount = document.getElementById('btn-close-account');

        const viewAuth = document.getElementById('account-view-auth');
        const viewProfile = document.getElementById('account-view-profile');
        const tabRegister = document.getElementById('auth-tab-register');
        const tabLogin = document.getElementById('auth-tab-login');

        const btnSwitchToLogin = document.getElementById('btn-switch-to-login');
        const btnSwitchToReg = document.getElementById('btn-switch-to-reg');

        const inputPrenom = document.getElementById('input-sub-prenom');
        const inputPhone = document.getElementById('input-sub-phone');
        const btnRegister = document.getElementById('btn-sub-register');

        const inputId = document.getElementById('input-sub-id');
        const btnLogin = document.getElementById('btn-sub-login');

        const profilePrenom = document.getElementById('sub-profile-prenom');
        const profileId = document.getElementById('sub-profile-id');
        const profileExpiry = document.getElementById('sub-profile-expiry');
        const badgeStatus = document.getElementById('sub-badge-status');
        const btnCopySubId = document.getElementById('btn-copy-sub-id');
        const btnSubLogout = document.getElementById('btn-sub-logout');
        const btnWhatsapp = document.getElementById('btn-whatsapp-support');

        const navAccountText = document.getElementById('nav-account-text');
        const userSubBadge = document.getElementById('user-sub-badge');
        const userSubDesc = document.getElementById('user-sub-desc');

        function updateAccountUI(sub) {
            if (sub && sub.id) {
                if (navAccountText) navAccountText.textContent = sub.prenom || sub.id;
                if (userSubBadge) userSubBadge.textContent = sub.id;
                if (userSubDesc) userSubDesc.textContent = 'Abonne : ' + sub.prenom + ' (' + sub.id + ')';

                if (viewAuth) viewAuth.style.display = 'none';
                if (viewProfile) viewProfile.style.display = 'block';

                if (profilePrenom) profilePrenom.textContent = sub.prenom || 'Abonne';
                if (profileId) profileId.textContent = sub.id;
                const profileAvatar = document.getElementById('sub-profile-avatar');
                if (profileAvatar) profileAvatar.textContent = ((sub.prenom || 'A')[0] || 'A').toUpperCase();

                let daysText = '30 jours restants';
                if (sub.expiresAt) {
                    const exp = new Date(sub.expiresAt);
                    const diffDays = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) {
                        daysText = diffDays + ' jours restants (jusqu au ' + exp.toLocaleDateString('fr-FR') + ')';
                        if (badgeStatus) {
                            badgeStatus.textContent = '● ACTIF';
                            badgeStatus.style.color = '#10b981';
                            badgeStatus.style.background = 'rgba(16,185,129,0.2)';
                        }
                    } else {
                        daysText = 'Expire le ' + exp.toLocaleDateString('fr-FR');
                        if (badgeStatus) {
                            badgeStatus.textContent = '● EXPIRE';
                            badgeStatus.style.color = '#e63946';
                            badgeStatus.style.background = 'rgba(230,57,70,0.2)';
                        }
                    }
                }
                if (profileExpiry) profileExpiry.textContent = daysText;

                if (btnWhatsapp) {
                    btnWhatsapp.href = 'https://wa.me/221783055520?text=' + encodeURIComponent('Bonjour BOKK TV, mon compte est lié à l\'identifiant ' + sub.id + ' (' + (sub.prenom || '') + '). Je vous contacte au sujet de mon abonnement.');
                }
            } else {
                if (navAccountText) navAccountText.textContent = 'Mon ID';
                if (userSubBadge) userSubBadge.textContent = 'Gratuit';
                if (userSubDesc) userSubDesc.textContent = 'Creer ou consulter votre ID BOKK';

                if (viewAuth) viewAuth.style.display = 'block';
                if (viewProfile) viewProfile.style.display = 'none';
                if (tabRegister) tabRegister.style.display = 'block';
                if (tabLogin) tabLogin.style.display = 'none';
            }
        }

        let liveSubUnsub = null;
        function startLiveSubscriberSync(subId) {
            if (liveSubUnsub) { liveSubUnsub(); liveSubUnsub = null; }
            if (window.BokkFirebase && typeof window.BokkFirebase.listenSubscriber === 'function' && subId) {
                liveSubUnsub = window.BokkFirebase.listenSubscriber(subId, (liveSub) => {
                    console.log('[BOKK TV] 🔥 Synchronisation abonné en direct:', liveSub);
                    try {
                        localStorage.setItem('bokk_subscriber', JSON.stringify(liveSub));
                    } catch (e) {}
                    updateAccountUI(liveSub);

                    if (liveSub.status === 'suspended') {
                        destroyActivePlayer();
                        if (videoEl) videoEl.pause();
                        isStreamPreviewLocked = true;
                        openModal();
                        const noticeText = document.getElementById('account-auth-notice-text');
                        if (noticeText) {
                            noticeText.innerHTML = '🚫 <strong>Accès Suspendu :</strong> Votre abonnement a été suspendu par l\'administrateur.';
                        }
                    }
                });
            }
        }

        if (window.BokkFirebase && typeof window.BokkFirebase.getCurrentSubscriber === 'function') {
            const current = window.BokkFirebase.getCurrentSubscriber();
            updateAccountUI(current);
            if (current && current.id) {
                startLiveSubscriberSync(current.id);
            }
        }

        function openModal() {
            if (accountModal) accountModal.style.display = 'flex';
            const moreSheetBackdrop = document.getElementById('more-sheet-backdrop');
            if (moreSheetBackdrop) moreSheetBackdrop.style.display = 'none';
        }

        function closeModal(force = false) {
            if (isStreamPreviewLocked && !force && !isUserRegisteredAndActive()) {
                showToast('⚠️ Obtenez votre ID gratuit ci-dessous pour continuer la vidéo');
                return;
            }
            isStreamPreviewLocked = false;
            if (accountModal) accountModal.style.display = 'none';
        }

        if (btnOpenAccount) btnOpenAccount.onclick = openModal;
        if (moreActionAccount) moreActionAccount.onclick = openModal;
        if (btnCloseAccount) btnCloseAccount.onclick = closeModal;
        if (accountModal) {
            accountModal.onclick = (e) => {
                if (e.target === accountModal) {
                    if (isStreamPreviewLocked && !isUserRegisteredAndActive()) {
                        showToast('⚠️ Obtenez votre ID gratuit ci-dessous pour reprendre la vidéo');
                        return;
                    }
                    closeModal(true);
                }
            };
        }

        if (btnSwitchToLogin) {
            btnSwitchToLogin.onclick = () => {
                if (tabRegister) tabRegister.style.display = 'none';
                if (tabLogin) tabLogin.style.display = 'block';
            };
        }

        if (btnSwitchToReg) {
            btnSwitchToReg.onclick = () => {
                if (tabLogin) tabLogin.style.display = 'none';
                if (tabRegister) tabRegister.style.display = 'block';
            };
        }

        // ── Gestion des Boutons de Paiement Wave (Notification Immédiate à l'Admin) ──
        function setupWavePaymentButtons() {
            const waveBtns = document.querySelectorAll('.btn-wave-plan');
            waveBtns.forEach(btn => {
                btn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const curSub = (window.BokkFirebase && typeof window.BokkFirebase.getCurrentSubscriber === 'function')
                        ? window.BokkFirebase.getCurrentSubscriber()
                        : null;

                    // Si l'utilisateur n'est pas encore inscrit/connecté, lui demander d'abord son numéro pour lier son compte
                    if (!curSub || !curSub.id) {
                        showToast('ℹ️ Veuillez d\'abord entrer votre numéro pour associer votre paiement.');
                        openModal();
                        if (tabRegister) tabRegister.style.display = 'block';
                        if (tabLogin) tabLogin.style.display = 'none';
                        if (viewAuth) viewAuth.style.display = 'block';
                        if (viewProfile) viewProfile.style.display = 'none';
                        return;
                    }

                    const plan = btn.getAttribute('data-plan') || '1m';
                    const amount = Number(btn.getAttribute('data-amount')) || 3000;
                    const days = Number(btn.getAttribute('data-days')) || 30;

                    const subId = curSub.id;
                    const subName = curSub.prenom || 'Abonné';
                    const payerPhone = curSub.phone || curSub.phoneDisplay || curSub.id;

                    // 1. Notification automatique et instantanée enregistrée dans Firestore (pour l'admin dans /adminee)
                    if (window.BokkFirebase && typeof window.BokkFirebase.submitPaymentClaim === 'function') {
                        window.BokkFirebase.submitPaymentClaim({
                            subscriberId: subId,
                            subscriberName: subName,
                            payerPhone: payerPhone,
                            plan: plan,
                            amount: amount,
                            days: days,
                            autoCreated: true
                        }).then(res => {
                            console.log('[BOKK TV] 🔔 Notification de paiement envoyée à l\'admin:', res);
                        }).catch(err => {
                            console.warn('[BOKK TV] Erreur submitPaymentClaim:', err);
                        });
                    }

                    // 2. Feedback rassurant pour l'utilisateur
                    showToast('🚀 Demande transmise à l\'administrateur ! Ouverture de Wave...');

                    // 3. Ouverture du lien officiel Wave correspondant au montant
                    const waveUrl = `https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=${amount}`;
                    setTimeout(() => {
                        window.open(waveUrl, '_blank');
                    }, 250);
                };
            });
        }
        setupWavePaymentButtons();

        // ── Validation du Numéro & Inscription (Règle 1 Compte = 1 Numéro) ──
        const errorSubPhone = document.getElementById('error-sub-phone');
        const errorSubLogin = document.getElementById('error-sub-login');

        function validateLocalPhone(raw) {
            const clean = (raw || '').replace(/[\s\-\.\(\)]/g, '');
            if (!clean) {
                return { valid: false, error: 'Le numéro de téléphone est obligatoire.' };
            }
            if (clean.length < 8) {
                return { valid: false, error: 'Numéro trop court (saisissez un numéro sénégalais ou international complet).' };
            }
            // Détection suites suspectes ou bidon (ex: 56789, 123456789, répétitions)
            if (/^(\d)\1{5,}$/.test(clean)) {
                return { valid: false, error: 'Numéro suspect (chiffres répétés).' };
            }
            if (/^(012345678|123456789|987654321|56789)$/.test(clean)) {
                return { valid: false, error: 'Numéro invalide (suite de chiffres non valide).' };
            }

            // Cas Sénégal : 9 chiffres (70, 75, 76, 77, 78)
            let national = '';
            if (clean.startsWith('+221')) national = clean.slice(4);
            else if (clean.startsWith('00221')) national = clean.slice(5);
            else if (clean.startsWith('221') && clean.length === 12) national = clean.slice(3);
            else if (/^(70|75|76|77|78)\d{7}$/.test(clean)) national = clean;

            if (national) {
                if (!/^(70|75|76|77|78)\d{7}$/.test(national)) {
                    return { valid: false, error: 'Numéro sénégalais invalide (doit commencer par 70, 75, 76, 77 ou 78 et comporter 9 chiffres).' };
                }
                return {
                    valid: true,
                    isSenegal: true,
                    national: national,
                    e164: '+221' + national,
                    id: 'BK-' + national,
                    display: national.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')
                };
            }

            // Cas International avec + ou 00 (8 à 15 chiffres)
            if (/^(\+|00)[1-9]\d{7,14}$/.test(clean)) {
                const digits = clean.replace(/\D/g, '');
                return {
                    valid: true,
                    isSenegal: false,
                    national: digits,
                    e164: clean.startsWith('00') ? '+' + clean.slice(2) : clean,
                    id: 'BK-' + digits,
                    display: clean
                };
            }

            return {
                valid: false,
                error: 'Format invalide. Entrez un numéro sénégalais (ex: 77 123 45 67) ou international (ex: +33 6 12 34 56 78).'
            };
        }

        if (inputPhone) {
            inputPhone.addEventListener('input', () => {
                const raw = inputPhone.value.trim();
                if (!raw) {
                    if (errorSubPhone) errorSubPhone.style.display = 'none';
                    return;
                }
                const check = validateLocalPhone(raw);
                if (errorSubPhone) {
                    errorSubPhone.style.display = 'block';
                    if (check.valid) {
                        errorSubPhone.style.color = '#10b981';
                        errorSubPhone.textContent = `✓ Numéro valide — Votre ID sera : ${check.id}`;
                    } else {
                        errorSubPhone.style.color = '#ef4444';
                        errorSubPhone.textContent = check.error;
                    }
                }
            });
        }
        if (inputId) {
            inputId.addEventListener('input', () => {
                if (errorSubLogin) errorSubLogin.style.display = 'none';
            });
        }

        if (btnRegister) {
            btnRegister.onclick = async () => {
                const prenom = (inputPrenom ? inputPrenom.value : '').trim();
                const phone = (inputPhone ? inputPhone.value : '').trim();

                if (!prenom) {
                    showToast('Veuillez entrer votre prénom.');
                    if (inputPrenom) inputPrenom.focus();
                    return;
                }

                if (!phone) {
                    if (errorSubPhone) {
                        errorSubPhone.style.display = 'block';
                        errorSubPhone.style.color = '#ef4444';
                        errorSubPhone.textContent = 'Le numéro de téléphone est obligatoire.';
                    }
                    if (inputPhone) inputPhone.focus();
                    showToast('Veuillez entrer votre numéro de téléphone.');
                    return;
                }

                // Validation stricte du numéro avant toute soumission
                const check = validateLocalPhone(phone);
                if (!check.valid) {
                    if (errorSubPhone) {
                        errorSubPhone.style.display = 'block';
                        errorSubPhone.style.color = '#ef4444';
                        errorSubPhone.textContent = check.error;
                    }
                    if (inputPhone) inputPhone.focus();
                    showToast(check.error);
                    return;
                }

                if (errorSubPhone) {
                    errorSubPhone.style.display = 'block';
                    errorSubPhone.style.color = '#38bdf8';
                    errorSubPhone.textContent = `Validation en cours pour l'ID ${check.id}...`;
                }
                btnRegister.disabled = true;
                btnRegister.textContent = 'Vérification du compte...';

                if (window.BokkFirebase && typeof window.BokkFirebase.registerSubscriber === 'function') {
                    const res = await window.BokkFirebase.registerSubscriber(prenom, phone);
                    btnRegister.disabled = false;
                    btnRegister.textContent = 'Valider mon Compte & ID (Gratuit 30j)';

                    if (res.success && res.subscriber) {
                        updateAccountUI(res.subscriber);
                        startLiveSubscriberSync(res.subscriber.id);

                        if (res.alreadyExists) {
                            showToast('🎉 Bon retour ' + (res.subscriber.prenom || prenom) + ' ! Votre compte (' + res.subscriber.id + ') a été retrouvé et connecté.');
                        } else {
                            showToast('🎉 Bienvenue ' + prenom + ' ! Votre identifiant est ' + res.subscriber.id + ' (30 jours offerts).');
                        }

                        isStreamPreviewLocked = false;
                        closeModal(true);
                        // Reprise immédiate du flux
                        if (hlsInstance) {
                            try { hlsInstance.startLoad(); } catch (e) {}
                        }
                        if (videoEl && videoEl.paused) {
                            videoEl.play().catch(() => {});
                        }
                    } else {
                        const errMsg = res.error || 'Erreur lors de la validation du numéro.';
                        if (errorSubPhone) {
                            errorSubPhone.style.display = 'block';
                            errorSubPhone.textContent = errMsg;
                        }
                        showToast(errMsg);
                    }
                } else {
                    btnRegister.disabled = false;
                    btnRegister.textContent = 'Valider mon Compte & ID (Gratuit 30j)';
                    showToast('Service non disponible pour le moment');
                }
            };
        }

        if (btnLogin) {
            btnLogin.onclick = async () => {
                const id = (inputId ? inputId.value : '').trim();
                if (!id) {
                    if (errorSubLogin) {
                        errorSubLogin.style.display = 'block';
                        errorSubLogin.textContent = 'Veuillez entrer votre numéro ou ID.';
                    }
                    if (inputId) inputId.focus();
                    showToast('Entrez votre numéro ou identifiant');
                    return;
                }

                if (errorSubLogin) errorSubLogin.style.display = 'none';
                btnLogin.disabled = true;
                btnLogin.textContent = 'Vérification...';

                if (window.BokkFirebase && typeof window.BokkFirebase.loginSubscriber === 'function') {
                    const res = await window.BokkFirebase.loginSubscriber(id);
                    btnLogin.disabled = false;
                    btnLogin.textContent = 'Connexion Immédiate';

                    if (res.success && res.subscriber) {
                        updateAccountUI(res.subscriber);
                        startLiveSubscriberSync(res.subscriber.id);
                        showToast('✅ Bon retour ' + (res.subscriber.prenom || '') + ' !');
                        isStreamPreviewLocked = false;
                        closeModal(true);
                        // Reprise immédiate du flux
                        if (hlsInstance) {
                            try { hlsInstance.startLoad(); } catch (e) {}
                        }
                        if (videoEl && videoEl.paused) {
                            videoEl.play().catch(() => {});
                        }
                    } else {
                        if (errorSubLogin) {
                            errorSubLogin.style.display = 'block';
                            errorSubLogin.textContent = 'Numéro ou ID introuvable. Vérifiez votre saisie ou créez un compte.';
                        }
                        showToast('Numéro ou ID introuvable. Vérifiez la saisie.');
                    }
                } else {
                    btnLogin.disabled = false;
                    btnLogin.textContent = 'Connexion Immédiate';
                }
            };
        }

        if (btnCopySubId) {
            btnCopySubId.onclick = async () => {
                const id = profileId ? profileId.textContent : '';
                if (!id) return;
                try {
                    await navigator.clipboard.writeText(id);
                    showToast('ID ' + id + ' copié !');
                } catch(e) {
                    showToast('Votre ID : ' + id);
                }
            };
        }

        if (btnSubLogout) {
            btnSubLogout.onclick = () => {
                if (liveSubUnsub) { liveSubUnsub(); liveSubUnsub = null; }
                if (window.BokkFirebase && typeof window.BokkFirebase.logoutSubscriber === 'function') {
                    window.BokkFirebase.logoutSubscriber();
                }
                updateAccountUI(null);
                showToast('Déconnecté.');
            };
        }

        // ── Déclaration de paiement Wave Manuelle (Option C) ──
        const btnSubmitClaim = document.getElementById('btn-submit-claim');
        const inputClaimPayerPhone = document.getElementById('input-claim-payer-phone');
        const selectClaimPlan = document.getElementById('select-claim-plan');
        const inputClaimRef = document.getElementById('input-claim-ref');
        const claimFeedback = document.getElementById('claim-feedback');

        if (btnSubmitClaim) {
            btnSubmitClaim.onclick = async () => {
                const sub = (window.BokkFirebase && typeof window.BokkFirebase.getCurrentSubscriber === 'function')
                    ? window.BokkFirebase.getCurrentSubscriber()
                    : null;
                const subId = sub ? sub.id : (profileId ? profileId.textContent : '');
                const subName = sub ? sub.prenom : (profilePrenom ? profilePrenom.textContent : '');

                const payerPhone = (inputClaimPayerPhone ? inputClaimPayerPhone.value : '').trim();
                const plan = (selectClaimPlan ? selectClaimPlan.value : '1m');
                const waveRef = (inputClaimRef ? inputClaimRef.value : '').trim();

                if (!payerPhone) {
                    if (claimFeedback) {
                        claimFeedback.style.display = 'block';
                        claimFeedback.style.background = 'rgba(230,57,70,0.15)';
                        claimFeedback.style.color = '#e63946';
                        claimFeedback.textContent = 'Veuillez saisir le numéro Wave ayant effectué le paiement.';
                    }
                    if (inputClaimPayerPhone) inputClaimPayerPhone.focus();
                    return;
                }

                btnSubmitClaim.disabled = true;
                btnSubmitClaim.textContent = 'Envoi de la déclaration...';

                const amounts = { '1m': 3000, '3m': 7500, '12m': 25000 };
                const daysMap = { '1m': 30, '3m': 90, '12m': 365 };
                const amount = amounts[plan] || 3000;
                const days = daysMap[plan] || 30;

                if (window.BokkFirebase && typeof window.BokkFirebase.submitPaymentClaim === 'function') {
                    const res = await window.BokkFirebase.submitPaymentClaim({
                        subscriberId: subId,
                        subscriberName: subName,
                        payerPhone: payerPhone,
                        plan: plan,
                        amount: amount,
                        days: days,
                        waveRef: waveRef,
                        autoCreated: false
                    });
                    btnSubmitClaim.disabled = false;
                    btnSubmitClaim.textContent = 'Valider ma déclaration';

                    if (res && res.success) {
                        if (claimFeedback) {
                            claimFeedback.style.display = 'block';
                            claimFeedback.style.background = 'rgba(16,185,129,0.15)';
                            claimFeedback.style.color = '#10b981';
                            claimFeedback.textContent = '✅ Déclaration transmise ! Votre compte sera validé dès réception.';
                        }
                        showToast('Déclaration Wave envoyée ! Validation en cours...');
                        if (inputClaimRef) inputClaimRef.value = '';
                    } else {
                        if (claimFeedback) {
                            claimFeedback.style.display = 'block';
                            claimFeedback.style.background = 'rgba(230,57,70,0.15)';
                            claimFeedback.style.color = '#e63946';
                            claimFeedback.textContent = 'Erreur: ' + ((res && res.error) || 'Impossible de transmettre la déclaration.');
                        }
                    }
                } else {
                    btnSubmitClaim.disabled = false;
                    btnSubmitClaim.textContent = 'Valider ma déclaration';
                    showToast('Service temporairement indisponible');
                }
            };
        }
    }

    // ── Gestion Masquage / Affichage du Ticker de Matchs ──
    function initMatchToggle() {
        const btnToggleMatches = document.getElementById('btn-toggle-matches');
        const toggleIcon = document.getElementById('toggle-matches-icon');
        const toggleLabel = document.getElementById('toggle-matches-label');
        const sec = document.getElementById('section-matchs');
        if (!btnToggleMatches || !sec) return;

        const STORAGE_KEY = 'bokktv_hide_matches';
        let isHidden = false;
        try {
            isHidden = localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {}

        function updateUI() {
            if (isHidden) {
                sec.classList.add('matches-hidden');
                if (toggleLabel) toggleLabel.textContent = 'Afficher les matchs';
                if (toggleIcon) {
                    toggleIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
                }
            } else {
                sec.classList.remove('matches-hidden');
                if (toggleLabel) toggleLabel.textContent = 'Masquer';
                if (toggleIcon) {
                    toggleIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
                }
            }
        }

        updateUI();

        btnToggleMatches.onclick = (e) => {
            e.stopPropagation();
            isHidden = !isHidden;
            try { localStorage.setItem(STORAGE_KEY, String(isHidden)); } catch {}
            updateUI();
        };
    }

function init() {
        // ── Initialisation Signalements & Abonnés Firebase Cloud ──
        setupFirebaseReporting();
        setupSubscriberAccount();

        // ── Invitation à l'arrivée (non-bloquante) ──
        if (!isUserRegisteredAndActive() && !sessionStorage.getItem('bokk_welcome_shown')) {
            sessionStorage.setItem('bokk_welcome_shown', '1');
            setTimeout(() => {
                if (!isStreamPreviewLocked && (!videoEl || videoEl.paused)) {
                    openAccountModalInWelcomeMode();
                }
            }, 1800);
        }

        // ── Horloge Nav (mise à jour toutes les 10s) ──
        updateNavClock();
        setInterval(updateNavClock, 10000);

        // ── Configuration du switcher de vues (home / catalogue) ──
        setupViewSwitching();

        // ── Catalogue ──
        currentCategory = 'tous';
        applyCustomChannels();
        populateBouquetFilter();
        renderCategories();
        renderChannelList(true);
        renderRecentChannels();
        checkExpiryBanner();

        // ── Synchronisation des chaînes M3U ajoutées par l'administrateur ──
        if (window.BokkFirebase && typeof window.BokkFirebase.listenActiveM3uChannels === 'function') {
            window.BokkFirebase.listenActiveM3uChannels(m3uChannels => {
                if (!Array.isArray(m3uChannels)) return;
                // Nettoyer les précédentes chaînes M3U Cloud
                for (let i = channels.length - 1; i >= 0; i--) {
                    if (String(channels[i].id).startsWith('m3u_')) {
                        channels.splice(i, 1);
                    }
                }
                if (m3uChannels.length > 0) {
                    channels.push(...m3uChannels);
                    console.log(`[BOKK TV] 🚀 ${m3uChannels.length} chaînes M3U Cloud synchronisées en direct !`);
                }
                populateBouquetFilter();
                renderCategories();
                renderChannelList(false);
                updateCategoryCounts();
                renderHomeCarousels();
            });
        }

        // ── Portail Home (style myCANAL) ──
        renderLiveLogosRow();
        renderUneCards();
        renderMatchesScrollRow();
        initMatchToggle();
        renderHomeCarousels();

        // ── Match Center & carousels ──
        setupHeroBillboard();
        renderMatchCenter('all');
        renderStreamingCarousels();
        setupNavScroll();

        // ── Données matchs en temps réel ──
        fetchLiveMatchData();

        // ── Index par défaut (France 24 ou premier canal) ──
        if (channels.length > 0) {
            const f24Idx = channels.findIndex(c =>
                (c.name && c.name.toLowerCase().includes('france 24')) ||
                (c.url && c.url.includes('france24.com'))
            );
            currentIndex = f24Idx >= 0 ? f24Idx : 0;
        }

        // ── Vue grille/liste ──
        if (isGridView) {
            if (btnViewGrid) btnViewGrid.classList.add('active');
            if (btnViewList) btnViewList.classList.remove('active');
            document.body.classList.add('grid-view-active');
        }

        // ── Mesure vitesse réseau ──
        measureNetworkSpeed();
        setInterval(measureNetworkSpeed, 120000);

        // ── Boutons qualité ──
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => setQualityLevel(btn.dataset.level));
        });

        // ── Chargement infini ──
        const checkScrollAndLoadMore = (container) => {
            if (!container) return;
            if (container.scrollTop + container.clientHeight >= container.scrollHeight - 350) {
                renderNextBatch();
            }
        };
        if (channelListEl) {
            channelListEl.addEventListener('scroll', () => checkScrollAndLoadMore(channelListEl), { passive: true });
        }
        window.addEventListener('scroll', () => {
            const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            if (window.innerHeight + window.scrollY >= docH - 600) renderNextBatch();
        }, { passive: true });
        // ── Enregistrement Service Worker PWA (Progressive Web App) ──
        if ('serviceWorker' in navigator) {
            const isLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (isLocal) {
                // En local : désactiver tout Service Worker pour garantir zéro mise en cache intempestive
                navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (let reg of regs) reg.unregister();
                }).catch(() => {});
                if ('caches' in window) {
                    caches.keys().then((keys) => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
                }
            } else if (window.location.protocol === 'https:') {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js?v=16').then((reg) => {
                        reg.update();
                    }).catch(() => {});
                });
            }
        }
    }

    // Lancement au chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();