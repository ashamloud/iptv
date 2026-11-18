// ═══════════════════════════════════════════════════════════════
// BOKK TV — Résolution directe des flux natifs (Android / iOS / TV)
// Zéro proxy • Zéro Cloudflare Worker • Zéro Render
// Connexion TCP/HTTP directe vers la source IPTV (Ultra-rapide)
// ═══════════════════════════════════════════════════════════════

// Pool de comptes MegaTV vérifiés pour rotation directe
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

export function resolveStreamUrl(rawUrl: string, channel?: any): string {
  if (!rawUrl) return '';

  let finalUrl = rawUrl.trim();

  // Si c'est un flux MegaTV, injecter les identifiants actifs directement
  if (finalUrl.includes('megatv5074.com') && finalUrl.includes('/live/')) {
    finalUrl = rewriteMegaTvUrl(finalUrl);
  }

  // Connexion DIRECTE : ExoPlayer gère HLS et MPEG-TS nativement sans aucun proxy
  return finalUrl;
}
