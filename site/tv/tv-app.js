/**
 * BOKK TV — Smart TV Engine
 * Compatible avec Android TV, Fire TV, Tizen OS, webOS, et télécommandes D-PAD (Touches Fléchées)
 */

(function () {
    'use strict';

    // ── Proxies Cloud Haute Disponibilité & Résolution Universelle ──
    const CF_WORKER    = 'https://bokk-tv-proxy.pgueye866.workers.dev';

    function resolveStreamUrl(rawUrl, stage = 0) {
        if (!rawUrl) return '';
        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;

        const isLocalHost = (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port === '8080'
        );

        let extraParams = '&ua=IPTVSmartersPro';
        if (rawUrl.includes('radio2m.ma')) extraParams += '&ref=http://www.radio2m.ma/';

        // En local sur port 8080 : utiliser le proxy Python local ultra-rapide
        if (isLocalHost) {
            if (stage === 0) return `/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
            return `${CF_WORKER}/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }

        // En production : Cloudflare Worker en premier (Edge CDN gratuit 100k req/j)
        if (stage === 0) {
            return `${CF_WORKER}/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        } else {
            return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }
    }

    // ── Catégories TV ──
    const CATEGORIES = [
        { key: 'senegal',     label: '🇸🇳 Sénégal' },
        { key: 'afrique',     label: 'Afrique' },
        { key: 'francophone', label: '🇫🇷 France & TNT' },
        { key: 'sport',       label: 'Sport Direct' },
        { key: 'cinema',      label: 'Films & Séries' },
        { key: 'music',       label: 'Musique Afrique' },
        { key: 'documentaire',label: 'Documentaires' },
        { key: 'jeunesse',    label: 'Jeunesse' },
        { key: 'favoris',     label: 'Mes Favoris' },
        { key: 'tous',        label: 'Tout le Catalogue' },
        { key: 'uk',          label: '🇬🇧 UK & USA' },
        { key: 'espagne',     label: '🇪🇸 Espagne' },
        { key: 'allemagne',   label: '🇩🇪 Allemagne' },
        { key: 'italie',      label: '🇮🇹 Italie' }
    ];

    // ── Variables d'état ──
    let currentCat = 'senegal';
    let currentBouquet = 'all';
    let currentChannelIndex = -1;
    let filteredChannels = [];
    let favorites = new Set(JSON.parse(localStorage.getItem('bokk_tv_tv_favs') || '[]'));
    let hlsInstance = null;
    let mpegtsInstance = null;
    let osdTimer = null;
    let overlayVisible = true;
    let focusedZone = 'grid'; // 'cat', 'bouquet', 'grid'
    let focusedIndex = 0;

    // ── Éléments DOM ──
    const videoEl        = document.getElementById('tv-video');
    const iframeEl       = document.getElementById('tv-iframe');
    const loaderEl       = document.getElementById('tv-loader');
    const loaderChanEl   = document.getElementById('tv-loader-channel');
    const errorEl        = document.getElementById('tv-error');
    const overlayEl      = document.getElementById('tv-overlay');
    const catRowEl       = document.getElementById('tv-cat-row');
    const bouquetRowEl   = document.getElementById('tv-bouquet-row');
    const gridEl         = document.getElementById('tv-grid');
    const gridLabelEl    = document.getElementById('tv-grid-label');
    const countTextEl    = document.getElementById('tv-count-text');
    const clockEl        = document.getElementById('tv-clock');

    // OSD
    const osdEl          = document.getElementById('tv-osd');
    const osdBadgeEl     = document.getElementById('tv-osd-badge');
    const osdNumberEl    = document.getElementById('tv-osd-number');
    const osdNameEl      = document.getElementById('tv-osd-name');
    const osdDescEl      = document.getElementById('tv-osd-desc');

    // ── Horloge TV ──
    function updateClock() {
        if (!clockEl) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        clockEl.textContent = `${hh}:${mm}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ── Construction des Catégories ──
    function renderCategories() {
        catRowEl.innerHTML = '';
        CATEGORIES.forEach((cat, idx) => {
            const btn = document.createElement('button');
            btn.className = 'tv-cat-btn' + (cat.key === currentCat ? ' active' : '');
            btn.textContent = cat.label;
            btn.dataset.index = idx;
            btn.dataset.key = cat.key;
            btn.onclick = () => selectCategory(cat.key);
            catRowEl.appendChild(btn);
        });
    }

    function selectCategory(catKey) {
        currentCat = catKey;
        currentBouquet = 'all';
        renderCategories();
        renderBouquets();
        updateFilteredChannels();
        renderGrid();
        focusedZone = 'grid';
        focusedIndex = 0;
        focusCurrentElement();
    }

    // ── Construction des Bouquets ──
    function renderBouquets() {
        bouquetRowEl.innerHTML = '';
        // Récupérer les bouquets disponibles pour cette catégorie
        const bouquets = new Set(['all']);
        channels.forEach(ch => {
            if (currentCat === 'tous' || ch.category === currentCat) {
                if (ch.group) bouquets.add(ch.group);
            }
        });

        const list = Array.from(bouquets);
        list.slice(0, 30).forEach((b, idx) => {
            const btn = document.createElement('button');
            btn.className = 'tv-bouquet-btn' + (b === currentBouquet ? ' active' : '');
            btn.textContent = b === 'all' ? '⚡ Tous les bouquets' : b;
            btn.dataset.index = idx;
            btn.dataset.bouquet = b;
            btn.onclick = () => {
                currentBouquet = b;
                renderBouquets();
                updateFilteredChannels();
                renderGrid();
            };
            bouquetRowEl.appendChild(btn);
        });
    }

    // ── Filtrage des chaînes ──
    function updateFilteredChannels() {
        filteredChannels = channels.filter(ch => {
            if (ch.name.startsWith('###')) return false;

            if (currentCat === 'favoris') {
                return favorites.has(ch.id);
            }
            if (currentCat !== 'tous' && ch.category !== currentCat) {
                return false;
            }
            if (currentBouquet !== 'all' && ch.group !== currentBouquet) {
                return false;
            }
            return true;
        });

        if (gridLabelEl) {
            const catObj = CATEGORIES.find(c => c.key === currentCat);
            gridLabelEl.textContent = catObj ? catObj.label : 'Chaînes';
        }
        if (countTextEl) {
            countTextEl.textContent = `${filteredChannels.length} chaîne${filteredChannels.length > 1 ? 's' : ''}`;
        }
    }

    // ── Rendu de la Grille TV ──
    function renderGrid() {
        gridEl.innerHTML = '';
        if (filteredChannels.length === 0) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8; font-size: 1.2rem;">
                    Aucune chaîne trouvée dans cette catégorie.
                </div>
            `;
            return;
        }

        // Virtualisation légère : afficher les premières 120 chaînes par paquet
        const slice = filteredChannels.slice(0, 120);
        slice.forEach((ch, idx) => {
            const card = document.createElement('div');
            card.className = 'tv-card' + (ch.id === (channels[currentChannelIndex]?.id) ? ' active' : '');
            card.dataset.index = idx;
            card.tabIndex = -1;

            const logoUrl = ch.logo && ch.logo.trim() ? ch.logo : '/favicon.png';
            const isFav = favorites.has(ch.id);

            card.innerHTML = `
                ${ch.badge ? `<span class="tv-card-badge">${ch.badge}</span>` : ''}
                ${isFav ? `<span class="tv-card-fav">★</span>` : ''}
                <div class="tv-card-logo-wrap">
                    <img class="tv-card-logo" src="${logoUrl}" alt="${ch.name}" onerror="this.onerror=null;this.src='/favicon.png';">
                </div>
                <div class="tv-card-name">${ch.name}</div>
                <div class="tv-card-sub">${ch.group || ch.category}</div>
            `;

            card.onclick = () => {
                playChannelByFilteredIndex(idx);
                hideOverlay();
            };

            gridEl.appendChild(card);
        });
    }

    // ── Lecture d'une Chaîne ──
    function playChannelByFilteredIndex(filteredIdx) {
        if (filteredIdx < 0 || filteredIdx >= filteredChannels.length) return;
        const channel = filteredChannels[filteredIdx];
        const rawIdx = channels.findIndex(c => c.id === channel.id);
        if (rawIdx !== -1) {
            currentChannelIndex = rawIdx;
        }
        playChannel(channel);
    }

    function playChannel(channel, stage = 0, useFallback = false) {
        destroyPlayers();

        errorEl.classList.remove('visible');
        loaderEl.classList.add('visible');
        if (loaderChanEl) loaderChanEl.textContent = `Connexion à ${channel.name}...`;

        showOSD(channel);

        const activeUrl = (useFallback && channel.fallbackUrl) ? channel.fallbackUrl : channel.url;
        const targetUrl = resolveStreamUrl(activeUrl, stage);
        const lowerUrl = (activeUrl || '').toLowerCase();

        if (lowerUrl.includes('embed') || lowerUrl.includes('youtube.com')) {
            iframeEl.style.display = 'block';
            videoEl.style.display = 'none';
            iframeEl.src = targetUrl;
            loaderEl.classList.remove('visible');
            return;
        }

        iframeEl.style.display = 'none';
        videoEl.style.display = 'block';

        if (lowerUrl.endsWith('.ts') && typeof mpegts !== 'undefined' && mpegts.isSupported()) {
            mpegtsInstance = mpegts.createPlayer({
                type: 'mse',
                isLive: true,
                url: targetUrl
            }, {
                enableWorker: true,
                lazyLoad: false,
                liveBufferLatencyChasing: true
            });
            mpegtsInstance.attachMediaElement(videoEl);
            mpegtsInstance.load();
            mpegtsInstance.play().then(() => {
                loaderEl.classList.remove('visible');
            }).catch(() => {});

            mpegtsInstance.on(mpegts.Events.ERROR, () => {
                if (stage < 2) {
                    playChannel(channel, stage + 1, useFallback);
                } else if (!useFallback && channel.fallbackUrl) {
                    playChannel(channel, 0, true);
                } else {
                    loaderEl.classList.remove('visible');
                    errorEl.classList.add('visible');
                }
            });
            return;
        }

        // HLS
        if (Hls.isSupported()) {
            hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                manifestLoadingTimeOut: 20000,
                levelLoadingTimeOut: 20000,
                fragLoadingTimeOut: 40000
            });
            hlsInstance.loadSource(targetUrl);
            hlsInstance.attachMedia(videoEl);

            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                loaderEl.classList.remove('visible');
                videoEl.play().catch(() => {
                    videoEl.muted = true;
                    videoEl.play().catch(() => {});
                });
            });

            hlsInstance.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hlsInstance.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hlsInstance.recoverMediaError();
                    } else if (stage < 2) {
                        playChannel(channel, stage + 1, useFallback);
                    } else if (!useFallback && channel.fallbackUrl) {
                        playChannel(channel, 0, true);
                    } else {
                        loaderEl.classList.remove('visible');
                        errorEl.classList.add('visible');
                    }
                }
            });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = targetUrl;
            videoEl.play().then(() => {
                loaderEl.classList.remove('visible');
            }).catch(() => {});
        }
    }

    function destroyPlayers() {
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        if (mpegtsInstance) {
            mpegtsInstance.destroy();
            mpegtsInstance = null;
        }
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        iframeEl.src = 'about:blank';
    }

    // ── OSD au changement de chaîne ──
    function showOSD(channel) {
        if (!osdEl) return;
        if (osdTimer) clearTimeout(osdTimer);

        if (osdNameEl) osdNameEl.textContent = channel.name;
        if (osdBadgeEl) osdBadgeEl.textContent = channel.badge || 'HD';
        if (osdDescEl) osdDescEl.textContent = `${channel.group || channel.category} • En Direct`;
        if (osdNumberEl) {
            const num = (channels.findIndex(c => c.id === channel.id) + 1);
            osdNumberEl.textContent = `CH ${String(num).padStart(2, '0')}`;
        }

        osdEl.classList.add('visible');
        osdTimer = setTimeout(() => {
            osdEl.classList.remove('visible');
        }, 5000);
    }

    // ── Gestion de l'affichage du Guide ──
    function showOverlay() {
        overlayVisible = true;
        overlayEl.classList.add('visible');
        focusCurrentElement();
    }

    function hideOverlay() {
        overlayVisible = false;
        overlayEl.classList.remove('visible');
        // Retirer le focus pour ne pas déclencher d'actions involontaires
        document.activeElement && document.activeElement.blur();
    }

    function toggleOverlay() {
        if (overlayVisible) hideOverlay();
        else showOverlay();
    }

    // ── NAVIGATION SPÉCIALE TÉLÉCOMMANDE (D-PAD / KEYBOARD) ──
    function focusCurrentElement() {
        // Enlever les classes .focused partout
        document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));

        if (focusedZone === 'cat') {
            const btns = catRowEl.querySelectorAll('.tv-cat-btn');
            if (btns[focusedIndex]) {
                btns[focusedIndex].classList.add('focused');
                btns[focusedIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        } else if (focusedZone === 'bouquet') {
            const btns = bouquetRowEl.querySelectorAll('.tv-bouquet-btn');
            if (btns[focusedIndex]) {
                btns[focusedIndex].classList.add('focused');
                btns[focusedIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        } else if (focusedZone === 'grid') {
            const cards = gridEl.querySelectorAll('.tv-card');
            if (cards[focusedIndex]) {
                cards[focusedIndex].classList.add('focused');
                cards[focusedIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    window.addEventListener('keydown', (e) => {
        const key = e.key;

        // Si le guide est masqué, n'importe quelle touche fléchée ou OK le fait réapparaître
        if (!overlayVisible) {
            if (key === 'ArrowUp' || key === 'ChannelUp' || key === 'PageUp') {
                zapping(1);
                return;
            }
            if (key === 'ArrowDown' || key === 'ChannelDown' || key === 'PageDown') {
                zapping(-1);
                return;
            }
            if (['Enter', 'ArrowLeft', 'ArrowRight', 'Escape', 'Back', 'GoBack'].includes(key)) {
                showOverlay();
                return;
            }
            return;
        }

        // Quand le menu Guide est visible :
        switch (key) {
            case 'ArrowRight':
                e.preventDefault();
                navigateRight();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                navigateLeft();
                break;
            case 'ArrowDown':
                e.preventDefault();
                navigateDown();
                break;
            case 'ArrowUp':
                e.preventDefault();
                navigateUp();
                break;
            case 'Enter':
                e.preventDefault();
                triggerSelect();
                break;
            case 'Escape':
            case 'Back':
            case 'BrowserBack':
                e.preventDefault();
                hideOverlay();
                break;
            case 'f':
            case 'F':
                toggleCurrentFavorite();
                break;
        }
    });

    function navigateRight() {
        if (focusedZone === 'cat') {
            const count = catRowEl.querySelectorAll('.tv-cat-btn').length;
            if (focusedIndex < count - 1) focusedIndex++;
        } else if (focusedZone === 'bouquet') {
            const count = bouquetRowEl.querySelectorAll('.tv-bouquet-btn').length;
            if (focusedIndex < count - 1) focusedIndex++;
        } else if (focusedZone === 'grid') {
            const count = gridEl.querySelectorAll('.tv-card').length;
            if (focusedIndex < count - 1) focusedIndex++;
        }
        focusCurrentElement();
    }

    function navigateLeft() {
        if (focusedIndex > 0) {
            focusedIndex--;
        }
        focusCurrentElement();
    }

    function navigateDown() {
        if (focusedZone === 'cat') {
            focusedZone = 'bouquet';
            focusedIndex = 0;
        } else if (focusedZone === 'bouquet') {
            focusedZone = 'grid';
            focusedIndex = 0;
        } else if (focusedZone === 'grid') {
            // Sauter une rangée de 6 cartes
            const count = gridEl.querySelectorAll('.tv-card').length;
            if (focusedIndex + 6 < count) {
                focusedIndex += 6;
            }
        }
        focusCurrentElement();
    }

    function navigateUp() {
        if (focusedZone === 'grid') {
            if (focusedIndex >= 6) {
                focusedIndex -= 6;
            } else {
                focusedZone = 'bouquet';
                focusedIndex = 0;
            }
        } else if (focusedZone === 'bouquet') {
            focusedZone = 'cat';
            focusedIndex = 0;
        }
        focusCurrentElement();
    }

    function triggerSelect() {
        if (focusedZone === 'cat') {
            const btns = catRowEl.querySelectorAll('.tv-cat-btn');
            if (btns[focusedIndex]) btns[focusedIndex].click();
        } else if (focusedZone === 'bouquet') {
            const btns = bouquetRowEl.querySelectorAll('.tv-bouquet-btn');
            if (btns[focusedIndex]) btns[focusedIndex].click();
        } else if (focusedZone === 'grid') {
            playChannelByFilteredIndex(focusedIndex);
            hideOverlay();
        }
    }

    function toggleCurrentFavorite() {
        if (focusedZone === 'grid' && filteredChannels[focusedIndex]) {
            const chId = filteredChannels[focusedIndex].id;
            if (favorites.has(chId)) favorites.delete(chId);
            else favorites.add(chId);
            localStorage.setItem('bokk_tv_tv_favs', JSON.stringify(Array.from(favorites)));
            renderGrid();
            focusCurrentElement();
        }
    }

    function zapping(direction) {
        if (filteredChannels.length === 0) return;
        let nextIdx = (focusedIndex + direction + filteredChannels.length) % filteredChannels.length;
        focusedIndex = nextIdx;
        playChannelByFilteredIndex(nextIdx);
    }

    // ── Initialisation ──
    function init() {
        renderCategories();
        renderBouquets();
        updateFilteredChannels();
        renderGrid();

        // Lancement immédiat de la chaîne RTS 1 Sénégal au démarrage
        if (filteredChannels.length > 0) {
            playChannelByFilteredIndex(0);
        }

        // Focus initial sur la première chaîne
        focusedZone = 'grid';
        focusedIndex = 0;
        focusCurrentElement();
    }

    // Démarrage quand le catalogue est prêt
    if (typeof channels !== 'undefined') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
