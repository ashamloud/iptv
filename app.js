const CATEGORIES = [
        { key: 'tous',        label: '🌐 Tous' },
        { key: 'senegal',     label: '🇸🇳 Sénégal' },
        { key: 'sport',       label: '⚽ Sport' },
        { key: 'francophone', label: '🇫🇷 Francophone' },
        { key: 'arab',        label: '🌙 Arabe' },
        { key: 'news',        label: '📰 Info' },
        { key: 'music',       label: '🎵 Musique' },
        { key: 'autres',      label: '📡 Autres' },
    ];

    let currentIndex = -1;
    let currentCat = 'tous';
    let hls = null;
    let errorTimer = null;

    const loader = document.getElementById('loader');
    const errorMsg = document.getElementById('error-msg');
    const errorText = document.getElementById('error-text');
    const placeholder = document.getElementById('player-placeholder');
    const nowPlaying = document.getElementById('now-playing');
    const video = document.getElementById('hls-video');
    const iframe = document.getElementById('video-iframe');
    const chList = document.getElementById('ch-list');
    const chCount = document.getElementById('ch-count');
    const searchEl = document.getElementById('search');
    const catsEl = document.getElementById('cats');

    function showLoader() {
        loader.style.display = 'flex';
        errorMsg.style.display = 'none';
        placeholder.style.display = 'none';
    }
    function showError(msg) {
        loader.style.display = 'none';
        errorMsg.style.display = 'flex';
        errorText.textContent = msg || 'Chaîne indisponible ou géo-bloquée.';
    }
    function hideAll() {
        loader.style.display = 'none';
        errorMsg.style.display = 'none';
        placeholder.style.display = 'none';
    }

    function retryChannel() {
        if (currentIndex >= 0) loadChannel(currentIndex);
    }

    function loadChannel(idx) {
        const ch = channels[idx];
        if (!ch) return;
        currentIndex = idx;

        if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
        if (hls) { hls.destroy(); hls = null; }

        video.style.display = 'none';
        video.src = '';
        iframe.style.display = 'none';
        iframe.src = 'about:blank';

        showLoader();

        nowPlaying.innerHTML = '▶ <span>' + ch.name + '</span>';

        // Update active state
        document.querySelectorAll('.ch-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.idx) === idx);
        });

        errorTimer = setTimeout(() => {
            showError('Délai dépassé — chaîne trop lente ou indisponible.');
        }, 12000);

        if (ch.type === 'hls') {
            video.style.display = 'block';
            if (Hls.isSupported()) {
                hls = new Hls({ enableWorker: true, startLevel: -1 });
                hls.loadSource(ch.url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    clearTimeout(errorTimer);
                    hideAll();
                    video.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (e, data) => {
                    if (data.fatal) {
                        clearTimeout(errorTimer);
                        showError('Chaîne hors ligne, géo-bloquée ou CORS.');
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = ch.url;
                video.addEventListener('loadedmetadata', () => { clearTimeout(errorTimer); hideAll(); video.play().catch(()=>{}); }, { once: true });
            } else {
                showError('Format non supporté par ce navigateur.');
            }
        } else {
            iframe.style.display = 'block';
            iframe.src = ch.url;
            iframe.onload = () => { clearTimeout(errorTimer); hideAll(); };
        }
    }

    // ── Build category tabs ──
    function buildCats() {
        catsEl.innerHTML = '';
        CATEGORIES.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-btn' + (cat.key === currentCat ? ' active' : '');
            btn.textContent = cat.label;
            btn.onclick = () => {
                currentCat = cat.key;
                document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                searchEl.value = '';
                renderList('');
            };
            catsEl.appendChild(btn);
        });
    }

    // ── Render channel list ──
    function renderList(query) {
        const q = query.trim().toLowerCase();
        const filtered = channels
            .map((ch, i) => ({ ch, i }))
            .filter(({ ch }) => {
                const matchCat = currentCat === 'tous' || ch.category === currentCat;
                const matchQ = !q || ch.name.toLowerCase().includes(q);
                return matchCat && matchQ;
            });

        chCount.textContent = filtered.length + ' chaîne' + (filtered.length !== 1 ? 's' : '');
        chList.innerHTML = '';

        if (!filtered.length) {
            chList.innerHTML = '<div class="no-results">Aucune chaîne trouvée</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach(({ ch, i }) => {
            const el = document.createElement('div');
            el.className = 'ch-item' + (i === currentIndex ? ' active' : '');
            el.dataset.idx = i;
            el.innerHTML = '<div class="ch-dot"></div><div class="ch-name" title="' + ch.name + '">' + ch.name + '</div>';
            el.onclick = () => loadChannel(i);
            frag.appendChild(el);
        });
        chList.appendChild(frag);
    }

    // ── Search ──
    searchEl.addEventListener('input', e => {
        if (e.target.value) {
            // When searching, show all categories
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.cat-btn').classList.add('active');
            currentCat = 'tous';
        }
        renderList(e.target.value);
    });

    // ── Init ──
    buildCats();
    renderList('');

    // Auto-play first Sénégal channel
    const firstSenegal = channels.findIndex(ch => ch.category === 'senegal');
    if (firstSenegal >= 0) loadChannel(firstSenegal);