// SVG icons for each category (no emojis)
const CATEGORY_ICONS = {
    tous: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M3.5 2A1.5 1.5 0 002 3.5v4A1.5 1.5 0 003.5 9h4A1.5 1.5 0 009 7.5v-4A1.5 1.5 0 007.5 2h-4zm0 9A1.5 1.5 0 002 12.5v4A1.5 1.5 0 003.5 18h4A1.5 1.5 0 009 16.5v-4A1.5 1.5 0 007.5 11h-4zm7-9A1.5 1.5 0 009 3.5v4A1.5 1.5 0 0010.5 9h4A1.5 1.5 0 0016 7.5v-4A1.5 1.5 0 0014.5 2h-4zm0 9A1.5 1.5 0 009 12.5v4A1.5 1.5 0 0010.5 18h4A1.5 1.5 0 0016 16.5v-4A1.5 1.5 0 0014.5 11h-4z"/></svg>`,
    senegal: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd"/></svg>`,
    sport: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>`,
    francophone: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z"/><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.379a3 3 0 00-.879-2.121L9 5.879A3 3 0 006.879 5H4.5v1z"/></svg>`,
    arab: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M2 3a1 1 0 000 2h11a1 1 0 100-2H2zm0 4a1 1 0 000 2h5a1 1 0 000-2H2zm0 4a1 1 0 100 2h4a1 1 0 100-2H2zm16-5a1 1 0 10-2 0v7.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L18 13.586V6z"/></svg>`,
    news: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 002 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6zm6 6H5v2h6v-2z" clip-rule="evenodd"/><path d="M15 7h1a2 2 0 012 2v5.5a1.5 1.5 0 01-3 0V7z"/></svg>`,
    music: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z"/></svg>`,
    autres: `<svg viewBox="0 0 20 20" fill="currentColor" class="cat-icon"><path d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"/></svg>`,
};

const CATEGORY_COLORS = {
    tous: '#6366f1', senegal: '#3fb950', sport: '#f97316',
    francophone: '#3b82f6', arab: '#a855f7', news: '#22d3ee',
    music: '#ec4899', autres: '#64748b',
};

const CATEGORIES = [
    { key: 'tous',        label: 'Tous' },
    { key: 'senegal',     label: 'Sénégal' },
    { key: 'sport',       label: 'Sport' },
    { key: 'francophone', label: 'Francophone' },
    { key: 'arab',        label: 'Arabe' },
    { key: 'news',        label: 'Info' },
    { key: 'music',       label: 'Musique' },
    { key: 'autres',      label: 'Autres' },
];

let currentIndex = -1;
let currentCat = 'tous';
let hls = null;
let errorTimer = null;

const loader      = document.getElementById('loader');
const errorMsg    = document.getElementById('error-msg');
const errorText   = document.getElementById('error-text');
const placeholder = document.getElementById('player-placeholder');
const nowPlaying  = document.getElementById('now-playing');
const video       = document.getElementById('hls-video');
const iframe      = document.getElementById('video-iframe');
const chList      = document.getElementById('ch-list');
const chCount     = document.getElementById('ch-count');
const searchEl    = document.getElementById('search');
const catsEl      = document.getElementById('cats');
const playerBox   = document.getElementById('player-box');
const fsIconExpand = document.getElementById('fs-icon-expand');
const fsIconShrink = document.getElementById('fs-icon-shrink');

/* ── Fullscreen ── */
function toggleFullscreen() {
    const target = playerBox;
    if (!document.fullscreenElement) {
        target.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
}
document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    fsIconExpand.style.display = isFs ? 'none'  : 'block';
    fsIconShrink.style.display = isFs ? 'block' : 'none';
});
// Double-clic sur le player = plein écran
playerBox.addEventListener('dblclick', () => toggleFullscreen());

/* ── Player state helpers ── */
function showLoader() {
    loader.classList.remove('hidden'); loader.style.display = 'flex';
    errorMsg.classList.add('hidden'); errorMsg.style.display = 'none';
    placeholder.style.display = 'none';
}
function showError(msg) {
    loader.classList.add('hidden'); loader.style.display = 'none';
    errorMsg.classList.remove('hidden'); errorMsg.style.display = 'flex';
    errorText.textContent = msg || 'Chaîne indisponible ou géo-bloquée.';
}
function hideAll() {
    loader.classList.add('hidden'); loader.style.display = 'none';
    errorMsg.classList.add('hidden'); errorMsg.style.display = 'none';
    placeholder.style.display = 'none';
}

/* ── Retry ── */
function retryChannel() {
    if (currentIndex >= 0) loadChannel(currentIndex);
}

/* ── Load channel ── */
function loadChannel(idx) {
    const ch = channels[idx];
    if (!ch) return;
    currentIndex = idx;

    if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
    if (hls) { hls.destroy(); hls = null; }

    video.style.display = 'none'; video.src = '';
    iframe.style.display = 'none'; iframe.src = 'about:blank';
    showLoader();
    playerBox.classList.add('playing');

    // Now playing text
    nowPlaying.textContent = ch.name;

    // Active state in list
    document.querySelectorAll('.ch-item').forEach(el =>
        el.classList.toggle('active', parseInt(el.dataset.idx) === idx)
    );

    // Timeout failsafe
    errorTimer = setTimeout(() =>
        showError('Délai dépassé — chaîne trop lente ou indisponible.'), 12000);

    if (ch.type === 'hls') {
        video.style.display = 'block';
        if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true, startLevel: -1 });
            hls.loadSource(ch.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                clearTimeout(errorTimer); hideAll(); video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) { clearTimeout(errorTimer); showError('Chaîne hors ligne ou géo-bloquée.'); }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = ch.url;
            video.addEventListener('loadedmetadata', () => { clearTimeout(errorTimer); hideAll(); video.play().catch(() => {}); }, { once: true });
        } else {
            showError('Format non supporté par ce navigateur.');
        }
    } else {
        iframe.style.display = 'block';
        iframe.src = ch.url;
        iframe.onload = () => { clearTimeout(errorTimer); hideAll(); };
    }
}

/* ── Build category tabs ── */
function buildCats() {
    catsEl.innerHTML = '';
    CATEGORIES.forEach(cat => {
        const color = CATEGORY_COLORS[cat.key] || '#64748b';
        const btn = document.createElement('button');
        btn.className = 'cat-pill' + (cat.key === currentCat ? ' active' : '');
        btn.dataset.cat = cat.key;
        btn.innerHTML =
            `<span class="cat-dot" style="background:${color}"></span>` +
            `${CATEGORY_ICONS[cat.key] || ''}` +
            `<span>${cat.label}</span>`;
        btn.onclick = () => {
            currentCat = cat.key;
            document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchEl.value = '';
            renderList('');
        };
        catsEl.appendChild(btn);
    });
}

/* ── Render channel list ── */
function renderList(query) {
    const q = query.trim().toLowerCase();
    const filtered = channels
        .map((ch, i) => ({ ch, i }))
        .filter(({ ch }) => {
            const matchCat = currentCat === 'tous' || ch.category === currentCat;
            const matchQ   = !q || ch.name.toLowerCase().includes(q);
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
        // Play icon as SVG instead of text
        el.innerHTML =
            `<div class="ch-dot"></div>` +
            `<div class="ch-name" title="${ch.name}">${ch.name}</div>` +
            `<svg class="ch-play-icon" viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>`;
        el.onclick = () => loadChannel(i);
        frag.appendChild(el);
    });
    chList.appendChild(frag);
}

/* ── Search ── */
searchEl.addEventListener('input', e => {
    if (e.target.value) {
        document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        document.querySelector('.cat-pill').classList.add('active');
        currentCat = 'tous';
    }
    renderList(e.target.value);
});

/* ── Init ── */
buildCats();
renderList('');
// Chaîne par défaut : Louga TV (Sénégal)
const defaultIdx = channels.findIndex(ch => ch.name.toLowerCase().includes('louga'));
const fallbackIdx = channels.findIndex(ch => ch.category === 'senegal');
const startIdx = defaultIdx >= 0 ? defaultIdx : fallbackIdx;
if (startIdx >= 0) loadChannel(startIdx);