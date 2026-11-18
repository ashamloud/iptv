const CF_WORKER_BASE = 'https://bokk-tv-proxy.pgueye866.workers.dev';

export function resolveStreamUrl(rawUrl: string, channel?: any): string {
  if (!rawUrl) return '';

  const isMegaTv = rawUrl.includes('megatv') || rawUrl.includes(':80/live/') || rawUrl.includes(':8080/live/');
  const ua = (channel && channel.userAgent) ? channel.userAgent : (isMegaTv ? 'IPTVSmartersPro' : 'IPTVSmartersPro');

  let extra = `&ua=${encodeURIComponent(ua)}`;
  if (channel && channel.referrer) {
    extra += `&ref=${encodeURIComponent(channel.referrer)}`;
  }

  return `${CF_WORKER_BASE}/proxy?url=${encodeURIComponent(rawUrl)}${extra}`;
}

