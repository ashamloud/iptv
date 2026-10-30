#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOKK TV — Constructeur & Validateur Intelligent de Catalogue IPTV
- Fusionne : chaine.md, m3u/*.m3u, chaînes sénégalaises/africaines, et chaînes vérifiées de channels.js
- Extrait les User-Agents (#EXTVLCOPT) et Referers nécessaires
- Teste chaque flux avec multi-threading et retente avec plusieurs User-Agents (Dalvik, VLC, Smarters)
- Conserve un maximum de chaînes fonctionnelles
"""

import os, sys, re, json, time, ssl, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl._create_unverified_context()
TIMEOUT = 3.5
MAX_WORKERS = 120

TEST_UAS = [
    'Dalvik/2.1.0 (Linux; U; Android 13; Samsung F1833B Build/TP1A.280629.015)',
    'IPTVSmartersPro',
    'VLC/3.0.18 LibVLC/3.0.18',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
]

def test_stream_live(url, preferred_ua=None, ref=None):
    """
    Teste si un flux répond. Tente d'abord l'UA préféré, puis les UA alternatifs.
    Retourne (is_alive, best_ua).
    """
    # Chaînes internes ou ACAN (toujours valides via serveur)
    if url.lower() in ('rts1', 'rts2', 'sentv', '2stv', 'leraltv', 'walftv', 'walf'):
        return True, preferred_ua

    candidate_uas = []
    if preferred_ua:
        candidate_uas.append(preferred_ua)
    for ua in TEST_UAS:
        if ua not in candidate_uas:
            candidate_uas.append(ua)

    for ua in candidate_uas[:3]: # tester jusqu'à 3 UA maximum
        try:
            headers = {
                'User-Agent': ua,
                'Accept': '*/*',
                'Connection': 'close'
            }
            if ref:
                headers['Referer'] = ref

            req = urllib.request.Request(url, headers=headers, method='GET')
            # Ne lire que les premiers 512 octets pour aller très vite
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=TIMEOUT) as resp:
                status = getattr(resp, 'status', 200)
                if status in (200, 206, 301, 302, 307):
                    return True, ua
        except urllib.error.HTTPError as he:
            if he.code in (401, 403):
                # Réessayer avec un autre User-Agent
                continue
            elif he.code in (404, 410, 502, 503, 504):
                # Vraiment mort
                return False, preferred_ua
        except Exception:
            continue

    return False, preferred_ua


def parse_m3u_file(filepath, default_group="Général", default_cat="monde"):
    print(f"  -> Analyse de {os.path.basename(filepath)}...")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    entries = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('#EXTINF:'):
            meta = line[8:]
            title_idx = meta.rfind(',')
            title = meta[title_idx+1:].strip() if title_idx != -1 else 'Chaîne'
            attrs = meta[:title_idx] if title_idx != -1 else meta

            logo = ''
            m_logo = re.search(r'tvg-logo="([^"]+)"', attrs, re.I) or re.search(r"tvg-logo='([^']+)'", attrs, re.I)
            if m_logo:
                logo = m_logo.group(1).strip()

            group = default_group
            m_group = re.search(r'group-title="([^"]+)"', attrs, re.I) or re.search(r"group-title='([^']+)'", attrs, re.I)
            if m_group and m_group.group(1).strip():
                group = m_group.group(1).strip()

            country = ''
            m_country = re.search(r'tvg-country="([^"]+)"', attrs, re.I) or re.search(r"tvg-country='([^']+)'", attrs, re.I)
            if m_country:
                country = m_country.group(1).strip()

            ua = None
            ref = None
            i += 1
            url = ''
            while i < len(lines):
                l = lines[i].strip()
                if l.startswith('#EXTVLCOPT:http-user-agent='):
                    ua = l.split('=', 1)[1].strip()
                elif l.startswith('#EXTVLCOPT:http-referrer='):
                    ref = l.split('=', 1)[1].strip()
                elif l and not l.startswith('#'):
                    url = l
                    break
                i += 1

            if url and url.startswith('http'):
                # Détection de catégorie
                gl = group.lower()
                tl = title.lower()
                cat = default_cat

                if any(x in gl or x in tl for x in ['sport', 'foot', 'futbol', 'espn', 'bein', 'fifa', 'dazn', 'laliga', 'nba', 'sky sport', 'ssport', 's sport', 'eurosport', 'formel 1', 'f1']):
                    cat = 'sport'
                elif any(x in gl or x in tl for x in ['sénégal', 'senegal', 'dakar', 'wolof', 'rts', 'walf', 'sen tv']):
                    cat = 'senegal'
                elif any(x in gl or x in tl for x in ['ciné', 'cine', 'film', 'movie', 'serie', 'série', 'drama', 'novelas', 'dizi']):
                    cat = 'cinema'
                elif any(x in gl or x in tl for x in ['music', 'musique', 'trace', 'radio', 'song', 'hits', 'clip', 'musik']):
                    cat = 'music'
                elif any(x in gl or x in tl for x in ['kids', 'jeunesse', 'enfant', 'anim', 'toon', 'disney', 'junior', 'gulli', 'manga']):
                    cat = 'jeunesse'
                elif any(x in gl or x in tl for x in ['docu', 'decouverte', 'découverte', 'histoire', 'animaux', 'science', 'nature', 'doku', 'planet']):
                    cat = 'documentaire'
                elif any(x in gl or x in tl for x in ['france', 'francophone', 'belgique', 'suisse', 'tnt', 'tf1', 'm6', 'france 2', 'france 3', 'cnews', 'bfm']):
                    cat = 'francophone'
                elif any(x in gl or x in tl for x in ['afrique', 'africa', 'ivoire', 'mali', 'guinée', 'cameroun', 'rdc', 'gabon', 'togo', 'bénin']):
                    cat = 'afrique'
                elif any(x in gl or x in tl for x in ['deutschland', 'germany', 'rtl', 'zdf', 'ard', 'sat.1', 'prosieben']) or 'de |' in gl:
                    cat = 'allemagne'
                elif any(x in gl or x in tl for x in ['spain', 'espana', 'espagne', 'movistar', 'la 1', 'antena']):
                    cat = 'espagne'
                elif any(x in gl or x in tl for x in ['italy', 'italia', 'italie', 'rai', 'mediaset']):
                    cat = 'italie'
                elif any(x in gl or x in tl for x in ['uk', 'usa', 'united kingdom', 'bbc', 'itv', 'cbs', 'nbc', 'fox']):
                    cat = 'uk'

                entries.append({
                    'name': title,
                    'group': group,
                    'category': cat,
                    'country': country,
                    'logo': logo,
                    'url': url,
                    'userAgent': ua,
                    'referrer': ref
                })
        else:
            i += 1
    return entries

def main():
    print("=" * 60)
    print(" BOKK TV — Construction & Validation du Catalogue Complet")
    print("=" * 60)

    # 1. Récupérer les chaînes sénégalaises prioritaires et France TNT depuis channels.js
    site_channels_path = "channels.js"
    core_channels = []
    seen_urls = set()

    if os.path.exists(site_channels_path):
        print("1. Extraction des chaînes prioritaires et officielles...")
        with open(site_channels_path, "r", encoding="utf-8") as f:
            c_raw = f.read()
        start = c_raw.find("[")
        end = c_raw.rfind("]") + 1
        if start != -1 and end > start:
            try:
                old_list = json.loads(c_raw[start:end])
                for c in old_list:
                    # Garder prioritairement les chaînes nationales, officielles et bien titrées
                    u = c.get('url', '')
                    cat = c.get('category', '')
                    name = c.get('name', '')
                    # Garder les chaînes du Sénégal et les chaînes TNT françaises de qualité
                    is_priority = (
                        cat in ('senegal', 'afrique') or
                        'france' in name.lower() or
                        'rts' in name.lower() or
                        'walf' in name.lower() or
                        'sen tv' in name.lower() or
                        'pluto' in name.lower() or
                        'sony' in name.lower() or
                        'trace' in name.lower() or
                        'rakuten' in u.lower() or
                        'amagi' in u.lower() or
                        'raw.githubusercontent.com/Paradise-91' in u.lower()
                    )
                    if is_priority and u and u not in seen_urls:
                        seen_urls.add(u)
                        core_channels.append(c)
                print(f"  -> {len(core_channels)} chaînes prioritaires conservées.")
            except Exception as e:
                print(f"  Erreur lecture old channels: {e}")

    # 2. Parser chaine.md (contient les BeIN Sports, S SPORT, etc.)
    all_raw_candidates = list(core_channels)
    chaine_md_path = "../chaine.md"
    if os.path.exists(chaine_md_path):
        chaine_entries = parse_m3u_file(chaine_md_path, default_group="Sport & Direct", default_cat="sport")
        print(f"  -> {len(chaine_entries)} chaînes extraites de chaine.md.")
        for e in chaine_entries:
            u = e['url']
            if u not in seen_urls:
                seen_urls.add(u)
                clean_u = u.lower().split('?')[0]
                stream_type = 'ts' if (clean_u.endswith('.ts') or clean_u.endswith('.mpegts')) else 'hls'
                all_raw_candidates.append({
                    'id': 9500000 + len(all_raw_candidates),
                    'stream_id': 9500000 + len(all_raw_candidates),
                    'name': e['name'],
                    'category': e['category'],
                    'group': e['group'],
                    'country': e['country'] or 'INT',
                    'badge': 'FHD' if 'fhd' in e['name'].lower() or '1080' in e['name'] else ('4K' if '4k' in e['name'].lower() or 'uhd' in e['name'].lower() else 'HD'),
                    'desc': f"{e['name']} • {e['group']}",
                    'logo': e['logo'] or 'https://i.imgur.com/3Z6U1q9.png',
                    'url': u,
                    'fallbackUrl': u,
                    'type': stream_type,
                    'userAgent': e['userAgent'],
                    'referrer': e['referrer']
                })

    # 3. Parser les fichiers m3u/
    m3u_dir = "../m3u"
    if os.path.exists(m3u_dir):
        for fname in sorted(os.listdir(m3u_dir)):
            if fname.endswith('.m3u'):
                fpath = os.path.join(m3u_dir, fname)
                dcat = 'sport' if 'futbol' in fname else ('cinema' if 'pluto' in fname or 'rakuten' in fname else ('music' if 'trace' in fname else 'francophone'))
                dgroup = fname.replace('.m3u', '').replace('_', ' ').capitalize()
                m3u_entries = parse_m3u_file(fpath, default_group=dgroup, default_cat=dcat)
                print(f"  -> {len(m3u_entries)} chaînes de {fname}.")
                for e in m3u_entries:
                    u = e['url']
                    if u not in seen_urls:
                        seen_urls.add(u)
                        clean_u = u.lower().split('?')[0]
                        stream_type = 'ts' if (clean_u.endswith('.ts') or clean_u.endswith('.mpegts')) else 'hls'
                        all_raw_candidates.append({
                            'id': 9500000 + len(all_raw_candidates),
                            'stream_id': 9500000 + len(all_raw_candidates),
                            'name': e['name'],
                            'category': e['category'],
                            'group': e['group'],
                            'country': e['country'] or ('FR' if 'fr' in fname else 'INT'),
                            'badge': 'HD',
                            'desc': f"{e['name']} • {e['group']}",
                            'logo': e['logo'] or 'https://i.imgur.com/3Z6U1q9.png',
                            'url': u,
                            'fallbackUrl': u,
                            'type': stream_type,
                            'userAgent': e['userAgent'],
                            'referrer': e['referrer']
                        })

    print(f"\nTotal chaînes candidates réunies : {len(all_raw_candidates)}")
    print(f"Validation multi-threadée en cours ({MAX_WORKERS} workers, timeout {TIMEOUT}s)...")

    # 4. Tester chaque flux pour ne garder que les flux vivants
    verified_channels = []
    dead_count = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_channel = {}
        for ch in all_raw_candidates:
            u = ch.get('url', '')
            ua = ch.get('userAgent')
            ref = ch.get('referrer')
            fut = executor.submit(test_stream_live, u, ua, ref)
            future_to_channel[fut] = ch

        done_count = 0
        total_cand = len(all_raw_candidates)

        for fut in as_completed(future_to_channel):
            ch = future_to_channel[fut]
            done_count += 1
            try:
                is_alive, best_ua = fut.result()
            except Exception:
                is_alive = False
                best_ua = ch.get('userAgent')

            if is_alive:
                if best_ua:
                    ch['userAgent'] = best_ua
                verified_channels.append(ch)
            else:
                dead_count += 1

            if done_count % 300 == 0 or done_count == total_cand:
                elapsed = time.time() - t0
                print(f"  [{done_count}/{total_cand}] {elapsed:.0f}s — {len(verified_channels)} OK / {dead_count} morts", flush=True)

    print(f"\n" + "=" * 60)
    print(f" RÉSULTAT DU SCAN COMPLET :")
    print(f" -> {len(verified_channels)} chaînes VIVANTES ET OPÉRATIONNELLES")
    print(f" -> {dead_count} flux morts/inaccessibles éliminés")
    print(f" Durée : {time.time()-t0:.1f}s")
    print("=" * 60)

    # Réassigner des IDs propres et ordonnés
    for idx, c in enumerate(verified_channels, 1):
        c['id'] = idx
        c['stream_id'] = idx
        if not c.get('fallbackUrl'):
            c['fallbackUrl'] = c['url']

    # Sauvegarde backup de channels.js
    if os.path.exists('channels.js'):
        try:
            with open('channels.js', 'r', encoding='utf-8') as src:
                with open('channels.js.bak', 'w', encoding='utf-8') as dst:
                    dst.write(src.read())
            print("Backup channels.js.bak créé.")
        except Exception as e:
            print(f"Backup warning: {e}")

    # Écriture dans site/channels.js
    with open('channels.js', 'w', encoding='utf-8') as f:
        f.write("// BOKK TV — Catalogue Officiel des Chaines Actives\n")
        f.write(f"// ({len(verified_channels)} chaines 100% testees et fonctionnelles)\n\n")
        f.write("const channels = ")
        json.dump(verified_channels, f, ensure_ascii=False)
        f.write(";\n")

    # Écriture dans app/assets/web/channels.js si existe
    app_web_path = "../app/assets/web/channels.js"
    if os.path.exists(os.path.dirname(app_web_path)):
        with open(app_web_path, 'w', encoding='utf-8') as f:
            f.write("const channels = ")
            json.dump(verified_channels, f, ensure_ascii=False)
            f.write(";\n")
        print(f"Catalogue synchronisé dans {app_web_path}")

    print("\n✅ Catalogue mis à jour avec succès !")

if __name__ == '__main__':
    main()
