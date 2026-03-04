import { NextResponse } from "next/server";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

function getMarketsForSport(sport: string) {
  // NBA / NCAAB: ML + HCP + O/U
  if (sport === "basketball_nba" || sport === "basketball_ncaab") {
    return "h2h,spreads,totals";
  }
  // Liga MX (soccer): ML + O/U
  // En The Odds API suele ser soccer_mexico_ligamx (confirma tu key exacta)
  if (sport.includes("soccer")) {
    return "h2h,totals";
  }
  // fallback
  return "h2h,totals";
}

// “HOY” en UTC (simple). Si quieres “HOY en Mexico City”,
// te paso una versión con timezone usando date-fns-tz.
function getTodayUtcRangeISO() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  return { from: start.toISOString(), to: end.toISOString() };
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      // Para Vercel/Next: cache controlado (ajusta por sección si lo separas)
      next: { revalidate: 15 }, // 15s suele ir bien para odds
    });
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") ?? "basketball_nba";
    // opcional: permitir override desde UI (?markets=...)
    const markets = searchParams.get("markets") ?? getMarketsForSport(sport);

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta ODDS_API_KEY en variables de entorno" },
        { status: 500 }
      );
    }

    // “HOY”
    const { from, to } = getTodayUtcRangeISO();

    const url =
      `${ODDS_API_BASE}/sports/${sport}/odds` +
      `?apiKey=${encodeURIComponent(apiKey)}` +
      `&regions=us` +
      `&markets=${encodeURIComponent(markets)}` +
      `&oddsFormat=american` +
      `&dateFormat=iso` +
      `&bookmakers=betmgm` +
      `&commenceTimeFrom=${encodeURIComponent(from)}` +
      `&commenceTimeTo=${encodeURIComponent(to)}`;

    const res = await fetchWithTimeout(url, 8000);
    const bodyText = await res.text();

    // Headers útiles de The Odds API (si vienen)
    const remaining = res.headers.get("x-requests-remaining");
    const used = res.headers.get("x-requests-used");

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "The Odds API error",
          status: res.status,
          remaining,
          used,
          body: bodyText,
          url: url.replace(apiKey, "REDACTED"),
        },
        { status: res.status }
      );
    }

    const data = JSON.parse(bodyText);

    return NextResponse.json(
      { data, meta: { remaining, used, sport, markets, from, to } },
      { status: 200 }
    );
  } catch (e: any) {
    const isAbort = e?.name === "AbortError";
    return NextResponse.json(
      { error: isAbort ? "Timeout llamando The Odds API" : "Server crash", detail: e?.message ?? String(e) },
      { status: isAbort ? 504 : 500 }
    );
  }
}