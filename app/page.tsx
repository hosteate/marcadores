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
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtAmerican(n?: number) {
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

function scoreFor(sc: ScoreGame | undefined, team: string) {
  const s = sc?.scores?.find((x) => x.name === team)?.score;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Divider({ title, count }: { title: string; count: number }) {
  return (
    <div className="sticky top-[49px] z-10 bg-white">
      <div className="mx-3 mt-3 mb-2 border-l-4 border-black bg-gray-50 px-3 py-2 flex justify-between">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-xs text-gray-500">{count}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [sport, setSport] = useState<(typeof SPORTS)[number]["key"]>("basketball_nba");
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const [scores, setScores] = useState<Map<string, ScoreGame>>(new Map());
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const abbr = (team: string) =>
    sport === "basketball_nba"
      ? NBA_ABBR[team] ?? team.slice(0, 4).toUpperCase()
      : team.slice(0, 4).toUpperCase();

  async function refresh() {
    const myId = ++reqIdRef.current;
    setLoading(true);

    try {
      const oddsJson = await fetch(`/api/odds?sport=${sport}`, { cache: "no-store" }).then((r) =>
        r.json()
      );
      if (myId !== reqIdRef.current) return;

      if (!Array.isArray(oddsJson)) {
        setOdds([]);
        return;
      }

      const o = oddsJson as OddsGame[];

      // 🔥 SOLO HOY
      const todayKey = ymdLocal(new Date());
      const todayGames = o.filter((g) => ymdLocal(new Date(g.commence_time)) === todayKey);

      setOdds(todayGames);

      const ids = todayGames.map((g) => g.id).join(",");
      if (!ids) return;

      const scoresJson = await fetch(
        `/api/scores?sport=${sport}&eventIds=${encodeURIComponent(ids)}`,
        { cache: "no-store" }
      ).then((r) => r.json());
      if (myId !== reqIdRef.current) return;

      const map = new Map<string, ScoreGame>();
      if (Array.isArray(scoresJson)) {
        scoresJson.forEach((g: ScoreGame) => {
          if (g?.id) map.set(g.id, g);
        });
      }
      setScores(map);
    } finally {
      if (myId !== reqIdRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [sport]);

  const { live, pre, final } = useMemo(() => {
    const live: OddsGame[] = [];
    const pre: OddsGame[] = [];
    const fin: OddsGame[] = [];

    for (const g of odds) {
      const sc = scores.get(g.id);
      const isLive = !!sc?.scores && sc.completed === false;
      const isFinal = sc?.completed === true;

      if (isLive) live.push(g);
      else if (isFinal) fin.push(g);
      else pre.push(g);
    }

    return { live, pre, final: fin };
  }, [odds, scores]);

  const renderCard = (g: OddsGame) => {
    const sc = scores.get(g.id);
    const isLive = !!sc?.scores && sc.completed === false;
    const isFinal = sc?.completed === true;

    const away = abbr(g.away_team);
    const home = abbr(g.home_team);

    const awayScore = scoreFor(sc, g.away_team);
    const homeScore = scoreFor(sc, g.home_team);

    const awayML = getH2H(g, g.away_team);
    const homeML = getH2H(g, g.home_team);

    return (
      <div key={g.id} className="border border-gray-200 bg-white">
        <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
          <div>{fmtDayTime(g.commence_time)}</div>
          {isLive && <span className="text-green-700 font-semibold">LIVE</span>}
          {isFinal && <span className="text-gray-700">FINAL</span>}
        </div>

        <div className="px-3 py-3">
          <div className="flex justify-between">
            <div className="text-lg font-semibold">{away}</div>
            <div className="text-xl font-semibold tabular-nums">
              {isLive || isFinal ? awayScore ?? "—" : fmtAmerican(awayML)}
            </div>
          </div>

          <div className="flex justify-between mt-2">
            <div className="text-lg font-semibold">{home}</div>
            <div className="text-xl font-semibold tabular-nums">
              {isLive || isFinal ? homeScore ?? "—" : fmtAmerican(homeML)}
            </div>
          </div>

          {(isLive || isFinal) && (
            <div className="mt-2 text-xs text-gray-600">
              Pre: {away} {fmtAmerican(awayML)} · {home} {fmtAmerican(homeML)}
            </div>
          )}
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

        <button className="border rounded px-3 py-1 text-sm" onClick={refresh}>
          {loading ? "..." : "Refresh"}
        </button>
      </header>

      <Divider title="LIVE" count={live.length} />
      <section className="px-3 pb-3 grid gap-3">{live.map(renderCard)}</section>

      <Divider title="HOY · Pre-Game" count={pre.length} />
      <section className="px-3 pb-3 grid gap-3">{pre.map(renderCard)}</section>

      <Divider title="HOY · Final" count={final.length} />
      <section className="px-3 pb-6 grid gap-3">{final.map(renderCard)}</section>
    </main>
  );
}