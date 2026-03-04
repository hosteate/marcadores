import { NextResponse } from "next/server";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const TIMEZONE = "America/Mexico_City";

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

// Calcula el offset real (en minutos) del timezone para una fecha dada
function getOffsetMinutes(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  // Construimos la “hora local” como si fuera UTC para inferir offset
  const asIfUTC = new Date(
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}.000Z`
  );

  return (asIfUTC.getTime() - date.getTime()) / 60000;
}

// ✅ HOY en America/Mexico_City, convertido a ISO (UTC) para The Odds API
function getTodayRangeISO(timeZone = TIMEZONE) {
  const now = new Date();

  // YYYY-MM-DD en el timezone
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "YYYY-MM-DD"

  const [y, m, d] = ymd.split("-").map(Number);

  // Inicio del día local (00:00:00 local) -> ISO UTC
  const guessStartUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const startOffset = getOffsetMinutes(guessStartUTC, timeZone);
  const start = new Date(guessStartUTC.getTime() - startOffset * 60000);

  // Fin del día local (23:59:59 local) -> ISO UTC
  const guessEndUTC = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  const endOffset = getOffsetMinutes(guessEndUTC, timeZone);
  const end = new Date(guessEndUTC.getTime() - endOffset * 60000);

  return { from: start.toISOString(), to: end.toISOString(), ymd };
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store", // ✅ NO refresh automático / NO revalidate
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

    // ✅ HOY en Mexico City (convertido a ISO UTC)
    const { from, to, ymd } = getTodayRangeISO(TIMEZONE);

    const url =
      `${ODDS_API_BASE}/sports/${encodeURIComponent(sport)}/odds` +
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
      {
        data,
        meta: {
          remaining,
          used,
          sport,
          markets,
          // Debug útil para confirmar “HOY”:
          todayYmdMexicoCity: ymd,
          commenceTimeFrom: from,
          commenceTimeTo: to,
          timeZone: TIMEZONE,
        },
      },
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