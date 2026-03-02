import { NextResponse } from "next/server";

type CacheEntry = { ts: number; data: any };
const CACHE_TTL_MS = 15_000; // cache corto (scores ~30s)
const cache = new Map<string, CacheEntry>();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get("sport") ?? "basketball_nba";
    const eventIds = searchParams.get("eventIds") ?? "";

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Falta ODDS_API_KEY" }, { status: 500 });
    }

    const daysFrom = "1";
    const dateFormat = "iso";

    const cacheKey = `${sport}|${daysFrom}|${dateFormat}|${eventIds}`;
    const now = Date.now();
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.data);
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/scores/` +
      `?apiKey=${apiKey}&daysFrom=${daysFrom}&dateFormat=${dateFormat}` +
      (eventIds ? `&eventIds=${encodeURIComponent(eventIds)}` : "");

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Scores API error", status: res.status, body: text },
        { status: res.status }
      );
    }

    const data = JSON.parse(text);
    cache.set(cacheKey, { ts: now, data });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server crash", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}