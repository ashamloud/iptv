// BOKK TV — Vercel Serverless Streaming Proxy
// Permet la lecture HLS / MPEG-TS en production (HTTPS) sans erreur Mixed Content ni blocage CORS.

const RTS_CHANNELS = {
    'rts1': 26,
    'rts2': 32,
    'rts3': 42,
    'rts4': 51,
    'rts5': 52
};
const rtsCache = {};

async function resolveRtsUrl(channelKey) {
    const cid = RTS_CHANNELS[channelKey.toLowerCase()];
    if (!cid) return null;
    const now = Date.now();
    if (rtsCache[cid] && (now - rtsCache[cid].time < 300000)) {
        return rtsCache[cid].url;
    }
    try {
        const res = await fetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        const streamUrl = data.web_url || data.direct_url;
        if (streamUrl) {
            rtsCache[cid] = { url: streamUrl, time: now };
            return streamUrl;
        }
    } catch (e) {
        console.error('[BOKK TV Vercel Proxy] RTS resolve error:', e.message);
    }
    return null;
}

module.exports = async function handler(req, res) {
    // 1. En-têtes CORS universels
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send("Paramètre 'url' manquant.");
    }

    // 2. Résolution dynamique des chaînes officielles RTS
    if (RTS_CHANNELS[targetUrl.toLowerCase()]) {
        const resolved = await resolveRtsUrl(targetUrl);
        if (resolved) {
            targetUrl = resolved;
        } else {
            return res.status(502).send("Impossible de contacter le serveur officiel RTS.");
        }
    }

    try {
        const parsed = new URL(targetUrl);
        const headers = {
            'User-Agent': req.query.ua || 'VLC/3.0.18 LibVLC/3.0.18',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, identity',
            'Connection': 'keep-alive'
        };

        if (req.query.ref) {
            headers['Referer'] = req.query.ref;
        } else if ('2m_monde' in targetUrl.toLowerCase()) {
            headers['Referer'] = 'http://www.radio2m.ma/';
        }

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const fetchRes = await fetch(targetUrl, {
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(6000)
        });

        const contentType = fetchRes.headers.get('content-type') || '';
        const finalUrl = fetchRes.url || targetUrl;
        const isM3u8 = (
            contentType.toLowerCase().includes('mpegurl') ||
            contentType.toLowerCase().includes('m3u') ||
            targetUrl.toLowerCase().split('?')[0].endsWith('.m3u8') ||
            finalUrl.toLowerCase().split('?')[0].endsWith('.m3u8')
        );

        if (isM3u8) {
            const text = await fetchRes.text();
            const lines = text.split(/\r?\n/);
            const extraQ = req.query.ref ? `&ref=${encodeURIComponent(req.query.ref)}` : '';

            const rewritten = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed) return line;
                if (trimmed.startsWith('#')) {
                    if (trimmed.includes('URI="')) {
                        return line.replace(/URI="([^"]+)"/g, (match, p1) => {
                            const resolved = new URL(p1, finalUrl).href;
                            return `URI="/api/proxy?url=${encodeURIComponent(resolved)}${extraQ}"`;
                        });
                    }
                    return line;
                }
                const resolved = new URL(trimmed, finalUrl).href;
                return `/api/proxy?url=${encodeURIComponent(resolved)}${extraQ}`;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.status(200).send(rewritten.join('\n'));
        }

        // Segment ou flux vidéo binaire (.ts, .aac, .m4s, etc.)
        const outType = contentType || 'video/mp2t';
        res.setHeader('Content-Type', outType);
        const cl = fetchRes.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        const cr = fetchRes.headers.get('content-range');
        if (cr) res.setHeader('Content-Range', cr);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(fetchRes.status);

        const reader = fetchRes.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        res.end();
    } catch (err) {
        return res.status(502).send(`Erreur de connexion au flux distant: ${err.message}`);
    }
};
