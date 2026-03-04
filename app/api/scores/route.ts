import { NextResponse } from "next/server";

function withTimeout(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(id) };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") ?? "basketball_nba";
    const eventIds = searchParams.get("eventIds"); // opcional: "id1,id2"
    const daysFrom = searchParams.get("daysFrom"); // opcional: 1..3

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta ODDS_API_KEY en variables de entorno" },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    let url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(
      sport
    )}/scores?apiKey=${encodeURIComponent(apiKey)}&dateFormat=iso`;

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

    const remaining = res.headers.get("x-requests-remaining");
    const used = res.headers.get("x-requests-used");

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "The Odds API error",
          status: res.status,
          remaining,
          used,
          body: text,
        },
        {
          status: res.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const data = JSON.parse(text);

    return NextResponse.json(
      { data, meta: { remaining, used, sport, daysFrom, eventIds } },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e: any) {
    const isAbort = e?.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort ? "Timeout llamando The Odds API" : "Server crash",
        detail: e?.message ?? String(e),
      },
      {
        status: isAbort ? 504 : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}