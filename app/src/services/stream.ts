// ═══════════════════════════════════════════════════════════════
// BOKK TV — Résolution intelligente des flux natifs (Android / iOS / TV)
// Connexion directe ultra-rapide CDN + Cache Edge + Zéro coupure
// ═══════════════════════════════════════════════════════════════

export const RTS_IDS: Record<string, number> = {
  rts1: 26,
  rts2: 32,
  rts3: 42,
  rts4: 51,
  rts5: 52,
  sentv: 2,
  '2stv': 29,
  leraltv: 35,
  walftv: 33,
  walf: 33,
};

const acanCache = new Map<string, { url: string; time: number }>();

/**
 * Récupère directement l'URL native du CDN ACAN officiel
 * (évite de passer par un proxy et élimine tout temps de chargement / coupure)
 */
export async function fetchAcanDirectUrl(channelKey: string): Promise<string | null> {
  const key = channelKey.toLowerCase();
  const cid = RTS_IDS[key];
  if (!cid) return null;

  const now = Date.now();
  const cached = acanCache.get(key);
  if (cached && now - cached.time < 300000) {
    return cached.url;
  }

  try {
    const res = await fetch(`https://tveapi.acan.group/myapiv2/directplayback/${cid}/json`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'IPTVSmartersPro'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const directUrl = data.android_url || data.direct_url || data.web_url;
      if (directUrl) {
        acanCache.set(key, { url: directUrl, time: now });
        return directUrl;
      }
    }
  } catch {}

  return null;
}

// Pool de comptes MegaTV vérifiés pour rotation
const MEGATV_ACCOUNTS = [
  ['430834571696283', '57URoE9Lii'],
  ['61F6598D4955DCF', 'dA5BZGgigb'],
  ['E195F0H', 'gnZuJrgGnY'],
  ['K7U6ZUB2J5ZEJV5', 'V6CKjNQIZH'],
];

function rewriteMegaTvUrl(targetUrl: string): string {
  const m = targetUrl.match(/^(https?:\/\/[^\/]+\/live\/)[^\/]+\/[^\/]+\/(.+)$/);
  if (m) {
    const cleanKey = (m[2] || '').split('?')[0].split('.')[0];
    let hash = 0;
    for (let i = 0; i < cleanKey.length; i++) {
      hash = ((hash << 5) - hash) + cleanKey.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % MEGATV_ACCOUNTS.length;
    const [user, pwd] = MEGATV_ACCOUNTS[idx];
    return `${m[1]}${user}/${pwd}/${m[2]}`;
  }
  return targetUrl;
}

export function buildStreamHeaders(channel?: any, resolvedUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': (channel && channel.userAgent) || 'IPTVSmartersPro',
    'Accept': '*/*',
    'Connection': 'keep-alive',
  };
  if (channel && channel.referrer) {
    headers['Referer'] = channel.referrer;
  }
  // Si on contourne le DNS vers l'IP directe, conserver le Host d'origine pour Nginx/Xtream
  if (resolvedUrl && resolvedUrl.includes('103.205.17.108')) {
    headers['Host'] = 'barrelastv.ottcst.org';
  }
  return headers;
}

export function resolveStreamUrl(
  rawUrl: string,
  channel?: any,
  useProxyFallback: boolean = false,
  bypassDnsIp: boolean = false
): string {
  if (!rawUrl) return '';

  let finalUrl = rawUrl.trim();
  const lowerUrl = finalUrl.toLowerCase();

  // 1. Chaînes officielles RTS / ACAN : vérifier le cache direct
  if (RTS_IDS[lowerUrl]) {
    const cached = acanCache.get(lowerUrl);
    if (cached && Date.now() - cached.time < 300000) {
      return cached.url;
    }
    return `https://bokktv.vercel.app/api/proxy?url=${encodeURIComponent(lowerUrl)}`;
  }

  // 2. Détection et rotation des flux MegaTV
  if (finalUrl.includes('megatv5074.com') && finalUrl.includes('/live/')) {
    finalUrl = rewriteMegaTvUrl(finalUrl);
  }

  // 2b. Normalisation des flux novatv vers MPEG-TS live direct
  if (finalUrl.includes('novatv.xyz') && !finalUrl.includes('/live/') && !finalUrl.endsWith('.ts')) {
    try {
      const u = new URL(finalUrl);
      const parts = u.pathname.replace(/^\/+/, '').split('/');
      if (parts.length >= 3) {
        finalUrl = `http://${u.host}/live/${parts[0]}/${parts[1]}/${parts[2]}.ts`;
      }
    } catch (_) {}
  }

  // 3. Contournement DNS uniquement si demandé en secours ou blocage opérateur (avec Host header associé)
  if (bypassDnsIp && finalUrl.includes('barrelastv.ottcst.org')) {
    finalUrl = finalUrl.replace('barrelastv.ottcst.org', '103.205.17.108');
  }

  // 4. Si proxy de secours demandé pour flux direct rejeté
  if (useProxyFallback) {
    const ua = (channel && channel.userAgent) || 'IPTVSmartersPro';
    let proxyUrl = `https://bokktv.vercel.app/api/proxy?url=${encodeURIComponent(finalUrl)}&ua=${encodeURIComponent(ua)}`;
    if (channel && channel.referrer) {
      proxyUrl += `&ref=${encodeURIComponent(channel.referrer)}`;
    }
    return proxyUrl;
  }

  return finalUrl;
}

export async function resolveStreamUrlAsync(
  rawUrl: string,
  channel?: any,
  useProxyFallback: boolean = false,
  bypassDnsIp: boolean = false
): Promise<string> {
  if (!rawUrl) return '';

  const clean = rawUrl.trim();
  const lower = clean.toLowerCase();

  // Résolution directe ACAN si disponible (zéro passage par proxy)
  if (RTS_IDS[lower]) {
    const directUrl = await fetchAcanDirectUrl(lower);
    if (directUrl) return directUrl;
  }

  return resolveStreamUrl(clean, channel, useProxyFallback, bypassDnsIp);
}
