import os
import sys
import re
import json
import urllib.request

m3u_dir = r"d:\Users\Gueladio\Pictures\BOKK\iptv\m3u"
site_channels_path = r"d:\Users\Gueladio\Pictures\BOKK\iptv\site\channels.js"
app_web_channels_path = r"d:\Users\Gueladio\Pictures\BOKK\iptv\app\assets\web\channels.js"
app_data_json_path = r"d:\Users\Gueladio\Pictures\BOKK\iptv\app\src\data\channelsData.json"

print("1. Extracting non-MegaTV Senegalese and base channels from site/channels.js...")
with open(site_channels_path, "r", encoding="utf-8") as f:
    c_raw = f.read()
start = c_raw.find("[")
end = c_raw.rfind("]") + 1
old_channels = json.loads(c_raw[start:end])

initial_channels = []
seen_urls = set()
for c in old_channels:
    u = c.get("url", "")
    if u and "megatv5074" not in u:
        if u not in seen_urls:
            seen_urls.add(u)
            initial_channels.append(c)

print(f"Preserved {len(initial_channels)} core national and working channels.")

def parse_m3u_content(text, default_group="Général", default_cat="monde"):
    parsed = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("#EXTINF:"):
            meta_part = line[8:]
            title_idx = meta_part.rfind(",")
            title = meta_part[title_idx+1:].strip() if title_idx != -1 else "Chaîne"
            attrs_str = meta_part[:title_idx] if title_idx != -1 else meta_part
            
            logo = ""
            logo_m = re.search(r'tvg-logo=[\'"]([^\'"]+)[\'"]', attrs_str, re.I)
            if logo_m:
                logo = logo_m.group(1).strip()
            
            group = default_group
            group_m = re.search(r'group-title=[\'"]([^\'"]+)[\'"]', attrs_str, re.I)
            if group_m and group_m.group(1).strip():
                group = group_m.group(1).strip()
            
            country = ""
            country_m = re.search(r'tvg-country=[\'"]([^\'"]+)[\'"]', attrs_str, re.I)
            if country_m:
                country = country_m.group(1).strip()
            
            i += 1
            stream_url = ""
            while i < len(lines):
                next_l = lines[i].strip()
                if next_l and not next_l.startswith("#"):
                    stream_url = next_l
                    break
                i += 1
            
            if stream_url and stream_url.startswith("http"):
                gl = group.lower()
                tl = title.lower()
                cat = default_cat
                if any(x in gl or x in tl for x in ["sport", "foot", "futbol", "espn", "bein", "fifa", "dazn", "laliga", "nba", "sky sport"]):
                    cat = "sport"
                elif any(x in gl or x in tl for x in ["ciné", "cine", "film", "movie", "serie", "série", "drama"]):
                    cat = "cinema"
                elif any(x in gl or x in tl for x in ["music", "musique", "trace", "radio", "song", "hits"]):
                    cat = "music"
                elif any(x in gl or x in tl for x in ["kids", "jeunesse", "enfant", "anim", "toon", "disney", "junior", "gulli"]):
                    cat = "jeunesse"
                elif any(x in gl or x in tl for x in ["news", "info", "actualité", "actualite", "24/7", "cnn", "bbc", "france 24", "bfm", "cnews", "lci"]):
                    cat = "francophone" if ("fr" in country.lower() or "france" in gl or "fra" in gl) else "info"
                elif any(x in gl or x in tl for x in ["france", "francophone", "belgique", "suisse", "tnt", "tf1", "m6", "france 2", "france 3"]):
                    cat = "francophone"
                elif any(x in gl or x in tl for x in ["sénégal", "senegal", "dakar", "wolof"]):
                    cat = "senegal"
                elif any(x in gl or x in tl for x in ["afrique", "africa", "ivoire", "mali", "guinée", "cameroun", "rdc", "gabon", "togo", "bénin"]):
                    cat = "afrique"
                elif "esp" in country.lower() or "spain" in gl:
                    cat = "espagne"
                elif "de" in country.lower() or "germany" in gl:
                    cat = "allemagne"
                elif "it" in country.lower() or "italy" in gl:
                    cat = "italie"
                elif "uk" in country.lower() or "us" in country.lower() or "united" in gl:
                    cat = "uk"

                parsed.append({
                    "name": title,
                    "group": group,
                    "category": cat,
                    "country": country,
                    "logo": logo,
                    "url": stream_url
                })
        i += 1
    return parsed

all_new = []

# 2. Local M3U files
for fname in os.listdir(m3u_dir):
    fpath = os.path.join(m3u_dir, fname)
    if os.path.isfile(fpath) and fname.endswith(".m3u"):
        print(f"Parsing local file: {fname}...")
        with open(fpath, "r", encoding="utf-8", errors="ignore") as fp:
            dgroup = fname.replace(".m3u", "").replace("_", " ").capitalize()
            dcat = "sport" if "futbol" in fname else ("francophone" if "fr" in fname else "monde")
            entries = parse_m3u_content(fp.read(), default_group=dgroup, default_cat=dcat)
            print(f"-> {len(entries)} channels parsed from {fname}")
            all_new.extend(entries)

# 3. Online URLs
online_urls = [
    ("https://iptv-org.github.io/iptv/languages/fra.m3u", "Francophonie", "francophone"),
    ("https://iptv.llc", "IPTV Global", "monde"),
    ("https://iptv-org.github.io/iptv/index.country.m3u", "International", "monde"),
]

for url, dgroup, dcat in online_urls:
    print(f"Fetching {url}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=35) as res:
            text = res.read().decode("utf-8", errors="ignore")
            entries = parse_m3u_content(text, default_group=dgroup, default_cat=dcat)
            print(f"-> {len(entries)} channels parsed from {url}")
            all_new.extend(entries)
    except Exception as e:
        print(f"-> Error fetching {url}: {e}")

# 4. Merge & Deduplicate
combined = list(initial_channels)
channel_id = 9300000

for item in all_new:
    u = item["url"]
    if u in seen_urls:
        continue
    seen_urls.add(u)
    
    clean_u = u.lower().split("?")[0]
    stream_type = "ts" if (clean_u.endswith(".ts") or clean_u.endswith(".mpegts")) else "hls"
    
    combined.append({
        "id": channel_id,
        "stream_id": channel_id,
        "name": item["name"],
        "category": item["category"],
        "group": item["group"],
        "country": item["country"],
        "badge": "HD",
        "desc": f"{item['name']} • {item['group']}",
        "logo": item["logo"],
        "url": u,
        "fallbackUrl": u,
        "type": stream_type
    })
    channel_id += 1

print(f"\n==========================================")
print(f"TOTAL CHANNELS IN NEW CATALOGUE: {len(combined)}")
print(f"==========================================")

# Write to site/channels.js
print(f"Writing {site_channels_path}...")
with open(site_channels_path, "w", encoding="utf-8") as f:
    f.write("// BOKK TV — Catalogue Officiel des Chaînes\n")
    f.write(f"// Chaînes Nationales Sénégal + IPTV-org + IPTV.llc + M3U ({len(combined)} chaînes)\n\n")
    f.write("const channels = ")
    json.dump(combined, f, ensure_ascii=False)
    f.write(";\n")

# Write to app/assets/web/channels.js
if os.path.exists(os.path.dirname(app_web_channels_path)):
    print(f"Writing {app_web_channels_path}...")
    with open(app_web_channels_path, "w", encoding="utf-8") as f:
        f.write("const channels = ")
        json.dump(combined, f, ensure_ascii=False)
        f.write(";\n")

# Write to app/src/data/channelsData.json
if os.path.exists(os.path.dirname(app_data_json_path)):
    print(f"Writing {app_data_json_path}...")
    with open(app_data_json_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False)

print("Done successfully!")
