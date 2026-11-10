#!/usr/bin/env python3
"""Finish all remaining tasks quickly."""
import shutil, re, os

# 1. Fix remaining emoji in app.js (console.log only - not visible to user, but clean it anyway)
with open('site/app.js','r',encoding='utf-8') as f: c=f.read()
c = c.replace(
    "console.log(`[BOKK TV] ✅ ${allMatches.length} vrais matchs ESPN chargés en direct !`);",
    "console.log(`[BOKK TV] ${allMatches.length} vrais matchs ESPN chargés en direct !`);"
)
with open('site/app.js','w',encoding='utf-8') as f: f.write(c)
print("app.js: console.log emoji removed")

# 2. Fix epg.js fallback titles (remove soccer ball emoji from fallback program titles)
with open('site/epg.js','r',encoding='utf-8') as f: c=f.read()
c = c.replace("'⚽ UEFA Champions League / Choc Football en Direct'", "'UEFA Champions League — En Direct'")
c = c.replace("'⚽ Match en Direct : LaLiga / Serie A'", "'Match en Direct : LaLiga / Serie A'")
with open('site/epg.js','w',encoding='utf-8') as f: f.write(c)
print("epg.js: emoji removed from fallback titles")

# 3. tv-app.js: ★ is fine (classic Unicode star, not emoji) — keep it

# 4. Update sw.js version to bust cache
with open('site/sw.js','r',encoding='utf-8') as f: c=f.read()
c = re.sub(r"const CACHE_VERSION = 'v\d+'", "const CACHE_VERSION = 'v6'", c)
with open('site/sw.js','w',encoding='utf-8') as f: f.write(c)
print("sw.js: cache version bumped to v6")

# 5. Update CSS version in index.html
with open('site/index.html','r',encoding='utf-8') as f: c=f.read()
c = c.replace('style.css?v=9942','style.css?v=9943')
# also bump script versions
c = re.sub(r'app\.js\?v=\d+','app.js?v=9943',c)
c = re.sub(r'epg\.js\?v=\d+','epg.js?v=9943',c)
with open('site/index.html','w',encoding='utf-8') as f: f.write(c)
print("index.html: versions bumped to 9943")

# 6. Mirror ALL site/ files to app/assets/web/
pairs = [
    ('site/index.html',    'app/assets/web/index.html'),
    ('site/style.css',     'app/assets/web/style.css'),
    ('site/app.js',        'app/assets/web/app.js'),
    ('site/epg.js',        'app/assets/web/epg.js'),
    ('site/epg-data.js',   'app/assets/web/epg-data.js'),
    ('site/epg_data.json', 'app/assets/web/epg_data.json'),
    ('site/matches.js',    'app/assets/web/matches.js'),
    ('site/sw.js',         'app/assets/web/sw.js'),
    ('site/server.py',     'app/assets/web/server.py'),
    ('site/tv/index.html', 'app/assets/web/tv/index.html'),
    ('site/tv/tv-app.js',  'app/assets/web/tv/tv-app.js'),
]
for src,dst in pairs:
    os.makedirs(os.path.dirname(dst),exist_ok=True)
    shutil.copy2(src,dst)
print(f"Mirror: {len(pairs)} files synced to app/assets/web/")

print("\nALL DONE — ready to commit")

