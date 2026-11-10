#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOKK TV — Auto-Updater Matchs & Événements Sportifs À VENIR
Récupère les rencontres officielles en temps réel (ESPN Sports API)
Strictement AUCUN match passé — Uniquement les matchs en direct et les prochains rendez-vous.
"""

import os
import json
import time
import datetime
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(ROOT_DIR, 'site')
APP_WEB_DIR = os.path.join(ROOT_DIR, 'app', 'assets', 'web')

LEAGUES = [
    {'slug': 'uefa.champions', 'name': 'UEFA Champions League', 'badge': 'CHAMPIONS LEAGUE'},
    {'slug': 'uefa.europa',    'name': 'UEFA Europa League',    'badge': 'EUROPA LEAGUE'},
    {'slug': 'fra.1',          'name': 'Ligue 1',               'badge': 'LIGUE 1'},
    {'slug': 'esp.1',          'name': 'LaLiga',                'badge': 'LALIGA'},
    {'slug': 'eng.1',          'name': 'Premier League',        'badge': 'PREMIER LEAGUE'},
    {'slug': 'ita.1',          'name': 'Serie A',               'badge': 'SERIE A'},
    {'slug': 'ger.1',          'name': 'Bundesliga',            'badge': 'BUNDESLIGA'},
]

POSTERS = {
    'UEFA Champions League': 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1400&q=80',
    'UEFA Europa League':    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=80',
    'Ligue 1':               'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80',
    'LaLiga':                'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=80',
    'Premier League':        'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=80',
    'Serie A':               'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80',
    'Bundesliga':            'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1400&q=80',
}

CHANNELS_MAP = {
    'UEFA Champions League': [
        {'id': 3713, 'name': 'Canal+ Foot HD',     'badge': 'FHD', 'quality': '1080p'},
        {'id': 3724, 'name': 'beIN Sports 1 AR',   'badge': 'FHD', 'quality': '1080p'},
        {'id': 3704, 'name': 'M+ Liga Campeones',  'badge': 'FHD', 'quality': '1080p'},
        {'id': 3712, 'name': 'Canal+ 360',         'badge': 'HD',  'quality': '720p'}
    ],
    'UEFA Europa League': [
        {'id': 3713, 'name': 'Canal+ Foot HD',     'badge': 'FHD', 'quality': '1080p'},
        {'id': 3725, 'name': 'beIN Sports 2 HD AR','badge': 'FHD', 'quality': '1080p'}
    ],
    'LaLiga': [
        {'id': 5293, 'name': 'DAZN LaLiga 4K',     'badge': '4K UHD', 'quality': '4K'},
        {'id': 3724, 'name': 'beIN Sports 1 AR',   'badge': 'FHD', 'quality': '1080p'},
        {'id': 5245, 'name': 'M+ LaLiga 4K',       'badge': '4K UHD', 'quality': '4K'},
        {'id': 3713, 'name': 'Canal+ Foot HD',     'badge': 'FHD', 'quality': '1080p'}
    ],
    'Ligue 1': [
        {'id': 3713, 'name': 'Canal+ Foot HD',     'badge': 'FHD', 'quality': '1080p'},
        {'id': 3724, 'name': 'beIN Sports 1 AR',   'badge': 'FHD', 'quality': '1080p'},
        {'id': 148,  'name': 'Canal+ Sport 360',   'badge': 'HD',  'quality': '720p'}
    ],
    'Premier League': [
        {'id': 2774, 'name': 'Canal+ Premier League','badge': 'FHD', 'quality': '1080p'},
        {'id': 3724, 'name': 'beIN Sports 1 HD AR',  'badge': 'FHD', 'quality': '1080p'},
        {'id': 3713, 'name': 'Canal+ Foot HD',       'badge': 'FHD', 'quality': '1080p'}
    ],
    'Serie A': [
        {'id': 3724, 'name': 'beIN Sports 1 HD AR', 'badge': 'FHD', 'quality': '1080p'},
        {'id': 3725, 'name': 'beIN Sports 2 HD AR', 'badge': 'FHD', 'quality': '1080p'}
    ],
    'Bundesliga': [
        {'id': 3725, 'name': 'beIN Sports 2 HD AR', 'badge': 'FHD', 'quality': '1080p'},
        {'id': 3713, 'name': 'Canal+ Foot HD',      'badge': 'FHD', 'quality': '1080p'}
    ],
    'default': [
        {'id': 3713, 'name': 'Canal+ Foot HD',     'badge': 'FHD', 'quality': '1080p'},
        {'id': 3724, 'name': 'beIN Sports 1 AR',   'badge': 'FHD', 'quality': '1080p'}
    ]
}

# GRANDS RENDEZ-VOUS À VENIR (Strictement futurs : 11 nov, 12 nov, 13 nov, 14 nov, 15 nov, 22 nov)
CURATED_EVENTS = [
    {
        "id": "match-maroc-ci",
        "title": "Maroc vs Côte d'Ivoire",
        "competition": "Choc Africain • Amicaux Internationaux",
        "competitionBadge": "CHOC DES LIONS",
        "category": "football",
        "stage": "Lions de l'Atlas vs Éléphants de Côte d'Ivoire",
        "date": "Mer. 11 Nov.",
        "time": "20:30",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1400&q=80",
        "teamA": {
            "name": "Maroc",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/4774.png"
        },
        "teamB": {
            "name": "Côte d'Ivoire",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/1004.png"
        },
        "description": "Choc au sommet entre les Lions de l'Atlas marocains et les champions d'Afrique ivoiriens. Diffusion en direct en HD & 4K.",
        "channels": [
            {"name": "Canal+ Foot HD", "id": 3713, "badge": "FHD", "quality": "1080p"},
            {"name": "beIN Sports 1 AR", "id": 3724, "badge": "FHD", "quality": "1080p"},
            {"name": "RTI 1 Côte d'Ivoire", "id": 9100010, "badge": "FHD", "quality": "1080p"}
        ],
        "rawDate": 1794429000
    },
    {
        "id": "match-italie-france",
        "title": "Italie vs France",
        "competition": "UEFA Nations League",
        "competitionBadge": "CHOC AU SOMMET",
        "category": "football",
        "stage": "Ligue A • Choc au Sommet à San Siro",
        "date": "Jeu. 12 Nov.",
        "time": "20:45",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=80",
        "teamA": {
            "name": "Italie",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/116.png"
        },
        "teamB": {
            "name": "France",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/478.png"
        },
        "description": "Ligue des Nations — Choc au sommet entre l'Italie et les Bleus de France. Diffusion en direct en HD & 4K.",
        "channels": [
            {"name": "TF1 HD", "id": 3437, "badge": "FHD", "quality": "1080p"},
            {"name": "Canal+ Foot HD", "id": 3713, "badge": "FHD", "quality": "1080p"},
            {"name": "beIN Sports 1 AR", "id": 3724, "badge": "4K UHD", "quality": "4K"}
        ],
        "rawDate": 1794516300
    },
    {
        "id": "match-senegal-burkina",
        "title": "Sénégal vs Burkina Faso",
        "competition": "Éliminatoires CAN 2025",
        "competitionBadge": "SÉNÉGAL DIRECT",
        "category": "senegal",
        "stage": "Lions de la Teranga à Dakar",
        "date": "Ven. 13 Nov.",
        "time": "20:00",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
        "teamA": {
            "name": "Sénégal",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/thumb/5/51/Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg/512px-Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg.png"
        },
        "teamB": {
            "name": "Burkina Faso",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/4771.png"
        },
        "description": "Les Lions de la Teranga sénégalais face aux Étalons du Burkina Faso. Diffusion en direct sur RTS 1 et beIN Sports.",
        "channels": [
            {"name": "RTS 1 Sénégal (Direct HD)", "id": 71, "badge": "FHD", "quality": "1080p"},
            {"name": "beIN Sports 1 HD AR", "id": 3724, "badge": "FHD", "quality": "1080p"},
            {"name": "RTS 2 Sénégal HD", "id": 72, "badge": "HD", "quality": "720p"}
        ],
        "rawDate": 1794600000
    },
    {
        "id": "match-espagne-angleterre",
        "title": "Espagne vs Angleterre",
        "competition": "UEFA Nations League",
        "competitionBadge": "LIGUE DES NATIONS",
        "category": "football",
        "stage": "Remake Finale Euro 2024",
        "date": "Sam. 14 Nov.",
        "time": "20:45",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=80",
        "teamA": {
            "name": "Espagne",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/164.png"
        },
        "teamB": {
            "name": "Angleterre",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/448.png"
        },
        "description": "L'Espagne championne d'Europe affronte les Three Lions d'Angleterre en direct en HD & 4K.",
        "channels": [
            {"name": "beIN Sports 1 AR", "id": 3724, "badge": "FHD", "quality": "1080p"},
            {"name": "Canal+ Foot HD", "id": 3713, "badge": "FHD", "quality": "1080p"},
            {"name": "DAZN LaLiga 4K", "id": 5293, "badge": "4K UHD", "quality": "4K"}
        ],
        "rawDate": 1794689100
    },
    {
        "id": "match-portugal-danemark",
        "title": "Portugal vs Danemark",
        "competition": "UEFA Nations League",
        "competitionBadge": "LIGUE DES NATIONS",
        "category": "football",
        "stage": "Cristiano Ronaldo en Action",
        "date": "Dim. 15 Nov.",
        "time": "20:45",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80",
        "teamA": {
            "name": "Portugal",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/479.png"
        },
        "teamB": {
            "name": "Danemark",
            "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/463.png"
        },
        "description": "La Seleção portugaise avec Cristiano Ronaldo face au Danemark en direct sur BOKK TV.",
        "channels": [
            {"name": "beIN Sports 2 HD AR", "id": 3725, "badge": "FHD", "quality": "1080p"},
            {"name": "Canal+ Foot HD", "id": 3713, "badge": "FHD", "quality": "1080p"}
        ],
        "rawDate": 1794775500
    },
    {
        "id": "event-formula-one",
        "title": "Grand Prix de Formule 1 — Las Vegas",
        "competition": "Formula 1 Championship",
        "competitionBadge": "FORMULE 1",
        "category": "f1",
        "stage": "Course Officielle en Direct 4K",
        "date": "Dim. 22 Nov.",
        "time": "15:00",
        "isLive": False,
        "isFinished": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80",
        "teamA": {
            "name": "Scuderia Ferrari",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/5/55/Scuderia_Ferrari_Logo.svg"
        },
        "teamB": {
            "name": "Red Bull Racing",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/7/77/Logo_Red_Bull_Racing.svg"
        },
        "description": "Toute l'intensité de la Formule 1 en direct avec caméras embarquées et télémétrie en temps réel.",
        "channels": [
            {"name": "F1 MULTI 1 HD", "id": 3884, "badge": "FHD", "quality": "1080p"},
            {"name": "Sky Sport F1 FHD", "id": 3895, "badge": "FHD", "quality": "1080p"},
            {"name": "Canal+ Sport 360", "id": 148, "badge": "HD", "quality": "720p"},
            {"name": "DAZN F1 HD", "id": 3896, "badge": "HD", "quality": "720p"}
        ],
        "rawDate": 1795359600
    }
]

def fetch_espn_matches():
    matches = []
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    now_date = datetime.date(2026, 11, 10)
    now_ts = int(time.time())

    # Dates cibles à scanner pour les prochaines journées de championnat et coupes
    target_dates = [(now_date + datetime.timedelta(days=i)).strftime('%Y%m%d') for i in [1, 2, 3, 4, 5, 11, 12]]

    tasks = []
    for d_str in target_dates:
        for lg in LEAGUES:
            tasks.append((lg, d_str))

    def fetch_single(task):
        lg, d_str = task
        url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg['slug']}/scoreboard?dates={d_str}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return (lg, data.get('events', []))
        except Exception:
            return (lg, [])

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(fetch_single, tasks))

    jours = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']
    mois = ['Jan.', 'Fév.', 'Mar.', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sep.', 'Oct.', 'Nov.', 'Déc.']

    for lg, events in results:
        for ev in events:
            comps = ev.get('competitions', [])
            if not comps: continue
            comp = comps[0]
            competitors = comp.get('competitors', [])
            if len(competitors) < 2: continue

            home = next((c for c in competitors if c.get('homeAway') == 'home'), competitors[0])
            away = next((c for c in competitors if c.get('homeAway') == 'away'), competitors[1])

            status_type = comp.get('status', {}).get('type', {})
            state = status_type.get('state', 'pre')
            is_live = (state == 'in')
            is_finished = (state == 'post')

            date_iso = ev.get('date', '')
            raw_ts = 0
            date_str = "À venir"
            time_str = "20:00"

            if date_iso:
                try:
                    dt = datetime.datetime.fromisoformat(date_iso.replace('Z', '+00:00'))
                    local_dt = dt + datetime.timedelta(hours=1)
                    raw_ts = int(dt.timestamp())
                    date_str = f"{jours[local_dt.weekday()]} {local_dt.day} {mois[local_dt.month-1]}"
                    time_str = local_dt.strftime('%H:%M')

                    # Étiquette Aujourd'hui / Demain
                    now = datetime.datetime.now()
                    if local_dt.date() == now.date():
                        date_str = "Aujourd'hui"
                    elif local_dt.date() == (now + datetime.timedelta(days=1)).date():
                        date_str = "Demain"
                except Exception:
                    pass

            # RÈGLE D'OR : EXCLURE STRICTEMENT TOUT MATCH PASSÉ OU TERMINÉ
            if is_finished or (raw_ts > 0 and raw_ts < now_ts - 7200 and not is_live):
                continue

            channels = CHANNELS_MAP.get(lg['name'], CHANNELS_MAP['default'])

            matches.append({
                "id": f"espn-{ev.get('id')}",
                "title": f"{home.get('team', {}).get('displayName', 'Équipe A')} vs {away.get('team', {}).get('displayName', 'Équipe B')}",
                "competition": lg['name'],
                "competitionBadge": lg['badge'],
                "category": "football",
                "teamA": {
                    "name": home.get('team', {}).get('displayName', 'Équipe A'),
                    "logo": home.get('team', {}).get('logo', '')
                },
                "teamB": {
                    "name": away.get('team', {}).get('displayName', 'Équipe B'),
                    "logo": away.get('team', {}).get('logo', '')
                },
                "poster": POSTERS.get(lg['name'], POSTERS['Ligue 1']),
                "score": "VS",
                "date": date_str,
                "time": time_str,
                "isLive": is_live,
                "isFinished": False,
                "liveMinute": status_type.get('detail', 'LIVE') if is_live else None,
                "stage": comp.get('notes', [{}])[0].get('headline', lg['name']) if comp.get('notes') else lg['name'],
                "description": f"{home.get('team', {}).get('displayName')} contre {away.get('team', {}).get('displayName')} en direct sur BOKK TV.",
                "channels": channels,
                "rawDate": raw_ts
            })

    return matches

def generate_matches_files():
    print("[BOKK MATCHS] Récupération des rencontres à venir via ESPN...")
    espn_matches = fetch_espn_matches()

    combined = list(CURATED_EVENTS)

    seen_titles = {m['title'].lower() for m in combined}
    for em in espn_matches:
        if em['title'].lower() not in seen_titles:
            combined.append(em)
            seen_titles.add(em['title'].lower())

    now_ts = int(time.time())
    # Règle stricte : 0 match passé
    combined = [m for m in combined if m.get('isLive') or (m.get('rawDate', 0) >= now_ts - 7200 and not m.get('isFinished'))]

    def sort_key(m):
        if m.get('isLive'):
            return (0, 0)
        diff = m.get('rawDate', now_ts) - now_ts
        return (1, diff if diff > 0 else 999999999)

    combined.sort(key=sort_key)
    print(f"[BOKK MATCHS] Total de {len(combined)} affiches À VENIR prêtes (0 match passé).")

    js_content = f"""/**
 * BOKK TV — Match Center & Grands Rendez-Vous Sportifs À VENIR
 * Généré automatiquement chaque jour via API ESPN & flux officiels
 * Date de mise à jour : {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
 */

const FEATURED_MATCHES = {json.dumps(combined, ensure_ascii=False, indent=4)};

if (typeof window !== 'undefined') {{
    window.FEATURED_MATCHES = FEATURED_MATCHES;
}}
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = FEATURED_MATCHES;
}}
"""

    js_path = os.path.join(SITE_DIR, 'matches.js')
    json_path = os.path.join(SITE_DIR, 'matches_data.json')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    if os.path.exists(APP_WEB_DIR):
        app_js_path = os.path.join(APP_WEB_DIR, 'matches.js')
        app_json_path = os.path.join(APP_WEB_DIR, 'matches_data.json')
        with open(app_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        with open(app_json_path, 'w', encoding='utf-8') as f:
            json.dump(combined, f, ensure_ascii=False, indent=2)

    print(f"[BOKK MATCHS] Fichiers mis à jour avec succès : {js_path}")

if __name__ == '__main__':
    generate_matches_files()
