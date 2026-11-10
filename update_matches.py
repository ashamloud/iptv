#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BOKK TV — Auto-Updater Matchs & Événements Sportifs
Télécharge les rencontres officielles en temps réel (ESPN Sports API)
et met à jour site/matches.js et site/matches_data.json automatiquement.
"""

import os
import json
import time
import datetime
import urllib.request
import urllib.error

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

CURATED_EVENTS = [
    {
        "id": "match-atletico-barcelona",
        "title": "Atlético Madrid vs FC Barcelone",
        "competition": "LaLiga EA Sports",
        "competitionBadge": "LALIGA",
        "category": "football",
        "stage": "Choc au Sommet • LaLiga",
        "date": "Dim. 8 Nov.",
        "time": "20:00",
        "isLive": True,
        "liveMinute": "72'",
        "score": "1 - 2",
        "poster": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1400&q=80",
        "teamA": {
            "name": "Atlético Madrid",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/9/94/Logo_Atl%C3%A9tico_Madrid_2017.svg"
        },
        "teamB": {
            "name": "FC Barcelone",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/a/a1/Logo_FC_Barcelona.svg"
        },
        "description": "LaLiga — Atlético Madrid contre Barcelona. Diffusion en direct en HD & 4K.",
        "channels": [
            {"name": "DAZN LaLiga 4K", "id": 5293, "badge": "4K UHD", "quality": "4K"},
            {"name": "beIN Sports 1 AR", "id": 3724, "badge": "FHD", "quality": "1080p"},
            {"name": "M+ LaLiga 4K", "id": 5245, "badge": "4K UHD", "quality": "4K"},
            {"name": "Canal+ Foot HD", "id": 3713, "badge": "FHD", "quality": "1080p"}
        ]
    },
    {
        "id": "match-senegal-can",
        "title": "Sénégal vs Maroc",
        "competition": "Éliminatoires CAN & Amicaux",
        "competitionBadge": "CHOC DES LIONS",
        "category": "senegal",
        "stage": "Le Sommet du Football Africain",
        "date": "Vendredi",
        "time": "20:00",
        "isLive": False,
        "score": "VS",
        "poster": "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
        "teamA": {
            "name": "Lions de la Teranga",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/thumb/5/51/Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg/512px-Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg.png"
        },
        "teamB": {
            "name": "Lions de l'Atlas",
            "logo": "https://upload.wikimedia.org/wikipedia/fr/thumb/7/7b/F%C3%A9d%C3%A9ration_Royale_Marocaine_de_Football_logo.svg/512px-F%C3%A9d%C3%A9ration_Royale_Marocaine_de_Football_logo.svg.png"
        },
        "description": "Les champions d'Afrique sénégalais face aux demi-finalistes mondiaux marocains sur RTS 1 et beIN Sports.",
        "channels": [
            {"name": "RTS 1 Sénégal (Direct HD)", "id": 71, "badge": "FHD", "quality": "1080p"},
            {"name": "beIN Sports 1 HD AR", "id": 3724, "badge": "FHD", "quality": "1080p"},
            {"name": "RTS 2 Sénégal HD", "id": 72, "badge": "HD", "quality": "720p"}
        ]
    },
    {
        "id": "event-formula-one",
        "title": "Grand Prix de Formule 1",
        "competition": "Formula 1 Championship",
        "competitionBadge": "FORMULE 1",
        "category": "f1",
        "stage": "Course Officielle en Direct 4K",
        "date": "Dimanche",
        "time": "15:00",
        "isLive": True,
        "liveMinute": "Tour 42/78",
        "score": "LIVE",
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
        ]
    }
]

def fetch_espn_matches():
    matches = []
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

    for lg in LEAGUES:
        url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg['slug']}/scoreboard"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=6) as response:
                data = json.loads(response.read().decode('utf-8'))
                events = data.get('events', [])

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

                    live_minute = None
                    if is_live:
                        live_minute = status_type.get('detail', 'LIVE')

                    score_text = 'VS'
                    h_score = home.get('score')
                    a_score = away.get('score')
                    if h_score is not None and a_score is not None and (is_live or is_finished):
                        score_text = f"{h_score} - {a_score}"

                    date_iso = ev.get('date', '')
                    raw_ts = 0
                    date_str = "Bientôt"
                    time_str = "20:00"

                    if date_iso:
                        try:
                            # Parse UTC date
                            dt = datetime.datetime.fromisoformat(date_iso.replace('Z', '+00:00'))
                            # Convert to local time (Europe/Paris approximate UTC+1 / UTC+2)
                            local_dt = dt + datetime.timedelta(hours=1)
                            raw_ts = int(dt.timestamp())
                            jours = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']
                            mois = ['Jan.', 'Fév.', 'Mar.', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sep.', 'Oct.', 'Nov.', 'Déc.']
                            date_str = f"{jours[local_dt.weekday()]} {local_dt.day} {mois[local_dt.month-1]}"
                            time_str = local_dt.strftime('%H:%M')

                            # Label Aujourd'hui / Demain
                            now = datetime.datetime.now()
                            if local_dt.date() == now.date():
                                date_str = "Aujourd'hui"
                            elif local_dt.date() == (now + datetime.timedelta(days=1)).date():
                                date_str = "Demain"
                        except Exception:
                            pass

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
                        "score": score_text,
                        "date": date_str,
                        "time": time_str,
                        "isLive": is_live,
                        "isFinished": is_finished,
                        "liveMinute": live_minute,
                        "stage": comp.get('notes', [{}])[0].get('headline', lg['name']) if comp.get('notes') else lg['name'],
                        "description": f"{home.get('team', {}).get('displayName')} contre {away.get('team', {}).get('displayName')} en direct sur BOKK TV.",
                        "channels": channels,
                        "rawDate": raw_ts
                    })
        except Exception as e:
            # Print and continue
            print(f"[ESPN] Erreur ligue {lg['slug']}: {e}")

    return matches

def generate_matches_files():
    print("[BOKK MATCHS] Récupération des rencontres en temps réel via ESPN...")
    espn_matches = fetch_espn_matches()

    # Combiner avec les événements phares (Atlético, Sénégal, F1)
    combined = list(CURATED_EVENTS)

    # Ajouter les matchs ESPN uniques
    seen_titles = {m['title'].lower() for m in combined}
    for em in espn_matches:
        if em['title'].lower() not in seen_titles:
            combined.append(em)
            seen_titles.add(em['title'].lower())

    # Trier : En direct d'abord, puis à venir (par heure chronologique), puis terminés
    now_ts = int(time.time())
    def sort_key(m):
        if m.get('isLive'):
            return (0, 0)
        if not m.get('isFinished'):
            diff = m.get('rawDate', now_ts) - now_ts
            return (1, diff if diff > 0 else 999999999)
        return (2, m.get('rawDate', 0))

    combined.sort(key=sort_key)
    print(f"[BOKK MATCHS] Total de {len(combined)} affiches prêtes (dont {sum(1 for m in combined if m.get('isLive'))} en direct).")

    # Écriture JS
    js_content = f"""/**
 * BOKK TV — Match Center & Grands Rendez-Vous Sportifs
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

    # Enregistrer dans site/
    js_path = os.path.join(SITE_DIR, 'matches.js')
    json_path = os.path.join(SITE_DIR, 'matches_data.json')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    # Mirror vers app/assets/web/
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

