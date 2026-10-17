#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOKK TV — Script de compilation des chaînes IPTV
Combine l'abonnement MegaTV (7 341 flux) et TOUTES les chaînes de la playlist Francophone
IPTV-Org (https://iptv-org.github.io/iptv/languages/fra.m3u) sans exception,
avec résolution intelligente des flux et référencement des Referer/User-Agent.
"""

import urllib.request
import json
import re
import sys
import os

SERVER_BASE = "http://megatv5074.com:80"
USERNAME = "81NQAFA7Q5S4188"
PASSWORD = "JWyIZeiu08"
FRA_M3U_URL = "https://iptv-org.github.io/iptv/languages/fra.m3u"
HEADERS = {'User-Agent': 'VLC/3.0.18'}

print("[1/5] Téléchargement des catégories MegaTV...")
req_cats = urllib.request.Request(
    f"{SERVER_BASE}/player_api.php?username={USERNAME}&password={PASSWORD}&action=get_live_categories",
    headers=HEADERS
)
with urllib.request.urlopen(req_cats, timeout=30) as r:
    cats_data = json.loads(r.read().decode('utf-8'))
cat_by_id = {str(c['category_id']): c['category_name'].strip() for c in cats_data}
print(f" -> {len(cat_by_id)} catégories MegaTV trouvées.")

print("[2/5] Téléchargement des flux en direct MegaTV...")
req_streams = urllib.request.Request(
    f"{SERVER_BASE}/player_api.php?username={USERNAME}&password={PASSWORD}&action=get_live_streams",
    headers=HEADERS
)
with urllib.request.urlopen(req_streams, timeout=60) as r:
    streams_data = json.loads(r.read().decode('utf-8'))
print(f" -> {len(streams_data)} flux en direct MegaTV récupérés.")

print("[3/5] Téléchargement de la playlist Francophone complète (fra.m3u)...")
req_fra = urllib.request.Request(FRA_M3U_URL, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req_fra, timeout=30) as r:
    fra_raw = r.read().decode('utf-8')

def extract_badge(name):
    u = name.upper()
    if '4K' in u: return '4K'
    if 'UHD' in u: return 'UHD'
    if 'FHD' in u or '1080' in u: return 'FHD'
    if 'HEVC' in u or 'H.265' in u: return 'HEVC'
    if 'HD' in u or '720' in u: return 'HD'
    if 'SD' in u or '576' in u or '480' in u or '360' in u: return 'SD'
    return 'HD'

def classify_megatv(cname, name):
    cn = cname.upper()
    if any(k in cn for k in ['SPORT', 'DAZN', 'FOOT', 'LALIGA', 'PREMIER LEAGUE', 'CHAMPIONSHIP', 'RACING', 'UFC', 'RUGBY', 'DARTS', 'DIRTVISION', 'SETANTA', 'VIAPLAY', 'SPFL']):
        return 'sport'
    if any(k in cn for k in ['CINÉMA', 'FILM', 'SERIE', 'CINE', 'ESTRENOS', 'MOVIES']):
        return 'cinema'
    if any(k in cn for k in ['ENFANT', 'KIDS', 'KINDER', 'FËMIJË', 'NIÑOS', 'BAMBINI', 'DJECIJI']):
        return 'jeunesse'
    if any(k in cn for k in ['DOCU', 'NEWS', 'LAJME']):
        return 'documentaire'
    if any(k in cn for k in ['MUZIK', 'MUSIC', 'RADIO']):
        return 'music'
    if any(k in cn for k in ['FR |', 'CARAÏBES', 'RÉUNION', 'FRANÇAIS']):
        return 'francophone'
    if 'UK |' in cn:
        return 'uk'
    if 'ES |' in cn:
        return 'espagne'
    if 'DE |' in cn or 'AUSTRIA' in cn:
        return 'allemagne'
    if 'IT |' in cn:
        return 'italie'
    if 'ALB |' in cn:
        return 'albanie'
    if 'EXYU |' in cn:
        return 'exyu'
    return 'international'

def detect_country_megatv(cname):
    cn = cname.upper()
    if 'FR |' in cn or 'CARAÏBES' in cn or 'RÉUNION' in cn: return 'FR'
    if 'UK |' in cn: return 'UK'
    if 'ES |' in cn: return 'ES'
    if 'DE |' in cn or 'AUSTRIA' in cn: return 'DE'
    if 'IT |' in cn: return 'IT'
    if 'ALB |' in cn: return 'AL'
    if 'EXYU |' in cn: return 'EXYU'
    if 'SWISS' in cn: return 'CH'
    return 'INT'

def classify_fra_group(group, name):
    g = group.lower()
    n = name.lower()
    if 'sport' in g or 'sport' in n:
        return 'sport'
    if any(k in g for k in ['movie', 'series', 'cinema', 'cinéma', 'film']) or any(k in n for k in ['cinema', 'film', 'série', 'serie']):
        return 'cinema'
    if any(k in g for k in ['kid', 'animation', 'enfant', 'jeunesse']):
        return 'jeunesse'
    if any(k in g for k in ['music', 'musique']):
        return 'music'
    if any(k in g for k in ['doc', 'news', 'info', 'actualité', 'legislative', 'business']):
        return 'documentaire'
    return 'francophone'

def format_fra_bouquet(group):
    g = group.lower()
    if 'general' in g:
        return '🇫🇷 France TNT & Général'
    if 'news' in g:
        return '🇫🇷 France & Info Direct'
    if 'music' in g:
        return '🇫🇷 Musique Francophone'
    if 'entertainment' in g:
        return '🇫🇷 Divertissement FR'
    if 'religious' in g:
        return '🇫🇷 Chaînes Religieuses FR'
    if 'movie' in g or 'series' in g:
        return '🇫🇷 Cinéma & Séries FR'
    if 'kid' in g or 'animation' in g:
        return '🇫🇷 Jeunesse FR'
    if 'sport' in g:
        return '🇫🇷 Sport Francophone'
    if 'doc' in g:
        return '🇫🇷 Documentaires & Découverte'
    if 'culture' in g:
        return '🇫🇷 Culture & Savoir'
    if 'lifestyle' in g:
        return '🇫🇷 Art de Vivre & Lifestyle'
    return f'🇫🇷 France Web & TNT ({group.split(";")[0].strip()})'

def detect_fra_country(tvg_id):
    m = re.search(r'\.([a-z]{2})@', tvg_id.lower())
    if m:
        c = m.group(1).upper()
        if c in ['FR', 'BE', 'CH', 'CA', 'CI', 'SN', 'MA', 'TN', 'DZ', 'CM']:
            return c
    return 'FR'

def norm_name(n):
    n = re.sub(r'^(FR|CH|BE|EU)\s*[-:]\s*', '', n, flags=re.IGNORECASE)
    n = re.sub(r'\s*(FHD|UHD|HD|SD|4K|HEVC|H\.265|\(1080p\)|\(720p\)|◉|²|\[.*?\]).*$', '', n, flags=re.IGNORECASE)
    return re.sub(r'[^a-z0-9]', '', n.lower())

print("[4/5] Traitement et fusion intégrale des catalogues...")
all_channels = []
used_ids = set()
megatv_map = {}

# 1. Ajout de TOUTES les chaînes MegaTV (7 341)
for s in streams_data:
    sid = s.get('stream_id')
    while sid in used_ids:
        sid += 10000000
    used_ids.add(sid)

    raw_name = s.get('name', '').strip()
    cat_id = str(s.get('category_id', ''))
    group_name = cat_by_id.get(cat_id, 'MegaTV')
    
    category = classify_megatv(group_name, raw_name)
    country = detect_country_megatv(group_name)
    badge = extract_badge(raw_name)
    logo = s.get('stream_icon') or ''

    stream_url = f"{SERVER_BASE}/live/{USERNAME}/{PASSWORD}/{s['stream_id']}.ts"
    fallback_url = f"{SERVER_BASE}/live/{USERNAME}/{PASSWORD}/{s['stream_id']}.m3u8"

    ch_obj = {
        "id": sid,
        "stream_id": s['stream_id'],
        "name": raw_name,
        "category": category,
        "group": group_name,
        "country": country,
        "badge": badge,
        "desc": group_name,
        "logo": logo,
        "url": stream_url,
        "fallbackUrl": fallback_url,
        "type": "ts"
    }
    all_channels.append(ch_obj)

    # Indexation pour fallback des chaînes françaises
    if country in ['FR', 'CH', 'BE']:
        nk = norm_name(raw_name)
        if nk and nk not in megatv_map:
            megatv_map[nk] = ch_obj

megatv_count = len(all_channels)
print(f" -> {megatv_count} chaînes MegaTV préparées.")

# 2. Ajout de TOUTES les chaînes Francophones depuis fra.m3u sans exception
fra_lines = fra_raw.splitlines()
cur_extinf = {}
fra_added = 0

for line in fra_lines:
    line = line.strip()
    if line.startswith('#EXTINF:'):
        cur_extinf = {}
        m_name = re.search(r',([^,]+)$', line)
        cur_extinf['raw_name'] = m_name.group(1).strip() if m_name else 'Chaîne Francophone'
        
        m_logo = re.search(r'tvg-logo="([^"]+)"', line)
        cur_extinf['logo'] = m_logo.group(1) if m_logo else ''
        
        m_group = re.search(r'group-title="([^"]+)"', line)
        cur_extinf['group'] = m_group.group(1) if m_group else 'Général'
        
        m_id = re.search(r'tvg-id="([^"]+)"', line)
        cur_extinf['tvg_id'] = m_id.group(1) if m_id else ''

        m_ref = re.search(r'http-referrer="([^"]+)"', line)
        if m_ref: cur_extinf['referrer'] = m_ref.group(1).strip()
        
        m_ua = re.search(r'http-user-agent="([^"]+)"', line)
        if m_ua: cur_extinf['userAgent'] = m_ua.group(1).strip()
        
    elif line.startswith('#EXTVLCOPT:'):
        if 'http-referrer=' in line:
            cur_extinf['referrer'] = line.split('http-referrer=', 1)[1].strip()
        elif 'http-user-agent=' in line:
            cur_extinf['userAgent'] = line.split('http-user-agent=', 1)[1].strip()
            
    elif line.startswith('http'):
        if cur_extinf:
            url = line
            raw_name = cur_extinf.get('raw_name', '')
            tvg_id = cur_extinf.get('tvg_id', '')
            group = cur_extinf.get('group', 'Général')
            logo = cur_extinf.get('logo', '')
            referrer = cur_extinf.get('referrer', '')
            user_agent = cur_extinf.get('userAgent', '')
            
            # Nettoyer légèrement le nom pour un affichage soigné
            clean_name = re.sub(r'\s*\(\d+p\)', '', raw_name)
            clean_name = re.sub(r'\s*\[.*?\]', '', clean_name).strip()
            if not clean_name:
                clean_name = raw_name
            
            badge = extract_badge(raw_name)
            category = classify_fra_group(group, clean_name)
            bouquet = format_fra_bouquet(group)
            country = detect_fra_country(tvg_id)
            
            # Détection et assignation automatique au bouquet Sénégal
            if country == 'SN' or 'senegal' in clean_name.lower() or '.sn@' in tvg_id.lower() or 'seneweb' in clean_name.lower():
                category = 'senegal'
                bouquet = '🇸🇳 Sénégal'
                country = 'SN'

            # Éviter doublons avec le bouquet officiel sénégalais pré-intégré
            is_dup_sn = any(
                clean_name.lower() in existing_sn['name'].lower() or existing_sn['name'].lower() in clean_name.lower()
                for existing_sn in senegal_channels
            ) if 'senegal_channels' in locals() else False

            if is_dup_sn:
                continue

            fra_id = 8000000 + fra_added
            while fra_id in used_ids:
                fra_id += 1
            used_ids.add(fra_id)

            # Recherche d'un flux MegaTV de secours correspondant
            nk = norm_name(clean_name)
            megatv_match = megatv_map.get(nk)
            
            # Détection d'adresses IP obsolètes ou de flux multicast UDP injouables
            is_dead_ip = any(bad in url for bad in [
                '151.80.18.177', '145.239.5.177', '85.14.32.26:8800',
                'guineetvdirect.online', 'ssh101stream'
            ])

            if is_dead_ip and megatv_match:
                # Si le lien IPTV-Org est une IP pirate morte, utiliser le flux MegaTV officiel actif en direct
                stream_url = megatv_match['url']
                fallback_url = url
                stream_type = "ts"
            else:
                stream_url = url
                fallback_url = megatv_match['url'] if megatv_match else url
                stream_type = "hls"

            new_ch = {
                "id": fra_id,
                "stream_id": fra_id,
                "name": clean_name,
                "raw_name": raw_name,
                "category": category,
                "group": bouquet,
                "country": country,
                "badge": badge,
                "desc": f"IPTV Francophone • {group}",
                "logo": logo,
                "url": stream_url,
                "fallbackUrl": fallback_url,
                "type": stream_type
            }
            if referrer:
                new_ch['referrer'] = referrer
            if user_agent:
                new_ch['userAgent'] = user_agent

            all_channels.append(new_ch)
            fra_added += 1
            cur_extinf = {}

print(f" -> {fra_added} chaînes francophones ajoutées depuis fra.m3u (TOUTES sans exception).")

# 3. Ajout du Bouquet Officiel du Sénégal
print("[4.5/5] Intégration du Bouquet National du Sénégal (RTS, SEN TV, etc.)...")
senegal_channels = [
    {
        "id": 9000001,
        "stream_id": 9000001,
        "name": "RTS 1 Sénégal (Officiel HD)",
        "raw_name": "RTS 1 Sénégal (Officiel HD)",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "1080p",
        "desc": "Télévision Nationale Sénégalaise (Officiel HD 1080p)",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_RTS_1.png/800px-Logo_RTS_1.png",
        "url": "rts1",
        "fallbackUrl": "rts1",
        "type": "hls"
    },
    {
        "id": 9000002,
        "stream_id": 9000002,
        "name": "RTS 2 Sénégal (Officiel HD)",
        "raw_name": "RTS 2 Sénégal (Officiel HD)",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Deuxième chaîne publique nationale",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Logo_RTS_2.png/800px-Logo_RTS_2.png",
        "url": "rts2",
        "fallbackUrl": "rts2",
        "type": "hls"
    },
    {
        "id": 9000003,
        "stream_id": 9000003,
        "name": "RTS 4 Sénégal (Officiel)",
        "raw_name": "RTS 4 Sénégal (Officiel)",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne thématique RTS 4",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_RTS_1.png/800px-Logo_RTS_1.png",
        "url": "rts4",
        "fallbackUrl": "rts4",
        "type": "hls"
    },
    {
        "id": 9000004,
        "stream_id": 9000004,
        "name": "RTS 5 Sénégal (Officiel)",
        "raw_name": "RTS 5 Sénégal (Officiel)",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne thématique RTS 5",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_RTS_1.png/800px-Logo_RTS_1.png",
        "url": "rts5",
        "fallbackUrl": "rts5",
        "type": "hls"
    },
    {
        "id": 9000005,
        "stream_id": 9000005,
        "name": "SEN TV Sénégal (Officiel 1080p)",
        "raw_name": "SEN TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "1080p",
        "desc": "Grande chaîne privée généraliste sénégalaise",
        "logo": "https://i.imgur.com/uR1dZ6A.png",
        "url": "sentv",
        "fallbackUrl": "sentv",
        "type": "hls"
    },
    {
        "id": 9000006,
        "stream_id": 9000006,
        "name": "A2i TV Sénégal",
        "raw_name": "A2i TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "1080p",
        "desc": "Chaîne de télévision privée sénégalaise",
        "logo": "https://i.imgur.com/YlDFir7.jpg",
        "url": "https://stream.sen-gt.com/A2itv/myStream/playlist.m3u8",
        "fallbackUrl": "https://stream.sen-gt.com/A2itv/myStream/playlist.m3u8",
        "type": "hls"
    },
    {
        "id": 9000007,
        "stream_id": 9000007,
        "name": "A2i Music Sénégal",
        "raw_name": "A2i Music Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Musique et culture sénégalaise",
        "logo": "https://i.imgur.com/Fykhzxh.jpg",
        "url": "https://stream.sen-gt.com/A2iMusic/myStream/playlist.m3u8",
        "fallbackUrl": "https://stream.sen-gt.com/A2iMusic/myStream/playlist.m3u8",
        "type": "hls"
    },
    {
        "id": 9000008,
        "stream_id": 9000008,
        "name": "A2i Religion Sénégal",
        "raw_name": "A2i Religion Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne religieuse sénégalaise",
        "logo": "https://i.imgur.com/54WrwyN.jpg",
        "url": "https://stream.sen-gt.com/A2iReligion/myStream/playlist.m3u8",
        "fallbackUrl": "https://stream.sen-gt.com/A2iReligion/myStream/playlist.m3u8",
        "type": "hls"
    },
    {
        "id": 9000009,
        "stream_id": 9000009,
        "name": "Amani TV Sénégal",
        "raw_name": "Amani TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "1080p",
        "desc": "Chaîne sénégalaise culturelle",
        "logo": "https://i.imgur.com/0cY4K7G.png",
        "url": "https://goccn.cloud/hls/amanitv/index.m3u8",
        "fallbackUrl": "https://goccn.cloud/hls/amanitv/index.m3u8",
        "type": "hls"
    },
    {
        "id": 9000010,
        "stream_id": 9000010,
        "name": "Diaspora 24 Sénégal",
        "raw_name": "Diaspora 24 Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne d'information de la diaspora sénégalaise",
        "logo": "https://i.imgur.com/4devfx1.png",
        "url": "https://vdo3.pro-fhi.net:3218/stream/play.m3u8",
        "fallbackUrl": "https://vdo3.pro-fhi.net:3218/stream/play.m3u8",
        "type": "hls"
    },
    {
        "id": 9000011,
        "stream_id": 9000011,
        "name": "GMS TV Sénégal",
        "raw_name": "GMS TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne d'actualité et d'information sénégalaise",
        "logo": "https://i.imgur.com/Ue02CIH.png",
        "url": "https://acasmedia6.acangroup.org/gmstv/gmstv_output/playlist.m3u8",
        "fallbackUrl": "https://acasmedia6.acangroup.org/gmstv/gmstv_output/playlist.m3u8",
        "type": "hls"
    },
    {
        "id": 9000012,
        "stream_id": 9000012,
        "name": "Louga TV Sénégal",
        "raw_name": "Louga TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne régionale de Louga",
        "logo": "https://i.ibb.co/xXZ5kFy/unnamed.jpg",
        "url": "https://stream.sen-gt.com/Mbacke/myStream/playlist.m3u8",
        "fallbackUrl": "https://stream.sen-gt.com/Mbacke/myStream/playlist.m3u8",
        "type": "hls"
    },
    {
        "id": 9000013,
        "stream_id": 9000013,
        "name": "Seneweb TV Sénégal",
        "raw_name": "Seneweb TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Premier portail d'actualité au Sénégal en direct",
        "logo": "https://i.imgur.com/i9P2qjs.png",
        "url": "https://vdo2.pro-fhi.net:3297/stream/play.m3u8",
        "fallbackUrl": "https://vdo2.pro-fhi.net:3297/stream/play.m3u8",
        "type": "hls"
    },
    {
        "id": 9000014,
        "stream_id": 9000014,
        "name": "SenJeunes TV Sénégal",
        "raw_name": "SenJeunes TV Sénégal",
        "category": "senegal",
        "group": "🇸🇳 Sénégal",
        "country": "SN",
        "badge": "HD",
        "desc": "Chaîne de la jeunesse sénégalaise",
        "logo": "https://i.imgur.com/MeCSPsI.jpg",
        "url": "https://stream.sen-gt.com/senjeunestv/myStream/playlist.m3u8",
        "fallbackUrl": "https://stream.sen-gt.com/senjeunestv/myStream/playlist.m3u8",
        "type": "hls"
    }
]

for sc in senegal_channels:
    all_channels.append(sc)

print(f" -> {len(senegal_channels)} chaînes officielles sénégalaises intégrées.")
print(f"Total absolu de chaînes combinées : {len(all_channels)}")

# [5/5] Écriture dans channels.js
print("[5/5] Écriture du fichier channels.js...")
site_dir = os.path.dirname(os.path.abspath(__file__))
channels_js_path = os.path.join(site_dir, 'channels.js')

out_code = f"""// BOKK TV — Catalogue Officiel des Chaînes
// Source 1 : MegaTV Premium ({megatv_count} chaînes)
// Source 2 : IPTV-Org Francophone ({fra_added} chaînes)
// Total chaînes combinées sans exception : {len(all_channels)}

const channels = {json.dumps(all_channels, ensure_ascii=False, indent=2)};
"""

with open(channels_js_path, 'w', encoding='utf-8') as f:
    f.write(out_code)

print(f"Fichier channels.js généré avec succès ({os.path.getsize(channels_js_path):,} octets) !")
