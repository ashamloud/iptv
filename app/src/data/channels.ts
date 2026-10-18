// ═══════════════════════════════════════════════════════════════
// BOKK TV — Application Mobile (React Native / Expo)
// Données et types des chaînes en direct
// ═══════════════════════════════════════════════════════════════

export interface Channel {
  id: number;
  name: string;
  url: string;
  type: 'hls' | 'embed' | string;
  category: string;
  country?: string;
  badge?: string;
  desc?: string;
  logo?: string;
  fallbackUrl?: string;
}

export interface Category {
  key: string;
  label: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { key: 'tous',        label: 'Tous',               color: '#6366f1' },
  { key: 'senegal',     label: '🇸🇳 Sénégal',         color: '#3fb950' },
  { key: 'sport',       label: '⚽ Sport',            color: '#f97316' },
  { key: 'francophone', label: '🇫🇷 Francophone',     color: '#3b82f6' },
  { key: 'cinema',      label: '🎬 Films & Séries',   color: '#a855f7' },
  { key: 'religion',    label: '🕌 Religion',        color: '#eab308' },
  { key: 'music',       label: '🎵 Musique',         color: '#ec4899' },
  { key: 'news',        label: '📰 Info',            color: '#22d3ee' },
  { key: 'arab',        label: '🌙 Arabe',           color: '#8b5cf6' },
  { key: 'autres',      label: '📺 Autres',          color: '#64748b' },
];

export const channelsAll: Channel[] = [
  // ═══════════════ SÉNÉGAL (Chaînes Nationales & Régionales) ═══════════════
  {
    id: 101,
    name: "Louga TV HD",
    url: "https://stream.sen-gt.com/Mbacke/myStream/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "HD",
    desc: "Chaîne d'information régionale et culturelle du Sénégal",
    logo: "https://i.ibb.co/xXZ5kFy/unnamed.jpg"
  },
  {
    id: 102,
    name: "A2i TV Sénégal",
    url: "https://stream.sen-gt.com/A2itv/myStream/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "1080p",
    desc: "Actualités, débats et divertissement sénégalais",
    logo: "https://i.imgur.com/YlDFir7.jpg"
  },
  {
    id: 103,
    name: "RTS 1 Sénégal (Direct)",
    url: "https://cs2.push2stream.com/RTS1-DVR/playlist.m3u8",
    fallbackUrl: "http://69.64.57.208/rts1/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "DIRECT",
    desc: "Chaîne publique nationale de la RTS Sénégal",
    logo: "https://upload.wikimedia.org/wikipedia/fr/4/4e/Logo_RTS_1.png"
  },
  {
    id: 104,
    name: "TFM (Télé Futurs Médias)",
    url: "https://raw.githubusercontent.com/Sibprod/streams/main/ressources/dm/py/hls/tfm.m3u8",
    fallbackUrl: "http://69.64.57.208/tfm/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "DIRECT",
    desc: "La chaîne d'information et de divertissement leader au Sénégal",
    logo: "https://upload.wikimedia.org/wikipedia/fr/b/b3/Logo_TFM.png"
  },
  {
    id: 105,
    name: "2sTV Sénégal",
    url: "http://69.64.57.208/2stv/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "DIRECT",
    desc: "Première chaîne privée du Sénégal : culture, musique et talk-shows",
    logo: "https://upload.wikimedia.org/wikipedia/fr/8/87/2stv.png"
  },
  {
    id: 106,
    name: "TeleMusik Sénégal",
    url: "https://58c04fb1d143f.streamlock.net/rezopropartner_1_live/rezopropartner_1_live/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "720p",
    desc: "100% musique sénégalaise, Mbalax et sons urbains d'Afrique de l'Ouest",
    logo: "https://i.imgur.com/dPAPLsd.png"
  },
  {
    id: 107,
    name: "GMS TV Sénégal",
    url: "https://acasmedia6.acangroup.org/gmstv/gmstv_output/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "HD",
    desc: "Grande chaîne d'information, société et culture",
    logo: "https://i.imgur.com/Ue02CIH.png"
  },
  {
    id: 108,
    name: "RTS 3 Sénégal",
    url: "http://145.239.5.177/224/index.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "720p",
    desc: "Chaîne publique jeunesse, sport et culture de la RTS",
    logo: "https://i.imgur.com/UC3olOw.png"
  },
  {
    id: 109,
    name: "SunuLabel TV",
    url: "https://live3.acangroup.org:1929/publiclive/sunulabel/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "480p",
    desc: "Actualités citoyennes et événements au Sénégal",
    logo: "https://i.imgur.com/Ibp7IBk.jpeg"
  },
  {
    id: 110,
    name: "A2i Music Sénégal",
    url: "https://stream.sen-gt.com/A2iMusic/myStream/playlist.m3u8",
    type: "hls",
    category: "senegal",
    country: "SN",
    badge: "720p",
    desc: "Clips musicaux, artistes africains et découvertes",
    logo: "https://i.imgur.com/Fykhzxh.jpg"
  },

  // ═══════════════ SPORT & FOOTBALL ═══════════════
  {
    id: 201,
    name: "beIN SPORTS XTRA",
    url: "https://bein-xtra-bein.amagi.tv/playlist.m3u8",
    fallbackUrl: "https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8",
    type: "hls",
    category: "sport",
    country: "GLOBAL",
    badge: "1080p",
    desc: "Football, matches en direct, analyses et grands rendez-vous sportifs",
    logo: "https://i.ibb.co/HT49GPmB/XTRA-2.png"
  },
  {
    id: 202,
    name: "beIN Sports XTRA en Español",
    url: "https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8",
    type: "hls",
    category: "sport",
    country: "ES",
    badge: "1080p",
    desc: "Couverture football latino-américain, Ligue 1 et compétitions internationales",
    logo: "https://i.imgur.com/V562tpO.png"
  },
  {
    id: 203,
    name: "Alkass One Sports HD",
    url: "https://liveeu-gcp.alkassdigital.net/alkass1-p/main.m3u8",
    type: "hls",
    category: "sport",
    country: "QA",
    badge: "1080p",
    desc: "Chaîne sportive premium : football arabe, coupes et tournois internationaux",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Al_Kass_Sports_Channels_Logo.png"
  },
  {
    id: 204,
    name: "Alkass Two Sports HD",
    url: "https://liveeu-gcp.alkassdigital.net/alkass2-p/main.m3u8",
    type: "hls",
    category: "sport",
    country: "QA",
    badge: "1080p",
    desc: "Diffusion de grands rendez-vous sportifs en haute définition",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Al_Kass_Sports_Channels_Logo.png"
  },
  {
    id: 205,
    name: "Alkass Four Sports HD",
    url: "https://liveeu-gcp.alkassdigital.net/alkass4-p/main.m3u8",
    type: "hls",
    category: "sport",
    country: "QA",
    badge: "1080p",
    desc: "Sports en direct, athlétisme et tournois mondiaux",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Al_Kass_Sports_Channels_Logo.png"
  },
  {
    id: 206,
    name: "A Spor HD",
    url: "https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8",
    type: "hls",
    category: "sport",
    country: "TR",
    badge: "1080p",
    desc: "Grands matchs de football, actualités sportives et talk-shows sport",
    logo: "https://i.imgur.com/ZhkZzLf.png"
  },
  {
    id: 207,
    name: "KSA Sports 1 HD",
    url: "https://aloula-redirect.vercel.app/9/playlist.m3u8",
    type: "hls",
    category: "sport",
    country: "SA",
    badge: "1080p",
    desc: "Saudi Pro League (Ronaldo, Mané, Benzema) et événements sportifs",
    logo: "https://upload.wikimedia.org/wikipedia/en/e/eb/KSA_Sports_logo.png"
  },
  {
    id: 208,
    name: "KSA Sports 2 HD",
    url: "https://aloula-redirect.vercel.app/10/playlist.m3u8",
    type: "hls",
    category: "sport",
    country: "SA",
    badge: "1080p",
    desc: "Saudi Sports Channel 2 : matchs et compétitions en continu",
    logo: "https://upload.wikimedia.org/wikipedia/en/e/eb/KSA_Sports_logo.png"
  },
  {
    id: 209,
    name: "PGA Tour Golf",
    url: "https://d11k1mnrgfposz.cloudfront.net/playlist.m3u8",
    type: "hls",
    category: "sport",
    country: "US",
    badge: "1080p",
    desc: "Circuit professionnel mondial de golf, tournois et résumés en direct",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/eb/PGA_Tour_logo.svg/800px-PGA_Tour_logo.svg.png"
  },
  {
    id: 210,
    name: "30A Golf Kingdom",
    url: "https://30a-tv.com/feeds/vidaa/golf.m3u8",
    type: "hls",
    category: "sport",
    country: "US",
    badge: "720p",
    desc: "Golf international, entraînements de champions et compétitions",
    logo: "https://i.imgur.com/Lv53nh4.png"
  },
  {
    id: 211,
    name: "FloHockey 24/7",
    url: "https://amg02278-amg02278c2-flosports-worldwide-9916.playouts.now.amagi.tv/playlist.m3u8",
    type: "hls",
    category: "sport",
    country: "US",
    badge: "1080p",
    desc: "Matchs de hockey sur glace et tournois 24h/24",
    logo: "https://amg02278-amg02278c2-flosports-worldwide-9916.playouts.now.amagi.tv/playlist.m3u8"
  },
  {
    id: 212,
    name: "Rally TV Live",
    url: "https://rally-tv-live.akamaized.net/hls/live/2117704/RallyTV-Pri/master.m3u8",
    type: "hls",
    category: "sport",
    country: "EU",
    badge: "1080p",
    desc: "WRC et courses automobiles de rallye en immersion totale",
    logo: "https://rally-tv-live.akamaized.net/hls/live/2117704/RallyTV-Pri/master.m3u8"
  },

  // ═══════════════ FRANCOPHONE & MONDE ═══════════════
  {
    id: 301,
    name: "France 24 Français",
    url: "https://live.france24.com/hls/live/2037179-b/F24_FR_HI_HLS/master_5000.m3u8",
    type: "hls",
    category: "francophone",
    country: "FR",
    badge: "1080p",
    desc: "L'actualité internationale 24h/24 en direct et en continu",
    logo: "https://i.imgur.com/u8N6uoj.png"
  },
  {
    id: 302,
    name: "AfricaNews Français",
    url: "https://cdn-euronews.akamaized.net/live/eds/africanews-fr/25050/index.m3u8",
    type: "hls",
    category: "francophone",
    country: "AFR",
    badge: "1080p",
    desc: "L'information panafricaine indépendante et les grands dossiers du continent",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Africanews_logo.svg/800px-Africanews_logo.svg.png"
  },
  {
    id: 303,
    name: "TV5 Monde Chefs",
    url: "https://tvf-tv5ch.otteravision.com/tvf/tv5ch/tv5ch.m3u8",
    type: "hls",
    category: "francophone",
    country: "FR",
    badge: "1080p",
    desc: "Gastronomie francophone, art de vivre et cuisine du monde",
    logo: "https://psi.tv5monde.com/media/static/default/lives/tv5monde-chef.png"
  },
  {
    id: 304,
    name: "Arte France",
    url: "http://145.239.5.177/300/index.m3u8",
    type: "hls",
    category: "francophone",
    country: "FR",
    badge: "720p",
    desc: "Documentaires d'exception, cinéma d'auteur et culture européenne",
    logo: "https://i.imgur.com/ecXMjNl.png"
  },
  {
    id: 305,
    name: "BFM 2 HD",
    url: "https://d1ib1gsg71oarf.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-scp7wda722jph/BFM2_FR.m3u8",
    type: "hls",
    category: "francophone",
    country: "FR",
    badge: "1080p",
    desc: "Le direct événementiel et les actualités BFM en haute définition",
    logo: "https://alloforfait.fr/wp-content/uploads/2024/03/logo-bfm2-300x200.jpg"
  },
  {
    id: 306,
    name: "TV5 Monde Europe",
    url: "http://5.180.164.197:8080/TV5MONDE/index.m3u8",
    type: "hls",
    category: "francophone",
    country: "FR",
    badge: "1080p",
    desc: "Films, fictions françaises et divertissement international",
    logo: "https://i.imgur.com/rPAbMSu.png"
  },

  // ═══════════════ FILMS & SÉRIES (CINÉMA) ═══════════════
  {
    id: 401,
    name: "24 Hour Free Movies",
    url: "https://d1j2u714xk898n.cloudfront.net/scheduler/scheduleMaster/145.m3u8",
    type: "hls",
    category: "cinema",
    country: "US",
    badge: "720p",
    desc: "Diffusion non-stop de longs métrages, films cultes et action 24h/24",
    logo: "https://i.imgur.com/iSVnzR1.png"
  },
  {
    id: 402,
    name: "30A Classic Movies",
    url: "https://30a-tv.com/feeds/pzaz/30atvmovies.m3u8",
    type: "hls",
    category: "cinema",
    country: "US",
    badge: "720p",
    desc: "Les grands classiques du 7ème art, aventures et comédies d'époque",
    logo: "https://30a-tv.com/feeds/pzaz/30atvmovies.m3u8"
  },
  {
    id: 403,
    name: "AndTV Cinéma International",
    url: "https://amg01117-amg01117c1-amgplt0029.playout.now3.amagi.tv/playlist/amg01117-amg01117c1-amgplt0029/playlist.m3u8",
    type: "hls",
    category: "cinema",
    country: "INT",
    badge: "1080p",
    desc: "Cinéma international, superproductions et séries dramatiques",
    logo: "https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SYMANDTV/images/LOGO_HD/LOGO_HD_image.png"
  },
  {
    id: 404,
    name: "ABN Cinema World",
    url: "https://mediaserver.abnvideos.com/streams/abnbiblemovies.m3u8",
    type: "hls",
    category: "cinema",
    country: "US",
    badge: "720p",
    desc: "Films historiques, fresques dramatiques et récits universels",
    logo: "https://i.imgur.com/NCqZdaL.png"
  },

  // ═══════════════ RELIGION & SPIRITUALITÉ ═══════════════
  {
    id: 501,
    name: "Touba TV Sénégal (Direct)",
    url: "https://endour.net/hls/One_nationtv/index.m3u8",
    fallbackUrl: "https://goccn.cloud/hls/amanitv/index.m3u8",
    type: "hls",
    category: "religion",
    country: "SN",
    badge: "DIRECT",
    desc: "Chaîne mouride de référence : enseignements de Cheikh Ahmadou Bamba et Magal",
    logo: "https://yt3.googleusercontent.com/ytc/AIdro_kM6r7Xq92h8pA=s900-c-k-c0x00ffffff-no-rj"
  },
  {
    id: 502,
    name: "Mouride TV HD",
    url: "https://stream.sen-gt.com/A2iReligion/myStream/playlist.m3u8",
    type: "hls",
    category: "religion",
    country: "SN",
    badge: "DIRECT",
    desc: "Conférences religieuses, Qasaïds et retransmissions spirituelles",
    logo: "https://i.imgur.com/54WrwyN.jpg"
  },
  {
    id: 503,
    name: "Al Mouridiyyah TV",
    url: "https://goccn.cloud/hls/amanitv/index.m3u8",
    type: "hls",
    category: "religion",
    country: "SN",
    badge: "DIRECT",
    desc: "Médiathèque et diffusion en continu de la communauté mouride",
    logo: "https://upload.wikimedia.org/wikipedia/commons/e/ea/Al_Mouridiyyah.png"
  },
  {
    id: 504,
    name: "Saint Coran Live (Makkah)",
    url: "https://live.kwikmotion.com/sbrksaquranradiolive/srpksaquranradio/playlist.m3u8",
    type: "hls",
    category: "religion",
    country: "SA",
    badge: "1080p",
    desc: "Récitations sacrées du Saint Coran en continu depuis La Mecque",
    logo: "https://aloula.faulio.com/storage/mediagallery/14/da/fullhd_823bc2fe722ede75410492d57fd6c201208b4224.png"
  },
  {
    id: 505,
    name: "Bahrain Quran TV",
    url: "https://5c7b683162943.streamlock.net/live/ngrp:bahrainquran_all/playlist.m3u8",
    type: "hls",
    category: "religion",
    country: "BH",
    badge: "720p",
    desc: "Chaîne religieuse dédiée à la récitation et aux exégèses du Coran",
    logo: "https://i.imgur.com/er5hOK4.png"
  },

  // ═══════════════ MUSIQUE & CULTURE ═══════════════
  {
    id: 601,
    name: "Trace Afrikora (Teranga)",
    url: "https://channels.trace.plus/Traceprod/TERANGA_hd/index.m3u8",
    type: "hls",
    category: "music",
    country: "SN",
    badge: "1080p",
    desc: "Musique ouest-africaine, Mbalax, Mandingue et Afrobeats 24h/24",
    logo: "https://channels.trace.plus/Traceprod/TERANGA_hd/index.m3u8"
  },
  {
    id: 602,
    name: "Trace Africa",
    url: "https://channels.trace.plus/Traceprod/AFRICA_FR_hd/index.m3u8",
    type: "hls",
    category: "music",
    country: "AFR",
    badge: "1080p",
    desc: "La chaîne musicale numéro 1 des rythmes africains",
    logo: "https://channels.trace.plus/Traceprod/AFRICA_FR_hd/index.m3u8"
  },
  {
    id: 603,
    name: "Trace Urban Africa",
    url: "https://channels.trace.plus/Traceprod/URBAN_AFRIC_FR_hd/index.m3u8",
    type: "hls",
    category: "music",
    country: "AFR",
    badge: "1080p",
    desc: "Le meilleur du Hip-Hop, R&B et Trap africain",
    logo: "https://channels.trace.plus/Traceprod/URBAN_AFRIC_FR_hd/index.m3u8"
  },
  {
    id: 604,
    name: "TeleMusik Mbalax Live",
    url: "https://58c04fb1d143f.streamlock.net/rezopropartner_1_live/rezopropartner_1_live/playlist.m3u8",
    type: "hls",
    category: "music",
    country: "SN",
    badge: "720p",
    desc: "Vidéoclips Mbalax, concerts et lives exclusifs",
    logo: "https://i.imgur.com/dPAPLsd.png"
  },
  {
    id: 605,
    name: "A2i Music Urban",
    url: "https://stream.sen-gt.com/A2iMusic/myStream/playlist.m3u8",
    type: "hls",
    category: "music",
    country: "SN",
    badge: "720p",
    desc: "Afrobeats, Rap Galsen et nouvelles tendances musicales",
    logo: "https://i.imgur.com/Fykhzxh.jpg"
  },

  // ═══════════════ CHAÎNES ARABES & INTERNATIONALES ═══════════════
  {
    id: 701,
    name: "Alkass Three HD",
    url: "https://liveeu-gcp.alkassdigital.net/alkass3-p/main.m3u8",
    type: "hls",
    category: "arab",
    country: "QA",
    badge: "1080p",
    desc: "Directs sportifs et émissions d'analyse en langue arabe",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Al_Kass_Sports_Channels_Logo.png"
  },
  {
    id: 702,
    name: "Alkass Six HD",
    url: "https://liveeu-gcp.alkassdigital.net/alkass6-p/main.m3u8",
    type: "hls",
    category: "arab",
    country: "QA",
    badge: "1080p",
    desc: "Compétitions régionales du Golfe et retransmissions spéciales",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Al_Kass_Sports_Channels_Logo.png"
  }
];

export default channelsAll;
