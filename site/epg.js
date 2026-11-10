/**
 * BOKK TV — EPG Engine (Guide des Programmes TV en Temps Réel)
 * Fournit le programme en cours, l'heure de début/fin et le pourcentage écoulé.
 */

(function () {
  'use strict';

  const CHANNEL_GRIDS = {
    // ── TF1 ──
    'tf1': [
      { start: '06:00', end: '08:30', title: 'Bonjour ! La Matinale TF1', desc: 'Informations, chroniques et bonne humeur.' },
      { start: '08:30', end: '09:25', title: 'Téléshopping', desc: 'Le magazine des nouveautés et téléachat.' },
      { start: '09:25', end: '11:00', title: 'Amour, Gloire et Beauté', desc: 'Feuilleton dramatique quotidien.' },
      { start: '11:00', end: '12:00', title: 'Les Feux de l\'Amour', desc: 'Série culte à Genoa City.' },
      { start: '12:00', end: '13:00', title: 'Les 12 Coups de Midi', desc: 'Jeu présenté par Jean-Luc Reichmann.' },
      { start: '13:00', end: '13:45', title: 'Le Journal de 13h', desc: 'Le grand journal de l\'actualité régionale et nationale.' },
      { start: '13:45', end: '15:30', title: 'Téléfilm : Destin Brisé', desc: 'Fiction dramatique inédite.' },
      { start: '15:30', end: '17:30', title: 'Téléfilm Passion & Mystère', desc: 'Suspense et romance.' },
      { start: '17:30', end: '18:30', title: 'Familles Nombreuses : la vie en XXL', desc: 'Docu-réalité immersif.' },
      { start: '18:30', end: '19:10', title: 'Ici tout commence', desc: 'Les aventures des élèves de l\'institut Auguste Armand.' },
      { start: '19:10', end: '20:00', title: 'Demain nous appartient', desc: 'Suspense et intrigues à Sète.' },
      { start: '20:00', end: '20:45', title: 'Le 20h — Le Journal', desc: 'Le grand journal d\'information nationale et internationale.' },
      { start: '20:45', end: '21:10', title: 'C\'est Canteloup', desc: 'Détournement de l\'actualité par Nicolas Canteloup.' },
      { start: '21:10', end: '23:00', title: 'Grand Soir Cinéma & Séries', desc: 'Votre grande soirée divertissement en Haute Définition.' },
      { start: '23:00', end: '01:00', title: 'Late Show & Enquêtes', desc: 'Magazines d\'investigation et rediffusions nocturnes.' },
      { start: '01:00', end: '06:00', title: 'Programmes de la nuit', desc: 'Rediffusions et documentaires.' }
    ],

    // ── FRANCE 2 ──
    'france 2': [
      { start: '06:30', end: '09:30', title: 'Télématin', desc: 'Le premier magazine d\'actualité matinale de France.' },
      { start: '09:30', end: '10:45', title: 'La Maison des Maternelles', desc: 'Conseils pour parents et familles.' },
      { start: '10:45', end: '12:00', title: 'Chacun son tour', desc: 'Jeu animé par Bruno Guillon.' },
      { start: '12:00', end: '13:00', title: 'Tout le monde veut prendre sa place', desc: 'Jeu culte du midi.' },
      { start: '13:00', end: '13:50', title: 'Journal de 13 Heures', desc: 'L\'actualité française et internationale en profondeur.' },
      { start: '13:50', end: '16:05', title: 'Ça commence aujourd\'hui', desc: 'Témoignages émouvants avec Faustine Bollaert.' },
      { start: '16:05', end: '18:00', title: 'Affaire Conclue', desc: 'Ventes aux enchères et trésors d\'antiquités.' },
      { start: '18:00', end: '18:40', title: 'Tout le monde a son mot à dire', desc: 'Jeu de lettres et d\'esprit avec Sidonie Bonnec.' },
      { start: '18:40', end: '20:00', title: 'N\'oubliez pas les paroles', desc: 'Le grand jeu musical de Nagui.' },
      { start: '20:00', end: '20:45', title: 'Journal de 20 Heures', desc: 'L\'édition phare de la rédaction de France Télévisions.' },
      { start: '20:45', end: '21:10', title: 'Un si grand soleil', desc: 'Feuilleton quotidien montpelliérain.' },
      { start: '21:10', end: '23:15', title: 'Envoyé Spécial / Soirée Fiction', desc: 'Grands reportages d\'investigation et cinéma français.' },
      { start: '23:15', end: '01:00', title: 'Complément d\'enquête', desc: 'Les coulisses du pouvoir et des affaires.' },
      { start: '01:00', end: '06:30', title: 'Nuit France 2', desc: 'Documentaires et rediffusions.' }
    ],

    // ── M6 ──
    'm6': [
      { start: '06:00', end: '08:45', title: 'M6 Matin & Météo', desc: 'Clips, infos trafic et météo.' },
      { start: '08:45', end: '10:15', title: 'M6 Boutique', desc: 'Achats et innovations maison.' },
      { start: '10:15', end: '12:45', title: 'Ça peut vous arriver', desc: 'Julien Courbet règle vos litiges en direct.' },
      { start: '12:45', end: '13:35', title: 'Le 12.45', desc: 'Le journal télévisé de la mi-journée.' },
      { start: '13:35', end: '15:20', title: 'Scènes de Ménages', desc: 'Les sketches hilarants des couples préférés des Français.' },
      { start: '15:20', end: '17:25', title: 'Un jour, un destin téléfilm', desc: 'Comédies romantiques et fictions.' },
      { start: '17:25', end: '18:40', title: 'Le Château de mes rêves', desc: 'Le quotidien de propriétaires de châteaux.' },
      { start: '18:40', end: '19:45', title: 'Tous en cuisine / La Meilleure Boulangerie', desc: 'Gastronomie et défis culinaires.' },
      { start: '19:45', end: '20:30', title: 'Le 19.45', desc: 'Toute l\'actualité décryptée en 30 minutes.' },
      { start: '20:30', end: '21:10', title: 'Scènes de Ménages Prime', desc: 'Les inédits avant la grande soirée.' },
      { start: '21:10', end: '23:15', title: 'Top Chef / Grand Film M6', desc: 'La compétition gastronomique au sommet.' },
      { start: '23:15', end: '01:30', title: 'Enquête Exclusive', desc: 'Bernard de La Villardière aux quatre coins du globe.' },
      { start: '01:30', end: '06:00', title: 'M6 Music Night', desc: 'Les meilleurs clips et concerts.' }
    ],

    // ── CANAL+ & CANAL+ SPORT ──
    'canal+': [
      { start: '06:00', end: '11:00', title: 'Le Grand Journal du Cinéma', desc: 'Bandes-annonces, interviews et making-of.' },
      { start: '11:00', end: '13:00', title: 'Premier League Hebdo', desc: 'Résumés et analyses des chocs anglais.' },
      { start: '13:00', end: '15:30', title: 'Cinéma Exclusif Box-Office', desc: 'Les films récents 6 mois après leur sortie en salles.' },
      { start: '15:30', end: '18:00', title: 'Grands Prix Moto & F1', desc: 'Immersion au cœur des paddocks et courses rétro.' },
      { start: '18:00', end: '19:30', title: 'Canal Champions Club', desc: 'Plateau d\'avant-match avec les consultants vedettes.' },
      { start: '19:30', end: '20:50', title: 'Canal Football Club', desc: 'Hervé Mathoux décrypte tous les buts du week-end.' },
      { start: '20:50', end: '23:00', title: 'UEFA Champions League — En Direct', desc: 'Le grand match européen en direct exclusif 1080p.' },
      { start: '23:00', end: '00:30', title: 'Le Debrief Champions League', desc: 'Analyses tactiques, interviews à chaud et résumés.' },
      { start: '00:30', end: '06:00', title: 'Création Originale Canal+', desc: 'Les séries prestigieuses de la chaîne cryptée.' }
    ],

    // ── BEIN SPORTS ──
    'bein': [
      { start: '06:00', end: '10:00', title: 'beIN Center — Tous les Buts', desc: 'Les résumés de la Liga, Serie A et Bundesliga.' },
      { start: '10:00', end: '13:00', title: 'Salon des Légendes', desc: 'Rétrospectives des plus grands matchs de l\'histoire.' },
      { start: '13:00', end: '15:00', title: 'Choc LaLiga en Rediffusion', desc: 'Le Real Madrid et FC Barcelone en action.' },
      { start: '15:00', end: '18:00', title: 'Grand Tour Multisports', desc: 'Tennis ATP, NBA Extra et Handball.' },
      { start: '18:00', end: '19:00', title: 'NBA Extra', desc: 'L\'émission quotidienne dédiée au basket américain.' },
      { start: '19:00', end: '20:30', title: 'Club beIN Europe', desc: 'L\'avant-match des soirées européennes.' },
      { start: '20:30', end: '22:45', title: 'Match en Direct : LaLiga / Serie A', desc: 'Le choc au sommet commenté par les experts beIN.' },
      { start: '22:45', end: '00:00', title: 'L\'After Sport beIN', desc: 'Débats enflammés et réactions en zone mixte.' },
      { start: '00:00', end: '06:00', title: 'Nuit Live NBA', desc: 'Matchs en direct des parquets américains.' }
    ],

    // ── RTS 1 SÉNÉGAL ──
    'rts': [
      { start: '06:30', end: '09:00', title: 'Kinkeliba — La Matinale', desc: 'Actualité, santé, culture et société sénégalaise.' },
      { start: '09:00', end: '11:00', title: 'Séries & Fictions Locales', desc: 'Le meilleur de la comédie et du drame sénégalais.' },
      { start: '11:00', end: '13:00', title: 'Magazine Société & Terroirs', desc: 'À la découverte des richesses du Sénégal profond.' },
      { start: '13:00', end: '13:45', title: 'Le Journal Télévisé de 13h', desc: 'L\'édition d\'information de la mi-journée.' },
      { start: '13:45', end: '16:00', title: 'Musique & Culture Sunugaal', desc: 'Mbalax, hip-hop Galsen et reportages artistiques.' },
      { start: '16:00', end: '18:00', title: 'Émission Jeunesse & Éducation', desc: 'Programmes ludiques et éducatifs.' },
      { start: '18:00', end: '19:30', title: 'Grand Mag des Sports & Lamb', desc: 'Lutte traditionnelle sénégalaise et Ligue 1 locale.' },
      { start: '19:30', end: '20:00', title: 'Journal en Langues Nationales (Wolof, Pulaar...)', desc: 'L\'information accessible à tous.' },
      { start: '20:00', end: '20:45', title: 'Le Journal Télévisé de 20h', desc: 'La grande édition nationale présentée en direct.' },
      { start: '20:45', end: '23:00', title: 'Grand Plateau Débat / Théâtre Sénégalais', desc: 'Politique, société et pièces de théâtre populaires.' },
      { start: '23:00', end: '06:30', title: 'RTS Nuit', desc: 'Rediffusion des grands concerts et documentaires historiques.' }
    ]
  };

  /**
   * Convertit "HH:MM" en minutes depuis minuit
   */
  function timeToMinutes(tStr) {
    const parts = tStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  /**
   * Trouve le programme en cours pour une chaîne donnée à l'heure actuelle
   */
  function getCurrentProgram(channelName) {
    if (!channelName) return null;
    const lower = channelName.toLowerCase();

    let matchedKey = null;
    if (lower.includes('tf1')) matchedKey = 'tf1';
    else if (lower.includes('france 2')) matchedKey = 'france 2';
    else if (lower.includes('m6')) matchedKey = 'm6';
    else if (lower.includes('canal')) matchedKey = 'canal+';
    else if (lower.includes('bein')) matchedKey = 'bein';
    else if (lower.includes('rts') || lower.includes('senegal')) matchedKey = 'rts';

    if (!matchedKey || !CHANNEL_GRIDS[matchedKey]) {
      // Pour les autres chaînes, programme générique intelligent
      return {
        title: 'Diffusion Directe 24/7',
        start: '00:00',
        end: '23:59',
        progress: 50,
        desc: `${channelName} en streaming direct haute fidélité.`
      };
    }

    const grid = CHANNEL_GRIDS[matchedKey];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const prog of grid) {
      const sMin = timeToMinutes(prog.start);
      let eMin = timeToMinutes(prog.end);
      if (eMin <= sMin) eMin += 24 * 60; // Dépasse minuit

      let checkNow = currentMinutes;
      if (checkNow < sMin && eMin > 24 * 60) checkNow += 24 * 60;

      if (checkNow >= sMin && checkNow < eMin) {
        const total = eMin - sMin;
        const elapsed = checkNow - sMin;
        const progress = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
        return {
          title: prog.title,
          start: prog.start,
          end: prog.end,
          desc: prog.desc,
          progress: progress
        };
      }
    }

    return {
      title: 'Programmes de la nuit',
      start: '01:00',
      end: '06:00',
      progress: 30,
      desc: 'Diffusion en continu.'
    };
  }

  // Exposer l'EPG mondialement
  window.BokkEPG = {
    getCurrentProgram: getCurrentProgram,
    getChannelGrid: function (key) {
      return CHANNEL_GRIDS[key] || null;
    },
    getAllGrids: function () {
      return CHANNEL_GRIDS;
    }
  };
})();

