"use client";

import { useEffect, useMemo, useState } from "react";

/* --- tipos --- */
type Outcome = { name: string; price?: number; point?: number };
type Market = { key: "spreads" | "totals"; outcomes: Outcome[] };
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

/* --- deportes --- */
const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
];

/* --- abreviaturas NBA --- */
const NBA: Record<string, string> = {
  "Denver Nuggets": "DEN",
  "Utah Jazz": "UTA",
  "Los Angeles Clippers": "LAC",
  "Golden State Warriors": "GSW",
  "Detroit Pistons": "DET",
  "Cleveland Cavaliers": "CLE",
  "New York Knicks": "NYK",
  "Toronto Raptors": "TOR",
  "San Antonio Spurs": "SAS",
};

/* fallback */
function abbr(n: string) {
  return NBA[n] ?? n.slice(0, 3).toUpperCase();
}

function fmtSpread(n?: number) {
  if (n === undefined) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function since(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function Page() {
  const [sport, setSport] = useState(SPORTS[0].key);
  const [games, setGames] = useState<OddsGame[]>([]);
  const [scores, setScores] = useState<Map<string, ScoreGame>>(new Map());

  async function load() {
    const o = await fetch(`/api/odds?sport=${sport}`).then(r => r.json());
    setGames(o);

    const ids = o.map((g: OddsGame) => g.id).join(",");
    if (!ids) return;

    const s = await fetch(`/api/scores?sport=${sport}&eventIds=${ids}`)
      .then(r => r.json());

    const map = new Map();
    s.forEach((g: ScoreGame) => map.set(g.id, g));
    setScores(map);
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 120000);
    return () => clearInterval(i);
  }, [sport]);

  const sorted = useMemo(
    () => [...games].sort(
      (a, b) =>
        new Date(a.commence_time).getTime() -
        new Date(b.commence_time).getTime()
    ),
    [games]
  );

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white px-3 py-2">
        <div className="flex items-center">
          <div className="text-sm font-semibold">marcadores.live</div>
          <select
            className="ml-auto text-sm border rounded px-2 py-1"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
          >
            {SPORTS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </header>

      <section className="text-sm">
        {sorted.map(g => {
          const sc = scores.get(g.id);

          const spreadMarket =
            g.bookmakers?.[0]?.markets?.find(m => m.key === "spreads");

          const totalMarket =
            g.bookmakers?.[0]?.markets?.find(m => m.key === "totals");

          const spreadAway =
            spreadMarket?.outcomes?.find(o => o.name === g.away_team)?.point;

          const spreadHome =
            spreadMarket?.outcomes?.find(o => o.name === g.home_team)?.point;

          const total = totalMarket?.outcomes?.[0]?.point;

          const awayScore =
            sc?.scores?.find(x => x.name === g.away_team)?.score;

          const homeScore =
            sc?.scores?.find(x => x.name === g.home_team)?.score;

          const live = sc?.scores && !sc.completed;

          return (
            <div
              key={g.id}
              className="border-b px-3 py-2"
            >
              {/* hora */}
              <div className="text-xs text-gray-500">
                {new Date(g.commence_time).toLocaleString()}
              </div>

              {/* away */}
              <div className="flex justify-between font-semibold mt-1">
                <div>{abbr(g.away_team)}</div>
                {live ? (
                  <div>{awayScore}</div>
                ) : (
                  <div>{fmtSpread(spreadAway)}</div>
                )}
              </div>

              {/* home */}
              <div className="flex justify-between font-semibold">
                <div>{abbr(g.home_team)}</div>
                {live ? (
                  <div>{homeScore}</div>
                ) : (
                  <div>{fmtSpread(spreadHome)}</div>
                )}
              </div>

              {/* bottom line */}
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                {live ? (
                  <div>LIVE · {since(sc?.last_update)}</div>
                ) : (
                  <div>
                    {fmtSpread(Math.max(spreadAway ?? 0, spreadHome ?? 0))}
                    &nbsp;&nbsp;O/U {total}
                  </div>
                )}
                <div>betmgm</div>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}