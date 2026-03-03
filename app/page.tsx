"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Outcome = { name: string; price?: number; point?: number };
type Market = { key: "h2h" | "spreads" | "totals"; outcomes: Outcome[] };
type Bookmaker = { key: string; markets: Market[] };

type OddsGame = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Bookmaker[];
};

type ScoreRow = { name: string; score: string };
type ScoreGame = {
  id: string;
  completed: boolean;
  scores?: ScoreRow[];
  last_update?: string;
};

const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
] as const;

const NBA_ABBR: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "LA Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

function fmtDayTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
function fmtAmerican(n?: number) {
  if (n === undefined) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function fmtSpread(n?: number) {
  if (n === undefined) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function sinceShort(iso?: string) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}
function getBook(game: OddsGame) {
  return game.bookmakers?.find((b) => b.key === "betmgm") ?? game.bookmakers?.[0];
}
function getMarket(game: OddsGame, key: Market["key"]) {
  return getBook(game)?.markets?.find((m) => m.key === key);
}
function getH2H(game: OddsGame, team: string) {
  return getMarket(game, "h2h")?.outcomes?.find((o) => o.name === team)?.price;
}
function getSpread(game: OddsGame, team: string) {
  return getMarket(game, "spreads")?.outcomes?.find((o) => o.name === team)?.point;
}
function getTotal(game: OddsGame) {
  return getMarket(game, "totals")?.outcomes?.[0]?.point;
}
function scoreFor(sc: ScoreGame | undefined, team: string) {
  const s = sc?.scores?.find((x) => x.name === team)?.score;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default function Page() {
  const [sport, setSport] = useState<(typeof SPORTS)[number]["key"]>("basketball_nba");
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const [scores, setScores] = useState<Map<string, ScoreGame>>(new Map());
  const [ncaabAbbrMap, setNcaabAbbrMap] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);

  // refs para evitar closures viejos en setInterval
  const oddsRef = useRef<OddsGame[]>([]);
  const scoresRef = useRef<Map<string, ScoreGame>>(new Map());
  useEffect(() => { oddsRef.current = odds; }, [odds]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  const abbr = (teamName: string) => {
    if (sport === "basketball_nba") return NBA_ABBR[teamName] ?? teamName.slice(0, 4).toUpperCase();
    return ncaabAbbrMap[teamName] ?? teamName.slice(0, 4).toUpperCase();
  };

  async function loadOddsAndMaybeScores() {
    setLoading(true);
    try {
      if (sport === "basketball_ncaab" && Object.keys(ncaabAbbrMap).length === 0) {
        const ab = await fetch(`/api/abbr?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then(r => r.json());
        setNcaabAbbrMap(ab);
      }

      const o = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then(r => r.json());
      setOdds(o);

      // pedimos scores solo para esos eventIds (ligero)
      const ids = o.map((g: OddsGame) => g.id).join(",");
      if (!ids) {
        setScores(new Map());
        return;
      }

      const s = await fetch(`/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`, { cache: "no-store" })
        .then(r => r.json());

      const map = new Map<string, ScoreGame>();
      s.forEach((g: ScoreGame) => map.set(g.id, g));
      setScores(map);
    } finally {
      setLoading(false);
    }
  }

  async function refreshScoresLiveOnly() {
    if (!visible) return;

    const now = Date.now();
    const current = oddsRef.current;

    // SOLO candidatos que ya empezaron por hora
    const candidates = current.filter((g) => new Date(g.commence_time).getTime() <= now);
    if (candidates.length === 0) return;

    // y SOLO los que no están finalizados (si ya tenemos scores)
    const currentScores = scoresRef.current;
    const stillLive = candidates.filter((g) => currentScores.get(g.id)?.completed !== true);
    if (stillLive.length === 0) return;

    const ids = stillLive.map((g) => g.id).join(",");
    if (!ids) return;

    const s = await fetch(`/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`, { cache: "no-store" })
      .then(r => r.json());

    const map = new Map(currentScores);
    s.forEach((g: ScoreGame) => map.set(g.id, g));
    setScores(map);
  }

  // Visibility: si está en background, 0 consumo; al volver, refresca
  useEffect(() => {
    const onVis = () => {
      const v = document.visibilityState === "visible";
      setVisible(v);
      if (v) loadOddsAndMaybeScores(); // refresh inmediato al volver
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  // Carga inicial al cambiar liga
  useEffect(() => {
    loadOddsAndMaybeScores();

    // Odds cada 15 min
    const oddsTimer = setInterval(() => {
      if (!document.hidden) loadOddsAndMaybeScores();
    }, 15 * 60_000);

    // Scores cada 60s, solo live + visible
    const scoreTimer = setInterval(() => {
      refreshScoresLiveOnly().catch(() => {});
    }, 60_000);

    return () => {
      clearInterval(oddsTimer);
      clearInterval(scoreTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const sorted = useMemo(() => {
    return [...odds].sort(
      (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );
  }, [odds]);

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">marcadores.live</div>

          <select
            className="ml-auto border rounded px-2 py-1 text-sm"
            value={sport}
            onChange={(e) => setSport(e.target.value as any)}
          >
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            className="border rounded px-2 py-1 text-sm"
            onClick={loadOddsAndMaybeScores}
            aria-label="refresh"
          >
            {loading ? "..." : "↻"}
          </button>
        </div>
      </header>

      <section className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((g) => {
          const sc = scores.get(g.id);
          const live = sc?.scores && !sc.completed;
          const final = sc?.completed;

          const away = abbr(g.away_team);
          const home = abbr(g.home_team);

          const awayScore = scoreFor(sc, g.away_team);
          const homeScore = scoreFor(sc, g.home_team);

          const awayML = getH2H(g, g.away_team);
          const homeML = getH2H(g, g.home_team);

          const spreadAway = getSpread(g, g.away_team);
          const spreadHome = getSpread(g, g.home_team);
          const total = getTotal(g);

          const handicap = Math.max(spreadAway ?? -999, spreadHome ?? -999);

          return (
            <div key={g.id} className="border bg-white">
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
                <div>{fmtDayTime(g.commence_time)}</div>
                <div>{live ? "LIVE" : final ? "FINAL" : ""}</div>
              </div>

              <div className="px-3 py-3">
                <div className="flex justify-between items-center">
                  <div className="text-lg font-semibold">{away}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {live || final ? awayScore ?? "—" : fmtAmerican(awayML)}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <div className="text-lg font-semibold">{home}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {live || final ? homeScore ?? "—" : fmtAmerican(homeML)}
                  </div>
                </div>
              </div>

              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
                {live ? (
                  <div className="text-green-600">Live · {sinceShort(sc?.last_update)}</div>
                ) : (
                  <div>
                    {fmtSpread(handicap)} &nbsp; O/U {total ?? "—"}
                  </div>
                )}
                <div>BetMGM</div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}