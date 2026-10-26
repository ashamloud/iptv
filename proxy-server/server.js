// BOKK TV — Proxy Universel (Railway / VPS)
// Proxifie tous les flux HLS/MPEG-TS : MegaTV, RTS, etc.
const http  = require("http");
const https = require("https");
const url   = require("url");

const RTS_CHANNELS = {
    "rts1":26,"rts2":32,"rts3":42,"rts4":51,"rts5":52,
    "sentv":2,"2stv":29,"leraltv":35,"walftv":33,"walf":33
};
const rtsCache = {};

// ── Pool de comptes MegaTV (20 actifs vérifiés 26/10/2026) ──
const MEGATV_ACCOUNTS = [
    ["02926AD784327A0","fa9yZrXklw"],
    ["2BRE4RQJ4JJ3HYX","bjmTAtFkfI"],
    ["37XK56RPPA4ESY4","WQ80IVhKvr"],
    ["3KRSA1DTXX8N5CF","wGOfmMDnVr"],
    ["430834571696283","57URoE9Lii"],
    ["511441353125991","3VFrh1xsvI"],
    ["61F6598D4955DCF","dA5BZGgigb"],
    ["810C271333152C5","Ahv4pLQX1m"],
    ["81NQAFA7Q5S4188","JWyIZeiu08"],
    ["8M0GJT1DGH5GC5J","21Ss8VLWx3"],
    ["BXNJAX3",        "TX8599J3117TD8G"],
    ["DH4R6JD1HQQ1W7E","GoCHhRWFte"],
    ["E195F0H",        "gnZuJrgGnY"],
    ["K7U6ZUB2J5ZEJV5","V6CKjNQIZH"],
    ["KPJ8V0ZVDPHJGJV","KC1hKWKEI2"],
    ["L123LS64BU77394","FrmSYMsCSP"],
    ["MAG1DVVLHN",     "MAG9PA88BF"],
    ["MAG98HJ481",     "MAGJPZEA3Q"],
    ["MAGF69VF1N",     "MAGUYBXGCD"],
    ["MAGNHL1VAP",     "MAGS5DV4NS"],
];
let _megatvIdx = 0;
function getMegaTvAccount() {
    const acc = MEGATV_ACCOUNTS[_megatvIdx % MEGATV_ACCOUNTS.length];
    _megatvIdx++;
    return acc;
}
function rewriteMegaTvUrl(targetUrl) {
    const m = targetUrl.match(/^(https?:\/\/[^\/]+\/live\/)[^\/]+\/[^\/]+\/(.+)$/);
    if (m) {
        const [user, pwd] = getMegaTvAccount();
        return `${m[1]}${user}/${pwd}/${m[2]}`;
    }
    return targetUrl;
}

function nodeFetch(targetUrl, extraHeaders, maxRedirects) {
    if (maxRedirects === undefined) maxRedirects = 6;
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(targetUrl);
            const isHttps = parsed.protocol === "https:";
            const mod = isHttps ? https : http;
            const req = mod.request({
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: Object.assign({
                    "User-Agent": "IPTVSmartersPro",
                    "Accept": "*/*",
                    "Connection": "keep-alive"
                }, extraHeaders || {}),
                timeout: 25000
            }, (res) => {
                if ([301,302,307,308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
                    const next = new URL(res.headers.location, targetUrl).href;
                    res.resume();
                    nodeFetch(next, extraHeaders, maxRedirects - 1).then(resolve).catch(reject);
                    return;
                }
                res.finalUrl = targetUrl;
                resolve(res);
            });
            req.on("timeout", () => req.destroy(new Error("Timeout")));
            req.on("error", reject);
            req.end();
        } catch(e) { reject(e); }
    });
}

function streamToBuffer(s) {
    return new Promise((res, rej) => {
        const c = [];
        s.on("data", d => c.push(d));
        s.on("end", () => res(Buffer.concat(c)));
        s.on("error", rej);
    });
}

async function resolveRts(key) {
    const cid = RTS_CHANNELS[key.toLowerCase()];
    if (!cid) return null;
    const now = Date.now();
    if (rtsCache[cid] && now - rtsCache[cid].t < 300000) return rtsCache[cid].url;
    try {
        const r = await nodeFetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, {"Accept":"application/json"});
        if (r.statusCode === 200) {
            const d = JSON.parse((await streamToBuffer(r)).toString("utf-8"));
            const u = d.web_url || d.direct_url;
            if (u) { rtsCache[cid] = { url: u, t: now }; return u; }
        } else r.resume();
    } catch(e) { console.error("[RTS]", e.message); }
    return null;
}

const BASE = process.env.PROXY_BASE || "";

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    const parsed = url.parse(req.url, true);
    if (parsed.pathname === "/" || parsed.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("BOKK TV Proxy Online");
    }
    if (parsed.pathname !== "/proxy") { res.writeHead(404); return res.end("404 Not Found"); }

    const host = req.headers["x-forwarded-host"] || req.headers["host"] || "";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const currentBase = process.env.PROXY_BASE || (host ? `${proto}://${host}` : "");

    let targetUrl = parsed.query.url;
    if (!targetUrl) { res.writeHead(400); return res.end("url param manquant"); }

    // RTS resolution
    if (RTS_CHANNELS[targetUrl.toLowerCase()]) {
        const r = await resolveRts(targetUrl);
        if (!r) { res.writeHead(502); return res.end("RTS indisponible"); }
        targetUrl = r;
    }

    // MegaTV round-robin account rotation — M3U8 UNIQUEMENT
    // Les segments .ts ont déjà les credentials corrects réécrits par le proxy
    // lors de la livraison de la playlist parente. Appliquer la rotation aux
    // segments causerait des erreurs 401 car le compte serait différent.
    if (targetUrl.includes("megatv5074.com") && targetUrl.includes("/live/")) {
        const tlo = targetUrl.toLowerCase().split("?")[0];
        if (tlo.endsWith(".m3u8") || tlo.endsWith(".m3u")) {
            targetUrl = rewriteMegaTvUrl(targetUrl);
        }
    }

    try {
        const extraH = {};
        if (parsed.query.ua) extraH["User-Agent"] = parsed.query.ua;
        if (parsed.query.ref) extraH["Referer"] = parsed.query.ref;
        if (req.headers.range) extraH["Range"] = req.headers.range;

        const upstream = await nodeFetch(targetUrl, extraH);

        if (upstream.statusCode >= 400) {
            upstream.resume();
            res.writeHead(upstream.statusCode);
            return res.end("Source IPTV: HTTP " + upstream.statusCode);
        }

        const ct = (upstream.headers["content-type"] || "").toLowerCase();
        const lo = targetUrl.toLowerCase().split("?")[0];
        const isM3u8 = ct.includes("mpegurl") || ct.includes("m3u") || lo.endsWith(".m3u8") || lo.endsWith(".m3u");

        if (isM3u8) {
            const finalBaseUrl = upstream.finalUrl || targetUrl;
            const text = (await streamToBuffer(upstream)).toString("utf-8");
            const xq = `&ref=${encodeURIComponent(parsed.query.ref || finalBaseUrl)}&ua=IPTVSmartersPro`;
            const rewritten = text.split(/\r?\n/).map(line => {
                const t = line.trim();
                if (!t) return line;
                if (t.startsWith("#")) {
                    if (t.includes('URI="')) return line.replace(/URI="([^"]+)"/g, (_, p1) => {
                        try { return `URI="${currentBase}/proxy?url=${encodeURIComponent(new URL(p1, finalBaseUrl).href)}${xq}"`; }
                        catch { return `URI="${p1}"`; }
                    });
                    return line;
                }
                try { return `${currentBase}/proxy?url=${encodeURIComponent(new URL(t, finalBaseUrl).href)}${xq}`; }
                catch { return line; }
            });
            const body = Buffer.from(rewritten.join("\n"), "utf-8");
            res.writeHead(200, {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Content-Length": body.length,
                "Cache-Control": "no-cache"
            });
            return res.end(body);
        }

        res.writeHead(upstream.statusCode, {
            "Content-Type": upstream.headers["content-type"] || "video/mp2t",
            "Cache-Control": "no-cache",
            ...(upstream.headers["content-length"] ? {"Content-Length": upstream.headers["content-length"]} : {}),
            ...(upstream.headers["content-range"]  ? {"Content-Range":  upstream.headers["content-range"]}  : {}),
            "Accept-Ranges": "bytes"
        });
        upstream.pipe(res);
        upstream.on("error", () => res.end());
    } catch(e) {
        console.error("[Proxy]", e.message);
        res.writeHead(502);
        res.end("Erreur: " + e.message);
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`BOKK Proxy on port ${PORT}`));
