/**
 * BOKK TV — Match Center & Grands Rendez-Vous Sportifs
 * Affiches officielles, programmation des chocs et chaînes de diffusion directe
 */

const FEATURED_MATCHES = [
    {
        id: "match-el-clasico",
        title: "FC Barcelone vs Real Madrid",
        competition: "La Liga EA Sports",
        competitionBadge: "🇪🇸 LA LIGA",
        category: "football",
        stage: "Le Choc des Titans • El Clásico",
        date: "Ce Soir",
        time: "21:00",
        isLive: true,
        liveMinute: "64'",
        score: "2 - 1",
        poster: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "FC Barcelone",
            logo: "https://upload.wikimedia.org/wikipedia/fr/a/a1/Logo_FC_Barcelona.svg"
        },
        teamB: {
            name: "Real Madrid",
            logo: "https://upload.wikimedia.org/wikipedia/fr/c/c7/Logo_Real_Madrid.svg"
        },
        description: "Le plus grand match de football de la planète en direct et en 4K Ultra HD. Qui remportera ce Clásico décisif pour le titre ?",
        channels: [
            { name: "M+ LaLiga 4K", id: 5245, badge: "4K UHD", quality: "4K" },
            { name: "beIN Sports 1 AR", id: 3724, badge: "FHD", quality: "1080p" },
            { name: "DAZN LaLiga 4K", id: 5293, badge: "4K UHD", quality: "4K" },
            { name: "Canal+ Foot HD", id: 3713, badge: "FHD", quality: "1080p" }
        ]
    },
    {
        id: "match-ucl-psg-bayern",
        title: "Paris Saint-Germain vs Bayern Munich",
        competition: "UEFA Champions League",
        competitionBadge: "🏆 LIGUE DES CHAMPIONS",
        category: "football",
        stage: "Phase Finale • Choc Européen",
        date: "Mercredi",
        time: "21:00",
        isLive: false,
        score: "VS",
        poster: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Paris Saint-Germain",
            logo: "https://upload.wikimedia.org/wikipedia/fr/8/86/Paris_Saint-Germain_Logo.svg"
        },
        teamB: {
            name: "Bayern Munich",
            logo: "https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg"
        },
        description: "Soirée magique de Ligue des Champions au Parc des Princes. Le PSG face au géant bavarois pour une qualification historique.",
        channels: [
            { name: "Canal+ Foot HD", id: 3713, badge: "FHD", quality: "1080p" },
            { name: "beIN Sports 2 HD AR", id: 3725, badge: "FHD", quality: "1080p" },
            { name: "M+ Liga de Campeones", id: 3704, badge: "FHD", quality: "1080p" },
            { name: "Canal+ 360", id: 3712, badge: "HD", quality: "720p" }
        ]
    },
    {
        id: "match-premier-league-mancity-arsenal",
        title: "Arsenal vs Manchester City",
        competition: "Premier League",
        competitionBadge: "🇬🇧 PREMIER LEAGUE",
        category: "football",
        stage: "Duel au Sommet de l'Angleterre",
        date: "Dimanche",
        time: "17:30",
        isLive: false,
        score: "VS",
        poster: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Arsenal FC",
            logo: "https://upload.wikimedia.org/wikipedia/fr/5/53/Arsenal_FC.svg"
        },
        teamB: {
            name: "Manchester City",
            logo: "https://upload.wikimedia.org/wikipedia/fr/b/ba/Logo_Manchester_City_2016.svg"
        },
        description: "Bataille titanesque à l'Emirates Stadium entre Mikel Arteta et Pep Guardiola pour le fauteuil de leader de Premier League.",
        channels: [
            { name: "Canal+ Premier League", id: 2774, badge: "FHD", quality: "1080p" },
            { name: "beIN Sports 1 HD AR", id: 3724, badge: "FHD", quality: "1080p" },
            { name: "Canal+ Foot HD", id: 3713, badge: "FHD", quality: "1080p" }
        ]
    },
    {
        id: "match-senegal-can",
        title: "Sénégal vs Maroc",
        competition: "Éliminatoires CAN & Amicaux",
        competitionBadge: "🌍 CHOC DES LIONS",
        category: "senegal",
        stage: "Le Sommet du Football Africain",
        date: "Vendredi",
        time: "20:00",
        isLive: false,
        score: "VS",
        poster: "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Lions de la Teranga",
            logo: "https://upload.wikimedia.org/wikipedia/fr/thumb/5/51/Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg/512px-Logo_F%C3%A9d%C3%A9ration_S%C3%A9n%C3%A9galaise_de_Football.svg.png"
        },
        teamB: {
            name: "Lions de l'Atlas",
            logo: "https://upload.wikimedia.org/wikipedia/fr/thumb/7/7b/F%C3%A9d%C3%A9ration_Royale_Marocaine_de_Football_logo.svg/512px-F%C3%A9d%C3%A9ration_Royale_Marocaine_de_Football_logo.svg.png"
        },
        description: "Les champions d'Afrique sénégalais face aux demi-finalistes mondiaux marocains. Un choc de prestige diffusé sur RTS 1 et beIN Sports.",
        channels: [
            { name: "RTS 1 Sénégal (Direct HD)", id: 71, badge: "FHD", quality: "1080p" },
            { name: "beIN Sports 1 HD AR", id: 3724, badge: "FHD", quality: "1080p" },
            { name: "RTS 2 Sénégal HD", id: 72, badge: "HD", quality: "720p" }
        ]
    },
    {
        id: "event-formula-one",
        title: "Grand Prix de Formule 1",
        competition: "Formula 1 Championship",
        competitionBadge: "🏎️ FORMULE 1",
        category: "f1",
        stage: "Course Officielle en Direct 4K",
        date: "Dimanche",
        time: "15:00",
        isLive: true,
        liveMinute: "Tour 42/78",
        score: "LIVE",
        poster: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Scuderia Ferrari",
            logo: "https://upload.wikimedia.org/wikipedia/fr/5/55/Scuderia_Ferrari_Logo.svg"
        },
        teamB: {
            name: "Red Bull Racing",
            logo: "https://upload.wikimedia.org/wikipedia/fr/7/77/Logo_Red_Bull_Racing.svg"
        },
        description: "Toute l'intensité de la Formule 1 en direct avec caméras embarquées, télémétrie en temps réel et commentaires exclusifs.",
        channels: [
            { name: "F1 MULTI 1 HD", id: 3884, badge: "FHD", quality: "1080p" },
            { name: "Sky Sport F1 FHD", id: 3895, badge: "FHD", quality: "1080p" },
            { name: "Canal+ Sport 360", id: 148, badge: "HD", quality: "720p" },
            { name: "DAZN F1 HD", id: 3896, badge: "HD", quality: "720p" }
        ]
    },
    {
        id: "match-om-psg",
        title: "Olympique de Marseille vs Paris SG",
        competition: "Ligue 1 McDonald's",
        competitionBadge: "🇫🇷 LE CLASSIQUE",
        category: "football",
        stage: "Le Choc Historique de France",
        date: "Dimanche",
        time: "20:45",
        isLive: false,
        score: "VS",
        poster: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Olympique de Marseille",
            logo: "https://upload.wikimedia.org/wikipedia/fr/4/43/Logo_Olympique_de_Marseille.svg"
        },
        teamB: {
            name: "Paris Saint-Germain",
            logo: "https://upload.wikimedia.org/wikipedia/fr/8/86/Paris_Saint-Germain_Logo.svg"
        },
        description: "L'Orange Vélodrome en ébullition pour le Classique du football français. Intensité maximale et ambiance volcanique garantie.",
        channels: [
            { name: "Canal+ Foot HD", id: 3713, badge: "FHD", quality: "1080p" },
            { name: "beIN Sports 1 HD AR", id: 3724, badge: "FHD", quality: "1080p" },
            { name: "Canal+ Sport 360", id: 148, badge: "HD", quality: "720p" }
        ]
    },
    {
        id: "match-ucl-madrid-city",
        title: "Real Madrid vs Manchester City",
        competition: "UEFA Champions League",
        competitionBadge: "🏆 CHOC DES ROIS",
        category: "football",
        stage: "Demi-Finale Légendaire",
        date: "Mardi",
        time: "21:00",
        isLive: false,
        score: "VS",
        poster: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80",
        teamA: {
            name: "Real Madrid",
            logo: "https://upload.wikimedia.org/wikipedia/fr/c/c7/Logo_Real_Madrid.svg"
        },
        teamB: {
            name: "Manchester City",
            logo: "https://upload.wikimedia.org/wikipedia/fr/b/ba/Logo_Manchester_City_2016.svg"
        },
        description: "Le Santiago Bernabéu sous les étoiles de la Champions League. Un duel légendaire entre les deux monstres sacrés d'Europe.",
        channels: [
            { name: "M+ Liga de Campeones", id: 3704, badge: "FHD", quality: "1080p" },
            { name: "beIN Sports 1 HD AR", id: 3724, badge: "FHD", quality: "1080p" },
            { name: "Canal+ Foot HD", id: 3713, badge: "FHD", quality: "1080p" }
        ]
    }
];

if (typeof window !== 'undefined') {
    window.FEATURED_MATCHES = FEATURED_MATCHES;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FEATURED_MATCHES;
}
