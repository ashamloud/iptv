#!/usr/bin/env python3
"""
BOKK TV — Moteur de synchronisation XMLTV officiel
Source: https://xmltvfr.fr/xmltv/xmltv.zip
Génère site/epg-data.js et site/epg_data.json pour affichage temps réel
du Guide TV (titre, description, heure début/fin, catégorie, affiche).
"""

import os
import sys
import io
import re
import json
import time
import zipfile
import shutil
import urllib.request
import xml.etree.ElementTree as ET
import unicodedata
from datetime import datetime, timedelta

XMLTV_URL = 'https://xmltvfr.fr/xmltv/xmltv.zip'
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(ROOT_DIR, 'site')
APP_ASSETS_DIR = os.path.join(ROOT_DIR, 'app', 'assets', 'web')
CACHE_ZIP = os.path.join(ROOT_DIR, 'xmltv_cache.zip')

# Chaînes majeures dont on conserve la grille complète sur 24h
TOP_PRIORITY_CHANNELS = {
    'TF1.fr', 'France2.fr', 'France3.fr', 'CanalPlus.fr', 'France5.fr', 'M6.fr', 'Arte.fr',
    'C8.fr', 'W9.fr', 'TMC.fr', 'NT1.fr', 'NRJ12.fr', 'LCP.fr', 'France4.fr', 'BFMTV.fr',
    'CNews.fr', 'CStar.fr', 'Gulli.fr', 'TF1SeriesFilms.fr', 'LEquipe21.fr', 'Numero23.fr',
    'RMCDecouverte.fr', 'Cherie25.fr', 'LCI.fr', 'Franceinfo.fr', 'ParisPremiere.fr', 'RTL9.fr',
    'TVBreizh.fr', 'Teva.fr', '13eRue.fr', 'Syfy.fr', 'AB1.fr', 'Action.fr',
    'CanalPlusCinema.fr', 'CanalPlusSport.fr', 'CanalPlusFoot.fr', 'CanalPlusSport360.fr',
    'CanalPlusBoxOffice.fr', 'CanalPlusGrandEcran.fr', 'CanalPlusDocs.fr', 'CanalPlusKids.fr',
    'CanalPlusSeries.fr', 'CanalPlusPopOuest.af', 'CanalPlusActionOuest.af',
    'beINSPORTS1.fr', 'beINSPORTS2.fr', 'beINSPORTS3.fr', 'beINSPORTSMAX4.fr', 'beINSPORTSMAX5.fr',
    'beINSPORTSMAX6.fr', 'beINSPORTSMAX7.fr', 'beINSPORTSMAX8.fr', 'beINSPORTSMAX9.fr', 'beINSPORTSMAX10.fr',
    'RMCSport1.fr', 'RMCSport2.fr', 'Eurosport1.fr', 'Eurosport2.fr', 'Automoto.fr', 'Equidia.fr',
    '2STV.sn', 'TFM.af', 'WALFTV.sn', 'RTS1.sn', 'RTS2.sn', 'RTI1.ci', 'RTI2.ci', 'Africa24.af',
    'TraceAfrica.fr', 'TraceUrban.fr', 'TraceGospel.fr', 'M6Music.fr', 'MCM.fr',
    'NationalGeographic.fr', 'NatGeoWild.fr', 'PlanetePlus.fr', 'UshuaiaTV.fr', 'Histoire.fr',
    'DiscoveryFrance.fr', 'DisneyChannel.fr', 'CartoonNetwork.fr', 'Nickelodeon.fr', 'Boomerang.fr',
    'Euronews.fr', 'France24.fr', 'TV5Monde.fr'
}


def normalize_key(s):
    """Normalise un nom de chaîne pour recherche insensible à la casse et aux accents."""
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('utf-8').lower()
    return re.sub(r'[^a-z0-9]', '', s)


def clean_channel_name(name):
    """Épure le nom d'une chaîne IPTV de ses suffixes de qualité et pays."""
    norm = normalize_key(name)
    cleaned = re.sub(r'(1080p|720p|576p|fhd|uhd|4k|hd|hevc|h265|fr|fra|vip|raw|direct|tv|senegal|sn|ci|af)$', '', norm)
    return cleaned or norm


def download_xmltv(force=False):
    """Télécharge xmltv.zip avec vérification de cache (< 12 heures)."""
    if not force and os.path.exists(CACHE_ZIP):
        mtime = os.path.getmtime(CACHE_ZIP)
        age_hours = (time.time() - mtime) / 3600.0
        if age_hours < 12.0 and os.path.getsize(CACHE_ZIP) > 1000000:
            print(f"[BOKK EPG] Cache XMLTV récent disponible ({age_hours:.1f}h). Téléchargement ignoré.")
            return True

    print(f"[BOKK EPG] Téléchargement du guide XMLTV ({XMLTV_URL})...")
    req = urllib.request.Request(XMLTV_URL, headers={'User-Agent': 'BOKK-TV-EPG/1.0 (iptv)'})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
            with open(CACHE_ZIP, 'wb') as f:
                f.write(data)
        print(f"[BOKK EPG] Téléchargement terminé : {len(data) / 1024 / 1024:.2f} Mo.")
        return True
    except Exception as e:
        print(f"[BOKK EPG] Erreur lors du téléchargement : {e}")
        return os.path.exists(CACHE_ZIP)


def parse_and_generate():
    """Parse xmltv.xml et génère la base EPG optimisée pour BOKK TV."""
    if not os.path.exists(CACHE_ZIP):
        print("[BOKK EPG] Fichier xmltv_cache.zip introuvable.")
        return False

    t0 = time.time()
    now = datetime.now()

    # Fenêtre pour le direct + prochain programme (-2h à +6h)
    win_live_start = (now - timedelta(hours=2)).strftime('%Y%m%d%H%M%S')
    win_live_end   = (now + timedelta(hours=6)).strftime('%Y%m%d%H%M%S')

    # Fenêtre pour la grille 24h (-4h à +24h)
    win_day_start  = (now - timedelta(hours=4)).strftime('%Y%m%d%H%M%S')
    win_day_end    = (now + timedelta(hours=24)).strftime('%Y%m%d%H%M%S')

    channels_meta = {}
    channel_aliases = {}
    epg_live = {}
    epg_schedules = {}

    print("[BOKK EPG] Analyse du fichier XMLTV...")

    with zipfile.ZipFile(CACHE_ZIP) as z:
        with z.open('xmltv.xml') as f:
            context = ET.iterparse(f, events=('end',))
            for event, elem in context:
                if elem.tag == 'channel':
                    cid = elem.get('id', '')
                    dname_el = elem.find('display-name')
                    icon_el = elem.find('icon')

                    name = dname_el.text.strip() if dname_el is not None and dname_el.text else cid
                    icon_url = icon_el.get('src', '') if icon_el is not None else ''

                    norm_name = normalize_key(name)
                    clean_name = clean_channel_name(name)

                    channels_meta[cid] = {
                        'id': cid,
                        'name': name,
                        'icon': icon_url
                    }

                    # Indexation des alias pour recherche O(1)
                    channel_aliases[norm_name] = cid
                    channel_aliases[clean_name] = cid
                    clean_cid = re.sub(r'\.(fr|sn|ci|af|be|ch|de|ma|ar|es|it)$', '', cid, flags=re.IGNORECASE)
                    channel_aliases[normalize_key(clean_cid)] = cid

                    elem.clear()

                elif elem.tag == 'programme':
                    cid = elem.get('channel', '')
                    start = elem.get('start', '').split(' ')[0]
                    stop = elem.get('stop', '').split(' ')[0]

                    if start and stop and (start <= win_day_end and stop >= win_day_start):
                        title_el = elem.find('title')
                        desc_el = elem.find('desc')
                        cat_el = elem.find('category')
                        icon_el = elem.find('icon')

                        title = title_el.text.strip() if title_el is not None and title_el.text else 'Programme'
                        desc = desc_el.text.strip()[:140] if desc_el is not None and desc_el.text else ''
                        cat = cat_el.text.strip() if cat_el is not None and cat_el.text else ''
                        icon = icon_el.get('src', '') if icon_el is not None else ''

                        s_hhmm = f"{start[8:10]}:{start[10:12]}" if len(start) >= 12 else ''
                        e_hhmm = f"{stop[8:10]}:{stop[10:12]}" if len(stop) >= 12 else ''

                        prog = {
                            's': start[:12],
                            'e': stop[:12],
                            'st': s_hhmm,
                            'et': e_hhmm,
                            't': title,
                            'd': desc,
                            'c': cat,
                            'img': icon
                        }

                        # Enregistrement dans les grilles 24h pour les chaînes prioritaires
                        if cid in TOP_PRIORITY_CHANNELS:
                            if cid not in epg_schedules:
                                epg_schedules[cid] = []
                            epg_schedules[cid].append(prog)

                        # Enregistrement dans le direct
                        if start <= win_live_end and stop >= win_live_start:
                            if cid not in epg_live:
                                epg_live[cid] = []
                            if len(epg_live[cid]) < 3:
                                epg_live[cid].append(prog)

                    elem.clear()

    # Indexer également les chaînes BOKK TV de site/channels.js pour couvrir les noms personnalisés
    channels_js_path = os.path.join(SITE_DIR, 'channels.js')
    if os.path.exists(channels_js_path):
        try:
            with open(channels_js_path, 'r', encoding='utf-8', errors='ignore') as fjs:
                txt = fjs.read()
                names = re.findall(r'"name":\s*"([^"]+)"', txt)
                for ch_name in names:
                    norm = normalize_key(ch_name)
                    cleaned = clean_channel_name(ch_name)
                    # Si déjà résolu
                    if norm not in channel_aliases:
                        # Chercher correspondance
                        matched_id = channel_aliases.get(cleaned)
                        if matched_id:
                            channel_aliases[norm] = matched_id
        except Exception:
            pass

    # Aliases manuels clés garantis
    MANUAL_ALIASES = {
        'tf1': 'TF1.fr',
        'france2': 'France2.fr',
        'france3': 'France3.fr',
        'canal': 'CanalPlus.fr',
        'canalplus': 'CanalPlus.fr',
        'france5': 'France5.fr',
        'm6': 'M6.fr',
        'arte': 'Arte.fr',
        'c8': 'C8.fr',
        'w9': 'W9.fr',
        'tmc': 'TMC.fr',
        'tfx': 'NT1.fr',
        'nrj12': 'NRJ12.fr',
        'lcp': 'LCP.fr',
        'france4': 'France4.fr',
        'bfmtv': 'BFMTV.fr',
        'bfm': 'BFMTV.fr',
        'cnews': 'CNews.fr',
        'cstar': 'CStar.fr',
        'gulli': 'Gulli.fr',
        'tf1seriesfilms': 'TF1SeriesFilms.fr',
        'lequipe': 'LEquipe21.fr',
        'lequipe21': 'LEquipe21.fr',
        '6ter': '6ter.fr',
        'rmcstory': 'Numero23.fr',
        'numero23': 'Numero23.fr',
        'rmcdecouverte': 'RMCDecouverte.fr',
        'cherie25': 'Cherie25.fr',
        'lci': 'LCI.fr',
        'franceinfo': 'Franceinfo.fr',
        'canalpluscinema': 'CanalPlusCinema.fr',
        'canalcinema': 'CanalPlusCinema.fr',
        'canalplussport': 'CanalPlusSport.fr',
        'canalsport': 'CanalPlusSport.fr',
        'canalplusfoot': 'CanalPlusFoot.fr',
        'canalfoot': 'CanalPlusFoot.fr',
        'canalplussport360': 'CanalPlusSport360.fr',
        'canalplusboxoffice': 'CanalPlusBoxOffice.fr',
        'canalplusgrandecran': 'CanalPlusGrandEcran.fr',
        'canalplusdocs': 'CanalPlusDocs.fr',
        'canalpluskids': 'CanalPlusKIDS.fr',
        'canalplusseries': 'CanalPlusSeries.fr',
        'canalpluspop': 'CanalPlusPopOuest.af',
        'canalplusaction': 'CanalPlusActionOuest.af',
        'beinsports1': 'beINSPORTS1.fr',
        'bein1': 'beINSPORTS1.fr',
        'beinsports2': 'beINSPORTS2.fr',
        'bein2': 'beINSPORTS2.fr',
        'beinsports3': 'beINSPORTS3.fr',
        'bein3': 'beINSPORTS3.fr',
        'rmcsport1': 'RMCSport1.fr',
        'rmcsport2': 'RMCSport2.fr',
        'eurosport1': 'Eurosport1.fr',
        'eurosport2': 'Eurosport2.fr',
        '2stv': '2STV.sn',
        'tfm': 'TFM.af',
        'walftv': 'WALFTV.sn',
        'walf': 'WALFTV.sn',
        'rts1': 'RTS1.sn',
        'rts2': 'RTS2.sn',
        'rts': 'RTS1.sn',
        'traceafrica': 'TraceAfrica.fr',
        'traceurban': 'TraceUrban.fr'
    }

    for k, v in MANUAL_ALIASES.items():
        channel_aliases[k] = v

    # Construction du paquet final
    final_payload = {
        'updated_at': now.isoformat(),
        'aliases': channel_aliases,
        'channels': channels_meta,
        'live': epg_live,
        'schedules': epg_schedules
    }

    # 1. Sauvegarde en JSON
    json_path = os.path.join(SITE_DIR, 'epg_data.json')
    json_str = json.dumps(final_payload, ensure_ascii=False, separators=(',', ':'))
    with open(json_path, 'w', encoding='utf-8') as f:
        f.write(json_str)

    # 2. Sauvegarde en fichier JavaScript direct pour compatibilité statique & Vercel
    js_path = os.path.join(SITE_DIR, 'epg-data.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("/** BOKK TV — Base de Données EPG Temps Réel XMLTV **/\n")
        f.write("var BOKK_EPG_DATABASE = ")
        f.write(json_str)
        f.write(";\n")
        f.write("if (typeof window !== 'undefined') window.BOKK_EPG_DATABASE = BOKK_EPG_DATABASE;\n")
        f.write("if (typeof globalThis !== 'undefined') globalThis.BOKK_EPG_DATABASE = BOKK_EPG_DATABASE;\n")

    # 3. Synchronisation avec app/assets/web/
    if os.path.isdir(APP_ASSETS_DIR):
        shutil.copy2(json_path, os.path.join(APP_ASSETS_DIR, 'epg_data.json'))
        shutil.copy2(js_path, os.path.join(APP_ASSETS_DIR, 'epg-data.js'))

    t1 = time.time()
    size_kb = len(json_str.encode('utf-8')) / 1024.0
    print(f"[BOKK EPG] Succès ! {len(epg_live)} chaînes avec direct, {len(epg_schedules)} grilles 24h complètes.")
    print(f"[BOKK EPG] Taille générée : {size_kb:.1f} Ko en {t1 - t0:.2f} secondes.")
    return True


if __name__ == '__main__':
    force_download = '--force' in sys.argv
    download_xmltv(force=force_download)
    parse_and_generate()
