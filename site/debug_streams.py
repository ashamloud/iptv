import json
import urllib.request
import urllib.parse
import ssl

with open('channels.js', 'r', encoding='utf-8') as f:
    channels = json.loads(f.read().split('const channels = ', 1)[1].rstrip(';\n '))

fra_channels = [c for c in channels if c.get('id', 0) >= 8000000]
print(f"Total fra channels: {len(fra_channels)}")

for ch in fra_channels[:25]:
    url = ch['url']
    proxy_url = f"http://127.0.0.1:8080/proxy?url={urllib.parse.quote(url)}"
    
    # Tester direct
    direct_ok = False
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=ctx, timeout=3) as r:
            direct_ok = True
            d_code = r.getcode()
            d_len = len(r.read(100))
    except Exception as e:
        direct_err = str(e)
    
    # Tester via proxy
    proxy_ok = False
    try:
        req = urllib.request.Request(proxy_url)
        with urllib.request.urlopen(req, timeout=3) as r:
            proxy_ok = True
            p_code = r.getcode()
            p_len = len(r.read(100))
    except Exception as e:
        proxy_err = str(e)
        
    print(f"{ch['name']}:")
    if direct_ok:
        print(f"   DIRECT: OK ({d_code})")
    else:
        print(f"   DIRECT: FAIL ({direct_err})")
    if proxy_ok:
        print(f"   PROXY:  OK ({p_code})")
    else:
        print(f"   PROXY:  FAIL ({proxy_err})")
