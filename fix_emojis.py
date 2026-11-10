#!/usr/bin/env python3
"""Script to remove all emojis from BOKK TV files for a professional look."""
import re

def fix_app_js():
    with open('site/app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # CATEGORY_METADATA - remove emojis from labels and icons
    replacements = [
        ("'playlist':     { label: '📂 Ma Playlist',     icon: '📂', order: 0.1 }",
         "'playlist':     { label: 'Ma Playlist',          icon: '',   order: 0.1 }"),
        ("'senegal':      { label: '🇸🇳 Sénégal',         icon: '🇸🇳', order: 1 }",
         "'senegal':      { label: 'Sénégal',               icon: '',   order: 1 }"),
        ("'francophone':  { label: '🇫🇷 France & TNT',    icon: '🇫🇷', order: 2 }",
         "'francophone':  { label: 'France & TNT',          icon: '',   order: 2 }"),
        ("'sport':        { label: '⚽ Sport Direct',     icon: '⚽', order: 3 }",
         "'sport':        { label: 'Sport Direct',          icon: '',   order: 3 }"),
        ("'cinema':       { label: '🎬 Films & Séries',   icon: '🎬', order: 4 }",
         "'cinema':       { label: 'Films & Séries',        icon: '',   order: 4 }"),
        ("'info':         { label: '📰 Actualités & Info', icon: '📰', order: 5 }",
         "'info':         { label: 'Actualités & Info',     icon: '',   order: 5 }"),
        ("'afrique':      { label: '🌍 Afrique',         icon: '🌍', order: 6 }",
         "'afrique':      { label: 'Afrique',               icon: '',   order: 6 }"),
        ("'documentaire': { label: '🌍 Documentaire',    icon: '🌍', order: 7 }",
         "'documentaire': { label: 'Documentaire',          icon: '',   order: 7 }"),
        ("'jeunesse':     { label: '🧸 Jeunesse',        icon: '🧸', order: 8 }",
         "'jeunesse':     { label: 'Jeunesse',              icon: '',   order: 8 }"),
        ("'music':        { label: '🎵 Musique',         icon: '🎵', order: 9 }",
         "'music':        { label: 'Musique',               icon: '',   order: 9 }"),
        ("'uk':           { label: '🇬🇧 UK & USA',        icon: '🇬🇧', order: 10 }",
         "'uk':           { label: 'UK & USA',              icon: '',   order: 10 }"),
        ("'espagne':      { label: '🇪🇸 Espagne',         icon: '🇪🇸', order: 11 }",
         "'espagne':      { label: 'Espagne',               icon: '',   order: 11 }"),
        ("'allemagne':    { label: '🇩🇪 Allemagne',       icon: '🇩🇪', order: 12 }",
         "'allemagne':    { label: 'Allemagne',             icon: '',   order: 12 }"),
        ("'italie':       { label: '🇮🇹 Italie',          icon: '🇮🇹', order: 13 }",
         "'italie':       { label: 'Italie',                icon: '',   order: 13 }"),
        ("'turquie':      { label: '🇹🇷 Turquie',         icon: '🇹🇷', order: 14 }",
         "'turquie':      { label: 'Turquie',               icon: '',   order: 14 }"),
        ("'albanie':      { label: '🇦🇱 Albanie',         icon: '🇦🇱', order: 15 }",
         "'albanie':      { label: 'Albanie',               icon: '',   order: 15 }"),
        ("'exyu':         { label: '🇷🇸 Ex-Yougoslavie',  icon: '🇷🇸', order: 16 }",
         "'exyu':         { label: 'Ex-Yougoslavie',        icon: '',   order: 16 }"),
        ("'adulte':       { label: '🔞 Adulte (+18)',     icon: '🔞', order: 98 }",
         "'adulte':       { label: 'Adulte (+18)',           icon: '',   order: 98 }"),
        ("'monde':        { label: '🌐 International',    icon: '🌐', order: 99 }",
         "'monde':        { label: 'International',          icon: '',   order: 99 }"),
        # Toasts / messages
        ("showToast(added ? `⭐ \"${name}\" ajoutée aux favoris` : `Retirée des favoris`);",
         "showToast(added ? `\"${name}\" ajoutée aux favoris` : `Retirée des favoris`);"),
        ("showToast(`⚠️ \"${channel.name}\" ne répond pas — masquée.`);",
         "showToast(`\"${channel.name}\" ne répond pas — masquée.`);"),
        ("showToast('🔇 Lecture automatique active — Cliquez pour le son');",
         "showToast('Lecture automatique active — Cliquez pour le son');"),
        ("showToast('🔇 Lecture automatique active — Touchez pour le son');",
         "showToast('Lecture automatique active — Touchez pour le son');"),
        # Speed badges (keep numeric value, remove emojis)
        ("label = `⚡ ${Math.round(kbps / 1000 * 10) / 10} Mbps`;",
         "label = `${Math.round(kbps / 1000 * 10) / 10} Mbps`;"),
        ("label = `🟡 ${Math.round(kbps / 1000 * 10) / 10} Mbps`;",
         "label = `${Math.round(kbps / 1000 * 10) / 10} Mbps`;"),
        ("label = `🔴 ${kbps} Kbps`;",
         "label = `${kbps} Kbps`;"),
        # Quality toasts
        ("showToast('🟡 Flux SD / Débit Économique activé');",
         "showToast('Flux SD / Débit Économique activé');"),
        ("showToast('🔵 Flux HD / Haute Définition activé');",
         "showToast('Flux HD / Haute Définition activé');"),
        ("showToast('🟡 Qualité forcée : Définition Standard');",
         "showToast('Qualité forcée : Définition Standard');"),
        ("showToast('🟮 Qualité forcée : Haute Définition');",
         "showToast('Qualité forcée : Haute Définition');"),
        # Bouquet filter
        ("`<option value=\"all\">⚡ Tous les bouquets M3U (",
         "`<option value=\"all\">Tous les bouquets M3U ("),
        # Category icons in dynamic catMap
        ("catMap.set('tous', { key: 'tous', label: 'Toutes les chaînes', icon: '📺', count: channels.length, order: 0 });",
         "catMap.set('tous', { key: 'tous', label: 'Toutes les chaînes', icon: '',   count: channels.length, order: 0 });"),
        # subText with TV emoji
        ("subText = `📺 ${prog.title}`;",
         "subText = prog.title;"),
        ("carouselSub = `📺 ${prog.title}`;",
         "carouselSub = prog.title;"),
        # Import success toast
        ("showToast(`✅ ${newChannels.length.toLocaleString('fr-FR')} chaîne(s) importée(s) avec succès !`);",
         "showToast(`${newChannels.length.toLocaleString('fr-FR')} chaîne(s) importée(s) avec succès`);"),
        # Channel not available warning
        ("showToast(`⚠️ Canal \"${queryName || targetId}\" non disponible dans cette playlist.`);",
         "showToast(`Canal \"${queryName || targetId}\" non disponible dans cette playlist.`);"),
        # Match launch toasts - keep ▶ as it's a standard Unicode, remove ⚽
        ("showToast(`⚽ ${allMatches.length} matchs réels synchronisés en direct`);",
         "showToast(`${allMatches.length} matchs synchronisés en direct`);"),
        # ESPN badges - remove flag emojis
        ("{ slug: 'uefa.champions', name: 'UEFA Champions League', badge: '🏆 UCL' },",
         "{ slug: 'uefa.champions', name: 'UEFA Champions League', badge: 'UCL' },"),
        ("{ slug: 'fra.1',          name: 'Ligue 1',               badge: '🇫🇷 Ligue 1' },",
         "{ slug: 'fra.1',          name: 'Ligue 1',               badge: 'L1' },"),
        ("{ slug: 'esp.1',          name: 'LaLiga',                badge: '🇪🇸 LaLiga' },",
         "{ slug: 'esp.1',          name: 'LaLiga',                badge: 'LaLiga' },"),
        ("{ slug: 'eng.1',          name: 'Premier League',        badge: '🇬🇧 Premier League' },",
         "{ slug: 'eng.1',          name: 'Premier League',        badge: 'PL' },"),
        ("{ slug: 'ita.1',          name: 'Serie A',               badge: '🇮🇹 Serie A' },",
         "{ slug: 'ita.1',          name: 'Serie A',               badge: 'Serie A' },"),
        ("{ slug: 'ger.1',          name: 'Bundesliga',            badge: '🇩🇪 Bundesliga' }",
         "{ slug: 'ger.1',          name: 'Bundesliga',            badge: 'Bundesliga' }"),
    ]

    count = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            count += 1
        else:
            print(f"  MISS: {old[:60]}")

    # Also fix any remaining icon: '📺' patterns in catMap entries
    content = re.sub(r"icon: '📺'", "icon: ''", content)

    with open('site/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"app.js: {count} replacements done")


def fix_tv_index():
    with open('site/tv/index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    replacements = [
        ('🇸🇳 Sénégal • Direct 24/7', 'Sénégal — Direct 24/7'),
        ('<div class="tv-error-icon">⚠️</div>',
         '<div class="tv-error-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>'),
        ('🇸🇳 Sénégal</span>', 'Sénégal</span>'),
    ]

    count = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            count += 1
        else:
            print(f"  MISS tv/index.html: {old[:60]}")

    with open('site/tv/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"tv/index.html: {count} replacements done")


def fix_tv_app_js():
    with open('site/tv/tv-app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    replacements = [
        ("{ key: 'senegal', label: '🇸🇳 Sénégal' },",
         "{ key: 'senegal', label: 'Sénégal' },"),
        ("{ key: 'francophone', label: '🇫🇷 France & TNT' },",
         "{ key: 'francophone', label: 'France & TNT' },"),
        ("{ key: 'uk', label: '🇬🇧 UK & USA' },",
         "{ key: 'uk', label: 'UK & USA' },"),
        ("{ key: 'espagne', label: '🇪🇸 Espagne' },",
         "{ key: 'espagne', label: 'Espagne' },"),
        ("{ key: 'allemagne', label: '🇩🇪 Allemagne' },",
         "{ key: 'allemagne', label: 'Allemagne' },"),
        ("{ key: 'italie', label: '🇮🇹 Italie' },",
         "{ key: 'italie', label: 'Italie' },"),
        ("{ key: 'exyu', label: '🇷🇸 Ex-Yougoslavie' },",
         "{ key: 'exyu', label: 'Ex-Yougoslavie' },"),
        ("{ key: 'adulte', label: '🔞 Adulte' },",
         "{ key: 'adulte', label: 'Adulte (+18)' },"),
        ("{ key: 'monde', label: '🌐 Monde' }",
         "{ key: 'monde', label: 'Monde' }"),
        ("btn.textContent = b === 'all' ? '⚡ Tous les bouquets' : b;",
         "btn.textContent = b === 'all' ? 'Tous les bouquets' : b;"),
        ('gridLabelEl.textContent = `🔍 Recherche : "${searchQuery.trim()}"`;',
         'gridLabelEl.textContent = `Recherche : "${searchQuery.trim()}"`;'),
        ("descText = `📺 ${prog.title} (${prog.start} - ${prog.end})`;",
         "descText = `${prog.title} (${prog.start} - ${prog.end})`;"),
    ]

    count = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            count += 1
        else:
            print(f"  MISS tv-app.js: {old[:60]}")

    with open('site/tv/tv-app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"tv/tv-app.js: {count} replacements done")


fix_app_js()
fix_tv_index()
fix_tv_app_js()
print("ALL DONE")

