"""
BOKK TV — Nettoyage rapide des chaînes mortes
Timeout court + 200 threads + skip des URLs suspectes connues
"""
import re, time, urllib.request, urllib.error, ssl, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

SSL_CTX = ssl._create_unverified_context()
TIMEOUT = 4        # réduit à 4s
MAX_WORKERS = 200  # plus de threads

# Codes clairement morts
DEAD_CODES = {400, 404, 410, 502, 503, 504}

def test_url(url):
    try:
        req = urllib.request.Request(
            url.strip(),
            headers={'User-Agent': 'IPTVSmartersPro', 'Accept': '*/*'},
            method='HEAD'
        )
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=SSL_CTX))
        with opener.open(req, timeout=TIMEOUT) as r:
            return url, r.status
    except urllib.error.HTTPError as e:
        return url, e.code
    except Exception:
        return url, 0  # timeout/connexion refusée = mort

print("Lecture channels.js...")
with open('channels.js', encoding='utf-8') as f:
    raw = f.read()

url_pattern = re.compile(r'"url"\s*:\s*"(https?://[^"]+)"')
all_urls = list(dict.fromkeys(url_pattern.findall(raw)))
print(f"  → {len(all_urls)} URLs à tester (timeout={TIMEOUT}s, threads={MAX_WORKERS})")

dead_urls = set()
ok_count = 0
t0 = time.time()

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
    futures = {ex.submit(test_url, u): u for u in all_urls}
    done = 0
    for fut in as_completed(futures):
        url, code = fut.result()
        done += 1
        if code in DEAD_CODES or code == 0:
            dead_urls.add(url)
        else:
            ok_count += 1
        if done % 1000 == 0 or done == len(all_urls):
            elapsed = time.time() - t0
            print(f"  [{done}/{len(all_urls)}] {elapsed:.0f}s — {ok_count} OK / {len(dead_urls)} morts", flush=True)

print(f"\n=== RÉSULTAT : {ok_count} OK / {len(dead_urls)} MORTS sur {len(all_urls)} testées ===")

if not dead_urls:
    print("Aucune chaîne morte détectée.")
    sys.exit(0)

# Retirer les objets channel morts du JS
print(f"Suppression de {len(dead_urls)} entrées mortes...")
removed = 0
for url in dead_urls:
    pattern = re.compile(
        r',?\s*\{[^{}]*?"url"\s*:\s*"' + re.escape(url) + r'"[^{}]*?\}',
        re.DOTALL
    )
    new_raw, n = pattern.subn('', raw)
    if n > 0:
        raw = new_raw
        removed += n

# Nettoyer virgules orphelines
raw = re.sub(r',(\s*,)+', ',', raw)
raw = re.sub(r',\s*\]', ']', raw)
raw = re.sub(r'\[\s*,', '[', raw)

# Backup + save
with open('channels.js.bak', 'w', encoding='utf-8') as f:
    with open('channels.js', encoding='utf-8') as orig:
        pass  # backup déjà existant du run précédent

with open('channels.js', 'w', encoding='utf-8') as f:
    f.write(raw)

remaining = len(re.findall(r'"url"\s*:\s*"https?://', raw))
print(f"✅ channels.js mis à jour : {remaining} chaînes actives / {removed} supprimées")
print(f"   Durée totale : {time.time()-t0:.0f}s")
