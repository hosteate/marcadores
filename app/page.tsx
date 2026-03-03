"use client";

import { useEffect, useMemo, useState } from "react";

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

// ✅ NBA abreviaturas oficiales (team name -> abbr)
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

  // NCAAB team->abbr (desde /api/abbr)
  const [ncaabAbbrMap, setNcaabAbbrMap] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const abbr = (teamName: string) => {
    if (sport === "basketball_nba") return NBA_ABBR[teamName] ?? teamName.slice(0, 4).toUpperCase();
    return ncaabAbbrMap[teamName] ?? teamName.slice(0, 4).toUpperCase();
  };

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      // NCAAB abbreviations only when needed
      if (sport === "basketball_ncaab") {
        const ab = await fetch(`/api/abbr?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then((r) =>
          r.json()
        );
        setNcaabAbbrMap(ab);
      } else {
        setNcaabAbbrMap({});
      }

      // odds
      const o = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then((r) =>
        r.json()
      );
      setOdds(o);

      // scores (solo para esos juegos)
      const ids = (o as OddsGame[]).map((g) => g.id).join(",");
      if (!ids) {
        setScores(new Map());
        return;
      }

      const s = await fetch(`/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`, {
        cache: "no-store",
      }).then((r) => r.json());

      const map = new Map<string, ScoreGame>();
      (s as ScoreGame[]).forEach((g) => map.set(g.id, g));
      setScores(map);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Carga automática al abrir la página y al cambiar liga (sin intervalos)
  useEffect(() => {
    refresh();
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

          <button className="border rounded px-2 py-1 text-sm" onClick={refresh}>
            {loading ? "..." : "Refresh"}
          </button>
        </div>

        {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
      </header>

      <section className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((g) => {
          const sc = scores.get(g.id);

          const isLive = !!sc?.scores && sc.completed === false;
          const isFinal = sc?.completed === true;

          const away = abbr(g.away_team);
          const home = abbr(g.home_team);

          const awayScore = scoreFor(sc, g.away_team);
          const homeScore = scoreFor(sc, g.home_team);

          const awayML = getH2H(g, g.away_team);
          const homeML = getH2H(g, g.home_team);

          const spreadAway = getSpread(g, g.away_team);
          const spreadHome = getSpread(g, g.home_team);

          const total = getTotal(g);

          // como tu ejemplo: mostramos el positivo (underdog)
          const handicap = Math.max(spreadAway ?? -999, spreadHome ?? -999);

          return (
            <div key={g.id} className="border bg-white">
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between items-center">
                <div>{fmtDayTime(g.commence_time)}</div>
                <div>
                  {isLive ? (
                    <span className="font-semibold text-green-700">LIVE</span>
                  ) : isFinal ? (
                    <span className="text-gray-700">FINAL</span>
                  ) : (
                    <span className="text-gray-500"></span>
                  )}
                </div>
              </div>

              <div className="px-3 py-3">
                <div className="flex justify-between items-center">
                  <div className="text-lg font-semibold">{away}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {isLive || isFinal ? awayScore ?? "—" : fmtAmerican(awayML)}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <div className="text-lg font-semibold">{home}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {isLive || isFinal ? homeScore ?? "—" : fmtAmerican(homeML)}
                  </div>
                </div>
              </div>

              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between items-center">
                {isLive ? (
                  <div className="text-green-700 font-medium">LIVE</div>
                ) : (
                  <div>
                    {fmtSpread(handicap)} &nbsp; O/U {total ?? "—"}
                  </div>
                )}
                <div className="text-gray-600">BetMGM</div>
              </div>
            </div>
          );
        })}
      </section>

      {sorted.length === 0 && !loading && !err && (
        <div className="px-3 py-6 text-sm text-gray-600">No hay juegos (o no hay odds disponibles).</div>
      )}
    </main>
  );
}