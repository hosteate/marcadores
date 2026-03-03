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
  home_team_rotation_number?: number;
  away_team_rotation_number?: number;
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
  odds?: OddsGame;
  score?: ScoreGame;
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
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtAmerican(n?: number) {
  if (n === undefined) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtNum(n?: number) {
  if (n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : String(n);
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
function getSpread(game: OddsGame | undefined, team: string) {
  return getMarket(game, "spreads")?.outcomes?.find((o) => o.name === team)?.point;
}
function getTotal(game: OddsGame | undefined) {
  return getMarket(game, "totals")?.outcomes?.[0]?.point;
}

function scoreFor(sc: ScoreGame | undefined, team: string) {
  const s = sc?.scores?.find((x) => x.name === team)?.score;
  return s ? Number(s) : undefined;
}

function StickyDivider({ title, count }: { title: string; count: number }) {
  const color =
    title === "LIVE"
      ? "border-red-600 text-red-600"
      : title.includes("Próximos")
      ? "border-blue-600 text-blue-600"
      : "border-gray-800 text-gray-800";

  return (
    <div className="sticky top-[49px] z-10 bg-white">
      <div className={`mx-3 mt-3 mb-2 border-l-4 ${color} bg-gray-50 px-3 py-2 flex justify-between`}>
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-xs text-gray-600">{count}</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [sport, setSport] = useState("basketball_nba");
  const [games, setGames] = useState<GameUnified[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);

    const oddsArr: OddsGame[] = await fetch(`/api/odds?sport=${sport}`).then((r) => r.json());
    const scoresArr: ScoreGame[] = await fetch(`/api/scores?sport=${sport}&daysFrom=1`).then((r) =>
      r.json()
    );

    const oddsById = new Map(oddsArr.map((g) => [g.id, g]));
    const scoresById = new Map(scoresArr.map((g) => [g.id, g]));

    const today = ymdLocal(new Date());
    const unified: GameUnified[] = [];

    for (const id of new Set([...oddsById.keys(), ...scoresById.keys()])) {
      const o = oddsById.get(id);
      const s = scoresById.get(id);

      const commence = s?.commence_time ?? o?.commence_time;
      if (!commence || ymdLocal(new Date(commence)) !== today) continue;

      unified.push({
        id,
        commence_time: commence,
        home_team: s?.home_team ?? o?.home_team!,
        away_team: s?.away_team ?? o?.away_team!,
        odds: o,
        score: s,
      });
    }

    unified.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
    setGames(unified);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [sport]);

  const { live, pre, fin } = useMemo(() => {
    const live: GameUnified[] = [];
    const pre: GameUnified[] = [];
    const fin: GameUnified[] = [];

    for (const g of games) {
      if (g.score?.completed) fin.push(g);
      else if (g.score?.scores) live.push(g);
      else pre.push(g);
    }

    fin.sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());
    return { live, pre, fin };
  }, [games]);

  const abbr = (t: string) => NBA_ABBR[t] ?? t.slice(0, 4).toUpperCase();

  const renderCard = (g: GameUnified) => {
    const isLive = g.score?.scores && !g.score.completed;
    const isFinal = g.score?.completed;
    const showScore = isLive || isFinal;

    const awayRot = g.odds?.away_team_rotation_number ?? "—";
    const homeRot = g.odds?.home_team_rotation_number ?? "—";

    const away = `${awayRot} ${abbr(g.away_team)}`;
    const home = `${homeRot} ${abbr(g.home_team)}`;

    return (
      <div key={g.id} className="border border-gray-200 bg-white">
        <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
          <span>{fmtTime(g.commence_time)}</span>
          {isLive && <span className="text-red-600 font-semibold">LIVE</span>}
          {isFinal && <span className="text-gray-800 font-semibold">FINAL</span>}
        </div>

        {!showScore && (
          <div className="bg-gray-50 px-3 py-2 text-xs text-gray-600 grid grid-cols-[1fr_80px_80px_80px]">
            <div></div>
            <div className="text-right font-semibold">ML</div>
            <div className="text-right font-semibold">HCP</div>
            <div className="text-right font-semibold">O/U</div>
          </div>
        )}

        <div className="px-3 py-3 grid gap-3">
          {[g.away_team, g.home_team].map((team, idx) => {
            const isAway = idx === 0;
            const label = isAway ? away : home;

            if (showScore) {
              return (
                <div key={team} className="flex justify-between">
                  <span className="font-semibold">{label}</span>
                  <span className="text-xl font-semibold">
                    {scoreFor(g.score, team) ?? "—"}
                  </span>
                </div>
              );
            }

            const ml = getH2H(g.odds, team);
            const spr = getSpread(g.odds, team);
            const total = getTotal(g.odds);

            return (
              <div
                key={team}
                className="grid grid-cols-[1fr_80px_80px_80px] items-center"
              >
                <div className="font-semibold">{label}</div>
                <div className="text-right">{fmtAmerican(ml)}</div>
                <div className="text-right">{spr ?? "—"}</div>
                <div className="text-right">
                  {isAway ? total ?? "—" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="sticky top-0 border-b bg-white px-3 py-2 flex gap-2 items-center">
        <span className="text-sm font-semibold">marcadores.live</span>
        <select
          className="ml-auto border rounded px-2 py-1 text-sm"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
        >
          {SPORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={refresh}
          className="border rounded px-3 py-1 text-sm"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </header>

      <StickyDivider title="LIVE" count={live.length} />
      <section className="px-3 pb-3 grid gap-3">{live.map(renderCard)}</section>

      <StickyDivider title="HOY · Próximos" count={pre.length} />
      <section className="px-3 pb-3 grid gap-3">{pre.map(renderCard)}</section>

      <StickyDivider title="HOY · Final" count={fin.length} />
      <section className="px-3 pb-6 grid gap-3">{fin.map(renderCard)}</section>
    </main>
  );
}