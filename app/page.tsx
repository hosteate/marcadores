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
  commence_time: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores?: ScoreRow[];
};

type GameUnified = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  odds?: OddsGame; // opcional
  score?: ScoreGame; // opcional
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

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtAmerican(n?: number) {
  if (n === undefined) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function getBook(game?: OddsGame) {
  return game?.bookmakers?.find((b) => b.key === "betmgm") ?? game?.bookmakers?.[0];
}
function getMarket(game: OddsGame | undefined, key: Market["key"]) {
  return getBook(game)?.markets?.find((m) => m.key === key);
}
function getH2H(game: OddsGame | undefined, team: string) {
  return getMarket(game, "h2h")?.outcomes?.find((o) => o.name === team)?.price;
}

function scoreFor(sc: ScoreGame | undefined, team: string) {
  const s = sc?.scores?.find((x) => x.name === team)?.score;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function StickyDivider({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  let colorBar = "border-gray-900";
  let textColor = "text-gray-900";

  if (title.includes("LIVE")) {
    colorBar = "border-red-600";
    textColor = "text-red-600";
  } else if (title.includes("Próximos")) {
    colorBar = "border-blue-600";
    textColor = "text-blue-600";
  } else if (title.includes("Final")) {
    colorBar = "border-gray-800";
    textColor = "text-gray-800";
  }

  return (
    <div className="sticky top-[49px] z-10 bg-white">
      <div
        className={`mx-3 mt-3 mb-2 border-l-4 ${colorBar} bg-gray-50 px-3 py-2 flex justify-between items-center`}
      >
        <div className={`text-xs font-semibold ${textColor}`}>{title}</div>
        <div className="text-xs text-gray-600">{count}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [sport, setSport] = useState<(typeof SPORTS)[number]["key"]>("basketball_nba");
  const [games, setGames] = useState<GameUnified[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  const abbr = (team: string) =>
    sport === "basketball_nba"
      ? NBA_ABBR[team] ?? team.slice(0, 4).toUpperCase()
      : team.slice(0, 4).toUpperCase();

  async function refresh() {
    const myId = ++reqIdRef.current;
    setLoading(true);
    setErr(null);

    try {
      // 1) Odds (upcoming + live) — no incluye finals :contentReference[oaicite:3]{index=3}
      const oddsJson = await fetch(`/api/odds?sport=${sport}`, { cache: "no-store" }).then((r) =>
        r.json()
      );
      if (myId !== reqIdRef.current) return;

      const oddsArr: OddsGame[] = Array.isArray(oddsJson) ? oddsJson : [];

      // 2) Scores con daysFrom=1 para incluir FINAL recientes :contentReference[oaicite:4]{index=4}
      const scoresJson = await fetch(`/api/scores?sport=${sport}&daysFrom=1`, { cache: "no-store" }).then((r) =>
        r.json()
      );
      if (myId !== reqIdRef.current) return;

      const scoresArr: ScoreGame[] = Array.isArray(scoresJson) ? scoresJson : [];

      // Maps por id
      const oddsById = new Map<string, OddsGame>();
      oddsArr.forEach((g) => oddsById.set(g.id, g));

      const scoresById = new Map<string, ScoreGame>();
      scoresArr.forEach((g) => scoresById.set(g.id, g));

      // Union de ids (para no perder finals)
      const allIds = new Set<string>([...oddsById.keys(), ...scoresById.keys()]);

      const todayKey = ymdLocal(new Date());

      const unified: GameUnified[] = [];
      for (const id of allIds) {
        const o = oddsById.get(id);
        const s = scoresById.get(id);

        // Preferimos commence_time/team data del score si existe
        const commence_time = s?.commence_time ?? o?.commence_time;
        const home_team = s?.home_team ?? o?.home_team;
        const away_team = s?.away_team ?? o?.away_team;

        if (!commence_time || !home_team || !away_team) continue;

        // ✅ SOLO HOY
        if (ymdLocal(new Date(commence_time)) !== todayKey) continue;

        unified.push({
          id,
          commence_time,
          home_team,
          away_team,
          odds: o,
          score: s,
        });
      }

      unified.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
      setGames(unified);
    } catch (e: any) {
      if (myId !== reqIdRef.current) return;
      setErr(e?.message ?? "Error");
      setGames([]);
    } finally {
      if (myId !== reqIdRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const { live, pre, fin } = useMemo(() => {
    const live: GameUnified[] = [];
    const pre: GameUnified[] = [];
    const fin: GameUnified[] = [];

    for (const g of games) {
      const s = g.score;
      const isLive = !!s?.scores && s.completed === false;
      const isFinal = s?.completed === true;

      if (isLive) live.push(g);
      else if (isFinal) fin.push(g);
      else pre.push(g);
    }

    // Final: más reciente arriba
    fin.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());

    return { live, pre, fin };
  }, [games]);

  const renderCard = (g: GameUnified) => {
  const s = g.score;
  const isLive = !!s?.scores && s.completed === false;
  const isFinal = s?.completed === true;

  const away = abbr(g.away_team);
  const home = abbr(g.home_team);

  const awayScore = scoreFor(s, g.away_team);
  const homeScore = scoreFor(s, g.home_team);

  const awayML = getH2H(g.odds, g.away_team);
  const homeML = getH2H(g.odds, g.home_team);

  const showScore = isLive || isFinal;

  return (
    <div key={g.id} className="border border-gray-200 bg-white">
      <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
        <div>{fmtTime(g.commence_time)}</div>
        {isLive && <span className="text-red-600 font-semibold">LIVE</span>}
        {isFinal && <span className="text-gray-800 font-semibold">FINAL</span>}
      </div>

      <div className="px-3 py-3">
        <div className="flex justify-between">
          <div className="text-lg font-semibold">{away}</div>
          <div className="text-xl font-semibold tabular-nums">
            {showScore ? awayScore ?? "—" : fmtAmerican(awayML)}
          </div>
        </div>

        <div className="flex justify-between mt-2">
          <div className="text-lg font-semibold">{home}</div>
          <div className="text-xl font-semibold tabular-nums">
            {showScore ? homeScore ?? "—" : fmtAmerican(homeML)}
          </div>
        </div>
      </div>
    </div>
  );
};

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b bg-white px-3 py-2 flex gap-2 items-center">
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

        <button className="border rounded px-3 py-1 text-sm" onClick={refresh} disabled={loading}>
          {loading ? "..." : "Refresh"}
        </button>
      </header>

      {err && <div className="px-3 pt-3 text-sm text-red-700">{err}</div>}

      <StickyDivider title="LIVE" count={live.length} />
      <section className="px-3 pb-3 grid gap-3">{live.map(renderCard)}</section>

      <StickyDivider title="HOY · Próximos" count={pre.length} />
      <section className="px-3 pb-3 grid gap-3">{pre.map(renderCard)}</section>

      <StickyDivider title="HOY · Final" count={fin.length} />
      <section className="px-3 pb-6 grid gap-3">{fin.map(renderCard)}</section>

      {games.length === 0 && !loading && !err && (
        <div className="px-3 py-6 text-sm text-gray-700">No hay juegos disponibles hoy.</div>
      )}
    </main>
  );
}