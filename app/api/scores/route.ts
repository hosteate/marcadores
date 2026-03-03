import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") ?? "basketball_nba";
    const eventIds = searchParams.get("eventIds"); // opcional
    const daysFrom = searchParams.get("daysFrom"); // opcional (1..3)

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Falta ODDS_API_KEY en .env.local" }, { status: 500 });
    }

    let url = `https://api.the-odds-api.com/v4/sports/${sport}/scores?apiKey=${apiKey}&dateFormat=iso`;

    // Para traer juegos finalizados recientes
    if (daysFrom) url += `&daysFrom=${encodeURIComponent(daysFrom)}`;

    // Opcional: filtrar por ids
    if (eventIds) url += `&eventIds=${encodeURIComponent(eventIds)}`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "The Odds API error", status: res.status, body: text },
        { status: res.status }
      );
    }

    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server crash", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}