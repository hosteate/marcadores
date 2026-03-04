import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(id) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") ?? "basketball_nba";
    const eventIds = searchParams.get("eventIds");
    const daysFrom = searchParams.get("daysFrom");

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta ODDS_API_KEY en .env.local" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    let url =
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/scores` +
      `?apiKey=${encodeURIComponent(apiKey)}` +
      `&dateFormat=iso`;

    if (daysFrom) url += `&daysFrom=${encodeURIComponent(daysFrom)}`;
    if (eventIds) url += `&eventIds=${encodeURIComponent(eventIds)}`;

    const { controller, clear } = withTimeout(8000);

    let res: Response;
    try {
      res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clear();
    }

    const text = await res.text();

    const remaining = res.headers.get("x-requests-remaining");
    const used = res.headers.get("x-requests-used");

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "The Odds API error",
          status: res.status,
          remaining,
          used,
          body: text,
        },
        { status: res.status, headers: NO_STORE_HEADERS }
      );
    }

    const data = JSON.parse(text);

    return NextResponse.json(
      {
        data,
        meta: {
          sport,
          daysFrom,
          eventIds,
          remaining,
          used,
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