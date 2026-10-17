import urllib.request
import re
import json

url = "https://iptv-org.github.io/iptv/languages/fra.m3u"
data = urllib.request.urlopen(url).read().decode('utf-8')

channels_with_headers = []
cur = {}
for line in data.splitlines():
    line = line.strip()
    if line.startswith('#EXTINF:'):
        cur = {'extinf': line}
        m_name = re.search(r',([^,]+)$', line)
        cur['name'] = m_name.group(1).strip() if m_name else ''
        m_ref = re.search(r'http-referrer="([^"]+)"', line)
        cur['referrer'] = m_ref.group(1) if m_ref else ''
        m_ua = re.search(r'http-user-agent="([^"]+)"', line)
        cur['user_agent'] = m_ua.group(1) if m_ua else ''
    elif line.startswith('#EXTVLCOPT:'):
        if 'http-referrer=' in line:
            cur['referrer'] = line.split('http-referrer=', 1)[1].strip()
        elif 'http-user-agent=' in line:
            cur['user_agent'] = line.split('http-user-agent=', 1)[1].strip()
    elif line.startswith('http'):
        if cur:
            cur['url'] = line
            if cur.get('referrer') or cur.get('user_agent'):
                channels_with_headers.append(cur)
            cur = {}

print(f"Total chaînes avec referrer/user-agent spécifiques : {len(channels_with_headers)}")
for c in channels_with_headers:
    print(f"- {c['name']} | Ref: {c.get('referrer')} | UA: {c.get('user_agent')[:30] if c.get('user_agent') else 'None'}")
