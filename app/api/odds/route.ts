import { NextResponse } from "next/server";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

function getMarketsForSport(sport: string) {
  // NBA / NCAAB: ML + HCP + O/U
  if (sport === "basketball_nba" || sport === "basketball_ncaab") {
    return "h2h,spreads,totals";
  }
  // Liga MX (soccer): ML + O/U
  if (sport.includes("soccer")) {
    return "h2h,totals";
  }
  return "h2h,totals";
}

// HOY en UTC (simple)
function getTodayUtcRangeISO() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)
  );
  return { from: start.toISOString(), to: end.toISOString() };
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store", // ✅ no cache / no revalidate
    });
  } finally {
    clearTimeout(id);
  }
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") ?? "basketball_nba";
    const markets = searchParams.get("markets") ?? getMarketsForSport(sport);

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta ODDS_API_KEY en variables de entorno" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Por default: HOY UTC
    // (Si algún día quieres HOY CDMX, lo ideal es pasar commenceTimeFrom/To desde UI)
    const { from, to } = getTodayUtcRangeISO();

    const commenceTimeFrom = searchParams.get("commenceTimeFrom") ?? from;
    const commenceTimeTo = searchParams.get("commenceTimeTo") ?? to;

    const url =
      `${ODDS_API_BASE}/sports/${encodeURIComponent(sport)}/odds` +
      `?apiKey=${encodeURIComponent(apiKey)}` +
      `&regions=us` +
      `&markets=${encodeURIComponent(markets)}` +
      `&oddsFormat=american` +
      `&dateFormat=iso` +
      `&bookmakers=betmgm` +
      `&commenceTimeFrom=${encodeURIComponent(commenceTimeFrom)}` +
      `&commenceTimeTo=${encodeURIComponent(commenceTimeTo)}`;

    const res = await fetchWithTimeout(url, 8000);
    const bodyText = await res.text();

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
        { status: res.status, headers: NO_STORE_HEADERS }
      );
    }

    const data = JSON.parse(bodyText);

    return NextResponse.json(
      { data, meta: { remaining, used, sport, markets, from: commenceTimeFrom, to: commenceTimeTo } },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (e: any) {
    const isAbort = e?.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort ? "Timeout llamando The Odds API" : "Server crash",
        detail: e?.message ?? String(e),
      },
      { status: isAbort ? 504 : 500, headers: NO_STORE_HEADERS }
    );
  }
}