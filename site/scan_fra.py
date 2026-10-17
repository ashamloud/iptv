import urllib.request
import re
import json
import concurrent.futures

url = "https://iptv-org.github.io/iptv/languages/fra.m3u"
data = urllib.request.urlopen(url).read().decode('utf-8')

channels = []
cur = {}
for line in data.splitlines():
    line = line.strip()
    if line.startswith('#EXTINF:'):
        cur = {}
        m_name = re.search(r',([^,]+)$', line)
        cur['name'] = m_name.group(1).strip() if m_name else ''
        m_ref = re.search(r'http-referrer="([^"]+)"', line)
        if m_ref: cur['ref'] = m_ref.group(1)
        m_ua = re.search(r'http-user-agent="([^"]+)"', line)
        if m_ua: cur['ua'] = m_ua.group(1)
    elif line.startswith('#EXTVLCOPT:'):
        if 'http-referrer=' in line:
            cur['ref'] = line.split('http-referrer=', 1)[1].strip()
        elif 'http-user-agent=' in line:
            cur['ua'] = line.split('http-user-agent=', 1)[1].strip()
    elif line.startswith('http'):
        if cur:
            cur['url'] = line
            channels.append(cur)
            cur = {}

print(f"Total chaînes à tester : {len(channels)}")

def test_channel(c):
    url = c['url']
    headers = {
        'User-Agent': c.get('ua') or 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    if c.get('ref'):
        headers['Referer'] = c['ref']
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4) as r:
            code = r.getcode()
            if code == 200:
                return (c['name'], True, "200 OK", url)
            else:
                return (c['name'], False, f"Code {code}", url)
    except Exception as e:
        return (c['name'], False, str(e), url)

with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
    results = list(executor.map(test_channel, channels))

alive = [r for r in results if r[1]]
dead = [r for r in results if not r[1]]

print(f"Résultats du test :")
print(f"  - Vivantes (200 OK) : {len(alive)}")
print(f"  - En échec : {len(dead)}")

print("\nTop 20 chaînes vivantes :")
for r in alive[:20]:
    print(f"  [VIVANTE] {r[0]} -> {r[3]}")

print("\nExemples de chaînes en échec et raisons :")
for r in dead[:20]:
    print(f"  [MORT/BLOQUÉ] {r[0]} -> {r[2]} ({r[3][:60]}...)")
