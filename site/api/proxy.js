// BOKK TV — Vercel Serverless Streaming Proxy v4
// Proxy HLS/MPEG-TS via Node.js natif + relay corsproxy.io pour MegaTV (IPs Vercel bloquées).

const http  = require("http");
const https = require("https");

const RTS_CHANNELS = {
    "rts1":26,"rts2":32,"rts3":42,"rts4":51,"rts5":52,
    "sentv":2,"2stv":29,"leraltv":35,"walftv":33,"walf":33
};
const rtsCache = {};

const MEGATV_RELAYS = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

function isMegaTvUrl(url) {
    return url && (url.includes("megatv5074.com") || url.includes("megatv"));
}

function nodeFetch(url, extraHeaders, maxRedirects) {
    if (maxRedirects === undefined) maxRedirects = 5;
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(url);
            const isHttps = parsed.protocol === "https:";
            const mod = isHttps ? https : http;
            const options = {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: Object.assign({
                    "User-Agent": "IPTVSmartersPro",
                    "Accept": "*/*",
                    "Connection": "keep-alive"
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
            req.on("timeout", () => req.destroy(new Error("Timeout")));
            req.on("error", reject);
            req.end();
        } catch (e) { reject(e); }
    });
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", c => chunks.push(c));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

async function smartFetch(targetUrl, extraHeaders) {
    try {
        const res = await nodeFetch(targetUrl, extraHeaders);
        if (isMegaTvUrl(targetUrl) && res.statusCode >= 400) {
            res.resume();
            throw new Error(`HTTP ${res.statusCode}`);
        }
        return res;
    } catch (e) {
        if (!isMegaTvUrl(targetUrl)) throw e;
        console.log(`[Proxy] Direct MegaTV echoue (${e.message}), essai relay...`);
    }
    for (const buildRelay of MEGATV_RELAYS) {
        const relayUrl = buildRelay(targetUrl);
        try {
            const res = await nodeFetch(relayUrl, {});
            if (res.statusCode < 400) {
                console.log("[Proxy] MegaTV OK via relay");
                return res;
            }
            res.resume();
        } catch (e2) {
            console.warn(`[Proxy] Relay echoue: ${e2.message}`);
        }
    }
    throw new Error("Tous les proxies MegaTV ont echoue.");
}

async function resolveRtsUrl(channelKey) {
    const cid = RTS_CHANNELS[channelKey.toLowerCase()];
    if (!cid) return null;
    const now = Date.now();
    if (rtsCache[cid] && (now - rtsCache[cid].time < 300000)) return rtsCache[cid].url;
    try {
        const res = await nodeFetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, { "Accept": "application/json" });
        if (res.statusCode === 200) {
            const buf = await streamToBuffer(res);
            const data = JSON.parse(buf.toString("utf-8"));
            const streamUrl = data.web_url || data.direct_url;
            if (streamUrl) { rtsCache[cid] = { url: streamUrl, time: now }; return streamUrl; }
        } else { res.resume(); }
    } catch (e) { console.error("[Proxy] RTS err:", e.message); }
    return null;
}

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") { res.statusCode = 200; return res.end(); }

    let targetUrl = (req.query && req.query.url) ? req.query.url : null;
    if (!targetUrl) { res.statusCode = 400; return res.end("Parametre url manquant."); }

    if (RTS_CHANNELS[targetUrl.toLowerCase()]) {
        const resolved = await resolveRtsUrl(targetUrl);
        if (resolved) { targetUrl = resolved; }
        else { res.statusCode = 502; return res.end("Impossible de contacter le serveur officiel RTS."); }
    }

    try {
        const extraHeaders = {};
        if (req.query.ua)  extraHeaders["User-Agent"] = req.query.ua;
        if (req.query.ref) extraHeaders["Referer"] = req.query.ref;
        else if (targetUrl.includes("radio2m.ma")) extraHeaders["Referer"] = "http://www.radio2m.ma/";
        if (req.headers.range) extraHeaders["Range"] = req.headers.range;

        const upstream = await smartFetch(targetUrl, extraHeaders);

        if (upstream.statusCode >= 400) {
            upstream.resume();
            res.statusCode = upstream.statusCode;
            return res.end(`Erreur source IPTV: HTTP ${upstream.statusCode}`);
        }

        const contentType = (upstream.headers["content-type"] || "").toLowerCase();
        const lowerTarget = targetUrl.toLowerCase().split("?")[0];
        const isM3u8 = contentType.includes("mpegurl") || contentType.includes("m3u") ||
                       lowerTarget.endsWith(".m3u8") || lowerTarget.endsWith(".m3u");

        if (isM3u8) {
            const buf  = await streamToBuffer(upstream);
            const text = buf.toString("utf-8");
            const extraRef = req.query.ref || targetUrl;
            const extraQ = `&ref=${encodeURIComponent(extraRef)}&ua=IPTVSmartersPro`;
            const rewritten = text.split(/\r?\n/).map(line => {
                const t = line.trim();
                if (!t) return line;
                if (t.startsWith("#")) {
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
            const body = Buffer.from(rewritten.join("\n"), "utf-8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
            res.setHeader("Content-Length", body.length);
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            return res.end(body);
        }

        res.statusCode = upstream.statusCode;
        res.setHeader("Content-Type", upstream.headers["content-type"] || "video/mp2t");
        if (upstream.headers["content-length"]) res.setHeader("Content-Length", upstream.headers["content-length"]);
        if (upstream.headers["content-range"])  res.setHeader("Content-Range",  upstream.headers["content-range"]);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "no-cache");
        upstream.pipe(res);
        upstream.on("error", () => res.end());

    } catch (err) {
        console.error("[Proxy] Erreur :", err.message);
        res.statusCode = 502;
        return res.end(`Erreur de connexion au flux: ${err.message}`);
    }
};
