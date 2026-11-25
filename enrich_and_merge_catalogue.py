import json
import re
import os

site_channels_path = r"site/channels.js"
app_web_channels_path = r"app/assets/web/channels.js"
app_data_json_path = r"app/src/data/channelsData.json"
m3u_file = r"m3u/Playlist Iptv (SFILE.MOBI) (1).m3u"

# 1. Load current site/channels.js
with open(site_channels_path, "r", encoding="utf-8") as f:
    raw = f.read()
start = raw.find("[")
end = raw.rfind("]") + 1
existing_channels = json.loads(raw[start:end])
print(f"Loaded {len(existing_channels)} existing channels from channels.js")

# Official clean CDN logos
LOGO_MAP = {
    # Senegal & Africa
    "rts 1": "https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png",
    "rts 2": "https://upload.wikimedia.org/wikipedia/commons/7/73/Logo_RTS_SN_3.png",
    "2stv": "https://upload.wikimedia.org/wikipedia/fr/a/ab/2sTV_logo.png",
    "tfm": "https://upload.wikimedia.org/wikipedia/fr/b/b5/TFM_logo.png",
    "walf": "https://upload.wikimedia.org/wikipedia/fr/8/84/Walf_FM_logo.jpg",
    "sen tv": "https://sentv.sn/images/artwork.png",
    "rti 1": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Logo_RTI_2021.svg",
    "africa 24": "https://upload.wikimedia.org/wikipedia/fr/6/6a/Logo_Africa_24.jpg",
    "trace africa": "https://upload.wikimedia.org/wikipedia/fr/c/c6/Traceafrica2022.png",
    "trace urban": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Trace_Urban_Logo.svg",

    # French TNT
    "tf1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tf1-fr.png",
    "france 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-2-fr.png",
    "france 3": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-3-fr.png",
    "france 4": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-4-fr.png",
    "france 5": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-5-fr.png",
    "franceinfo": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/franceinfo-fr.png",
    "m6": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/m6-fr.png",
    "arte": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/arte-fr.png",
    "w9": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/w9-fr.png",
    "tmc": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tmc-fr.png",
    "tfx": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tfx-fr.png",
    "c8": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/c8-fr.png",
    "cstar": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cstar-fr.png",
    "gulli": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/gulli-fr.png",
    "bfm tv": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bfm-tv-fr.png",
    "cnews": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/cnews-fr.png",
    "lci": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/lci-fr.png",
    "france 24": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/france-24-fr.png",
    "l'equipe": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/la-chaine-lequipe-fr.png",
    "lequipe": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/la-chaine-lequipe-fr.png",
    "6ter": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/6ter-fr.png",
    "paris premiere": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/paris-premiere-fr.png",
    "tv5 monde": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tv5monde-fr.png",
    "tv5": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/tv5monde-fr.png",
    "rtl9": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rtl9-fr.png",
    "ab1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/ab1-fr.png",
    "teva": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/teva-fr.png",

    # Canal+
    "canal+ foot": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-foot-fr.png",
    "canal+ 360": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-360-fr.png",
    "canal+ sport 360": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-360-fr.png",
    "canal+ sport": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-sport-fr.png",
    "canal+ cinema": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-cinemas-fr.png",
    "canal+ cinémas": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-cinemas-fr.png",
    "canal+ box office": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-box-office-fr.png",
    "canal+ grand ecran": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-grand-ecran-fr.png",
    "canal+ series": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-series-fr.png",
    "canal+ docs": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-docs-fr.png",
    "canal+ kids": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-kids-fr.png",
    "canal+ live": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-fr.png",
    "canal+": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/canal-plus-fr.png",

    # beIN Sports
    "bein sports 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-1-french-fr.png",
    "bein sports 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-2-french-fr.png",
    "bein sports 3": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-3-french-fr.png",
    "bein sports max 4": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 5": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 6": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 7": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 8": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 9": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max 10": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports max": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sports": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",
    "bein sport": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/bein-sports-fr.png",

    # RMC Sport
    "rmc sport 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-1-fr.png",
    "rmc sport 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-2-fr.png",
    "rmc sport": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-sport-fr.png",
    "rmc decouverte": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-decouverte-fr.png",
    "rmc story": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-story-fr.png",
    "rmc life": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/rmc-life-fr.png",

    # Movistar & Spain
    "liga de campeones": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/liga-de-campeones-por-movistar-plus-es.png",
    "campeones": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/liga-de-campeones-por-movistar-plus-es.png",
    "m+ laliga": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/laliga-tv-por-movistar-plus-es.png",
    "laliga tv": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/laliga-tv-por-movistar-plus-es.png",
    "laliga": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/laliga-tv-por-movistar-plus-es.png",
    "dazn laliga": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/dazn-laliga-es.png",
    "dazn": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/dazn-1-es.png",
    "movistar": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/movistar-plus-es.png",

    # Sky Sports
    "sky sports premier league": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-premier-league-uk.png",
    "sky sports football": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-football-uk.png",
    "sky sports main event": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-main-event-uk.png",
    "sky sports f1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-f1-uk.png",
    "sky sports": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-hz-uk.png",
    "sky sport": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-hz-uk.png",

    # Eurosport
    "eurosport 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/eurosport-1-fr.png",
    "eurosport 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/eurosport-2-fr.png",
    "eurosport": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/france/eurosport-1-fr.png",
}

def resolve_channel_logo(name, current_logo=""):
    # If current_logo is a generic dummy or wrong one, ignore it
    dummy_patterns = ["uhd.png", "4k.png", "rawanduhd.png", "exflag.png", "frlog.png", "one_tv.png", "default_tv"]
    is_dummy = any(p in current_logo.lower() for p in dummy_patterns) if current_logo else True

    clean_name = name.lower()
    clean_name = re.sub(r'\|[a-z0-9\s\.\-]+\|', ' ', clean_name) # remove |UEFA|, |8K|, |FR|, etc.
    clean_name = clean_name.replace('fr - ', '').replace('fr : ', '').replace('fr:', '').strip()

    # Search in LOGO_MAP with priority on longer matching keys
    sorted_keys = sorted(LOGO_MAP.keys(), key=lambda k: len(k), reverse=True)
    for k in sorted_keys:
        # Use regex boundary or substring
        if k in clean_name:
            return LOGO_MAP[k]

    # If already had a non-dummy valid logo, keep it
    if current_logo and not is_dummy and current_logo.startswith("http"):
        return current_logo

    return ""

# Clean & enrich existing channels
print("2. Enriching existing channels...")
enriched_count = 0
for ch in existing_channels:
    c_name = ch.get("name", "")
    old_logo = ch.get("logo", "")
    new_logo = resolve_channel_logo(c_name, old_logo)
    if new_logo and new_logo != old_logo:
        ch["logo"] = new_logo
        enriched_count += 1
print(f"Updated logos for {enriched_count} existing channels.")

# 3. Parse and extract French channels from m3u/Playlist Iptv (SFILE.MOBI) (1).m3u
print("3. Parsing French channels from Playlist Iptv...")
with open(m3u_file, "r", encoding="utf-8", errors="ignore") as f:
    m3u_lines = f.readlines()

new_fr_channels = []
seen_urls = set(c.get("url") for c in existing_channels if c.get("url"))
seen_names = set(c.get("name", "").lower() for c in existing_channels)

fr_groups = {
    "EU | FR | GÉNÉRAL": ("francophone", "France TNT & Nationales"),
    "EU | FR | SPORTS": ("sport", "France Sports & beIN"),
    "EU | FR | CANAL+ SPORTS": ("sport", "Canal+ Sport & Live"),
    "EU | FR | CINÉMA": ("cinema", "Cinéma & Séries"),
}

idx = 0
max_existing_id = max((c.get("id", 0) for c in existing_channels), default=2100)
next_id = max_existing_id + 1

while idx < len(m3u_lines):
    line = m3u_lines[idx].strip()
    if line.startswith("#EXTINF"):
        g_match = re.search(r'group-title="([^"]+)"', line)
        group_raw = g_match.group(1) if g_match else ""
        
        if group_raw in fr_groups:
            cat_default, group_default = fr_groups[group_raw]
            raw_title = line.split(",")[-1].strip()
            
            # Skip banner dividers like ##### FRANCE ... #####
            if not raw_title.startswith("#####"):
                # Clean title
                clean_title = raw_title.replace("FR - ", "").replace("FR : ", "").replace("FR:", "").strip()
                clean_title = clean_title.replace(" ◉", "").replace("²", "").replace(" [BK]", "").strip()
                
                # Advance to URL
                idx += 1
                while idx < len(m3u_lines) and m3u_lines[idx].strip().startswith("#"):
                    idx += 1
                stream_url = m3u_lines[idx].strip() if idx < len(m3u_lines) else ""
                
                if stream_url.startswith("http") and stream_url not in seen_urls:
                    seen_urls.add(stream_url)
                    
                    # Extract logo from line or resolve
                    logo_m = re.search(r'tvg-logo="([^"]*)"', line)
                    m3u_logo = logo_m.group(1).strip() if logo_m else ""
                    final_logo = resolve_channel_logo(clean_title, m3u_logo)
                    
                    badge = "FHD" if ("FHD" in raw_title or "1080" in raw_title) else ("4K" if "4K" in raw_title else "HD")
                    
                    new_ch = {
                        "id": next_id,
                        "stream_id": next_id,
                        "name": clean_title,
                        "category": cat_default,
                        "group": group_default,
                        "badge": badge,
                        "desc": f"{clean_title} • {group_default}",
                        "logo": final_logo,
                        "url": stream_url,
                        "fallbackUrl": stream_url,
                        "type": "ts",
                        "userAgent": "IPTVSmartersPro"
                    }
                    new_fr_channels.append(new_ch)
                    next_id += 1
    idx += 1

print(f"Added {len(new_fr_channels)} curated French and Sports channels from new playlist!")

# Combine
all_channels = existing_channels + new_fr_channels
print(f"Total catalogue: {len(all_channels)} channels.")

# Find key channel IDs to print
key_queries = [
    "TF1", "FRANCE 2", "FRANCE 3", "M6", "W9", "ARTE", 
    "CANAL+ FOOT", "CANAL+ 360", "CANAL+ SPORT", 
    "BEIN SPORTS 1", "BEIN SPORTS 2", "RTS 1", "2STV"
]
print("\n--- Key Channels IDs in Updated Catalogue ---")
key_ids = {}
for q in key_queries:
    found = next((c for c in all_channels if q in c.get("name", "").upper()), None)
    if found:
        key_ids[q] = found["id"]
        print(f"  {q}: ID {found['id']} -> {found['name']} (Logo: {found['logo'][:40]}...)")
    else:
        print(f"  {q}: NOT FOUND")

# 4. Write to site/channels.js
js_content = f"// Catalogue Global BOKK TV — Synchronisé & Enrichi ({len(all_channels)} Chaînes Actives)\n"
js_content += "const channels = " + json.dumps(all_channels, ensure_ascii=False, indent=2) + ";\n"
if "if (typeof module !== 'undefined')" not in raw:
    js_content += "\nif (typeof module !== 'undefined') { module.exports = channels; }\n"
    js_content += "if (typeof window !== 'undefined') { window.CHANNELS = channels; }\n"

with open(site_channels_path, "w", encoding="utf-8") as f:
    f.write(js_content)
print(f"Saved {site_channels_path}")

# 5. Write to app/assets/web/channels.js
with open(app_web_channels_path, "w", encoding="utf-8") as f:
    f.write(js_content)
print(f"Saved {app_web_channels_path}")

# 6. Write to app/src/data/channelsData.json
with open(app_data_json_path, "w", encoding="utf-8") as f:
    json.dump(all_channels, f, ensure_ascii=False, indent=2)
print(f"Saved {app_data_json_path}")

