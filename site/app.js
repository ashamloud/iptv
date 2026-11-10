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

    // Catalogue des chaînes (résolu depuis window.channels ou global)
    var resolvedChannels = (typeof window !== 'undefined' && Array.isArray(window.channels) && window.channels.length > 0)
        ? window.channels
        : ((typeof window !== 'undefined' && window.channels) || (typeof globalThis !== 'undefined' && globalThis.channels) || []);
    var channels = Array.isArray(resolvedChannels) ? resolvedChannels : [];

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

    // Compteur d'échecs par chaîne — on ne supprime qu'après 3 échecs consécutifs
    const _failCount = {};
    function showPlayerError(msg, channel = null, index = -1) {
        hidePlayerLoader();
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
    }

    // ── Destruction propre des instances de lecture actives ──
    function destroyActivePlayer() {
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

    // ── Contrôle manuel de la qualité HLS & MPEG-TS ──
    function setQualityLevel(levelKey) {
        forcedQuality = levelKey;
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === String(levelKey));
        });

        if (mpegtsInstance && currentChannelIndex !== -1) {
            const ch = channels[currentChannelIndex];
            if (ch && ch.fallbackUrl) {
                if (levelKey === 'sd') {
                    showToast('Flux SD / Débit Économique activé');
                    loadChannel(currentChannelIndex, true, 0);
                } else {
                    showToast('Flux HD / Haute Définition activé');
                    loadChannel(currentChannelIndex, false, 0);
                }
                return;
            }
        }

        if (!hlsInstance) return;
        const levels = hlsInstance.levels || [];

        if (levelKey === -1 || levelKey === '-1') {
            // Mode AUTO : ABR reprend le contrôle
            hlsInstance.currentLevel = -1;
            hlsInstance.nextLevel    = -1;
            showToast('Qualité : Auto (ABR)');
        } else if (levelKey === 'sd') {
            // SD : choisir le niveau de plus faible débit
            const sdIdx = 0;
            hlsInstance.currentLevel = sdIdx;
            hlsInstance.loadLevel    = sdIdx;
            showToast('Qualité forcée : Définition Standard');
        } else if (levelKey === 'hd') {
            // HD : choisir le niveau de plus haut débit
            const hdIdx = Math.max(0, levels.length - 1);
            hlsInstance.currentLevel = hdIdx;
            hlsInstance.loadLevel    = hdIdx;
            showToast('Qualité forcée : Haute Définition');
        }
    }

    // Proxies Cloud haute disponibilité (Cloudflare Worker Edge ultra-rapide)
    const RENDER_PROXY_BASE = null; // Désactivé (Render free suspendu par quota de 5 Go)
    const CF_WORKER_BASE    = 'https://bokk-tv-proxy.pgueye866.workers.dev';

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
        const isMegaTv = rawUrl.includes('megatv') || rawUrl.includes(':80/live/') || rawUrl.includes(':8080/live/');
        const ua = (channel && channel.userAgent) ? channel.userAgent : (isMegaTv ? 'IPTVSmartersPro' : 'IPTVSmartersPro');
        extraParams += `&ua=${encodeURIComponent(ua)}`;
        if (channel && channel.referrer) extraParams += `&ref=${encodeURIComponent(channel.referrer)}`;

        const isProduction = !isPort8080 && !isLocalHost && !isFileProtocol;

        // ── EN PRODUCTION : Cloudflare Worker haute performance (Edge CDN mondial) ──
        if (isProduction) {
            // Stage 0 : Cloudflare Worker CDN (100k req/jour, non bridé à 5 Go)
            if (stage === 0 && CF_WORKER_BASE) {
                return `${CF_WORKER_BASE}/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
            }
            // Stage 1 : Fallback Vercel /api/proxy
            if (stage === 1) {
                return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
            }
            // Stage 2 : URL directe (certains flux supportent CORS nativement)
            if (stage === 2) {
                return rawUrl;
            }
            // Stage 3+ : Retour Cloudflare Worker avec délai
            if (CF_WORKER_BASE) {
                return `${CF_WORKER_BASE}/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
            }
        }

        // ── EN LOCAL (port 8080 avec serveur Python local illimité) ──
        if (stage === 0) {
            let proxyBase = '/proxy';
            if (!isPort8080) proxyBase = `http://${fallbackLocalHost}:8080/proxy`;
            return `${proxyBase}?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        } else if (stage === 1 && CF_WORKER_BASE) {
            return `${CF_WORKER_BASE}/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        } else {
            let proxyBase = '/proxy';
            if (!isPort8080) proxyBase = `http://${fallbackLocalHost}:8080/proxy`;
            return `${proxyBase}?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }
    }

    // ── Chargement d'une chaîne (Support Dual Engine MPEG-TS & HLS) ──
    function loadChannel(index, useFallback = false, retryStage = 0) {
        if (index < 0 || index >= channels.length) return;
        const channel = channels[index];
        currentIndex = index;
        isTryingFallback = useFallback;

        // Révéler le lecteur vidéo dès qu'une chaîne est sélectionnée
        revealPlayer();

        // Détruire tout lecteur actif (HLS ou MPEG-TS)
        destroyActivePlayer();

        // Arrêter les éléments vidéo/iframe
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
        ensureUnmuted();   // ← Rétablir le son si l'utilisateur avait déjà interagi

        // ── Révéler le lecteur (nouveau design myCANAL) ──
        const playerWrapper = document.getElementById('player-wrapper');
        if (playerWrapper && playerWrapper.style.display === 'none') {
            playerWrapper.style.display = 'block';
        }

        // Activer et révéler le lecteur s'il était minimisé
        revealPlayer();
        const nowPlayingPill = document.getElementById('now-playing-pill');
        if (nowPlayingPill) nowPlayingPill.style.display = 'flex';
        if (typeof updateQuickZappingBar === 'function') {
            updateQuickZappingBar();
        }

        const activeUrl = (useFallback && channel.fallbackUrl) ? channel.fallbackUrl : channel.url;
        const lowerUrl = (activeUrl || '').toLowerCase().split('?')[0];

        // Détection ultra-précise du type de flux IPTV :
        // Les flux se terminant par .ts DOIVENT être lus avec mpegts.js (pas Hls.js !)
        let streamType = 'hls';
        if (activeUrl.includes('embed') || activeUrl.includes('youtube.com') || activeUrl.includes('dailymotion.com')) {
            streamType = 'embed';
        } else if (lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.mpegts')) {
            streamType = 'ts';
        } else if (lowerUrl.endsWith('.m3u8') || activeUrl.toLowerCase().includes('.m3u8')) {
            streamType = 'hls';
        } else if (channel.type === 'ts') {
            streamType = 'ts';
        } else if (channel.type === 'hls') {
            streamType = 'hls';
        }

        const finalUrl = resolveStreamUrl(activeUrl, retryStage, channel);
        // mpegts.js tourne dans un Web Worker : les URLs relatives sont interdites → forcer absolute
        const absoluteFinalUrl = finalUrl.startsWith('/') ? (window.location.origin + finalUrl) : finalUrl;
        console.log(`[BOKK TV] Chargement chaîne: "${channel.name}" [${streamType.toUpperCase()}] (Stage: ${retryStage}) URL:`, absoluteFinalUrl);

        if (streamType === 'embed') {
            iframeEl.style.display = 'block';
            iframeEl.src = finalUrl;
            iframeEl.onload = () => {
                clearPlayerOverlays();
            };
        } else if (streamType === 'ts') {
            // ── LECTEUR MPEG-TS ULTRA-RAPIDE (< 1s) ──
            videoEl.style.display = 'block';

            if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
                mpegtsInstance = mpegts.createPlayer({
                    type: 'mse',
                    isLive: true,
                    url: absoluteFinalUrl
                }, {
                    enableWorker: false,
                    lazyLoad: false,
                    // ── Moteur MPEG-TS Anti-Coupure (fluidité maximale sans calage) ──
                    liveBufferLatencyChasing: false,     // Désactivé : évite les calages, gels et désynchronisations
                    liveBufferLatencyMaxLatency: 8.0,    // Tolérance large pour continuité absolue du flux
                    liveBufferLatencyMinRemain: 1.0,     // 1s de flux continu garanti sans freeze
                    enableStashBuffer: true,
                    stashInitialSize: 128,               // 128 Ko de tampon pour débit stable
                    autoCleanupSourceBuffer: true,
                    autoCleanupMaxBackwardDuration: 30,
                    autoCleanupMinBackwardDuration: 15
                });

                mpegtsInstance.attachMediaElement(videoEl);
                mpegtsInstance.load();

                if (qualitySelectorEl) {
                    qualitySelectorEl.style.display = channel.fallbackUrl ? 'flex' : 'none';
                    const qHd = document.getElementById('q-hd');
                    const qSd = document.getElementById('q-sd');
                    const qAuto = document.getElementById('q-auto');
                    if (qHd && qSd) {
                        qHd.classList.toggle('active', !useFallback);
                        qSd.classList.toggle('active', !!useFallback);
                        if (qAuto) qAuto.classList.remove('active');
                    }
                }

                videoEl.addEventListener('playing', () => clearPlayerOverlays(), { once: true });
                videoEl.addEventListener('loadeddata', () => clearPlayerOverlays(), { once: true });
                videoEl.addEventListener('canplay', () => clearPlayerOverlays(), { once: true });

                attemptAutoPlay(mpegtsInstance);

                mpegtsInstance.on(mpegts.Events.ERROR, (type, detail, info) => {
                    console.warn(`[BOKK TV] Erreur MPEG-TS (${type}, ${detail}, Stage ${retryStage}) sur ${finalUrl}`);
                    destroyActivePlayer();

                    // Fallback M3U8 en priorité
                    if (channel.fallbackUrl && (channel.fallbackUrl.includes('.m3u8') || channel.fallbackUrl !== channel.url) && !useFallback) {
                        console.log('[BOKK TV] Bascule MPEG-TS → HLS...');
                        loadChannel(index, true, 0);
                    } else if (retryStage < 3) {
                        console.log(`[BOKK TV] Stage ${retryStage + 1}...`);
                        loadChannel(index, useFallback, retryStage + 1);
                    } else {
                        showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                    }
                });
            } else {
                videoEl.src = finalUrl;
                videoEl.play().catch(() => {});
            }
        } else {
            // ── LECTEUR HLS (.M3U8) INSTANT ZAPPING (< 2s) ──
            videoEl.style.display = 'block';

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    startLevel: 0,                     // Démarre sur le profil le plus fluide pour affichage immédiat
                    capLevelToPlayerSize: true,
                    // ── Coussin de sécurité anti-calage (flux continu et fluide) ──
                    liveSyncDurationCount: 3,          // 3 segments d'avance : absorbe les variations réseau
                    liveMaxLatencyDurationCount: 8,    // Tolère les légères variations sans caler ni couper
                    backBufferLength: 15,
                    maxBufferLength: 30,               // 30s de buffer optimal anti-freeze
                    maxMaxBufferLength: 60,
                    maxBufferSize: 40 * 1000 * 1000,
                    maxBufferHole: 1.0,                // Tolère les micro-trous sans bloquer
                    highBufferWatchdogPeriod: 2,
                    // ── Timeouts et tolérance aux débits variables ──
                    manifestLoadingTimeOut: 8000,
                    manifestLoadingMaxRetry: 4,
                    manifestLoadingRetryDelay: 500,
                    levelLoadingTimeOut: 8000,
                    levelLoadingMaxRetry: 4,
                    fragLoadingTimeOut: 10000,
                    fragLoadingMaxRetry: 5,
                    fragLoadingRetryDelay: 500,
                    // ── Headers requis pour certains serveurs IPTV ──
                    xhrSetup: function(xhr) {
                        xhr.setRequestHeader('Accept', '*/*');
                    },
                    // ── ABR fluide ──
                    abrEwmaDefaultEstimate: 1200000,
                    abrBandWidthFactor: 0.75,
                    startFragPrefetch: true,
                    progressive: true,
                    nudgeMaxRetry: 5,
                    nudgeOffset: 0.1,
                    maxStarvationDelay: 4
                });

                videoEl.addEventListener('loadeddata', () => clearPlayerOverlays(), { once: true });
                videoEl.addEventListener('canplay', () => clearPlayerOverlays(), { once: true });

                hlsInstance.loadSource(finalUrl);
                hlsInstance.attachMedia(videoEl);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                    clearPlayerOverlays();

                    // Afficher le sélecteur de qualité si plusieurs niveaux disponibles
                    if (qualitySelectorEl) {
                        qualitySelectorEl.style.display = data.levels && data.levels.length > 1 ? 'flex' : 'none';
                    }

                    // Appliquer la qualité précédemment choisie sur la nouvelle source
                    if (forcedQuality !== -1) {
                        setTimeout(() => setQualityLevel(forcedQuality), 200);
                    } else {
                        // En auto, donner à HLS.js notre estimation réseau mesurée
                        if (estimatedBwKbps < 2000) {
                            hlsInstance.bandwidthEstimate = estimatedBwKbps * 1000;
                        }
                    }

                    attemptAutoPlay(videoEl);
                });

                // ── Sélection automatique de la piste audio compatible (ex: TF1 FHD avec Dolby/E-AC3) ──
                hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
                    if (data && data.audioTracks && data.audioTracks.length > 1) {
                        const tracks = data.audioTracks;
                        const aacIndex = tracks.findIndex(t => {
                            const n = (t.name || '').toLowerCase();
                            const c = (t.audioCodec || '').toLowerCase();
                            return c.includes('mp4a') || c.includes('aac') || n.includes('stereo') || n.includes('aac') || (!n.includes('dolby') && !n.includes('5.1') && !c.includes('ec-3') && !c.includes('ac-3'));
                        });
                        if (aacIndex !== -1 && aacIndex !== hlsInstance.audioTrack) {
                            console.log(`[BOKK TV] Bascule automatique piste audio compatible (index ${aacIndex}, ${tracks[aacIndex].name || tracks[aacIndex].audioCodec})`);
                            hlsInstance.audioTrack = aacIndex;
                        }
                    }
                });

                hlsInstance.on(Hls.Events.ERROR, (_, data) => {
                    // Récupération automatique sur calage ou micro-coupure de connexion (anti-freeze)
                    if (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall') {
                        console.warn('[BOKK TV Anti-Freeze] Tampon en cours de chargement...');
                        if (hlsInstance) {
                            if (hlsInstance.autoLevelEnabled && hlsInstance.levels && hlsInstance.levels.length > 1) {
                                const currentLvl = hlsInstance.currentLevel;
                                if (currentLvl > 0) {
                                    hlsInstance.currentLevel = currentLvl - 1;
                                }
                            }
                            hlsInstance.startLoad();
                        }
                        return;
                    }

                    // Si le navigateur rejette un codec audio spécifique (ex: E-AC3 Dolby)
                    if (data.details === 'bufferAddCodecError' && data.mimeType && data.mimeType.includes('audio')) {
                        console.warn('[BOKK TV] Codec audio incompatible avec le navigateur, essai piste alternative...');
                        if (hlsInstance.audioTracks && hlsInstance.audioTracks.length > 1) {
                            const nextTrack = (hlsInstance.audioTrack + 1) % hlsInstance.audioTracks.length;
                            hlsInstance.audioTrack = nextTrack;
                            return;
                        }
                    }

                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn(`[BOKK TV] Erreur réseau HLS (Stage ${retryStage}) sur ${finalUrl}`);
                                destroyActivePlayer();
                                if (channel.fallbackUrl && !useFallback && channel.fallbackUrl !== channel.url) {
                                    loadChannel(index, true, 0);
                                } else if (retryStage < 4) {
                                    loadChannel(index, useFallback, retryStage + 1);
                                } else {
                                    showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.warn('[BOKK TV] Erreur média HLS, récupération...');
                                try {
                                    hlsInstance.recoverMediaError();
                                } catch (e) {
                                    try {
                                        hlsInstance.swapAudioCodec();
                                        hlsInstance.recoverMediaError();
                                    } catch (e2) {
                                        destroyActivePlayer();
                                        showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                                    }
                                }
                                break;
                            default:
                                destroyActivePlayer();
                                if (channel.fallbackUrl && !useFallback && channel.fallbackUrl !== channel.url) {
                                    loadChannel(index, true, 0);
                                } else if (retryStage < 4) {
                                    loadChannel(index, useFallback, retryStage + 1);
                                } else {
                                    showPlayerError('Ce flux est temporairement indisponible.', channel, index);
                                }
                                break;
                        }
                    }
                });
            } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                videoEl.src = finalUrl;
                videoEl.addEventListener('loadedmetadata', () => {
                    attemptAutoPlay(videoEl);
                }, { once: true });
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
        if (!ch || !ch.logo || ch.logo.trim() === '') {
            return getLogo(ch);
        }
        return ch.logo.trim();
    }

    // ── Base de logos officiels (sources: Wikimedia Commons / sites officiels) ──
    const CHANNEL_LOGOS = {
        // Sénégal
        'rts1':       'https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png',
        'rts2':       'https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png',
        '2stv':       'https://upload.wikimedia.org/wikipedia/fr/a/ab/2sTV_logo.png',
        'tfm':        'https://www.gfm.sn/wp-content/uploads/2020/04/logo-gfm2-300x227.png',
        'sentv':      'https://sentv.sn/images/artwork.png',
        'walftv':     'https://upload.wikimedia.org/wikipedia/fr/8/84/Walf_FM_logo.jpg',
        // Sport
        'bein':       'https://upload.wikimedia.org/wikipedia/commons/d/d4/BeIN_Sports_logo_%28horizontal_version%29.svg',
        'canalplus':  'https://upload.wikimedia.org/wikipedia/commons/1/12/Canal_plus_france_logo.svg',
        'eurosport1': 'https://upload.wikimedia.org/wikipedia/commons/1/17/Eurosport_Logo_2015.svg',
        'eurosport2': 'https://upload.wikimedia.org/wikipedia/commons/1/17/Eurosport_Logo_2015.svg',
        'skysports':  'https://upload.wikimedia.org/wikipedia/commons/b/b7/Sky_Sports_2025.svg',
        'tntsports':  'https://upload.wikimedia.org/wikipedia/commons/8/83/TNT_Sports_%282023%29.svg',
        'dazn':       'https://upload.wikimedia.org/wikipedia/commons/0/06/DAZN_Logo_Master.svg',
        'mtvbase':    'https://upload.wikimedia.org/wikipedia/commons/3/35/MTV_Base_Africa_%282021%29.svg',
        'osn':        'https://upload.wikimedia.org/wikipedia/commons/4/47/OSN_2020_logo.svg',
        // Pan-africain / International
        'traceafrica':'https://upload.wikimedia.org/wikipedia/fr/c/c6/Traceafrica2022.png',
        'tracemziki': 'https://upload.wikimedia.org/wikipedia/fr/2/25/Tracemziki2022.png',
        'africa24':   'https://upload.wikimedia.org/wikipedia/fr/6/6a/Logo_Africa_24.jpg',
        'tv5monde':   'https://upload.wikimedia.org/wikipedia/commons/3/3d/TV5Monde_Logo.svg',
        'france24':   'https://upload.wikimedia.org/wikipedia/commons/c/c1/France_24_logo_%282013%29.svg',
        'aljazeera':  'https://upload.wikimedia.org/wikipedia/commons/f/f2/Aljazeera_eng.svg',
        'bbcworld':   'https://upload.wikimedia.org/wikipedia/commons/2/2a/BBC_World_News.svg',
        'cnn':        'https://upload.wikimedia.org/wikipedia/commons/6/66/CNN_International_logo.svg',
        'rfi':        'https://upload.wikimedia.org/wikipedia/commons/d/dd/RFI_logo_2013.svg',
        // Afrique
        'ortm':       'https://upload.wikimedia.org/wikipedia/commons/8/8c/ORTM_1_0.png',
        'rtb':        'https://upload.wikimedia.org/wikipedia/fr/7/7f/Radio_T%C3%A9l%C3%A9vision_Burkina_logo.jpg',
        'rti':        'https://upload.wikimedia.org/wikipedia/commons/2/2f/Logo_RTI_2021.svg',
        // Maghreb / Moyen-Orient
        'rta':        'https://upload.wikimedia.org/wikipedia/commons/f/f1/%D8%A7%D9%84%D8%AA%D9%84%D9%81%D8%B2%D9%8A%D9%88%D9%86_%D8%A7%D9%84%D8%B9%D9%85%D9%88%D9%85%D9%8A_%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1%D9%8A.svg',
        '2m':         'https://upload.wikimedia.org/wikipedia/commons/2/29/2M_TV_logo.svg',
        'alaoula':    'https://upload.wikimedia.org/wikipedia/commons/e/e4/%D8%B4%D8%B9%D8%A7%D8%B1_%D9%82%D9%86%D8%A7%D8%A9_%D8%A7%D9%84%D8%A3%D9%88%D9%84%D9%89_Al_Aoula_Tv_Logo.png',
        'mbc1':       'https://upload.wikimedia.org/wikipedia/commons/c/c0/MBC_1_Logo.svg',
        'mbc2':       'https://upload.wikimedia.org/wikipedia/commons/1/1f/MBC2_Logo.svg',
        // France TNT
        'tf1':        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/TF1_logo_2013.svg/180px-TF1_logo_2013.svg.png',
        'france2':    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/France_2_logo.svg/160px-France_2_logo.svg.png',
        'france3':    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/France_3_logo.svg/160px-France_3_logo.svg.png',
        'france4':    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/France_4_logo.svg/160px-France_4_logo.svg.png',
        'france5':    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/France_5_logo.svg/160px-France_5_logo.svg.png',
        'm6':         'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/M6_-_2009.svg/180px-M6_-_2009.svg.png',
        'w9':         'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/W9_2017.svg/160px-W9_2017.svg.png',
        'tmc':        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/TMC_logo_2018.svg/160px-TMC_logo_2018.svg.png',
        'gulli':      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Logo_Gulli_2014.svg/180px-Logo_Gulli_2014.svg.png',
        'cstar':      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/CStar_logo_2016.svg/160px-CStar_logo_2016.svg.png',
    };

    function getLogo(ch) {
        if (!ch) return DEFAULT_TV_LOGO;
        const name = ((ch.name || '') + ' ' + (ch.id || '')).toLowerCase();

        if (name.includes('rts') && (name.includes('1') || name.includes('sénégal') || name.includes('senegal'))) return CHANNEL_LOGOS['rts1'];
        if (name.includes('rts') && name.includes('2')) return CHANNEL_LOGOS['rts2'];
        if (name.includes('2stv') || name.includes('2s tv')) return CHANNEL_LOGOS['2stv'];
        if (/\btfm\b/.test(name)) return CHANNEL_LOGOS['tfm'];
        if (name.includes('sen tv') || name.includes('sentv')) return CHANNEL_LOGOS['sentv'];
        if (name.includes('walf')) return CHANNEL_LOGOS['walftv'];
        if (name.includes('bein') || name.includes('be in sport')) return CHANNEL_LOGOS['bein'];
        if (name.includes('canal+') || name.includes('canal plus') || name.includes('canalplus')) return CHANNEL_LOGOS['canalplus'];
        if (name.includes('trace africa')) return CHANNEL_LOGOS['traceafrica'];
        if (name.includes('trace mziki') || name.includes('mziki')) return CHANNEL_LOGOS['tracemziki'];
        if (name.includes('mtv base')) return CHANNEL_LOGOS['mtvbase'];
        if (name.includes('africa 24') || name.includes('africa24')) return CHANNEL_LOGOS['africa24'];
        if (name.includes('tv5')) return CHANNEL_LOGOS['tv5monde'];
        if (name.includes('france 24') || name.includes('france24')) return CHANNEL_LOGOS['france24'];
        if (name.includes('al jazeera') || name.includes('aljazeera')) return CHANNEL_LOGOS['aljazeera'];
        if (name.includes('bbc world')) return CHANNEL_LOGOS['bbcworld'];
        if (/\bcnn\b/.test(name)) return CHANNEL_LOGOS['cnn'];
        if (name.includes('eurosport 2') || name.includes('eurosport2')) return CHANNEL_LOGOS['eurosport2'];
        if (name.includes('eurosport')) return CHANNEL_LOGOS['eurosport1'];
        if (/\brfi\b/.test(name) || name.includes('radio france internationale')) return CHANNEL_LOGOS['rfi'];
        if (/\bortm\b/.test(name)) return CHANNEL_LOGOS['ortm'];
        if (/\brtb\b/.test(name) || name.includes('burkina')) return CHANNEL_LOGOS['rtb'];
        if (/\brti\b/.test(name) || name.includes('ivoirienne') || name.includes('ivoire')) return CHANNEL_LOGOS['rti'];
        if (/\brta\b/.test(name) || /\bentv\b/.test(name) || /\baptv\b/.test(name)) return CHANNEL_LOGOS['rta'];
        if (/\b2m\b/.test(name)) return CHANNEL_LOGOS['2m'];
        if (name.includes('al aoula') || name.includes('aoula') || name.includes('alaoula')) return CHANNEL_LOGOS['alaoula'];
        if (name.includes('mbc 1') || name.includes('mbc1')) return CHANNEL_LOGOS['mbc1'];
        if (name.includes('mbc 2') || name.includes('mbc2')) return CHANNEL_LOGOS['mbc2'];
        if (/\bosn\b/.test(name)) return CHANNEL_LOGOS['osn'];
        if (name.includes('sky sport')) return CHANNEL_LOGOS['skysports'];
        if (name.includes('tnt sport') || name.includes('bt sport')) return CHANNEL_LOGOS['tntsports'];
        if (/\bdazn\b/.test(name)) return CHANNEL_LOGOS['dazn'];
        if (/\btf1\b/.test(name)) return CHANNEL_LOGOS['tf1'];
        if (name.includes('france 2') || name.includes('france2')) return CHANNEL_LOGOS['france2'];
        if (name.includes('france 3') || name.includes('france3')) return CHANNEL_LOGOS['france3'];
        if (name.includes('france 4') || name.includes('france4')) return CHANNEL_LOGOS['france4'];
        if (name.includes('france 5') || name.includes('france5')) return CHANNEL_LOGOS['france5'];
        if (/\bm6\b/.test(name)) return CHANNEL_LOGOS['m6'];
        if (/\bw9\b/.test(name)) return CHANNEL_LOGOS['w9'];
        if (/\btmc\b/.test(name)) return CHANNEL_LOGOS['tmc'];
        if (/\bgulli\b/.test(name)) return CHANNEL_LOGOS['gulli'];
        if (/\bcstar\b/.test(name)) return CHANNEL_LOGOS['cstar'];

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
        if (targetId) {
            foundIdx = channels.findIndex(c => c.id === targetId || c.stream_id === targetId);
        }
        if (foundIdx === -1 && queryName) {
            const qClean = queryName.toLowerCase().replace(/[^a-z0-9]/g, '');
            foundIdx = channels.findIndex(c => {
                const cClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cClean.includes(qClean) || qClean.includes(cClean);
            });
            if (foundIdx === -1) {
                const tokens = queryName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                foundIdx = channels.findIndex(c => {
                    const cLower = c.name.toLowerCase();
                    return tokens.every(t => cLower.includes(t));
                });
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

        // Chaînes EN DIRECT vedettes avec leurs IDs vérifiés 100% fonctionnels
        const LIVE_FEATURED = [
            { id: 2464, name: 'TF1',           logo: 'logos/tf1.svg' },
            { id: 2465, name: 'France 2',      logo: 'logos/france2.svg' },
            { id: 2466, name: 'France 3',      logo: 'logos/france3.svg' },
            { id: 2767, name: 'CANAL+ Sport',  logo: 'logos/canalplus.svg' },
            { id: 2470, name: 'M6',            logo: null },
            { id: 2472, name: 'Arte',          logo: 'logos/arte.svg' },
            { id: 2473, name: 'W9',            logo: null },
            { id: 71,   name: 'RTS 1',         logo: 'logos/rts1.svg' },
            { id: 3724, name: 'beIN Sports 1', logo: 'logos/beinsports.svg' },
            { id: 2770, name: 'Canal+ Foot',   logo: 'logos/canalplus.svg' },
            { id: 3725, name: 'beIN Sports 2', logo: 'logos/beinsports.svg' },
            { id: 2764, name: 'Canal+ 360',    logo: 'logos/canalplus.svg' },
        ];

        LIVE_FEATURED.forEach(featured => {
            // Trouver l'index dans le tableau des chaînes
            const idx = channels.findIndex(c => c.id === featured.id);

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
                if (idx !== -1) {
                    loadChannel(idx);
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

    // Mapping chaînes BOKK TV pour les grandes compétitions
    const COMPETITION_CHANNELS = {
        'UEFA Champions League': [
            { id: 2770, name: 'Canal+ Foot HD', badge: 'FHD' },
            { id: 3724, name: 'beIN Sports 1',  badge: '4K' },
            { id: 3704, name: 'M+ Liga Campeones', badge: 'HD' }
        ],
        'LaLiga': [
            { id: 5245, name: 'M+ LaLiga 4K',   badge: '4K' },
            { id: 5293, name: 'DAZN LaLiga',    badge: 'HD' },
            { id: 3724, name: 'beIN Sports 1',  badge: 'HD' }
        ],
        'Ligue 1': [
            { id: 2770, name: 'Canal+ Foot HD', badge: 'FHD' },
            { id: 2767, name: 'Canal+ Sport',   badge: 'FHD' },
            { id: 3724, name: 'beIN Sports 1',  badge: 'HD' }
        ],
        'Premier League': [
            { id: 2774, name: 'Canal+ Premier League', badge: 'FHD' },
            { id: 3724, name: 'beIN Sports 1',         badge: 'HD' }
        ],
        'Serie A': [
            { id: 3724, name: 'beIN Sports 1',  badge: 'HD' },
            { id: 2767, name: 'Canal+ Sport',   badge: 'FHD' }
        ],
        'Bundesliga': [
            { id: 3724, name: 'beIN Sports 1',  badge: 'HD' },
            { id: 2767, name: 'Canal+ Sport',   badge: 'FHD' }
        ],
        'default': [
            { id: 2770, name: 'Canal+ Foot HD', badge: 'FHD' },
            { id: 3724, name: 'beIN Sports 1',  badge: 'HD' }
        ]
    };

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

                    events.forEach(ev => {
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

                        const channels = COMPETITION_CHANNELS[league.name] || COMPETITION_CHANNELS['default'];

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
    function init() {
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

        // ── Portail Home (style myCANAL) ──
        renderLiveLogosRow();
        renderUneCards();
        renderMatchesScrollRow();
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
                    navigator.serviceWorker.register('/sw.js?v=4').catch(() => {});
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