// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Controller
// HLS.js Engine, Channel Navigation, Favorites, Player Controls & UI
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Catégories disponibles ──
    const CATEGORIES = [
        { key: 'tous',         label: 'Toutes les chaînes', icon: '📺' },
        { key: 'senegal',      label: '🇸🇳 Sénégal',         icon: '🇸🇳' },
        { key: 'francophone',  label: '🇫🇷 France',          icon: '🇫🇷' },
        { key: 'sport',        label: '⚽ Sport',            icon: '⚽' },
        { key: 'cinema',       label: '🎬 Films & Séries',   icon: '🎬' },
        { key: 'uk',           label: '🇬🇧 UK & USA',        icon: '🇬🇧' },
        { key: 'espagne',      label: '🇪🇸 Espagne',         icon: '🇪🇸' },
        { key: 'allemagne',    label: '🇩🇪 Allemagne',       icon: '🇩🇪' },
        { key: 'italie',       label: '🇮🇹 Italie',          icon: '🇮🇹' },
        { key: 'albanie',      label: '🇦🇱 Albanie',         icon: '🇦🇱' },
        { key: 'documentaire', label: '🌍 Documentaire',    icon: '🌍' },
        { key: 'jeunesse',     label: '🧸 Jeunesse',        icon: '🧸' },
        { key: 'music',        label: '🎵 Musique',         icon: '🎵' },
        { key: 'favoris',      label: '⭐ Favoris',          icon: '⭐' }
    ];

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
        showToast(added ? `⭐ "${name}" ajoutée aux favoris` : `Retirée des favoris`);

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

    // ── Masquer/Afficher les états du lecteur ──
    function showPlayerLoader() {
        if (loaderEl) loaderEl.classList.add('active');
        if (errorEl) errorEl.classList.remove('active');
        if (placeholderEl) placeholderEl.style.display = 'none';
    }

    function hidePlayerLoader() {
        if (loaderEl) loaderEl.classList.remove('active');
    }

    function showPlayerError(msg) {
        hidePlayerLoader();
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

    // ── Détection et résolution de l'URL du flux avec proxy intelligent ──
    function resolveStreamUrl(rawUrl, stage = 0, channel = null) {
        if (!rawUrl) return '';
        if (rawUrl.startsWith('/') && window.location.protocol === 'file:') {
            return `http://localhost:8080${rawUrl}`;
        }
        if (rawUrl.startsWith('/') || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
            return rawUrl;
        }

        const isLocalHost = (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port === '8080'
        );
        const isFileProtocol = (window.location.protocol === 'file:');

        let extraParams = '';
        if (channel) {
            if (channel.referrer) {
                extraParams += `&ref=${encodeURIComponent(channel.referrer)}`;
            }
            if (channel.userAgent) {
                extraParams += `&ua=${encodeURIComponent(channel.userAgent)}`;
            }
        }

        // Détection du point d'entrée proxy :
        // - En local (server.py) : /proxy
        // - En fichier local : http://localhost:8080/proxy
        // - En production / déploiement Vercel : /api/proxy
        const proxyBase = isLocalHost ? '/proxy' : (isFileProtocol ? 'http://localhost:8080/proxy' : '/api/proxy');

        // Stage 0 : Proxy optimisé (Local ou Vercel Serverless) avec réécriture M3U8
        if (stage === 0) {
            return `${proxyBase}?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }

        // Stage 1 : Tentative directe si déjà en HTTPS
        if (stage === 1) {
            if (rawUrl.startsWith('https://')) {
                return rawUrl;
            }
            return `${proxyBase}?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }

        // Stage 2 : Proxy public de secours
        if (stage >= 2) {
            return `https://corsproxy.io/?url=${encodeURIComponent(rawUrl)}`;
        }

        return rawUrl;
    }

    // ── Chargement d'une chaîne (Support Dual Engine MPEG-TS & HLS) ──
    function loadChannel(index, useFallback = false, retryStage = 0) {
        if (index < 0 || index >= channels.length) return;
        const channel = channels[index];
        currentIndex = index;
        isTryingFallback = useFallback;

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
        if (playerLogo) playerLogo.src = channel.logo || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
        if (playerCat) playerCat.textContent = channel.category.toUpperCase();
        if (playerBadge) playerBadge.textContent = channel.badge || 'HD';

        updateFavButtons();
        highlightActiveChannel();

        const activeUrl = (useFallback && channel.fallbackUrl) ? channel.fallbackUrl : channel.url;
        const lowerUrl = (activeUrl || '').toLowerCase().split('?')[0];

        // Détection ultra-précise du type de flux IPTV
        let streamType = 'hls';
        if (activeUrl.includes('embed') || activeUrl.includes('youtube.com') || activeUrl.includes('dailymotion.com')) {
            streamType = 'embed';
        } else if (lowerUrl.endsWith('.m3u8') || activeUrl.toLowerCase().includes('.m3u8') || channel.type === 'hls') {
            streamType = 'hls';
        } else if (lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.mpegts') || channel.type === 'ts') {
            streamType = 'ts';
        }

        const finalUrl = resolveStreamUrl(activeUrl, retryStage, channel);
        console.log(`[BOKK TV] Chargement chaîne: "${channel.name}" [${streamType.toUpperCase()}] (Stage: ${retryStage}) URL:`, finalUrl);

        if (streamType === 'embed') {
            iframeEl.style.display = 'block';
            iframeEl.src = finalUrl;
            iframeEl.onload = () => {
                clearPlayerOverlays();
            };
        } else if (streamType === 'ts') {
            // ── LECTEUR MPEG-TS (FLUX DIRECT MEGATV) ──
            videoEl.style.display = 'block';

            if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
                mpegtsInstance = mpegts.createPlayer({
                    type: 'mse',
                    isLive: true,
                    url: finalUrl
                }, {
                    enableWorker: true,
                    lazyLoad: false,
                    liveBufferLatencyChasing: true,
                    liveBufferLatencyMaxLatency: 3.5,
                    liveBufferLatencyMinRemain: 1.0,
                    autoCleanupSourceBuffer: true,
                    enableStashBuffer: false,
                    stashInitialSize: 128
                });

                mpegtsInstance.attachMediaElement(videoEl);
                mpegtsInstance.load();

                videoEl.addEventListener('playing', () => {
                    clearPlayerOverlays();
                }, { once: true });

                mpegtsInstance.play().then(() => {
                    clearPlayerOverlays();
                }).catch(() => {
                    console.log('[BOKK TV] Autoplay bloqué, attente interaction utilisateur.');
                    clearPlayerOverlays();
                });

                mpegtsInstance.on(mpegts.Events.ERROR, (type, detail, info) => {
                    console.warn(`[BOKK TV] Erreur MPEG-TS (${type}, ${detail}, Stage ${retryStage}) sur ${finalUrl}`);
                    destroyActivePlayer();

                    // 1. Si un fallback M3U8 existe, basculer immédiatement en HLS
                    if (channel.fallbackUrl && (channel.fallbackUrl.includes('.m3u8') || channel.fallbackUrl !== channel.url) && !useFallback) {
                        console.log('[BOKK TV] Bascule MPEG-TS vers flux HLS de secours...');
                        loadChannel(index, true, 0);
                    } else if (retryStage === 0) {
                        console.log('[BOKK TV] Tentative suivante Stage 1...');
                        loadChannel(index, useFallback, 1);
                    } else if (retryStage === 1) {
                        console.log('[BOKK TV] Tentative suivante Stage 2...');
                        loadChannel(index, useFallback, 2);
                    } else {
                        showPlayerError('Ce flux est temporairement indisponible.');
                    }
                });
            } else {
                // Fallback direct sur l'élément vidéo
                videoEl.src = finalUrl;
                videoEl.play().catch(() => {});
            }
        } else {
            // ── LECTEUR HLS (.M3U8) ──
            videoEl.style.display = 'block';

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                hlsInstance = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 8,
                    maxBufferLength: 10,
                    maxMaxBufferLength: 16,
                    maxBufferSize: 25 * 1000 * 1000,
                    manifestLoadingTimeOut: 3500,
                    manifestLoadingMaxRetry: 1,
                    manifestLoadingRetryDelay: 500,
                    levelLoadingTimeOut: 3500,
                    levelLoadingMaxRetry: 1,
                    fragLoadingTimeOut: 5000,
                    fragLoadingMaxRetry: 1,
                    startFragPrefetch: true,
                    progressive: true
                });

                hlsInstance.loadSource(finalUrl);
                hlsInstance.attachMedia(videoEl);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    clearPlayerOverlays();
                    videoEl.play().catch(() => {
                        console.log('[BOKK TV] Autoplay bloqué, attente interaction.');
                        clearPlayerOverlays();
                    });
                });

                hlsInstance.on(Hls.Events.ERROR, (_, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.warn(`[BOKK TV] Erreur réseau HLS (Stage ${retryStage}) sur ${finalUrl}`);
                                destroyActivePlayer();
                                if (channel.fallbackUrl && !useFallback && channel.fallbackUrl !== channel.url) {
                                    loadChannel(index, true, 0);
                                } else if (retryStage === 0) {
                                    loadChannel(index, useFallback, 1);
                                } else if (retryStage === 1) {
                                    loadChannel(index, useFallback, 2);
                                } else {
                                    showPlayerError('Ce flux est temporairement indisponible.');
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
                                        showPlayerError('Ce flux est temporairement indisponible.');
                                    }
                                }
                                break;
                            default:
                                destroyActivePlayer();
                                if (channel.fallbackUrl && !useFallback && channel.fallbackUrl !== channel.url) {
                                    loadChannel(index, true, 0);
                                } else {
                                    showPlayerError('Ce flux est temporairement indisponible.');
                                }
                                break;
                        }
                    }
                });
            } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                videoEl.src = finalUrl;
                videoEl.addEventListener('loadedmetadata', () => {
                    clearPlayerOverlays();
                    videoEl.play().catch(() => {});
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

    // ── Détection de correspondance catégorie ──
    function isChannelInCategory(ch, catKey, favs) {
        if (catKey === 'tous') return true;
        if (catKey === 'favoris') return favs.includes(ch.id);
        if (catKey === 'senegal') return (ch.category === 'senegal' || ch.country === 'SN');
        if (catKey === 'francophone') return (ch.category === 'francophone' || ch.country === 'FR' || (ch.group && ch.group.includes('FR |')));
        if (catKey === 'sport') return (ch.category === 'sport' || (ch.group && (ch.group.includes('SPORT') || ch.group.includes('DAZN') || ch.group.includes('FOOT') || ch.group.includes('LALIGA') || ch.group.includes('PREMIER LEAGUE'))));
        if (catKey === 'cinema') return (ch.category === 'cinema' || (ch.group && (ch.group.includes('CINÉMA') || ch.group.includes('FILM') || ch.group.includes('SERIE') || ch.group.includes('MOVIES'))));
        if (catKey === 'uk') return (ch.country === 'UK' || ch.category === 'uk' || (ch.group && ch.group.includes('UK |')));
        if (catKey === 'espagne') return (ch.country === 'ES' || ch.category === 'espagne' || (ch.group && ch.group.includes('ES |')));
        if (catKey === 'allemagne') return (ch.country === 'DE' || ch.category === 'allemagne' || (ch.group && (ch.group.includes('DE |') || ch.group.includes('AUSTRIA'))));
        if (catKey === 'italie') return (ch.country === 'IT' || ch.category === 'italie' || (ch.group && ch.group.includes('IT |')));
        if (catKey === 'albanie') return (ch.country === 'AL' || ch.category === 'albanie' || (ch.group && ch.group.includes('ALB |')));
        return (ch.category === catKey);
    }

    // ── Filtrage des chaînes ──
    function getFilteredChannels() {
        const query = currentQuery.trim().toLowerCase();
        const favs = getFavorites();

        return channels
            .map((ch, index) => ({ ...ch, index }))
            .filter(ch => {
                // Filtre Bouquet / Catégorie IPTV
                if (currentBouquet !== 'all' && ch.group !== currentBouquet) {
                    return false;
                }

                // Filtre Catégorie Principale
                if (!isChannelInCategory(ch, currentCategory, favs)) {
                    return false;
                }

                // Filtre Recherche
                if (query) {
                    const text = `${ch.name} ${ch.group || ''} ${ch.desc || ''} ${ch.category} ${ch.country || ''}`.toLowerCase();
                    return text.includes(query);
                }

                return true;
            });
    }

    // ── Remplissage du sélecteur de bouquets ──
    function populateBouquetFilter() {
        if (!bouquetFilter) return;
        const groups = new Map();
        channels.forEach(ch => {
            const g = ch.group || ch.desc;
            if (g) {
                groups.set(g, (groups.get(g) || 0) + 1);
            }
        });

        bouquetFilter.innerHTML = `<option value="all">⚡ Tous les bouquets (${channels.length.toLocaleString('fr-FR')} chaînes)</option>`;
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

    // ── Rendu de la barre des catégories ──
    function renderCategories() {
        if (!categoriesBar) return;
        categoriesBar.innerHTML = '';

        CATEGORIES.forEach(cat => {
            const count = getCategoryCount(cat.key);
            if (cat.key !== 'tous' && cat.key !== 'favoris' && count === 0) return;

            const btn = document.createElement('button');
            btn.className = 'cat-pill' + (cat.key === currentCategory ? ' active' : '');
            btn.dataset.category = cat.key;

            btn.innerHTML = `
                <span>${cat.label}</span>
                <span class="cat-pill-count">${count.toLocaleString('fr-FR')}</span>
            `;

            btn.onclick = () => {
                currentCategory = cat.key;
                document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderChannelList(true);
            };

            categoriesBar.appendChild(btn);
        });
    }

    function getCategoryCount(catKey) {
        if (catKey === 'tous') return channels.length;
        const favs = getFavorites();
        return channels.filter(ch => isChannelInCategory(ch, catKey, favs)).length;
    }

    function updateCategoryCounts() {
        document.querySelectorAll('.cat-pill').forEach(btn => {
            const catKey = btn.dataset.category;
            const countEl = btn.querySelector('.cat-pill-count');
            if (countEl && catKey) {
                countEl.textContent = getCategoryCount(catKey).toLocaleString('fr-FR');
            }
        });
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

        card.innerHTML = `
            <div class="card-logo-wrap">
                <img class="card-logo" src="${ch.logo || ''}" alt="${ch.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%236366f1\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'/></svg>'">
            </div>
            <div class="card-content">
                <div class="card-top">
                    <span class="card-title">${ch.name}</span>
                    <span class="card-badge">${ch.badge || 'HD'}</span>
                </div>
                <div class="card-subtitle">${ch.group || ch.desc || ch.category}</div>
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

        card.onclick = () => loadChannel(ch.index);

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

    // ── Plein Écran & Mode Cinéma ──
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            playerContainer.requestFullscreen().catch(err => {
                console.warn('Plein écran non supporté :', err);
            });
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        if (fsExpandIcon) fsExpandIcon.style.display = isFs ? 'none' : 'block';
        if (fsShrinkIcon) fsShrinkIcon.style.display = isFs ? 'block' : 'none';
    });

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

    if (playerContainer) {
        playerContainer.ondblclick = toggleFullscreen;
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
            renderChannelList();
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
            renderChannelList();
        };
    }

    // ── Basculer entre Vue Liste et Vue Grille ──
    if (btnViewList) {
        btnViewList.onclick = () => {
            isGridView = false;
            localStorage.setItem('bokk_tv_view', 'list');
            btnViewList.classList.add('active');
            if (btnViewGrid) btnViewGrid.classList.remove('active');
            renderChannelList();
        };
    }

    if (btnViewGrid) {
        btnViewGrid.onclick = () => {
            isGridView = true;
            localStorage.setItem('bokk_tv_view', 'grid');
            btnViewGrid.classList.add('active');
            if (btnViewList) btnViewList.classList.remove('active');
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
        // Ignorer si l'utilisateur est en train de taper dans la barre de recherche
        if (document.activeElement === searchInput) {
            if (e.key === 'Escape') {
                searchInput.blur();
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                if (videoEl.paused) videoEl.play().catch(() => {});
                else videoEl.pause();
                break;
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
            case 'arrowdown':
                e.preventDefault();
                playNextChannel();
                break;
            case 'arrowup':
                e.preventDefault();
                playPrevChannel();
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
        renderCategories();
        renderChannelList();
        updateM3uModalStatus();
        showToast(`✅ ${newChannels.length} chaîne(s) importée(s) avec succès !`);
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
            if (!CATEGORIES.some(c => c.key === 'playlist')) {
                CATEGORIES.splice(1, 0, { key: 'playlist', label: '📂 Ma Playlist', icon: '📂' });
            }
        } else {
            const pIdx = CATEGORIES.findIndex(c => c.key === 'playlist');
            if (pIdx >= 0) CATEGORIES.splice(pIdx, 1);
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

                    saveCustomChannels(parsed);
                    populateBouquetFilter();
                    showToast(`✅ ${parsed.length.toLocaleString('fr-FR')} chaînes MegaTV rechargées avec succès !`);
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
                btnLoadM3uUrl.textContent = 'Recharger la playlist MegaTV en ligne';
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

    // ── Initialisation ──
    function init() {
        if (isGridView && btnViewGrid && btnViewList) {
            btnViewGrid.classList.add('active');
            btnViewList.classList.remove('active');
        }

        applyCustomChannels();
        populateBouquetFilter();
        renderCategories();
        renderChannelList(true);

        // Écouteur de défilement pour le chargement infini (60 FPS avec 7 358 chaînes)
        if (channelListEl) {
            channelListEl.addEventListener('scroll', () => {
                if (channelListEl.scrollTop + channelListEl.clientHeight >= channelListEl.scrollHeight - 350) {
                    renderNextBatch();
                }
            }, { passive: true });
        }

        // Chaîne par défaut : Première vraie chaîne active (TF1 FHD ou premier canal)
        const defaultIndex = channels.findIndex(ch => ch.category === 'francophone' && !ch.name.startsWith('###'));
        const startIdx = defaultIndex >= 0 ? defaultIndex : channels.findIndex(ch => !ch.name.startsWith('###'));
        const finalStart = startIdx >= 0 ? startIdx : 0;
        if (channels[finalStart]) {
            loadChannel(finalStart);
        }
    }

    // Lancement au chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();