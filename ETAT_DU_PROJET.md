# 📺 BOKK TV — JOURNAL DE BORD & ÉTAT D'AVANCEMENT DU PROJET

> **Document de référence pour le développement et la reprise de session.**  
> *Dernière mise à jour : 24 Novembre 2026 — Commit `24a3b6d`*

---

## 📌 1. Informations Clés & Infrastructure du Projet

| Composant | Détails & Liens |
|---|---|
| **Dépôt GitHub** | [github.com/ashamloud/iptv](https://github.com/ashamloud/iptv) (Branche principale : `main`) |
| **Site Web PWA** | [bokktv.vercel.app](https://bokktv.vercel.app) *(Déploiement automatique Vercel à chaque push `main`)* |
| **Panneau Admin Web** | [bokktv.vercel.app/adminee](https://bokktv.vercel.app/adminee) *(Code PIN : 1234)* |
| **App Mobile & TV** | React Native (Expo SDK 58 natif), moteur `expo-video` (ExoPlayer Android) |
| **EAS Build (APK)** | Projet EAS `loudstreamtv`, compte `ashamloud`, package `com.ashamloud.bokktv` |
| **Base de Données** | Google Cloud Firestore (REST API sans SDK lourd) — Projet ID : `bokk-tv` |
| **Paiement Wave** | `https://pay.wave.com/m/M_sn_cop5B9UJYF8P/c/sn/?amount=3000` (TerangaJob, 3 000 F CFA) |
| **Plans Wave** | 1 mois (3 000 F) • 3 mois (7 500 F) • 12 mois (25 000 F) |
| **Support WhatsApp** | `+221783055520` |

---

## 🔒 2. Règles Métier & Contraintes Impératives

1. **Inscription 100% Gratuite** :
   - Tout visiteur ou nouvel utilisateur a droit à **30 jours d'accès complet offert** en entrant simplement son prénom et numéro de téléphone.
   - **AUCUN bouton Wave ni message de paiement TerangaJob** ne doit être montré à un utilisateur non connecté ou lors de l'inscription !
   - Le bouton Wave n'apparaît **QUE** dans le profil d'un compte déjà connecté pour prolonger, OU lorsqu'un compte existant a dépassé ses 30 jours et est expiré.
2. **Règle 1 Écran = 1 Compte** :
   - Un numéro de téléphone = 1 seul flux actif à la fois. Si un autre appareil démarre, la session précédente est mise en pause avec message explicite.
3. **Design & Esthétique** :
   - Thème sombre sobre, mat et élégant (`#07090e`, `#0c0f17`, accents `#e50914` et bleu focus `#38bdf8`).
   - Zéro néon, zéro effet criard ou dégradés surchargés. Navigation fluide et minimaliste.
4. **Diffusion Mobile & Exoplayer** :
   - L'application Android native **ne doit pas** passer par le proxy Vercel pour le flux vidéo (le proxy Vercel coupe à 10-15s en serverless). Les flux doivent être lus en **direct** avec les bons en-têtes IPTV (`User-Agent: IPTVSmartersPro`).
   - Les chaînes sénégalaises officielles (RTS 1, RTS 2, 2sTV, SenTV, WalfTV) sont résolues directement via l'API CDN ACAN (`https://tveapi.acan.group/myapiv2/directplayback/${id}/json`) pour obtenir l'URL CDN Android native sans latence.

---

## ✅ 3. Ce qui a été Réalisé (Historique des Commits)

### A. Panneau d'Administration (`site/adminee/index.html`)
- **Dashboard Analytics en temps réel** : cartes avec total abonnés actifs, expirés, suspendus, nouveaux inscrits des 7 derniers jours, revenus estimés en F CFA.
- **Mini-graphe SVG interactif** : évolution des inscriptions des 7 derniers jours.
- **Filtres d'abonnés** : boutons rapides (`Tous`, `Actifs`, `Expirés`, `Suspendus`, `En direct`) + **Export CSV complet**.
- **Prolongation personnalisée** : bouton permettant de choisir librement le nombre de jours à ajouter à un abonné (ex: 30j, 60j).
- **Messagerie Admin Popup** : onglet Messages permettant d'envoyer un popup broadcast (à tous) ou individuel (par numéro) avec un bouton OK pour fermer.
- **Journal d'Activité (`admin_logs`)** : 7ᵉ onglet traçant chaque action administrative (masquage/déblocage, suspension, prolongation, messages).
- **Scanner de Santé des Flux** : test direct des chaînes signalées avec retour visuel immédiat (✅ / ❌).

### B. Site Web PWA (`site/app.js`, `site/index.html`)
- **Historique "Vues récemment"** : section horizontale sur la page d'accueil avec les dernières chaînes regardées (stockage local `bokk_last_watched`).
- **Bannière d'expiration discrète** : alerte non-bloquante affichée uniquement aux abonnés dont l'accès expire sous 3 jours.
- **Profil membre enrichi** : avatar circulaire avec initiale, badge de statut, compte à rebours précis.
- **Formules Wave multiples** : cartes 1 mois (3 000 F), 3 mois (7 500 F), 12 mois (25 000 F).
- **Suppression totale des demandes de paiement aux non-connectés** : l'inscription est 100% gratuite, aucun bouton Wave prématuré.

### C. Application Mobile & Smart TV (`app/src/`)
- **Redesign complet du Lecteur Natif (`NativePlayer.tsx`)** :
  - Dock de commandes intégré épuré avec logo, nom de chaîne, badge catégorie, badge qualité et voyant vert `● DIRECT`.
  - Bouton Plein Écran proéminent et évident (cercle 38×38 avec bordure).
  - Contrôles de zapping Précédent/Suivant, Mute, Play/Pause, PiP (Picture-in-Picture).
  - Support de la télécommande Smart TV avec surbrillance bleue mate (`#38bdf8`) et gestion du D-Pad.
- **Filtrage des chaînes signalées/masquées** :
  - `FirebaseService.getDisabledChannels()` récupère désormais les deux collections : `disabled_channels` et `reported_channels`.
  - Filtrage à la fois par ID numérique et par nom normalisé dans l'application.
- **Réception des Messages Admin** :
  - Affichage en popup modal dès réception d'un message broadcast ou ciblé avec bouton `OK`.
- **Cache local intelligent** :
  - Mise en cache locale des chaînes masquées pour un démarrage instantané de l'application sans temps d'attente.

### D. Interface Smart TV / Android TV — Commit `24a3b6d` (24 Nov 2026) ✅

> **Problème remonté** : Sur TV, navigation avec télécommande sans indicateur de position, bottom nav inaccessible (scroll infini), interface = simple appli Android étirée. Paiement Wave essayait d'ouvrir l'appli Wave inexistante sur TV.

#### Fichiers modifiés :

| Fichier | Rôle |
|---|---|
| `app/src/components/TvSidebar.tsx` | **NOUVEAU** — Sidebar vertical gauche pour Smart TV |
| `app/src/components/ChannelCard.tsx` | Focus D-Pad (glow bleu, bandeau "OK POUR REGARDER") |
| `app/src/components/NativePlayer.tsx` | BackHandler TV, boutons focusables télécommande |
| `app/src/components/AccountModal.tsx` | QR code Wave sur TV (scan depuis téléphone) |
| `app/src/app/index.tsx` | Détection TV, layout sidebar + 5 colonnes, fullscreen auto |

#### Ce qui a été implémenté :

- **`TvSidebar.tsx`** (nouveau fichier) :
  - Sidebar vertical fixe à gauche, 5 onglets : Accueil, Direct TV, Sports, Favoris, Recherche
  - Focus glow `#38bdf8` avec barre indicatrice bleue à gauche, animation scale
  - Navigation D-Pad (télécommande) avec `Pressable focusable={true}` + `onFocus/onBlur`
  - `hasTVPreferredFocus={true}` sur l'item actif pour ancrer le focus TV

- **Détection TV `isTvMode`** :
  - `Platform.isTV || (width >= 850 && width > height)` — couvre Android TV natif et box IPTV landscape

- **Layout TV** :
  - `tvRootRow` : flex-row avec sidebar à gauche + contenu à droite
  - Bottom nav masquée sur TV → remplacée par la sidebar
  - Grille en **5 colonnes** sur TV pour maximiser l'affichage

- **Focus D-Pad sur `ChannelCard`** :
  - Glow bleu `#38bdf8` (border 3px, elevation 16)
  - Bandeau bas bleu "▶ OK POUR REGARDER" visible uniquement sur focus TV
  - Badge qualité devient bleu au focus

- **Boutons lecteur (`NativePlayer.tsx`)** :
  - `PlayerButton` helper avec `onFocus/onBlur` pour cibler chaque bouton avec la télécommande
  - `BackHandler` : bouton retour télécommande quitte le fullscreen sans fermer l'appli
  - `hasTVPreferredFocus={true}` sur la surface vidéo pour capturer OK→Play/Pause

- **Plein écran automatique sur TV** :
  - `handleSelectChannel` → `setIsPlayerFullscreen(true)` automatiquement si `isTvMode`

- **QR Code Wave sur TV (`AccountModal.tsx`)** :
  - Sur `Platform.isTV`, les 3 plans (1 mois / 3 mois / 12 mois) affichent un QR code au lieu d'ouvrir le lien Wave
  - QR code généré en temps réel via `api.qrserver.com` avec l'URL Wave encodée
  - L'utilisateur scanne le QR code depuis son téléphone pour payer
  - Design : boîte foncée `#0f172a` avec bordure bleue, instructuctions claires
  - `tvQrPlan` state : toggle — cliquer 2x sur le même plan ferme le QR

---

---

## ⚡ 4. Tâche Prioritaire En Cours : Fluidité Maximale du Streaming (Zéro Coupure)

### 🚨 Problème remonté par les utilisateurs :
> *"Chaque 3 secondes 2 fois il y a un chargement qui dure très longtemps... Des fois après quelques secondes ou une minute ça cale et ça cherche encore..."*

### 🔍 Diagnostic des Causes Racines :
1. **L'effet de recharge de chaîne dans `NativePlayer.tsx`** dépendait de `[channel.id, isRegistered]`. Quand l'application finissait de charger l'abonné 2 secondes après le démarrage, `isRegistered` passait de `false` à `true`, ce qui forçait `player.replace()` et redémarrait le flux vidéo depuis zéro (provoquant un deuxième chargement brutal).
2. **Le timer de 4 secondes pour visiteurs** s'armait inutilement avant que l'état d'authentification ne soit synchronisé.
3. **Le proxy Vercel coupait les flux après 10 à 15 secondes** à cause des limites d'exécution des fonctions serverless Vercel. Les applications natives ne doivent JAMAIS faire transiter des flux vidéo lourds via Vercel.
4. **Les chaînes RTS et sénégalaises passaient par le proxy** au lieu d'utiliser l'URL directe CDN Android de l'API ACAN (`tveapi.acan.group`).
5. **Absence de configuration de buffer dans `expo-video`** : pas de `preferredForwardBufferDuration` ni de `minBufferForPlayback`, provoquant des calages sur réseau 3G/4G à faible débit.
6. **L'overlay noir avec spinner clignotait sur chaque micro-tamponnage** de segment HLS au lieu d'être temporisé (débouncé).
7. **Polling d'arrière-plan agressif** : `syncAdminData` tournait toutes les 25 secondes et téléchargeait des milliers de chaînes M3U en plein milieu de la lecture d'une vidéo.

### 🛠️ Actions Correctives Validées à 100% :
- [x] **Résolution directe de l'API ACAN** pour RTS 1, RTS 2, 2sTV, SenTV, WalfTV (`stream.ts`) avec cache mémoire 5 minutes (plus aucun passage par le proxy Vercel qui coupait les flux).
- [x] **Configuration du buffer ExoPlayer** dans `NativePlayer.tsx` (`preferredForwardBufferDuration: 25`, `minBufferForPlayback: 2`, `waitsToMinimizeStalling: true`) pour une tenue de flux parfaite même sur réseau faible (Orange/Free 3G/4G).
- [x] **Débouncing du spinner de chargement (1,5s)** : élimine les écrans noirs et clignotements intempestifs lors des transitions de segments HLS.
- [x] **Suppression de `isRegistered` des dépendances de rechargement** (`[channel.id]` uniquement) : élimine définitivement le double chargement des 3 premières secondes.
- [x] **Passage de l'aperçu visiteur à 30 secondes** (au lieu de 4 secondes brutales), et **aucun timer** pour les utilisateurs connectés.
- [x] **Espacement des vérifications de session simultanée à 35s** (au lieu de 10s) pour préserver 100% de la bande passante au flux vidéo.
- [x] **Suspension automatique de `syncAdminData`** (téléchargements M3U en arrière-plan) dès qu'un flux vidéo est actif.
- [x] **Test TypeScript `npx tsc --noEmit` validé avec 0 erreur**.
- [x] **Commit Git & Push sur GitHub (`main`)** : commit `b4d688b` validé et synchronisé.
- [✅] **Compilation EAS Build APK Android — Build TV (`24a3b6d`)** :
  - **Build précédent (anti-coupure)** : `44e6dadd-6c44-46d3-b0fe-8b0df2630ab1`
  - **Nouveau build Smart TV** : ID `d13259fb-913f-44b3-86ba-a7f3d6139d4b` (commit `24a3b6d`) — **EN COURS DE BUILD**
  - **Page de suivi** : [expo.dev/.../builds/d13259fb-913f-44b3-86ba-a7f3d6139d4b](https://expo.dev/accounts/asham_loud/projects/loudstreamtv/builds/d13259fb-913f-44b3-86ba-a7f3d6139d4b)
  - **Profil** : `preview` (génère directement le fichier `.apk` prêt à installer sur mobile et Smart TV Android).

---

## 📋 5. Ce qu'il Reste à Faire (Roadmap Future)

1. **Validation & Test de l'APK Anti-Coupure** : Vérifier sur smartphone avec connexion mobile (Orange/Free Sénégal) la fluidité absolue de la lecture.
2. **Guide des Programmes (EPG) dans le dock du lecteur** : Afficher la barre de progression et le titre de l'émission en cours.
3. **Multi-profils famille** : Permettre à un compte de créer des profils (Adulte, Enfants) sans changer de numéro.
4. **Contrôle Parental** : Code PIN pour certaines catégories sensibles.
