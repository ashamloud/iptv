import os
import re
import json

def clean_vod_title(raw_name):
    title = raw_name
    # Retirer les tags de debut
    title = re.sub(r'^[|\[\(][^\]|\)]+[\]|\)]\s*', '', title)
    # Retirer les prefixes courants
    for prefix in ['|MULTI|', '|DE|', '|ES|', '|IT|', '|FR|', 'MULTI', 'DE', 'ES', 'IT', 'FR', 'EXYU -']:
        if title.startswith(prefix):
            title = title[len(prefix):].strip()
    # Retirer les suffixes de format
    title = re.sub(r'\.(avi|mp4|mkv|ts)$', '', title, flags=re.I)
    # Retirer les guillemets ou caracteres parasites
    title = title.replace('"', '').strip()
    return title

def build_vod():
    print("=== EXTRACTION DU CATALOGUE VOD FILMS & SERIES ===")
    
    file2_path = 'm3u/tv_channels el classico la liga (SFILE.MOBI).m3u'
    file1_path = 'm3u/Playlist Iptv (SFILE.MOBI) (1).m3u'
    
    vod_list = []
    seen_titles = set()
    
    # 1. Selectionner les meilleurs groupes de File 2
    # Priorite aux contenus MULTI, NETFLIX, DISNEY+, AMAZON, APPLE, HBO, SERIES, FILMS
    target_groups = {
        '|MULTI| NETFLIX': ('Netflix', 'netflix', 'film'),
        '|MULTI| NETFLIX 4K': ('Netflix', 'netflix', 'film'),
        '|MULTI| DISNEY+': ('Disney+', 'disney', 'film'),
        '|MULTI| DISNEY+ 4K': ('Disney+', 'disney', 'film'),
        '|MULTI| AMAZON PRIME': ('Prime Video', 'prime', 'film'),
        '|MULTI| AMAZONE PRIME 4K': ('Prime Video', 'prime', 'film'),
        '|MULTI| APPLE+': ('Apple TV+', 'apple', 'film'),
        '|ES| APPLE TV+': ('Apple TV+', 'apple', 'film'),
        '|DE| APPLE TV+': ('Apple TV+', 'apple', 'film'),
        '|DE| HBO': ('HBO Max', 'hbo', 'film'),
        '|ES| HBO': ('HBO Max', 'hbo', 'film'),
        '|ES| ÚLTIMAS PELÍCULAS': ('Films Récents', 'recents', 'film'),
        '|DE| NEUESTE FILME': ('Films Récents', 'recents', 'film'),
        '|DE| FILME 2023 & 2024': ('Films Récents', 'recents', 'film'),
        '|ES| ACCION': ('Action', 'action', 'film'),
        '|ES| COMEDIAS': ('Comédie', 'comedie', 'film'),
        '|DE| HORROR / THRILLER': ('Horreur & Thriller', 'horreur', 'film'),
        '|DE| SCI-FI UND FANTASIE': ('Sci-Fi & Fantaisie', 'scifi', 'film'),
        '|DE| ANIME': ('Animation & Anime', 'animation', 'animation'),
        '|DE| SERIES CURRENTLY ON AIR': ('Séries', 'series', 'serie'),
        '|ES| SERIE ACTUALMENTE AL AIRE': ('Séries', 'series', 'serie'),
        '|DE| BBC / USA SERIES': ('Séries', 'series', 'serie'),
        '|MULTI| NETFLIX': ('Séries Netflix', 'netflix', 'serie'),
    }

    # Limites par categorie pour un catalogue equilibre (~2500 a 3000 items)
    limits_per_cat = {
        'netflix': 500,
        'disney': 400,
        'prime': 400,
        'apple': 250,
        'hbo': 250,
        'recents': 350,
        'action': 200,
        'comedie': 150,
        'horreur': 150,
        'scifi': 150,
        'animation': 150,
        'series': 350
    }
    cat_counts = {k: 0 for k in limits_per_cat}
    
    current_id = 1
    
    print("Scan de File 2...")
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
                group_match = re.search(r'group-title="([^"]+)"', curr_inf, re.I)
                group = group_match.group(1).strip() if group_match else ''
                
                # Exclusion adultes
                if any(x in group.upper() for x in ['FOR ADULTS', 'XXX', '18+']):
                    curr_inf = None
                    continue
                    
                target_info = target_groups.get(group)
                if target_info:
                    cat_label, cat_key, content_type = target_info
                    if cat_counts.get(cat_key, 0) < limits_per_cat.get(cat_key, 200):
                        parts = curr_inf.split(',', 1)
                        raw_name = parts[1].strip() if len(parts) > 1 else ''
                        clean_name = clean_vod_title(raw_name)
                        
                        logo_match = re.search(r'tvg-logo="([^"]+)"', curr_inf, re.I)
                        logo = logo_match.group(1).strip() if logo_match else ''
                        
                        # Ne garder que les éléments avec une vraie affiche TMDB
                        if logo and 'image.tmdb.org' in logo and clean_name and len(clean_name) > 2:
                            clean_key = clean_name.lower().strip()
                            if clean_key not in seen_titles:
                                seen_titles.add(clean_key)
                                cat_counts[cat_key] += 1
                                
                                # Extraire l'annee si presente
                                year_match = re.search(r'\b(20[0-2][0-9]|19[8-9][0-9])\b', raw_name)
                                year = year_match.group(1) if year_match else '2024'
                                
                                # Extraire ou generer note
                                rating = round(7.0 + (hash(clean_key) % 25) / 10, 1)
                                if rating > 9.4:
                                    rating = 9.4
                                    
                                # Backdrop HD TMDB (remplacer w500 par w1280 ou garder)
                                backdrop = logo.replace('/w500/', '/w1280/').replace('/w600_and_h900_bestv2/', '/w1280/')
                                
                                vod_list.append({
                                    'id': f"vod_{current_id}",
                                    'title': clean_name,
                                    'raw_title': raw_name,
                                    'category': cat_key,
                                    'categoryLabel': cat_label,
                                    'type': content_type,
                                    'poster': logo,
                                    'backdrop': backdrop,
                                    'year': year,
                                    'rating': rating,
                                    'quality': '4K' if '4K' in group or '4K' in raw_name else 'HD',
                                    'url': url,
                                    'group': group,
                                    'synopsis': f"{clean_name} ({year}) disponible en streaming haute définition sur BOKK TV."
                                })
                                current_id += 1
                curr_inf = None

    print(f"File 2 : {len(vod_list)} VOD selectionnees.")
    
    # 2. Ajouter quelques grands classiques de File 1 (EX-YU Blockbusters)
    print("Scan de File 1...")
    file1_count = 0
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
                if 'VOD | EX-YU' in curr_inf or 'PRIME PPV' in curr_inf or 'DISNEY+ PPV' in curr_inf:
                    parts = curr_inf.split(',', 1)
                    raw_name = parts[1].strip() if len(parts) > 1 else ''
                    clean_name = clean_vod_title(raw_name)
                    logo_match = re.search(r'tvg-logo="([^"]+)"', curr_inf, re.I)
                    logo = logo_match.group(1).strip() if logo_match else ''
                    
                    if logo and 'image.tmdb.org' in logo and clean_name and len(clean_name) > 2:
                        clean_key = clean_name.lower().strip()
                        if clean_key not in seen_titles and file1_count < 300:
                            seen_titles.add(clean_key)
                            file1_count += 1
                            year_match = re.search(r'\b(20[0-2][0-9]|19[8-9][0-9])\b', raw_name)
                            year = year_match.group(1) if year_match else '2023'
                            rating = round(7.2 + (hash(clean_key) % 22) / 10, 1)
                            
                            vod_list.append({
                                'id': f"vod_{current_id}",
                                'title': clean_name,
                                'raw_title': raw_name,
                                'category': 'recents',
                                'categoryLabel': 'Blockbusters',
                                'type': 'film',
                                'poster': logo,
                                'backdrop': logo.replace('/w600_and_h900_bestv2/', '/w1280/'),
                                'year': year,
                                'rating': rating,
                                'quality': 'HD',
                                'url': url,
                                'group': 'Blockbusters',
                                'synopsis': f"{clean_name} ({year}) en exclusivité sur BOKK TV."
                            })
                            current_id += 1
                curr_inf = None
                
    print(f"Total Final VOD : {len(vod_list)} films et séries.")
    
    # Statistiques par categorie
    cat_final_counts = {}
    for item in vod_list:
        c = item['category']
        cat_final_counts[c] = cat_final_counts.get(c, 0) + 1
    for c, count in sorted(cat_final_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  • {c} : {count} titres")
        
    # Ecriture dans app/src/data/vodData.json
    out_path = 'app/src/data/vodData.json'
    print(f"\nEcriture du catalogue dans {out_path}...")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(vod_list, f, ensure_ascii=False, indent=2)
        
    print(f"Fichier genere avec succes : {round(os.path.getsize(out_path)/1024, 1)} Ko.")
    print("=== CATALOGUE VOD CREE AVEC SUCCES ===")

if __name__ == '__main__':
    build_vod()
