// BOKK TV — Vercel Serverless Streaming Proxy v3
// Proxy HLS/MPEG-TS via Node.js natif http/https (contourne les blocages IP Vercel).

const http  = require('http');
const https = require('https');

// ── Résolution des chaînes officielles RTS/SEN TV ──
const RTS_CHANNELS = {
    'rts1':    26,
    'rts2':    32,
    'rts3':    42,
    'rts4':    51,
    'rts5':    52,
    'sentv':    2,
    'leraltv': 35
};
const rtsCache = {};

function nodeFetch(url, extraHeaders, maxRedirects) {
    if (maxRedirects === undefined) maxRedirects = 5;
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(url);
            const isHttps = parsed.protocol === 'https:';
            const mod = isHttps ? https : http;
            const options = {
                hostname: parsed.hostname,
                port:     parsed.port || (isHttps ? 443 : 80),
                path:     parsed.pathname + parsed.search,
                method:   'GET',
                headers: Object.assign({
                    'User-Agent': 'IPTVSmartersPro',
                    'Accept':     '*/*',
                    'Connection': 'keep-alive'
                }, extraHeaders || {}),
                timeout: 20000
            };
            const req = mod.request(options, (res) => {
                if ([301,302,307,308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
                    const next = new URL(res.headers.location, url).href;
                    res.resume();
                    nodeFetch(next, extraHeaders, maxRedirects - 1).then(resolve).catch(reject);
                    return;
                }
                resolve(res);
            });
            req.on('timeout', () => req.destroy(new Error('Timeout')));
            req.on('error', reject);
            req.end();
        } catch (e) { reject(e); }
    });
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end',  () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

async function resolveRtsUrl(channelKey) {
    const cid = RTS_CHANNELS[channelKey.toLowerCase()];
    if (!cid) return null;
    const now = Date.now();
    if (rtsCache[cid] && (now - rtsCache[cid].time < 300000)) return rtsCache[cid].url;
    try {
        const res = await nodeFetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`,
            { 'Accept': 'application/json' });
        if (res.statusCode === 200) {
            const buf = await streamToBuffer(res);
            const data = JSON.parse(buf.toString('utf-8'));
            const streamUrl = data.web_url || data.direct_url;
            if (streamUrl) { rtsCache[cid] = { url: streamUrl, time: now }; return streamUrl; }
        } else { res.resume(); }
    } catch (e) { console.error('[Proxy] RTS err:', e.message); }
    return null;
}

// ── Handler Principal ──
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }

    let targetUrl = (req.query && req.query.url) ? req.query.url : null;
    if (!targetUrl) { res.statusCode = 400; return res.end("Paramètre 'url' manquant."); }

    // Résolution RTS
    if (RTS_CHANNELS[targetUrl.toLowerCase()]) {
        const resolved = await resolveRtsUrl(targetUrl);
        if (resolved) { targetUrl = resolved; }
        else { res.statusCode = 502; return res.end("Impossible de contacter le serveur officiel RTS."); }
    }

    try {
        const extraHeaders = {};
        if (req.query.ua)  extraHeaders['User-Agent'] = req.query.ua;
        if (req.query.ref) extraHeaders['Referer']    = req.query.ref;
        else if (targetUrl.includes('radio2m.ma') || targetUrl.includes('2m_monde'))
            extraHeaders['Referer'] = 'http://www.radio2m.ma/';
        if (req.headers.range) extraHeaders['Range'] = req.headers.range;

        const upstream = await nodeFetch(targetUrl, extraHeaders);

        // Debug probe
        if (req.query && req.query.debug === '1') {
            const buf = await streamToBuffer(upstream);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
                fetchStatus: upstream.statusCode,
                fetchOk:     upstream.statusCode >= 200 && upstream.statusCode < 300,
                finalUrl:    targetUrl,
                contentType: upstream.headers['content-type'],
                headers:     upstream.headers,
                bodyLength:  buf.length,
                sample:      buf.toString('utf-8').slice(0, 500)
            }));
        }

        if (upstream.statusCode >= 400) {
            upstream.resume();
            res.statusCode = upstream.statusCode;
            return res.end(`Erreur source IPTV: HTTP ${upstream.statusCode}`);
        }

        const contentType = (upstream.headers['content-type'] || '').toLowerCase();
        const lowerTarget = targetUrl.toLowerCase().split('?')[0];
        const isM3u8 = contentType.includes('mpegurl') || contentType.includes('m3u') ||
                       lowerTarget.endsWith('.m3u8') || lowerTarget.endsWith('.m3u');

        if (isM3u8) {
            const buf  = await streamToBuffer(upstream);
            const extraRef = req.query.ref || targetUrl;
            const extraQ = `&ref=${encodeURIComponent(extraRef)}&ua=IPTVSmartersPro`;
            const rewritten = text.split(/\r?\n/).map(line => {
                const t = line.trim();
                if (!t) return line;
                if (t.startsWith('#')) {
                    if (t.includes('URI="')) {
                        return line.replace(/URI="([^"]+)"/g, (_, p1) => {
                            try { const abs = new URL(p1, targetUrl).href;
                                  return `URI="/api/proxy?url=${encodeURIComponent(abs)}${extraQ}"`; }
                            catch { return `URI="${p1}"`; }
                        });
                    }
                    return line;
                }
                try { const abs = new URL(t, targetUrl).href;
                      return `/api/proxy?url=${encodeURIComponent(abs)}${extraQ}`; }
                catch { return line; }
            });
            const body = Buffer.from(rewritten.join('\n'), 'utf-8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
            res.setHeader('Content-Length', body.length);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.end(body);
        }

        // Flux binaire (segment .ts / .m4s)
        res.statusCode = upstream.statusCode;
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp2t');
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        upstream.pipe(res);
        upstream.on('error', () => res.end());

    } catch (err) {
        console.error('[Proxy] Erreur :', err.message);
        res.statusCode = 502;
        return res.end(`Erreur de connexion au flux: ${err.message}`);
    }
};
