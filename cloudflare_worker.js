/**
 * BOKK TV — Cloudflare Worker Proxy CDN v3 (Manual Redirect Engine)
 * ──────────────────────────────────────────────────────────────────
 * Résout le problème 401 causé par la perte du User-Agent lors des
 * redirections cross-origin de MegaTV (megatv5074.com -> 46.249.110.xxx).
 */

const SEGMENT_EXTENSIONS = ['.ts', '.m4s', '.aac', '.mp4', '.fmp4'];

const RTS_CHANNELS = {
  'rts1': 26, 'rts2': 32, 'rts3': 42, 'rts4': 51, 'rts5': 52,
  'sentv': 2, '2stv': 29, 'leraltv': 35, 'walftv': 33, 'walf': 33
};

const MEGATV_ACCOUNTS = [
  ['61F6598D4955DCF', 'dA5BZGgigb'],
  ['81NQAFA7Q5S4188', 'JWyIZeiu08'],
  ['K7U6ZUB2J5ZEJV5', 'V6CKjNQIZH'],
];

function rewriteMegaTvUrl(targetUrl) {
  const m = targetUrl.match(/^(https?:\/\/[^\/]+\/live\/)[^\/]+\/[^\/]+\/(.+)$/);
  if (m) {
    const streamPath = m[2];
    const cleanKey = streamPath.split('?')[0].split('.')[0];
    let hash = 0;
    for (let i = 0; i < cleanKey.length; i++) {
      hash = ((hash << 5) - hash) + cleanKey.charCodeAt(i);
      hash |= 0;
    }
    const [user, pwd] = MEGATV_ACCOUNTS[Math.abs(hash) % MEGATV_ACCOUNTS.length];
    return `${m[1]}${user}/${pwd}/${streamPath}`;
  }
  return targetUrl;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === '/proxy') {
      return handleProxy(request, url, ctx);
    }

    return new Response('BOKK TV CDN Worker v3 OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', ...corsHeaders() },
    });
  },
};

async function handleProxy(request, url, ctx) {
  let targetUrl = url.searchParams.get('url');
  const refParam  = url.searchParams.get('ref');
  const uaParam   = url.searchParams.get('ua');

  if (!targetUrl) {
    return new Response("Paramètre 'url' manquant.", { status: 400, headers: corsHeaders() });
  }

  // Résolution RTS
  const rtsId = RTS_CHANNELS[targetUrl.toLowerCase()];
  if (rtsId) {
    try {
      const r = await fetch(`https://tveapi.acan.group/myapiv2/directplayback/${rtsId}/json`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (r.ok) {
        const d = await r.json();
        targetUrl = d.web_url || d.direct_url || targetUrl;
      }
    } catch (_) {}
  }

  // MegaTV pool
  if (targetUrl.includes('megatv5074.com') && targetUrl.includes('/live/')) {
    const tlo = targetUrl.toLowerCase().split('?')[0];
    if (tlo.endsWith('.m3u8') || tlo.endsWith('.m3u')) {
      targetUrl = rewriteMegaTvUrl(targetUrl);
    }
  }

  const finalUa = uaParam || 'IPTVSmartersPro';

  const outHeaders = {
    'User-Agent': finalUa,
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, identity',
    'Connection': 'keep-alive',
  };

  if (refParam) {
    outHeaders['Referer'] = refParam;
  }

  const clientRange = request.headers.get('Range');
  if (clientRange) {
    outHeaders['Range'] = clientRange;
  }

  // ── Redirection manuelle pour conserver IPTVSmartersPro sur TOUS les sauts ──
  let resp;
  let finalUrl = targetUrl;
  let currentUrl = targetUrl;
  let redirects = 0;

  try {
    while (redirects < 6) {
      resp = await fetch(currentUrl, {
        method: 'GET',
        headers: outHeaders,
        redirect: 'manual',
      });

      // Si redirection (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get('Location');
        if (!loc) break;
        currentUrl = new URL(loc, currentUrl).href;
        finalUrl = currentUrl;
        redirects++;
        continue;
      }
      break;
    }
  } catch (e) {
    return new Response(`Erreur proxy : ${e.message}`, { status: 502, headers: corsHeaders() });
  }

  if (!resp.ok && resp.status !== 206) {
    return new Response(`Erreur source : ${resp.status} [redirects: ${redirects}, finalUrl: ${finalUrl}]`, { status: resp.status, headers: corsHeaders() });
  }

  const contentType = (resp.headers.get('Content-Type') || '').toLowerCase();
  const targetLower = targetUrl.toLowerCase().split('?')[0];
  const finalLower  = finalUrl.toLowerCase().split('?')[0];
  const isSegment   = SEGMENT_EXTENSIONS.some(ext => targetLower.endsWith(ext) || finalLower.endsWith(ext));
  const isM3u8      = targetLower.endsWith('.m3u8') || finalLower.endsWith('.m3u8') ||
                      contentType.includes('mpegurl') || contentType.includes('m3u') || contentType.includes('text/');

  // ── Réécriture M3U8 en utilisant finalUrl comme base pour les segments /hlsr/... ──
  if (isM3u8 && !isSegment) {
    const text   = await resp.text();
    const base   = url.origin;
    const extraQ = `&ref=${encodeURIComponent(refParam || finalUrl)}&ua=${encodeURIComponent(finalUa)}`;

    const rewritten = text.split(/\r?\n/).map(line => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        if (t.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, p1) => {
            const abs = resolveUrl(p1, finalUrl);
            return `URI="${base}/proxy?url=${encodeURIComponent(abs)}${extraQ}"`;
          });
        }
        return line;
      }
      // URLs relatives (ex: /hlsr/...) ou absolues
      const abs = resolveUrl(t, finalUrl);
      return `${base}/proxy?url=${encodeURIComponent(abs)}${extraQ}`;
    });

    return new Response(rewritten.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders(),
      },
    });
  }

  // ── Segments vidéo / MPEG-TS ──
  const h = new Headers(corsHeaders());
  h.set('Content-Type', contentType || 'video/mp2t');
  h.set('Cache-Control', isSegment ? 'public, max-age=5' : 'no-cache');
  const cl = resp.headers.get('Content-Length');
  if (cl) h.set('Content-Length', cl);
  const cr = resp.headers.get('Content-Range');
  if (cr) h.set('Content-Range', cr);
  h.set('Accept-Ranges', 'bytes');

  return new Response(resp.body, { status: resp.status, headers: h });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };
}

function resolveUrl(rel, base) {
  try { return new URL(rel, base).href; } catch { return rel; }
}
