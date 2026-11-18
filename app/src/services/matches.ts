// ═══════════════════════════════════════════════════════════════
// BOKK TV — Service des Matchs & Chocs Sportifs en Direct
// Données officielles temps réel (ESPN Scoreboard & Vercel API)
// ═══════════════════════════════════════════════════════════════

export interface TeamInfo {
  name: string;
  logo: string;
}

export interface MatchItem {
  id: string;
  title: string;
  competition: string;
  competitionBadge: string;
  teamA: TeamInfo;
  teamB: TeamInfo;
  score: string;
  time: string;
  date: string;
  isLive: boolean;
  liveMinute?: string | null;
  channels?: string;
  rawDate?: number;
}

const DEFAULT_TV_LOGO = 'https://cdn-icons-png.flaticon.com/512/53/53283.png';

const COMPETITION_CHANNELS: Record<string, string> = {
  'Ligue 1': 'Canal+ Sport 360 / beIN Sports 1',
  'Premier League': 'Canal+ Sport / Canal+ Foot',
  'LaLiga': 'beIN Sports 1 / beIN Sports 2',
  'UEFA Champions League': 'Canal+ Foot / beIN Sports 1',
  'Serie A': 'beIN Sports 2 / beIN Sports 3',
  'Bundesliga': 'beIN Sports 3',
  'default': 'Canal+ Sport / beIN Sports 1'
};

export const MatchesService = {
  async getLiveAndUpcomingMatches(): Promise<MatchItem[]> {
    try {
      // 1. Tenter le proxy local/Vercel
      try {
        const localRes = await fetch('https://bokktv.vercel.app/api/matches', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (localRes.ok) {
          const data = await localRes.json();
          if (Array.isArray(data) && data.length > 0) {
            return data.slice(0, 15);
          }
        }
      } catch {}

      // 2. Fetch direct via API ESPN (temps réel gratuit sans clé)
      const leagues = [
        { slug: 'uefa.champions', name: 'Champions League', badge: 'UCL' },
        { slug: 'fra.1',          name: 'Ligue 1',          badge: 'L1' },
        { slug: 'eng.1',          name: 'Premier League',   badge: 'PL' },
        { slug: 'esp.1',          name: 'LaLiga',           badge: 'LALIGA' },
        { slug: 'ita.1',          name: 'Serie A',          badge: 'SERIE A' },
        { slug: 'ger.1',          name: 'Bundesliga',       badge: 'BUNDESLIGA' }
      ];

      const matches: MatchItem[] = [];
      const now = new Date();
      const nowTs = Date.now();
      const tomorrow = new Date(nowTs + 24 * 3600 * 1000);

      await Promise.allSettled(
        leagues.map(async (league) => {
          try {
            const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            const events = data.events || [];

            events.forEach((ev: any) => {
              const comp = ev.competitions?.[0];
              if (!comp || !comp.competitors || comp.competitors.length < 2) return;

              const home = comp.competitors.find((c: any) => c.homeAway === 'home') || comp.competitors[0];
              const away = comp.competitors.find((c: any) => c.homeAway === 'away') || comp.competitors[1];

              const evDate = new Date(ev.date);
              const evTs = evDate.getTime();
              const state = comp.status?.type?.state || 'pre';
              const isLive = state === 'in';
              const isFinished = state === 'post';

              // Ignorer les matchs terminés depuis plus de 2 heures
              if (isFinished || (evTs < nowTs - 7200000 && !isLive)) {
                return;
              }

              let liveMinute: string | null = null;
              if (isLive) {
                liveMinute = comp.status?.type?.detail || 'LIVE';
              }

              let scoreText = 'VS';
              if (home.score !== undefined && away.score !== undefined && (isLive || isFinished)) {
                scoreText = `${home.score} - ${away.score}`;
              }

              const isEvToday =
                evDate.getDate() === now.getDate() &&
                evDate.getMonth() === now.getMonth() &&
                evDate.getFullYear() === now.getFullYear();
              const isEvTomorrow =
                evDate.getDate() === tomorrow.getDate() &&
                evDate.getMonth() === tomorrow.getMonth() &&
                evDate.getFullYear() === tomorrow.getFullYear();

              let dateStr = evDate.toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
              });
              if (isEvToday) dateStr = "Aujourd'hui";
              else if (isEvTomorrow) dateStr = 'Demain';

              const timeStr = evDate.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
              });

              matches.push({
                id: `espn-${ev.id}`,
                title: `${home.team?.displayName || 'Équipe 1'} vs ${away.team?.displayName || 'Équipe 2'}`,
                competition: league.name,
                competitionBadge: league.badge,
                teamA: {
                  name: home.team?.shortDisplayName || home.team?.displayName || 'Dom.',
                  logo: home.team?.logo || DEFAULT_TV_LOGO
                },
                teamB: {
                  name: away.team?.shortDisplayName || away.team?.displayName || 'Ext.',
                  logo: away.team?.logo || DEFAULT_TV_LOGO
                },
                score: scoreText,
                time: timeStr,
                date: dateStr,
                isLive,
                liveMinute,
                channels: COMPETITION_CHANNELS[league.name] || COMPETITION_CHANNELS['default'],
                rawDate: evTs
              });
            });
          } catch {}
        })
      );

      // Trier : direct en premier, puis par date chronologique
      matches.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return (a.rawDate || nowTs) - (b.rawDate || nowTs);
      });

      return matches.slice(0, 16);
    } catch {
      return [];
    }
  }
};
