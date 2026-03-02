"use client";

import { useEffect, useMemo, useState } from "react";

type Outcome = { name: string; price?: number; point?: number };
type Market = { key: "h2h" | "spreads" | "totals"; outcomes: Outcome[] };
type Bookmaker = { key: string; title?: string; markets: Market[] };

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
];

function fmtTimeTop(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtDayTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function fmtAmerican(n?: number) {
  if (n === undefined || n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function fmtSpread(n?: number) {
  if (n === undefined || n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function sinceShort(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function abbrTeam(name: string) {
  // fallback simple (sirve NBA/NCAAB sin tabla)
  const parts = name.replace(/\b(University|College|State|St\.|of|the|at)\b/gi, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();
  return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
}

function getBook(game: OddsGame) {
  const books = game.bookmakers ?? [];
  return books.find((b) => b.key === "betmgm") ?? books[0];
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
function displayHandicap(spreadAway?: number, spreadHome?: number) {
  const vals = [spreadAway, spreadHome].filter((x) => typeof x === "number") as number[];
  if (vals.length === 0) return undefined;
  return Math.max(...vals); // como tu ejemplo: +3.5
}
function scoreFor(sc: ScoreGame | undefined, team: string) {
  const s = sc?.scores?.find((x) => x.name === team)?.score;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default function Page() {
  const [sport, setSport] = useState(SPORTS[0].key);
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const [scores, setScores] = useState<Map<string, ScoreGame>>(new Map());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const r1 = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`, { cache: "no-store" });
      const t1 = await r1.text();
      if (!r1.ok) throw new Error(t1 || `HTTP ${r1.status}`);
      const games = JSON.parse(t1) as OddsGame[];
      setOdds(games);

      const ids = games.map((g) => g.id).join(",");
      if (ids) {
        const r2 = await fetch(
          `/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`,
          { cache: "no-store" }
        );
        const t2 = await r2.text();
        if (!r2.ok) throw new Error(t2 || `HTTP ${r2.status}`);
        const sc = JSON.parse(t2) as ScoreGame[];
        const map = new Map<string, ScoreGame>();
        sc.forEach((g) => map.set(g.id, g));
        setScores(map);
      } else {
        setScores(new Map());
      }
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  async function refreshScoresOnly() {
    try {
      const now = Date.now();
      const liveCandidates = odds.filter((g) => new Date(g.commence_time).getTime() <= now);
      if (liveCandidates.length === 0) return;

      const ids = liveCandidates.map((g) => g.id).join(",");
      if (!ids) return;

      const r = await fetch(
        `/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`,
        { cache: "no-store" }
      );
      if (!r.ok) return;

      const sc = (await r.json()) as ScoreGame[];
      const map = new Map(scores);
      sc.forEach((g) => map.set(g.id, g));
      setScores(map);
    } catch {
      // silencio
    }
  }

  useEffect(() => {
    loadAll();
    const base = setInterval(loadAll, 120_000); // odds (y scores base) cada 2 min
    const live = setInterval(refreshScoresOnly, 30_000); // scores cada 30s si ya empezó
    return () => {
      clearInterval(base);
      clearInterval(live);
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
      {/* header */}
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-5xl px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold">marcadores.live</div>
            <div className="ml-auto flex items-center gap-2">
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
              >
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button onClick={loadAll} className="rounded-xl border bg-white px-3 py-2 text-sm">
                {loading ? "..." : "↻"}
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600">
            <div>{sorted.length} juegos</div>
            <div>BetMGM</div>
          </div>

          {err && (
            <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
              {err}
            </pre>
          )}
        </div>
      </header>

      {/* grid like screenshot */}
      <section className="mx-auto max-w-5xl px-3 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((g) => {
            const sc = scores.get(g.id);
            const isLive = !!sc?.scores && sc.completed === false;
            const isFinal = sc?.completed === true;

            const awayAbbr = abbrTeam(g.away_team);
            const homeAbbr = abbrTeam(g.home_team);

            const awayML = getH2H(g, g.away_team);
            const homeML = getH2H(g, g.home_team);

            const awaySp = getSpread(g, g.away_team);
            const homeSp = getSpread(g, g.home_team);

            const handicap = displayHandicap(awaySp, homeSp);
            const total = getTotal(g);

            const awayScore = scoreFor(sc, g.away_team);
            const homeScore = scoreFor(sc, g.home_team);

            return (
              <article key={g.id} className="border bg-white shadow-sm">
                {/* top bar */}
                <div className="flex items-center justify-between bg-gray-100 px-3 py-2 text-xs text-gray-700">
                  <div>{fmtDayTime(g.commence_time)}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{isLive ? "LIVE" : isFinal ? "FINAL" : ""}</span>
                    <span className="text-gray-500">↗</span>
                  </div>
                </div>

                {/* teams */}
                <div className="px-3 py-3">
                  {/* away row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* logo placeholder */}
                      <div className="h-9 w-9 rounded bg-gray-200 flex items-center justify-center text-xs font-semibold">
                        {awayAbbr}
                      </div>
                      <div className="leading-tight">
                        <div className="text-[15px] font-semibold">{g.away_team}</div>
                        <div className="text-[12px] text-gray-700">{fmtAmerican(awayML)}</div>
                      </div>
                    </div>

                    <div className="text-[22px] font-semibold tabular-nums text-gray-800">
                      {isLive || isFinal ? (awayScore ?? "—") : "—"}
                    </div>
                  </div>

                  {/* home row */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded bg-gray-200 flex items-center justify-center text-xs font-semibold">
                        {homeAbbr}
                      </div>
                      <div className="leading-tight">
                        <div className="text-[15px] font-semibold">{g.home_team}</div>
                        <div className="text-[12px] text-gray-700">{fmtAmerican(homeML)}</div>
                      </div>
                    </div>

                    <div className="text-[22px] font-semibold tabular-nums text-gray-800">
                      {isLive || isFinal ? (homeScore ?? "—") : "—"}
                    </div>
                  </div>
                </div>

                {/* line bar */}
                <div className="flex items-center justify-between bg-gray-100 px-3 py-2 text-[12px] text-gray-700">
                  <div className="tabular-nums">
                    {fmtSpread(handicap)} &nbsp;&nbsp; O/U {total ?? "—"}
                  </div>
                  <div className="text-gray-500">BetMGM</div>
                </div>

                {/* live bar (green) */}
                {isLive && (
                  <div className="px-3 py-2 text-[12px] text-green-700">
                    Live · actualizado hace {sinceShort(sc?.last_update) || "—"}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}