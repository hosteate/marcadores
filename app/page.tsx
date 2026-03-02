"use client";

import { useEffect, useMemo, useState } from "react";

type Outcome = { name: string; price?: number; point?: number };
type Market = { key: "h2h" | "spreads" | "totals"; outcomes: Outcome[] };
type Bookmaker = { key: string; title: string; last_update: string; markets: Market[] };

type Game = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Bookmaker[];
};

const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "basketball_ncaab", label: "NCAA" },
];

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtAmerican(n?: number) {
  if (n === undefined || n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function fmtPoint(n?: number) {
  if (n === undefined || n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function americanToProb(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return (-odds) / ((-odds) + 100);
}
function probToAmerican(p: number) {
  if (p <= 0 || p >= 1) return undefined;
  if (p < 0.5) return Math.round(100 / p - 100);
  return -Math.round((100 * p) / (1 - p));
}
function avg(nums: number[]) {
  if (nums.length === 0) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

function avgMoneylineAmerican(game: Game, teamName: string) {
  const probs: number[] = [];
  for (const b of game.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "h2h");
    const o = m?.outcomes.find((x) => x.name === teamName);
    if (typeof o?.price === "number") probs.push(americanToProb(o.price));
  }
  const p = avg(probs);
  return p === undefined ? undefined : probToAmerican(p);
}
function avgSpreadPoint(game: Game, teamName: string) {
  const pts: number[] = [];
  for (const b of game.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "spreads");
    const o = m?.outcomes.find((x) => x.name === teamName);
    if (typeof o?.point === "number") pts.push(o.point);
  }
  const p = avg(pts);
  return p === undefined ? undefined : roundHalf(p);
}
function avgTotalPoint(game: Game) {
  const pts: number[] = [];
  for (const b of game.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "totals");
    const pt = m?.outcomes?.[0]?.point;
    if (typeof pt === "number") pts.push(pt);
  }
  const p = avg(pts);
  return p === undefined ? undefined : roundHalf(p);
}

function avgLines(game: Game) {
  const booksCount = (game.bookmakers ?? []).length;
  return {
    awayML: avgMoneylineAmerican(game, game.away_team),
    homeML: avgMoneylineAmerican(game, game.home_team),
    awaySp: avgSpreadPoint(game, game.away_team),
    homeSp: avgSpreadPoint(game, game.home_team),
    totalPoint: avgTotalPoint(game),
    label: `Promedio (${booksCount})`,
  };
}

export default function Page() {
  const [sport, setSport] = useState(SPORTS[0].key);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/odds?sport=${encodeURIComponent(sport)}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setGames(JSON.parse(text));
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000); // 2 min para ahorrar requests
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const sorted = useMemo(() => {
    return [...games].sort(
      (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );
  }, [games]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Sticky header optimizado para móvil */}
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold">marcadores.live</div>

            <div className="ml-auto flex items-center gap-2">
              <select
                className="rounded-xl border bg-white px-3 py-2 text-sm"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                aria-label="Liga"
              >
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>

              <button
                onClick={load}
                className="rounded-xl border bg-white px-3 py-2 text-sm active:scale-[0.99]"
              >
                {loading ? "..." : "↻"}
              </button>
            </div>
          </div>

          <div className="mt-2 text-xs text-gray-600">
            {loading ? "Actualizando..." : `${sorted.length} juegos`} · refresco cada 2 min · promedio de books
          </div>

          {err && (
            <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
              {err}
            </pre>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-3 py-3">
        <div className="grid grid-cols-1 gap-2">
          {sorted.map((g) => {
            const a = avgLines(g);

            return (
              <article key={g.id} className="rounded-2xl border bg-white">
                {/* Top row: hora + label */}
                <div className="flex items-center justify-between rounded-t-2xl border-b bg-gray-50 px-3 py-2">
                  <div className="text-xs text-gray-600">{fmtTime(g.commence_time)}</div>
                  <div className="text-[11px] text-gray-500">{a.label}</div>
                </div>

                {/* Body: filas compactas */}
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.away_team}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums text-gray-700">
                      <div className="w-[74px] text-right">ML {fmtAmerican(a.awayML)}</div>
                      <div className="w-[74px] text-right">SP {fmtPoint(a.awaySp)}</div>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.home_team}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums text-gray-700">
                      <div className="w-[74px] text-right">ML {fmtAmerican(a.homeML)}</div>
                      <div className="w-[74px] text-right">SP {fmtPoint(a.homeSp)}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                    <div className="tabular-nums">O/U {a.totalPoint ?? "—"}</div>
                    <div className="text-gray-400">h2h · spreads · totals</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto max-w-3xl px-3 pb-6 text-[11px] text-gray-500">
        Informativo: líneas calculadas como promedio de books (vía probabilidades implícitas) y puntos promedio.
      </footer>
    </main>
  );
}