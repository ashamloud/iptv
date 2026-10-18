#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOKK TV — Serveur Web Local & Proxy Streaming Universel
Port : 8080 (http://localhost:8080)

Fonctionnalités :
- Serveur de fichiers statiques ultra-rapide (HTML, CSS, JS, Logos)
- Proxy de streaming HLS (.m3u8 et .ts) avec réécriture automatique des URLs
- Élimination totale des restrictions CORS sans duplication d'en-têtes
- Support transparent des flux HTTP et HTTPS sans avertissement Mixed Content
- Décompression automatique GZIP pour les playlists compressées
- Résolution dynamique des flux officiels RTS 1-5 en 1080p via l'API ACAN
- Spoofing intelligent de Referer & User-Agent pour contourner les protections CDN
- Multi-threadé pour streaming fluide et sans latence
"""

import sys
import os
import re
import ssl
import json
import gzip
import time
import threading
import urllib.request
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from collections import OrderedDict

PORT = 8080
SITE_DIR = os.path.dirname(os.path.abspath(__file__))

SSL_CONTEXT = ssl._create_unverified_context()
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

import http.cookiejar
COOKIE_JAR = http.cookiejar.CookieJar()
STREAM_OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(COOKIE_JAR),
    urllib.request.HTTPSHandler(context=SSL_CONTEXT)
)

# ── Cache mémoire pour les segments vidéo (.ts, .m4s, .aac) ──
# Évite de re-télécharger le même segment depuis le serveur source
SEGMENT_CACHE = OrderedDict()   # {url: {'data': bytes, 'ct': str, 'time': float}}
SEGMENT_CACHE_LOCK = threading.Lock()
SEGMENT_CACHE_MAX_BYTES = 50 * 1024 * 1024  # 50 MB max
SEGMENT_CACHE_TTL = 12  # secondes
SEGMENT_CACHE_CURRENT_BYTES = 0

SEGMENT_EXTENSIONS = ('.ts', '.m4s', '.aac', '.mp4', '.fmp4')


def segment_cache_get(url):
    with SEGMENT_CACHE_LOCK:
        entry = SEGMENT_CACHE.get(url)
        if entry and (time.time() - entry['time'] < SEGMENT_CACHE_TTL):
            SEGMENT_CACHE.move_to_end(url)  # LRU: marquer comme récent
            return entry['data'], entry['ct']
        return None, None


def segment_cache_put(url, data, ct):
    global SEGMENT_CACHE_CURRENT_BYTES
    with SEGMENT_CACHE_LOCK:
        size = len(data)
        # Éviction LRU si on dépasse la limite
        while SEGMENT_CACHE_CURRENT_BYTES + size > SEGMENT_CACHE_MAX_BYTES and SEGMENT_CACHE:
            _, old = SEGMENT_CACHE.popitem(last=False)
            SEGMENT_CACHE_CURRENT_BYTES -= len(old['data'])
        SEGMENT_CACHE[url] = {'data': data, 'ct': ct, 'time': time.time()}
        SEGMENT_CACHE.move_to_end(url)
        SEGMENT_CACHE_CURRENT_BYTES += size


# ── Cache GZIP pour les fichiers statiques (JS/CSS/HTML) ──
STATIC_GZIP_CACHE = {}   # {filepath: (mtime, gzip_bytes)}
STATIC_GZIP_LOCK = threading.Lock()

GZIPPABLE_TYPES = {
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
}

# Cache pour les tokens RTS pour éviter de spammer l'API à chaque segment
RTS_CHANNELS = {
    'rts1': 26,
    'rts2': 32,
    'rts3': 42,
    'rts4': 51,
    'rts5': 52,
    'sentv': 2
}
RTS_TOKEN_CACHE = {}


def resolve_rts_url(channel_key):
    """Obtient l'URL en direct signée et fraîche pour une chaîne RTS/SEN TV officielle."""
    now = time.time()
    cid = RTS_CHANNELS.get(channel_key.lower())
    if not cid:
        return None
    
    cached = RTS_TOKEN_CACHE.get(cid)
    if cached and (now - cached['time'] < 300):  # Valide 5 minutes
        return cached['url']
    
    for attempt in range(2):
        try:
            api_url = f"https://tveapi.acan.group/myapiv2/directplayback/{cid}/json"
            req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=10) as res:
                data = json.loads(res.read().decode('utf-8'))
                stream_url = data.get('web_url') or data.get('direct_url')
                if stream_url:
                    RTS_TOKEN_CACHE[cid] = {'url': stream_url, 'time': now}
                    return stream_url
        except Exception as e:
            sys.stderr.write(f"[BOKK TV] Erreur résolution RTS {channel_key} (tentative {attempt+1}): {e}\n")
            sys.stderr.flush()
            time.sleep(0.5)
    return None


class BOKKStreamProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Max-Age', '86400')
        super().end_headers()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/proxy':
            self.handle_proxy(parsed, is_head=True)
        else:
            super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/proxy':
            self.handle_proxy(parsed, is_head=False)
        elif parsed.path == '/speedtest':
            # Endpoint test de vitesse : renvoie un blob aléatoire de 200 KB
            payload = os.urandom(200 * 1024)
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:
                self.wfile.write(payload)
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass
        else:
            self.handle_static_with_gzip(parsed.path)

    def handle_static_with_gzip(self, url_path):
        """Sert les fichiers statiques avec compression GZIP si le client le supporte."""
        # Nettoyer le chemin (sécurité basique)
        safe_path = urllib.parse.unquote(url_path.split('?')[0])
        if '..' in safe_path:
            super().do_GET()
            return

        ext = os.path.splitext(safe_path)[1].lower()
        if ext not in GZIPPABLE_TYPES:
            super().do_GET()
            return

        accept_enc = self.headers.get('Accept-Encoding', '')
        if 'gzip' not in accept_enc:
            super().do_GET()
            return

        # Chemin physique du fichier
        filepath = os.path.join(SITE_DIR, safe_path.lstrip('/'))
        if not os.path.isfile(filepath):
            super().do_GET()
            return

        try:
            mtime = os.path.getmtime(filepath)
            with STATIC_GZIP_LOCK:
                cached = STATIC_GZIP_CACHE.get(filepath)
                if cached and cached[0] == mtime:
                    gz_data = cached[1]
                else:
                    with open(filepath, 'rb') as f:
                        raw = f.read()
                    gz_data = gzip.compress(raw, compresslevel=6)
                    STATIC_GZIP_CACHE[filepath] = (mtime, gz_data)

            content_type = GZIPPABLE_TYPES[ext]
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(gz_data)))
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Cache-Control', 'public, max-age=300')
            self.end_headers()
            try:
                self.wfile.write(gz_data)
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass
        except Exception:
            super().do_GET()

    def end_headers(self):
        # Injecter CORS uniquement si pas déjà présent
        has_cors = hasattr(self, '_headers_buffer') and any(
            h.lower().startswith(b'access-control-allow-origin:') for h in self._headers_buffer
        )
        if not has_cors:
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def handle_proxy(self, parsed, is_head=False):
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get('url', [None])[0]

        if not target_url:
            self.send_error(400, "Paramètre 'url' manquant pour le proxy.")
            return

        # ── Résolution spéciale des chaînes officielles RTS ──
        if target_url.lower() in RTS_CHANNELS:
            resolved = resolve_rts_url(target_url.lower())
            if resolved:
                target_url = resolved
            else:
                self.send_response(502)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(b"Impossible de contacter l'API RTS")
                return

        # ── Cache HIT pour les segments vidéo (HLS uniquement, pas de flux continu /live/) ──
        target_lower_ext = target_url.lower().split('?')[0]
        if (any(target_lower_ext.endswith(ext) for ext in SEGMENT_EXTENSIONS)
                and not self.headers.get('Range') and not is_head
                and '/live/' not in target_lower_ext):
            cached_data, cached_ct = segment_cache_get(target_url)
            if cached_data is not None:
                try:
                    self.send_response(200)
                    self.send_header('Content-Type', cached_ct or 'video/mp2t')
                    self.send_header('Content-Length', str(len(cached_data)))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('Cache-Control', 'public, max-age=10')
                    self.send_header('X-Cache', 'HIT')
                    self.end_headers()
                    self.wfile.write(cached_data)
                    return
                except (ConnectionResetError, BrokenPipeError, OSError):
                    return

        try:
            # Récupérer d'éventuels paramètres ref et ua personnalisés
            custom_ref = qs.get('ref', [None])[0]
            custom_ua = qs.get('ua', [None])[0]

            # En-têtes style VLC (standard IPTV universel)
            # Ne JAMAIS forcer de Referer bidon car les CDN (CloudFront, Akamai, etc.) bloquent le hotlinking
            referer = None
            if custom_ref:
                referer = custom_ref
            elif '2m_monde' in target_url.lower() or 'radio2m.ma' in target_url.lower():
                referer = 'http://www.radio2m.ma/'
            elif 'odysee' in target_url.lower():
                referer = 'https://odysee.com/'
            elif 'liveghanatv' in target_url.lower():
                referer = 'https://liveghanatv.com/'

            if custom_ua:
                ua = custom_ua
            elif 'megatv' in target_url.lower():
                ua = 'VLC/3.0.18 LibVLC/3.0.18'
            else:
                ua = 'VLC/3.0.18 LibVLC/3.0.18'

            headers = {
                'User-Agent': ua,
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, identity',
                'Connection': 'keep-alive'
            }
            if referer:
                headers['Referer'] = referer

            # Transférer l'en-tête Range du navigateur pour streaming / seeking fluide
            client_range = self.headers.get('Range')
            if client_range:
                headers['Range'] = client_range

            req = urllib.request.Request(target_url, headers=headers)

            try:
                resp = STREAM_OPENER.open(req, timeout=5)
            except urllib.error.HTTPError as he:
                # Si 403 avec referer, retenter sans referer
                if he.code == 403 and 'Referer' in headers and not custom_ref:
                    del headers['Referer']
                    req2 = urllib.request.Request(target_url, headers=headers)
                    resp = STREAM_OPENER.open(req2, timeout=5)
                elif he.code == 403 and 'User-Agent' in headers and ua != USER_AGENT:
                    # Retenter avec User-Agent Chrome classique
                    headers['User-Agent'] = USER_AGENT
                    req2 = urllib.request.Request(target_url, headers=headers)
                    resp = STREAM_OPENER.open(req2, timeout=5)
                else:
                    raise he

            with resp:
                final_url = resp.geturl()
                content_type = resp.headers.get('Content-Type', '')
                content_encoding = resp.headers.get('Content-Encoding', '')
                status_code = getattr(resp, 'status', 200)

                if is_head:
                    self.send_response(status_code)
                    if content_type:
                        self.send_header('Content-Type', content_type)
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    return

                # Paramètres additionnels à propager dans les sous-playlists et segments
                extra_q = ""
                if custom_ref or referer:
                    extra_q += f"&ref={urllib.parse.quote(referer, safe='')}"
                if custom_ua:
                    extra_q += f"&ua={urllib.parse.quote(custom_ua, safe='')}"

                # Détection de playlist M3U8
                target_lower = target_url.lower()
                final_lower = final_url.lower()
                is_m3u8_url = (
                    '.m3u8' in target_lower or
                    '.m3u8' in final_lower or
                    'mpegurl' in content_type.lower() or
                    'm3u' in content_type.lower() or
                    'text/' in content_type.lower()
                )

                # Si c'est une playlist M3U8
                if is_m3u8_url:
                    raw_data = resp.read()

                    # Décompression GZIP si nécessaire
                    if 'gzip' in content_encoding.lower() or (len(raw_data) >= 2 and raw_data[:2] == b'\x1f\x8b'):
                        try:
                            data = gzip.decompress(raw_data)
                        except Exception:
                            data = raw_data
                    else:
                        data = raw_data

                    # Vérifier si le contenu est effectivement une playlist M3U8
                    is_real_m3u8 = (
                        data.startswith(b'#EXTM3U') or
                        b'#EXTINF' in data[:500] or
                        b'#EXT-X-' in data[:500] or
                        '.m3u8' in target_lower or
                        '.m3u8' in final_lower
                    )

                    if is_real_m3u8:
                        try:
                            text = data.decode('utf-8', errors='replace')
                            lines = text.splitlines()
                            rewritten = []
                            for line in lines:
                                stripped = line.strip()
                                if not stripped:
                                    rewritten.append(line)
                                elif stripped.startswith('#'):
                                    # Réécrire tous les tags contenant URI="..."
                                    if 'URI="' in stripped:
                                        def rewrite_uri_match(m):
                                            attr_url = urllib.parse.urljoin(final_url, m.group(1))
                                            return f'URI="/proxy?url={urllib.parse.quote(attr_url, safe="")}{extra_q}"'
                                        rewritten.append(re.sub(r'URI="([^"]+)"', rewrite_uri_match, line))
                                    else:
                                        rewritten.append(line)
                                else:
                                    # URL de sous-playlist (.m3u8) ou de segment vidéo (.ts, .aac, .m4s)
                                    resolved = urllib.parse.urljoin(final_url, stripped)
                                    rewritten.append(f'/proxy?url={urllib.parse.quote(resolved, safe="")}{extra_q}')

                            out_bytes = '\n'.join(rewritten).encode('utf-8')
                            self.send_response(200)
                            self.send_header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
                            self.send_header('Content-Length', str(len(out_bytes)))
                            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                            self.send_header('Accept-Ranges', 'bytes')
                            self.end_headers()
                            self.wfile.write(out_bytes)
                            return
                        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
                            return
                        except Exception:
                            pass

                    # Ce n'était pas un M3U8, envoyer les données déjà lues
                    out_type = content_type if content_type else 'application/octet-stream'
                    self.send_response(status_code)
                    self.send_header('Content-Type', out_type)
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.end_headers()
                    self.wfile.write(data)
                    return

                # Segment ou flux vidéo binaire (.ts, .aac, .m4s, etc.)
                out_type = content_type if content_type else 'video/mp2t'
                content_length = resp.headers.get('Content-Length')
                content_range = resp.headers.get('Content-Range')

                cl_int = None
                if content_length:
                    try:
                        cl_int = int(content_length)
                    except ValueError:
                        pass

                # ── Vérifier si ce segment est cacheable ──
                # RÈGLE CRUCIALE : Seuls les vrais petits segments HLS (Content-Length fini <= 10 MB, hors /live/)
                # peuvent être lus d'un coup. Un flux MPEG-TS live continu n'a pas de Content-Length
                # et DOIT être streamé par blocs de 64 KB en direct sous peine de bloquer indéfiniment !
                target_lower_check = target_url.lower().split('?')[0]
                is_segment = any(target_lower_check.endswith(ext) for ext in SEGMENT_EXTENSIONS)
                no_range = not self.headers.get('Range')

                if is_segment and no_range and cl_int is not None and cl_int <= 10 * 1024 * 1024 and '/live/' not in target_lower_check:
                    try:
                        seg_data = resp.read()
                        segment_cache_put(target_url, seg_data, out_type)
                        self.send_response(status_code)
                        self.send_header('Content-Type', out_type)
                        self.send_header('Content-Length', str(len(seg_data)))
                        self.send_header('Accept-Ranges', 'bytes')
                        self.send_header('Cache-Control', 'public, max-age=10')
                        self.send_header('X-Cache', 'MISS')
                        self.end_headers()
                        self.wfile.write(seg_data)
                    except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
                        pass
                else:
                    # Streaming continu direct par blocs de 64 KB (flux live MPEG-TS, radio ou gros fichier)
                    self.send_response(status_code)
                    self.send_header('Content-Type', out_type)
                    if content_length:
                        self.send_header('Content-Length', content_length)
                    if content_range:
                        self.send_header('Content-Range', content_range)
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('Cache-Control', 'public, max-age=3600')
                    self.end_headers()
                    try:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
                        pass

        except urllib.error.HTTPError as e:
            try:
                self.send_response(e.code)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(f"Erreur HTTP distante : {e.code} {e.reason}".encode('utf-8'))
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
                pass
        except Exception as e:
            try:
                self.send_response(502)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(f"Erreur Proxy : {str(e)}".encode('utf-8'))
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
                pass

    def log_message(self, format, *args):
        # Réduire le bruit dans la console pour les segments vidéo
        msg = format % args
        if '/proxy?' in msg and ('.ts' in msg or 'segment' in msg or 'clip' in msg or '.m4s' in msg):
            return
        sys.stderr.write(f"[BOKK TV] {msg}\n")
        sys.stderr.flush()


class SafeThreadingHTTPServer(ThreadingHTTPServer):
    # Sur Windows, désactiver allow_reuse_address pour empêcher 2 processus d'écouter sur le même port
    allow_reuse_address = False


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    try:
        server = SafeThreadingHTTPServer(('0.0.0.0', port), BOKKStreamProxyHandler)
    except OSError as e:
        sys.stderr.write(f"[BOKK TV ERREUR] Le port {port} est déjà utilisé : {e}\n")
        sys.stderr.flush()
        sys.exit(1)

    print("=" * 60)
    print(f"   BOKK TV Serveur & Proxy en ligne sur http://localhost:{port}/")
    print(f"   Proxy de streaming disponible sur http://localhost:{port}/proxy?url=...")
    print(f"   Multi-threading actif pour streaming fluide.")
    print("=" * 60)
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur BOKK TV.")
        server.server_close()

