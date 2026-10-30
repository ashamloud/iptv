import urllib.request, re, sys

with open('channels.js', encoding='utf-8') as f:
    raw = f.read()

# Extract all http URLs from the JS object
urls = re.findall(r'"url"\s*:\s*"(http[^"]+)"', raw)
if not urls:
    urls = re.findall(r'url\s*:\s*"(http[^"]+)"', raw)
if not urls:
    urls = re.findall(r"url\s*:\s*'(http[^']+)'", raw)

print(f"Found {len(urls)} URLs total, testing first 30...")
urls = urls[:30]

ok, err = 0, 0
for url in urls:
    try:
        req = urllib.request.Request(url.strip(), headers={'User-Agent': 'VLC/3.0'}, method='HEAD')
        r = urllib.request.urlopen(req, timeout=6)
        print(f"  OK  [{r.status}] {url[:80]}")
        ok += 1
    except Exception as e:
        print(f"  ERR [{str(e)[:45]}] {url[:60]}")
        err += 1

print(f"\n=== RÉSULTAT: {ok} OK / {err} MORTS ===")
