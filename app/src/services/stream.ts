// ═══════════════════════════════════════════════════════════════
// BOKK TV — Résolution intelligente des flux natifs (Android / iOS / TV)
// Connexion directe ultra-rapide + Fallback Proxy Vercel sécurisé
// ═══════════════════════════════════════════════════════════════

const RTS_CHANNELS = new Set(['rts1', 'rts2', 'rts3', 'rts4', 'rts5', 'sentv', '2stv', 'leraltv', 'walftv', 'walf']);

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

export function resolveStreamUrl(
  rawUrl: string,
  channel?: any,
  useProxyFallback: boolean = false
): string {
  if (!rawUrl) return '';

  let finalUrl = rawUrl.trim();

  // 1. Chaînes officielles RTS / ACAN : routage direct vers l'API signée
  const lowerUrl = finalUrl.toLowerCase();
  if (RTS_CHANNELS.has(lowerUrl)) {
    return `https://bokktv.vercel.app/api/proxy?url=${encodeURIComponent(lowerUrl)}`;
  }

  // 2. Si le proxy de secours est demandé (ex: rejet direct 401/403/timeout par l'opérateur)
  if (useProxyFallback) {
    const ua = (channel && channel.userAgent) || 'IPTVSmartersPro';
    let proxyUrl = `https://bokktv.vercel.app/api/proxy?url=${encodeURIComponent(finalUrl)}&ua=${encodeURIComponent(ua)}`;
    if (channel && channel.referrer) {
      proxyUrl += `&ref=${encodeURIComponent(channel.referrer)}`;
    }
    return proxyUrl;
  }

  // 3. Détection et rotation des flux MegaTV
  if (finalUrl.includes('megatv5074.com') && finalUrl.includes('/live/')) {
    finalUrl = rewriteMegaTvUrl(finalUrl);
  }

  // 4. Contournement DNS des domaines souvent bloqués par les opérateurs mobiles
  if (finalUrl.includes('barrelastv.ottcst.org')) {
    finalUrl = finalUrl.replace('barrelastv.ottcst.org', '103.205.17.108');
  }

  return finalUrl;
}
