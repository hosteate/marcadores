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
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
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
      if (sport === "basketball_ncaab") {
        const ab = await fetch(`/api/abbr?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then((r) =>
          r.json()
        );
        if (ab && typeof ab === "object" && !Array.isArray(ab)) setNcaabAbbrMap(ab);
        else setNcaabAbbrMap({});
      } else {
        setNcaabAbbrMap({});
      }

      const oddsJson = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`, { cache: "no-store" }).then((r) =>
        r.json()
      );

      if (!Array.isArray(oddsJson)) {
        console.error("ODDS no es array:", oddsJson);
        setOdds([]);
        setScores(new Map());
        setErr("No hay odds disponibles (o la API devolvió error).");
        return;
      }

      const o = oddsJson as OddsGame[];
      setOdds(o);

      const ids = o.map((g) => g.id).join(",");
      if (!ids) {
        setScores(new Map());
        return;
      }

      const scoresJson = await fetch(
        `/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`,
        { cache: "no-store" }
      ).then((r) => r.json());

      const map = new Map<string, ScoreGame>();
      if (Array.isArray(scoresJson)) {
        (scoresJson as ScoreGame[]).forEach((g) => {
          if (g?.id) map.set(g.id, g);
        });
      } else {
        console.error("SCORES no es array:", scoresJson);
      }
      setScores(map);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
      setOdds([]);
      setScores(new Map());
    } finally {
      setLoading(false);
    }
  }

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
    <main className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-10 border-b bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-gray-900">marcadores.live</div>

          <select
            className="ml-auto border rounded px-2 py-1 text-sm text-gray-900 bg-white"
            value={sport}
            onChange={(e) => setSport(e.target.value as any)}
          >
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          <button className="border rounded px-3 py-1 text-sm text-gray-900 bg-white" onClick={refresh} disabled={loading}>
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

          // scores (solo se usan si NO quieres ocultarlos; aquí los usaremos solo para detectar live/final)
          const awayScore = scoreFor(sc, g.away_team);
          const homeScore = scoreFor(sc, g.home_team);

          // PRE-MATCH moneyline (del feed /odds)
          const awayML = getH2H(g, g.away_team);
          const homeML = getH2H(g, g.home_team);

          const spreadAway = getSpread(g, g.away_team);
          const spreadHome = getSpread(g, g.home_team);
          const total = getTotal(g);

          const handicap = Math.max(spreadAway ?? -999, spreadHome ?? -999);

          return (
            <div key={g.id} className="border border-gray-200 bg-white">
              {/* top */}
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between items-center text-gray-700">
                <div className="text-gray-700">{fmtDayTime(g.commence_time)}</div>
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

              {/* body */}
              <div className="px-3 py-3">
                <div className="flex justify-between items-center">
                  <div className="text-lg font-semibold text-gray-900">{away}</div>

                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {/* ✅ LIVE: mostrar momios pre-match; NO live odds */}
                    {isLive ? fmtAmerican(awayML) : isFinal ? (awayScore ?? "—") : fmtAmerican(awayML)}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <div className="text-lg font-semibold text-gray-900">{home}</div>

                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {isLive ? fmtAmerican(homeML) : isFinal ? (homeScore ?? "—") : fmtAmerican(homeML)}
                  </div>
                </div>

                {/* ✅ leyenda SOLO en LIVE */}
                {isLive && (
                  <div className="mt-2 text-xs text-gray-700">
                    <span className="font-semibold">Momios Pre-Match:</span>{" "}
                    {away} {fmtAmerican(awayML)} · {home} {fmtAmerican(homeML)}
                  </div>
                )}
              </div>

              {/* bottom: siempre spread + O/U */}
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between items-center text-gray-700">
                <div className="text-gray-700">
                  {fmtSpread(handicap)} &nbsp; O/U {total ?? "—"}
                </div>
                <div className="text-gray-600">BetMGM</div>
              </div>
            </div>
          );
        })}
      </section>

      {sorted.length === 0 && !loading && !err && (
        <div className="px-3 py-6 text-sm text-gray-700">No hay juegos disponibles.</div>
      )}
    </main>
  );
}