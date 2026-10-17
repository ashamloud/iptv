# 📺 BOKK TV — Plateforme IPTV Complète (Web & Mobile)

**BOKK TV** est une suite IPTV moderne tout-en-un comprenant :
1. Une **application Web haute performance** (`iptv/site/`) utilisable immédiatement dans n'importe quel navigateur sur PC, tablette ou Smart TV.
2. Une **application Mobile native** (`iptv/app/`) propulsée par React Native & Expo, prête pour Android et iOS.

---

## 🌟 Fonctionnalités

- **🇸🇳 Chaînes du Sénégal** : RTS 1, TFM, 2sTV, Louga TV HD, A2i TV, GMS TV, RTS 3, SunuLabel TV, TeleMusik Sénégal.
- **⚽ Sport & Football** : beIN SPORTS XTRA, beIN Sports en Español, Alkass Sports HD (1, 2, 4), A Spor HD, KSA Sports 1 & 2 HD, PGA Tour, Rally TV, FloHockey.
- **🇫🇷 Francophone & Monde** : France 24 Français (1080p), AfricaNews Français, TV5 Monde Chefs & Europe, Arte France, BFM 2 HD.
- **🎬 Cinéma & Séries** : 24 Hour Free Movies, 30A Classic Movies, AndTV International Movies, ABN Cinema World.
- **🕌 Religion & Spiritualité** : Touba TV Sénégal, Mouride TV HD, Al Mouridiyyah, Saint Coran Live (Makkah 24/7), Bahrain Quran.
- **🎵 Musique & Culture** : Trace Afrikora (Teranga HD), Trace Africa HD, Trace Urban Africa, TeleMusik Mbalax Live, A2i Music Urban.
- **📂 Importateur de Playlist M3U** : Ajoutez vos propres abonnements ou fichiers `.m3u` / `.m3u8` via URL ou fichier local, sauvegardés automatiquement dans le navigateur.
- **⭐ Système de Favoris** : Mémorisation instantanée de vos chaînes préférées (`localStorage`).
- **🎛️ Lecteur HLS.js Avancé** : Basse latence, bascule automatique en cas de panne (*fallback streams*), plein écran, mode cinéma et image dans l'image (PiP).

---

## 🚀 1. Lancer la Version Web Localement

### Méthode la plus simple :
Double-cliquez sur le fichier :
👉 **[start.bat](file:///d:/Users/Gueladio/Pictures/BOKK/iptv/site/start.bat)**

Cela démarre automatiquement le serveur local et ouvre votre navigateur sur **http://localhost:8080/**.

---

## 🌐 2. Déployer le Site Web Gratuitement en Ligne

Pour que n'importe qui puisse accéder à votre IPTV depuis son smartphone, sa télé ou son ordinateur sans allumer votre PC :

### Option A : Netlify Drop (En 30 secondes, sans commande)
1. Rendez-vous sur **[app.netlify.com/drop](https://app.netlify.com/drop)** (gratuit).
2. Glissez-déposez simplement le dossier **`d:\Users\Gueladio\Pictures\BOKK\iptv\site`** dans votre navigateur.
3. Vous obtenez immédiatement un lien public sécurisé (ex: `https://bokk-tv.netlify.app`) utilisable partout dans le monde !

### Option B : Vercel
1. Installez Vercel CLI ou connectez votre dépôt GitHub sur **[vercel.com](https://vercel.com)**.
2. Le fichier `vercel.json` est déjà configuré dans `site/`.
3. Cliquez sur **Deploy** pour être en ligne en 1 clic.

---

## 📱 3. Installer Node.js et Lancer l'Application Mobile

### Étape 1 : Installer Node.js sur Windows
Si Node.js n'est pas encore installé sur votre ordinateur :
1. Téléchargez la version **LTS** sur le site officiel : **[nodejs.org](https://nodejs.org/)**.
2. Lancez l'installateur `.msi` et suivez les étapes par défaut ("Next" -> "Install").
3. *Alternative via terminal PowerShell (Administrateur) :*
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

### Étape 2 : Installer les dépendances du projet mobile
Ouvrez un terminal dans le dossier mobile :
```bash
cd d:\Users\Gueladio\Pictures\BOKK\iptv\app
npm install
```

### Étape 3 : Tester l'application sur votre smartphone (sans compiler)
1. Installez l'application gratuite **Expo Go** sur votre téléphone Android ([Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)) ou iPhone ([App Store](https://apps.apple.com/app/expo-go/id982107779)).
2. Lancez le serveur Expo :
   ```bash
   npx expo start
   ```
3. Scannez le **QR Code** qui s'affiche à l'écran. L'application BOKK TV se lance instantanément sur votre téléphone !

### Étape 4 : Générer le fichier APK autonome pour Android
Le projet inclut déjà le fichier [eas.json](file:///d:/Users/Gueladio/Pictures/BOKK/iptv/app/eas.json). Pour générer un fichier `.apk` téléchargeable et installable :
```bash
npx eas-cli build -p android --profile preview
```

---

## 🔧 4. Comment Ajouter ou Modifier des Chaînes

Les chaînes sont centralisées de manière synchronisée :
- Pour le Web : dans [iptv/site/channels.js](file:///d:/Users/Gueladio/Pictures/BOKK/iptv/site/channels.js)
- Pour le Mobile : dans [iptv/app/src/data/channels.ts](file:///d:/Users/Gueladio/Pictures/BOKK/iptv/app/src/data/channels.ts)

### Format d'une chaîne :
```typescript
{
  id: 111,
  name: "Nom de la Chaîne",
  url: "https://serveur.com/stream/playlist.m3u8",
  fallbackUrl: "https://serveur-secours.com/stream.m3u8", // Optionnel
  type: "hls",
  category: "senegal", // "senegal", "sport", "francophone", "cinema", "religion", "music"
  badge: "1080p",
  country: "SN",
  desc: "Description courte de la chaîne",
  logo: "https://lien-vers-le-logo.png"
}
```

---

## ⌨️ Raccourcis Clavier Web

| Touche | Action |
|---|---|
| <kbd>Espace</kbd> | Lecture / Pause |
| <kbd>F</kbd> | Plein écran |
| <kbd>T</kbd> | Mode Cinéma / Théâtre |
| <kbd>M</kbd> | Couper / Activer le son |
| <kbd>↓</kbd> | Chaîne suivante |
| <kbd>↑</kbd> | Chaîne précédente |
| <kbd>/</kbd> | Barre de recherche |
| <kbd>?</kbd> | Raccourcis clavier |
| <kbd>Echap</kbd> | Fermer les fenêtres modales |
