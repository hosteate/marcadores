"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------- TYPES ---------- */

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

/* ---------- CONFIG ---------- */

const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
];

/* ---------- HELPERS ---------- */

function abbrTeam(name: string) {
  const parts = name
    .replace(/\b(University|College|State|St\.|of|the|at)\b/gi, "")
    .trim()
    .split(/\s+/);

  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1][0] + parts[1][1]).toUpperCase();
  return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
}

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

/* ---------- COMPONENT ---------- */

export default function Page() {
  const [sport, setSport] = useState(SPORTS[0].key);
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const [scores, setScores] = useState<Map<string, ScoreGame>>(new Map());

  async function load() {
    const o = await fetch(`/api/odds?sport=${sport}`).then((r) => r.json());
    setOdds(o);

    const ids = o.map((g: OddsGame) => g.id).join(",");
    if (!ids) return;

    const s = await fetch(
      `/api/scores?sport=${sport}&eventIds=${ids}`
    ).then((r) => r.json());

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
    () =>
      [...odds].sort(
        (a, b) =>
          new Date(a.commence_time).getTime() -
          new Date(b.commence_time).getTime()
      ),
    [odds]
  );

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white px-3 py-2">
        <div className="flex items-center">
          <div className="text-sm font-semibold">marcadores.live</div>

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
        </div>
      </header>

      {/* GRID */}
      <section className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((g) => {
          const sc = scores.get(g.id);

          const live = sc?.scores && !sc.completed;
          const final = sc?.completed;

          const awayAbbr = abbrTeam(g.away_team);
          const homeAbbr = abbrTeam(g.home_team);

          const awayScore = scoreFor(sc, g.away_team);
          const homeScore = scoreFor(sc, g.home_team);

          const awayML = getH2H(g, g.away_team);
          const homeML = getH2H(g, g.home_team);

          const spreadAway = getSpread(g, g.away_team);
          const spreadHome = getSpread(g, g.home_team);

          const total = getTotal(g);

          const handicap = Math.max(
            spreadAway ?? -999,
            spreadHome ?? -999
          );

          return (
            <div key={g.id} className="border bg-white">
              {/* top */}
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
                <div>{fmtDayTime(g.commence_time)}</div>
                <div>{live ? "LIVE" : final ? "FINAL" : ""}</div>
              </div>

              <div className="px-3 py-3">
                {/* Away */}
                <div className="flex justify-between items-center">
                  <div className="text-lg font-semibold">{awayAbbr}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {live || final ? awayScore ?? "—" : fmtAmerican(awayML)}
                  </div>
                </div>

                {/* Home */}
                <div className="flex justify-between items-center mt-2">
                  <div className="text-lg font-semibold">{homeAbbr}</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {live || final ? homeScore ?? "—" : fmtAmerican(homeML)}
                  </div>
                </div>
              </div>

              {/* bottom */}
              <div className="bg-gray-100 px-3 py-2 text-xs flex justify-between">
                {live ? (
                  <div className="text-green-600">
                    Live · {sinceShort(sc?.last_update)}
                  </div>
                ) : (
                  <div>
                    {fmtSpread(handicap)} &nbsp; O/U {total}
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