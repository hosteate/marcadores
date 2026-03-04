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
    const eventIds = searchParams.get("eventIds"); // opcional
    const daysFrom = searchParams.get("daysFrom"); // opcional (1..3)

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

    // Trae finales recientes también
    if (daysFrom) url += `&daysFrom=${encodeURIComponent(daysFrom)}`;

    // Opcional: filtrar por ids
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

    if (!res.ok) {
      return NextResponse.json(
        { error: "The Odds API error", status: res.status, body: text },
        { status: res.status, headers: NO_STORE_HEADERS }
      );
    }

    // ✅ Mantén el mismo contrato: devuelve array directo
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
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