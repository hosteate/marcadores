"use client";

import { useEffect, useMemo, useState } from "react";

type Outcome = { name: string; price?: number; point?: number };
type Market = { key: "spreads" | "totals"; outcomes: Outcome[] };
type Bookmaker = { key: string; title: string; last_update: string; markets: Market[] };

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
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: ScoreRow[];
  last_update?: string;
};

const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "NCAAB" },
];

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
  "LA Clippers": "LAC",
  "Los Angeles Clippers": "LAC",
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

function abbrTeam(name: string) {
  if (NBA_ABBR[name]) return NBA_ABBR[name];

  // Fallback (NCAAB): intenta una abreviatura corta consistente
  const cleaned = name
    .replace(/\b(University|College|State|St\.|of|the|at)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);

  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1][0] + parts[1][1]).toUpperCase();
  return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
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

function getBetMgmBook(game: OddsGame) {
  const books = game.bookmakers ?? [];
  return books.find((b) => b.key === "betmgm") ?? books[0];
}

function getSpread(game: OddsGame, teamName: string) {
  const b = getBetMgmBook(game);
  const m = b?.markets?.find((x) => x.key === "spreads");
  const o = m?.outcomes?.find((x) => x.name === teamName);
  return o?.point;
}

function getTotal(game: OddsGame) {
  const b = getBetMgmBook(game);
  const m = b?.markets?.find((x) => x.key === "totals");
  return m?.outcomes?.[0]?.point;
}

// Como tu imagen: handicap “principal” (normalmente el positivo)
function displayHandicap(spreadAway?: number, spreadHome?: number) {
  const vals = [spreadAway, spreadHome].filter((x) => typeof x === "number") as number[];
  if (vals.length === 0) return undefined;
  return Math.max(...vals);
}

function scoreForTeam(sc: ScoreGame | undefined, teamName: string) {
  const s = sc?.scores?.find((x) => x.name === teamName)?.score;
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

  async function loadOddsAndScores() {
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
        for (const g of sc) map.set(g.id, g);
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
      const candidates = odds.filter((g) => new Date(g.commence_time).getTime() <= now);
      if (candidates.length === 0) return;

      const ids = candidates.map((g) => g.id).join(",");
      if (!ids) return;

      const r = await fetch(
        `/api/scores?sport=${encodeURIComponent(sport)}&eventIds=${encodeURIComponent(ids)}`,
        { cache: "no-store" }
      );
      if (!r.ok) return;

      const sc = (await r.json()) as ScoreGame[];
      const map = new Map(scores);
      for (const g of sc) map.set(g.id, g);
      setScores(map);
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    loadOddsAndScores();

    const base = setInterval(loadOddsAndScores, 120_000); // 2 min
    const live = setInterval(refreshScoresOnly, 30_000);  // 30s

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
    <main className="min-h-screen bg-[#f3f4f6]">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-[520px] px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold tracking-tight">marcadores.live</div>

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
                onClick={loadOddsAndScores}
                className="rounded-xl border bg-white px-3 py-2 text-sm active:scale-[0.99]"
                aria-label="Refrescar"
              >
                {loading ? "..." : "↻"}
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
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

      <section className="mx-auto max-w-[520px] px-3 py-3">
        <div className="space-y-2">
          {sorted.map((g) => {
            const sc = scores.get(g.id);

            const awayScore = scoreForTeam(sc, g.away_team);
            const homeScore = scoreForTeam(sc, g.home_team);

            const isLive = !!sc?.scores && sc.completed === false;
            const isFinal = sc?.completed === true;

            const awayAbbr = abbrTeam(g.away_team);
            const homeAbbr = abbrTeam(g.home_team);

            const spreadAway = getSpread(g, g.away_team);
            const spreadHome = getSpread(g, g.home_team);
            const handicap = displayHandicap(spreadAway, spreadHome);
            const total = getTotal(g);

            return (
              <article key={g.id} className="overflow-hidden rounded-2xl border bg-white">
                <div className="flex items-center justify-between border-b bg-[#f7f7f8] px-3 py-2">
                  <div className="text-[11px] text-gray-600">{fmtTime(g.commence_time)}</div>
                  <div className="text-[11px] text-gray-600">
                    {isLive ? "LIVE" : isFinal ? "FINAL" : ""}
                  </div>
                </div>

                <div className="px-3 py-2">
                  {/* Away row */}
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-semibold">{awayAbbr}</div>
                    {isLive || isFinal ? (
                      <div className="text-[14px] font-semibold tabular-nums">{awayScore ?? "—"}</div>
                    ) : (
                      <div className="text-[12px] text-gray-700 tabular-nums">{fmtSpread(spreadAway)}</div>
                    )}
                  </div>

                  {/* Home row */}
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-[14px] font-semibold">{homeAbbr}</div>
                    {isLive || isFinal ? (
                      <div className="text-[14px] font-semibold tabular-nums">{homeScore ?? "—"}</div>
                    ) : (
                      <div className="text-[12px] text-gray-700 tabular-nums">{fmtSpread(spreadHome)}</div>
                    )}
                  </div>

                  {/* Bottom line */}
                  <div className="mt-2 flex items-center justify-between text-[12px] text-gray-600">
                    {isLive ? (
                      <div className="truncate tabular-nums">LIVE · hace {sinceShort(sc?.last_update) || "—"}</div>
                    ) : isFinal ? (
                      <div className="truncate tabular-nums">FINAL · hace {sinceShort(sc?.last_update) || "—"}</div>
                    ) : (
                      <div className="tabular-nums">
                        {fmtSpread(handicap)}&nbsp;&nbsp;&nbsp;O/U {total ?? "—"}
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400">betmgm</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}