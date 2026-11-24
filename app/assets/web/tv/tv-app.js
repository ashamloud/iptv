/**
 * BOKK TV — Smart TV Engine
 * Compatible avec Android TV, Fire TV, Tizen OS, webOS, et télécommandes D-PAD (Touches Fléchées)
 */

(function () {
    'use strict';

    // ── Proxies Cloud Haute Disponibilité & Résolution Universelle ──
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

    // ACAN : cache résolution URL directe (expire en 4 min)
    const ACAN_TV_SHORTCUTS = {
        rts1: 26, rts2: 32, rts3: 42, rts4: 51, rts5: 52,
        sentv: 2, '2stv': 29, leraltv: 35, walftv: 33, walf: 33
    };
    const acanTvCache = {}; // { key: { url, ts } }

    async function resolveAcanTvUrl(nameKey) {
        const lower = nameKey.toLowerCase().replace(/\s+/g, '');
        if (!ACAN_TV_SHORTCUTS[lower]) return null;
        const now = Date.now();
        if (acanTvCache[lower] && now - acanTvCache[lower].ts < 240000) return acanTvCache[lower].url;
        try {
            const cid = ACAN_TV_SHORTCUTS[lower];
            const r = await fetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, { cache: 'no-store' });
            if (!r.ok) throw new Error('acan ' + r.status);
            const j = await r.json();
            const url = j.direct_url || j.web_url || j.android_url || null;
            if (url) { acanTvCache[lower] = { url, ts: now }; return url; }
        } catch { }
        // Fallback via proxy
        try {
            const r2 = await fetch(`/api/proxy?url=${encodeURIComponent(lower)}&resolve=1`, { signal: AbortSignal.timeout(6000) });
            if (r2.ok) { const j2 = await r2.json(); const url2 = j2.url || null; if (url2) { acanTvCache[lower] = { url: url2, ts: now }; return url2; } }
        } catch { }
        return null;
    }

    function resolveStreamUrl(rawUrl, stage = 0) {
        if (!rawUrl) return '';
        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;

        // Jouer en DIRECT les flux HTTPS HLS compatibles CORS (zéro proxy, zéro timeout)
        if (stage === 0 && isDirectCorsHttpsHls(rawUrl)) {
            return rawUrl;
        }

        const isLocalHost = (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port === '8080'
        );

        let extraParams = '&ua=IPTVSmartersPro';
        if (rawUrl.includes('radio2m.ma')) extraParams += '&ref=http://www.radio2m.ma/';

        // En local sur port 8080 : utiliser le proxy Python local ultra-rapide
        if (isLocalHost) {
            if (stage === 1) return rawUrl; // Essai direct
            return `/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }

        // Stage 0 : Proxy Vercel
        // Stage 1 : Direct
        // Stage 2+ : Proxy de secours
        if (stage === 0) {
            return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        } else if (stage === 1) {
            return rawUrl;
        } else {
            return `/api/proxy?url=${encodeURIComponent(rawUrl)}${extraParams}`;
        }
    }

    // ── Catégories TV ──
    const CATEGORIES = [
        { key: 'senegal', label: 'Sénégal' },
        { key: 'afrique', label: 'Afrique' },
        { key: 'francophone', label: 'France & TNT' },
        { key: 'sport', label: 'Sport Direct' },
        { key: 'cinema', label: 'Films & Séries' },
        { key: 'music', label: 'Musique Afrique' },
        { key: 'documentaire', label: 'Documentaires' },
        { key: 'jeunesse', label: 'Jeunesse' },
        { key: 'favoris', label: 'Mes Favoris' },
        { key: 'tous', label: 'Tout le Catalogue' },
        { key: 'uk', label: 'UK & USA' },
        { key: 'espagne', label: 'Espagne' },
        { key: 'allemagne', label: 'Allemagne' },
        { key: 'italie', label: 'Italie' },
        { key: 'exyu', label: 'Ex-Yougoslavie' },
        { key: 'adulte', label: 'Adulte (+18)' },
        { key: 'monde', label: 'Monde' }
    ];

    // ── Variables d'état & Catalogue Chaînes ──
    const resolvedChannels = (typeof window !== 'undefined' && Array.isArray(window.channels) && window.channels.length > 0)
        ? window.channels
        : ((typeof window !== 'undefined' && window.channels) || (typeof globalThis !== 'undefined' && globalThis.channels) || (typeof channels !== 'undefined' ? channels : []));
    const channels = Array.isArray(resolvedChannels) ? resolvedChannels : [];

    let currentCat = 'senegal';
    let currentBouquet = 'all';
    let searchQuery = '';
    let currentChannelIndex = -1;
    let filteredChannels = [];
    let favorites = new Set(JSON.parse(localStorage.getItem('bokk_tv_tv_favs') || '[]'));
    let hlsInstance = null;
    let mpegtsInstance = null;
    let osdTimer = null;
    let overlayVisible = true;
    let focusedZone = 'grid'; // 'cat', 'bouquet', 'grid'
    let focusedIndex = 0;

    // Anti-calage TV : stall watchdog + load sequence guard
    let tvStallWatchdog = null;
    let tvChannelLoadSeq = 0;

    function clearTvStallWatchdog() {
        if (tvStallWatchdog) { clearTimeout(tvStallWatchdog); tvStallWatchdog = null; }
    }

    function armTvStallWatchdog(channel, stage, useFallback, timeoutMs = 9000) {
        clearTvStallWatchdog();
        tvStallWatchdog = setTimeout(() => {
            clearTvStallWatchdog();
            // Essai de récupération graduée
            if (stage < 2) {
                playChannel(channel, stage + 1, useFallback);
            } else if (!useFallback && channel.fallbackUrl) {
                playChannel(channel, 0, true);
            }
        }, timeoutMs);
    }

    // ── Éléments DOM ──
    const videoEl = document.getElementById('tv-video');
    const iframeEl = document.getElementById('tv-iframe');
    const loaderEl = document.getElementById('tv-loader');
    const loaderChanEl = document.getElementById('tv-loader-channel');
    const errorEl = document.getElementById('tv-error');
    const overlayEl = document.getElementById('tv-overlay');
    const catRowEl = document.getElementById('tv-cat-row');
    const bouquetRowEl = document.getElementById('tv-bouquet-row');
    const gridEl = document.getElementById('tv-grid');
    const gridLabelEl = document.getElementById('tv-grid-label');
    const countTextEl = document.getElementById('tv-count-text');
    const clockEl = document.getElementById('tv-clock');
    const tvSearchInput = document.getElementById('tv-search-input');

    // OSD
    const osdEl = document.getElementById('tv-osd');
    const osdBadgeEl = document.getElementById('tv-osd-badge');
    const osdNumberEl = document.getElementById('tv-osd-number');
    const osdNameEl = document.getElementById('tv-osd-name');
    const osdDescEl = document.getElementById('tv-osd-desc');

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
            btn.textContent = b === 'all' ? 'Tous les bouquets' : b;
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
    function isTvChannelInCat(ch, catKey) {
        if (catKey === 'tous') return true;
        if (catKey === 'favoris') return favorites.has(ch.id);
        const chCat = (ch.category || '').toLowerCase();
        if (chCat === catKey.toLowerCase()) return true;
        if (ch.country && ch.country.toLowerCase() === catKey.toLowerCase()) return true;
        if (ch.group && ch.group.toLowerCase().includes(catKey.toLowerCase())) return true;
        if (catKey === 'senegal') return (chCat === 'senegal' || ch.country === 'SN' || (ch.group && ch.group.toLowerCase().includes('sénégal')));
        if (catKey === 'francophone') return (chCat === 'francophone' || ch.country === 'FR' || (ch.group && (ch.group.includes('FR |') || ch.group.includes('EU | FR') || ch.group.toLowerCase().includes('france'))));
        if (catKey === 'sport') return (chCat === 'sport' || (ch.group && (ch.group.toLowerCase().includes('sport') || ch.group.includes('DAZN') || ch.group.includes('FOOT'))));
        if (catKey === 'cinema') return (chCat === 'cinema' || (ch.group && (ch.group.toLowerCase().includes('ciné') || ch.group.toLowerCase().includes('film') || ch.group.toLowerCase().includes('movie') || ch.group.toLowerCase().includes('serie'))));
        if (catKey === 'uk') return (ch.country === 'UK' || ch.country === 'US' || chCat === 'uk' || (ch.group && (ch.group.includes('UK |') || ch.group.includes('USA'))));
        if (catKey === 'espagne') return (ch.country === 'ES' || chCat === 'espagne' || (ch.group && ch.group.includes('ES |')));
        if (catKey === 'allemagne') return (ch.country === 'DE' || chCat === 'allemagne' || (ch.group && (ch.group.includes('DE |') || ch.group.includes('GERMANY'))));
        if (catKey === 'italie') return (ch.country === 'IT' || chCat === 'italie' || (ch.group && ch.group.includes('IT |')));
        return false;
    }

    function updateFilteredChannels() {
        const q = searchQuery.trim().toLowerCase();
        filteredChannels = channels.filter(ch => {
            if (ch.name.startsWith('###')) return false;

            if (q) {
                // Recherche globale instantanée dans tout le catalogue TV
                const nameMatch = ch.name && ch.name.toLowerCase().includes(q);
                const groupMatch = ch.group && ch.group.toLowerCase().includes(q);
                const catMatch = ch.category && ch.category.toLowerCase().includes(q);
                return nameMatch || groupMatch || catMatch;
            }

            if (!isTvChannelInCat(ch, currentCat)) {
                return false;
            }
            if (currentBouquet !== 'all' && ch.group !== currentBouquet) {
                return false;
            }
            return true;
        });

        if (gridLabelEl) {
            if (q) {
                gridLabelEl.textContent = `Recherche : "${searchQuery.trim()}"`;
            } else {
                const catObj = CATEGORIES.find(c => c.key === currentCat);
                gridLabelEl.textContent = catObj ? catObj.label : 'Chaînes';
            }
        }
        if (countTextEl) {
            countTextEl.textContent = `${filteredChannels.length} chaîne${filteredChannels.length > 1 ? 's' : ''}`;
        }
    }

    // ── Rendu de la Grille TV avec pagination dynamique infinie ──
    let renderedTVCount = 0;
    const TV_BATCH_SIZE = 120;

    function appendNextTVBatch() {
        if (renderedTVCount >= filteredChannels.length) return;
        const nextSlice = filteredChannels.slice(renderedTVCount, renderedTVCount + TV_BATCH_SIZE);
        nextSlice.forEach((ch, localIdx) => {
            const idx = renderedTVCount + localIdx;
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
        renderedTVCount += nextSlice.length;
    }

    function renderGrid() {
        gridEl.innerHTML = '';
        renderedTVCount = 0;
        if (filteredChannels.length === 0) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8; font-size: 1.2rem;">
                    Aucune chaîne trouvée dans cette catégorie.
                </div>
            `;
            return;
        }

        appendNextTVBatch();
    }

    if (gridEl) {
        gridEl.addEventListener('scroll', () => {
            if (gridEl.scrollTop + gridEl.clientHeight >= gridEl.scrollHeight - 400) {
                appendNextTVBatch();
            }
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

    // Résolution async chaîne TV : ACAN direct si Sénégal, sinon proxy
    async function playChannel(channel, stage = 0, useFallback = false) {
        const mySeq = ++tvChannelLoadSeq;
        clearTvStallWatchdog();
        destroyPlayers();

        errorEl.classList.remove('visible');
        loaderEl.classList.add('visible');
        if (loaderChanEl) loaderChanEl.textContent = `Connexion à ${channel.name}...`;

        showOSD(channel);

        // Résolution ACAN directe pour chaînes sénégalaises (stage 0)
        let activeUrl = (useFallback && channel.fallbackUrl) ? channel.fallbackUrl : channel.url;
        if (stage === 0 && !useFallback) {
            const nameKey = channel.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            const acanUrl = await resolveAcanTvUrl(nameKey);
            if (mySeq !== tvChannelLoadSeq) return; // Chaîne changée entretemps
            if (acanUrl) activeUrl = acanUrl;
        }

        if (mySeq !== tvChannelLoadSeq) return;

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

        // Nettoyer les anciens listeners avant de charger
        const newVideo = videoEl.cloneNode(false);
        videoEl.parentNode.replaceChild(newVideo, videoEl);
        // Note: videoEl is now stale; use newVideo
        const vid = document.getElementById('tv-video');

        function onRecoverStall() {
            if (mySeq !== tvChannelLoadSeq) return;
            if (stage < 2) { playChannel(channel, stage + 1, useFallback); }
            else if (!useFallback && channel.fallbackUrl) { playChannel(channel, 0, true); }
            else { loaderEl.classList.remove('visible'); errorEl.classList.add('visible'); }
        }

        // Stall watchdog sur waiting/stalled
        vid.addEventListener('waiting', () => { if (mySeq === tvChannelLoadSeq) armTvStallWatchdog(channel, stage, useFallback, 9000); });
        vid.addEventListener('stalled', () => { if (mySeq === tvChannelLoadSeq) armTvStallWatchdog(channel, stage, useFallback, 9000); });
        vid.addEventListener('playing', () => { clearTvStallWatchdog(); loaderEl.classList.remove('visible'); });
        vid.addEventListener('canplay', () => { clearTvStallWatchdog(); loaderEl.classList.remove('visible'); });

        // Reconnexion transparente EOF (timeout Vercel 30s)
        vid.addEventListener('ended', () => {
            if (mySeq !== tvChannelLoadSeq) return;
            playChannel(channel, stage, useFallback);
        });

        const isMpegTs = (channel.type === 'ts' || lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.mpegts') ||
            (!lowerUrl.includes('.m3u8') && !lowerUrl.includes('embed') && !lowerUrl.includes('youtube')));

        if (isMpegTs && typeof mpegts !== 'undefined' && mpegts.isSupported()) {
            mpegtsInstance = mpegts.createPlayer({
                type: 'mse',
                isLive: true,
                url: targetUrl
            }, {
                enableWorker: false,
                lazyLoad: false,
                liveBufferLatencyChasing: true,
                liveBufferLatencyMaxLatency: 12.0,
                liveBufferLatencyMinRemain: 2.0,
                enableStashBuffer: true,
                stashInitialSize: 512,
                autoCleanupSourceBuffer: true,
                autoCleanupMaxBackwardDuration: 30,
                autoCleanupMinBackwardDuration: 15
            });
            mpegtsInstance.attachMediaElement(vid);
            mpegtsInstance.load();

            // Reconnexion transparente sur fin de segment (Vercel 30s timeout)
            mpegtsInstance.on(mpegts.Events.LOADING_COMPLETE, () => {
                if (mySeq !== tvChannelLoadSeq) return;
                setTimeout(() => { if (mySeq === tvChannelLoadSeq) playChannel(channel, stage, useFallback); }, 300);
            });

            mpegtsInstance.on(mpegts.Events.ERROR, () => {
                if (mySeq !== tvChannelLoadSeq) return;
                onRecoverStall();
            });

            mpegtsInstance.play().then(() => {
                loaderEl.classList.remove('visible');
                clearTvStallWatchdog();
            }).catch(() => { });
            return;
        }

        // HLS
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                startLevel: -1,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 7,
                startFragPrefetch: true,
                maxBufferLength: 25,
                maxMaxBufferLength: 45,
                abrEwmaDefaultEstimate: 950000,
                abrBandWidthFactor: 0.65,
                manifestLoadingTimeOut: 8000,
                levelLoadingTimeOut: 8000,
                fragLoadingTimeOut: 12000
            });
            hlsInstance.loadSource(targetUrl);
            hlsInstance.attachMedia(vid);

            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                loaderEl.classList.remove('visible');
                clearTvStallWatchdog();
                vid.play().catch(() => { vid.muted = true; vid.play().catch(() => { }); });
            });

            hlsInstance.on(Hls.Events.ERROR, (_, data) => {
                if (!data.fatal || mySeq !== tvChannelLoadSeq) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    hlsInstance.startLoad();
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hlsInstance.recoverMediaError();
                } else {
                    onRecoverStall();
                }
            });
        } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
            vid.src = targetUrl;
            vid.play().then(() => { loaderEl.classList.remove('visible'); }).catch(() => { });
        }
    }

    function destroyPlayers() {
        clearTvStallWatchdog();
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        if (mpegtsInstance) {
            mpegtsInstance.destroy();
            mpegtsInstance = null;
        }
        // Réinitialiser l'élément vidéo proprement
        const vid = document.getElementById('tv-video');
        if (vid) {
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
        }
        iframeEl.src = 'about:blank';
    }

    // ── OSD au changement de chaîne ──
    function showOSD(channel) {
        if (!osdEl) return;
        if (osdTimer) clearTimeout(osdTimer);

        if (osdNameEl) osdNameEl.textContent = channel.name;
        if (osdBadgeEl) osdBadgeEl.textContent = channel.badge || 'HD';
        if (osdDescEl) {
            let descText = `${channel.group || channel.category} • En Direct`;
            if (window.BokkEPG) {
                const prog = window.BokkEPG.getCurrentProgram(channel.name);
                if (prog) {
                    descText = `${prog.title} (${prog.start} - ${prog.end})`;
                }
            }
            osdDescEl.textContent = descText;
        }
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
            // Sauter une rangée de 6 cartes avec chargement dynamique
            if (focusedIndex + 6 < filteredChannels.length) {
                if (focusedIndex + 18 >= renderedTVCount) {
                    appendNextTVBatch();
                }
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

        if (tvSearchInput) {
            tvSearchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value;
                updateFilteredChannels();
                renderGrid();
                focusedIndex = 0;
            });
            tvSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    e.preventDefault();
                    focusedZone = 'grid';
                    focusedIndex = 0;
                    focusCurrentElement();
                    tvSearchInput.blur();
                }
            });
        }

        // Lancement immédiat de la chaîne RTS 1 Sénégal au démarrage
        if (filteredChannels.length > 0) {
            playChannelByFilteredIndex(0);
        }

        // Focus initial sur la première chaîne
        focusedZone = 'grid';
        focusedIndex = 0;
        focusCurrentElement();

        // Synchronisation des chaînes M3U ajoutées par l'administrateur
        if (window.BokkFirebase && typeof window.BokkFirebase.listenActiveM3uChannels === 'function') {
            window.BokkFirebase.listenActiveM3uChannels(m3uChannels => {
                if (!Array.isArray(m3uChannels)) return;
                for (let i = channels.length - 1; i >= 0; i--) {
                    if (String(channels[i].id).startsWith('m3u_')) {
                        channels.splice(i, 1);
                    }
                }
                if (m3uChannels.length > 0) {
                    channels.push(...m3uChannels);
                }
                renderCategories();
                renderBouquets();
                updateFilteredChannels();
                renderGrid();
            });
        }
    }

    // Démarrage quand le catalogue est prêt
    if (typeof channels !== 'undefined') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();
