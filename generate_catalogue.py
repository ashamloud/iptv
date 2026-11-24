import os
import re
import json

def generate_catalogue():
    print("=== DEBUT DE LA GENERATION DU CATALOGUE BOKK TV ===")
    
    # 1. Recuperer le bouquet Senegal & Afrique depuis site/channels.js.bak
    senegal_channels = []
    afrique_channels = []
    
    if os.path.exists('site/channels.js.bak'):
        print("Lecture du fichier de sauvegarde site/channels.js.bak...")
        with open('site/channels.js.bak', 'r', encoding='utf-8', errors='ignore') as f:
            txt = f.read()
        s = txt.find('[')
        e = txt.rfind(']')
        if s != -1 and e != -1:
            try:
                old_channels = json.loads(txt[s:e+1])
                for c in old_channels:
                    cat = (c.get('category') or '').lower()
                    grp = (c.get('group') or '').lower()
                    name = (c.get('name') or '').lower()
                    country = (c.get('country') or '').upper()
                    
                    if cat == 'senegal' or 'sénégal' in grp or 'senegal' in grp or country == 'SN' or 'sénégal' in name or 'senegal' in name:
                        if not any(sc['name'] == c['name'] for sc in senegal_channels):
                            senegal_channels.append(c)
                    elif cat == 'afrique' or 'afrique' in grp or country in ['CI', 'ML', 'GN', 'CM', 'BF']:
                        if not any(ac['name'] == c['name'] for ac in afrique_channels):
                            afrique_channels.append(c)
            except Exception as ex:
                print("Erreur parsing channels.js.bak:", ex)
                
    # Verifier si 2sTV est present, sinon l'ajouter
    if not any('2stv' in c.get('name', '').lower() for c in senegal_channels):
        senegal_channels.append({
            'name': '2sTV Sénégal (Officiel HD)',
            'category': 'senegal',
            'group': '🇸🇳 Sénégal',
            'country': 'SN',
            'badge': 'HD',
            'desc': '2sTV Sénégal • Direct Officiel ACAN',
            'logo': 'https://upload.wikimedia.org/wikipedia/fr/4/4c/Logo_2sTV.png',
            'url': '2stv',
            'fallbackUrl': '2stv',
            'type': 'hls'
        })

    print(f"Bouquet Senegal preserve : {len(senegal_channels)} chaines.")
    print(f"Bouquet Afrique preserve : {len(afrique_channels)} chaines.")

    # 2. Parser File 1 : Playlist Iptv (SFILE.MOBI) (1).m3u
    file1_path = "m3u/Playlist Iptv (SFILE.MOBI) (1).m3u"
    file1_channels = []
    
    with open(file1_path, 'r', encoding='utf-8', errors='ignore') as f:
        curr_inf = None
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('#EXTINF:'):
                curr_inf = line
            elif curr_inf and line.startswith('http'):
                url = line
                parts = curr_inf.split(',', 1)
                name = parts[1].strip() if len(parts) > 1 else ''
                
                # Exclure bannières et titres vides
                if name.startswith('#####') or not name or name.startswith('==='):
                    curr_inf = None
                    continue
                    
                group_match = re.search(r'group-title="([^"]+)"', curr_inf, re.IGNORECASE)
                logo_match = re.search(r'tvg-logo="([^"]+)"', curr_inf, re.IGNORECASE)
                group = group_match.group(1).strip() if group_match else 'Général'
                logo = logo_match.group(1).strip() if logo_match else ''
                
                # Exclure VOD
                if 'VOD |' in group.upper():
                    curr_inf = None
                    continue
                    
                file1_channels.append({
                    'name': name,
                    'group': group,
                    'logo': logo,
                    'url': url,
                    'source': 'file1'
                })
                curr_inf = None
                
    print(f"File 1 chaines valides : {len(file1_channels)}")

    # 3. Parser File 2 : tv_channels el classico la liga (SFILE.MOBI).m3u
    file2_path = "m3u/tv_channels el classico la liga (SFILE.MOBI).m3u"
    file2_channels = []
    
    vod_keywords = [
        'SERIES', 'SERIE', 'MOVIE', 'NETFLIX', 'AMAZON', 'PRIME', 'DISNEY', 'HBO',
        'ANIME', 'FILM', 'VOD', 'EPISODE', 'SEASON', 'FOR ADULTS', 'DRAMA', 'ROMANCE',
        'KOMÖDIE', 'SCI-FI', 'ÚLTIMAS', 'COMEDIAS', 'ACCION', 'HOROR', 'HORROR',
        'KINDER', 'BAMBINI', 'AKTION', 'COMMEDIE', 'PELÍCULAS', 'STORIA', 'GESCHICHTE',
        'LATINO', 'DRAMES', 'CHRISTMAS', 'BOLLYWOOD', 'NINO', 'KINO', 'ANIMO', 'WORLD CUP CLUBS REPLAY'
    ]
    
    with open(file2_path, 'r', encoding='utf-8', errors='ignore') as f:
        curr_inf = None
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('#EXTINF:'):
                curr_inf = line
            elif curr_inf and line.startswith('http'):
                url = line
                if '/movie/' in url or '/series/' in url:
                    curr_inf = None
                    continue
                    
                group_match = re.search(r'group-title="([^"]+)"', curr_inf, re.IGNORECASE)
                group = group_match.group(1).strip() if group_match else 'Général'
                
                # Exclure VOD et adulte
                if any(kw in group.upper() for kw in vod_keywords):
                    curr_inf = None
                    continue
                    
                parts = curr_inf.split(',', 1)
                name = parts[1].strip() if len(parts) > 1 else ''
                if not name or name.startswith('#####') or name.startswith('==='):
                    curr_inf = None
                    continue
                    
                logo_match = re.search(r'tvg-logo="([^"]+)"', curr_inf, re.IGNORECASE)
                logo = logo_match.group(1).strip() if logo_match else ''
                
                file2_channels.append({
                    'name': name,
                    'group': group,
                    'logo': logo,
                    'url': url,
                    'source': 'file2'
                })
                curr_inf = None

    print(f"File 2 chaines valides : {len(file2_channels)}")

    # 4. Fonction de mapping des catégories
    def map_category(group, name):
        g = group.upper()
        n = name.upper()
        # Sport en priorité
        if any(k in g for k in ['SPORT', 'LALIGA', 'DAZN', 'UEFA', 'CHAMPIONS', 'F1', 'MOTOGP', 'PPV', 'EUROSPORT', 'DYN']) or \
           any(k in n for k in ['SPORT', 'BEIN', 'CANAL+ SPORT', 'FOOT', 'DAZN', 'RMC SPORT', 'EUROSPORT', 'F1', 'MOTO GP', 'LALIGA']):
            return 'sport'
        # Francophone / TNT / France
        if '|FR|' in n or 'FRANCE' in g or 'FRANCE' in n or 'FR |' in g or any(k in n for k in ['TF1', 'FRANCE 2', 'FRANCE 3', 'FRANCE 4', 'FRANCE 5', 'M6', 'ARTE', 'W9', 'TMC', 'TFX', '6TER', 'C8', 'CSTAR', 'GULLI', 'BFM', 'LCI', 'CANAL+']):
            return 'francophone'
        # Cinéma & Séries
        if any(k in g for k in ['CINE', 'FILM', 'DISNEY', 'KINO', 'THEATER', 'MOVIE']):
            return 'cinema'
        # Espagne
        if 'ES|' in g or 'ESPAÑA' in g:
            return 'espagne'
        # Italie
        if 'IT|' in g or 'ITALIA' in g:
            return 'italie'
        # Allemagne & Autriche
        if 'DE|' in g or 'DEUTSCHLAND' in g or 'ÖSTERREICH' in g or 'AT|' in g:
            return 'allemagne'
        # Documentaire & Nature
        if 'DOKUMENTAR' in g or 'DOCUMENTARI' in g or 'CULTURA' in g or 'RELAX' in g:
            return 'documentaire'
        # Jeunesse
        if 'NINOS' in g or 'BAMBINI' in g or 'JUGEND' in g or 'KIDS' in g or 'CARTOON' in g:
            return 'jeunesse'
        # Musique
        if 'MUSIK' in g or 'MUSICA' in g:
            return 'music'
        # Ex-Yougoslavie
        if 'EXYU' in g:
            return 'exyu'
        return 'monde'

    def map_badge(name):
        n = name.upper()
        if '8K' in n:
            return '8K'
        if '4K' in n or 'UHD' in n:
            return '4K'
        if 'HEVC' in n or 'H265' in n:
            return 'HEVC'
        if 'FHD' in n or '1080' in n or 'RAW' in n:
            return 'FHD'
        if 'SD' in n or '576' in n or '480' in n or 'LOW' in n:
            return 'SD'
        return 'HD'

    final_channels = []
    current_id = 1
    
    # Inserer Senegal en tete
    for c in senegal_channels:
        final_channels.append({
            'id': current_id,
            'stream_id': current_id,
            'name': c.get('name', ''),
            'category': 'senegal',
            'group': '🇸🇳 Sénégal',
            'country': 'SN',
            'badge': c.get('badge', 'HD'),
            'desc': c.get('desc', f"{c.get('name', '')} • Sénégal Direct"),
            'logo': c.get('logo', ''),
            'url': c.get('url', ''),
            'fallbackUrl': c.get('fallbackUrl', c.get('url', '')),
            'type': c.get('type', 'hls'),
            'userAgent': c.get('userAgent', 'IPTVSmartersPro')
        })
        current_id += 1
        
    # Inserer Afrique ensuite
    for c in afrique_channels:
        final_channels.append({
            'id': current_id,
            'stream_id': current_id,
            'name': c.get('name', ''),
            'category': 'afrique',
            'group': '🌍 Afrique',
            'country': c.get('country', ''),
            'badge': c.get('badge', 'HD'),
            'desc': c.get('desc', f"{c.get('name', '')} • Afrique Direct"),
            'logo': c.get('logo', ''),
            'url': c.get('url', ''),
            'fallbackUrl': c.get('fallbackUrl', c.get('url', '')),
            'type': c.get('type', 'hls'),
            'userAgent': c.get('userAgent', 'IPTVSmartersPro')
        })
        current_id += 1

    # File 1 (novatv.xyz) est temporairement suspendu (compte expiré 401)
    # File 2 (barrelastv.ottcst.org) est 100% actif avec 1968 chaînes validées
    print("Insertion des chaînes directes actives de File 2 (MPEG-TS)...")
    for c in file2_channels:
        cat = map_category(c['group'], c['name'])
        badge = map_badge(c['name'])
        stream_type = 'hls' if '.m3u8' in c['url'] else 'ts'
        final_channels.append({
            'id': current_id,
            'stream_id': current_id,
            'name': c['name'],
            'category': cat,
            'group': c['group'],
            'badge': badge,
            'desc': f"{c['name']} • {c['group']}",
            'logo': c['logo'],
            'url': c['url'],
            'fallbackUrl': c['url'],
            'type': stream_type,
            'userAgent': 'IPTVSmartersPro'
        })
        current_id += 1

    print(f"\nTOTAL DES CHAINES GENEREES : {len(final_channels)}")
    cat_counts = {}
    for c in final_channels:
        cat = c['category']
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    for cat, count in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  • [{cat}] : {count} chaînes")

    # Ecriture
    print("\nEcriture dans site/channels.js...")
    with open('site/channels.js', 'w', encoding='utf-8') as f:
        f.write('var channels = ')
        json.dump(final_channels, f, ensure_ascii=False, indent=2)
        f.write(';\n')
        f.write('if (typeof window !== "undefined") { window.channels = channels; }\n')
        f.write('if (typeof module !== "undefined" && module.exports) { module.exports = channels; }\n')

    print("Ecriture dans app/src/data/channelsData.json...")
    with open('app/src/data/channelsData.json', 'w', encoding='utf-8') as f:
        json.dump(final_channels, f, ensure_ascii=False, indent=2)

    # Copier aussi dans app/assets/web/channels.js si existant
    if os.path.exists('app/assets/web/channels.js'):
        print("Mise a jour de app/assets/web/channels.js...")
        with open('app/assets/web/channels.js', 'w', encoding='utf-8') as f:
            f.write('var channels = ')
            json.dump(final_channels, f, ensure_ascii=False, indent=2)
            f.write(';\n')
            f.write('if (typeof window !== "undefined") { window.channels = channels; }\n')
            f.write('if (typeof module !== "undefined" && module.exports) { module.exports = channels; }\n')

    print("=== TERMINE AVEC SUCCES ===")

if __name__ == '__main__':
    generate_catalogue()

