import { NextResponse } from "next/server";

type CacheEntry = { ts: number; data: any };

const CACHE_TTL_MS = 60_000; // 60s cache para ahorrar requests
const cache = new Map<string, CacheEntry>();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get("sport") ?? "basketball_nba";

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta ODDS_API_KEY en .env.local" },
        { status: 500 }
      );
    }

    // Cache key (por liga + params)
    const regions = "us";
    const markets = "h2h,spreads,totals";
    const cacheKey = `${sport}|${regions}|${markets}`;

    const hit = cache.get(cacheKey);
    const now = Date.now();
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.data);
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=${encodeURIComponent(regions)}` +
      `&markets=${encodeURIComponent(markets)}` +
      `&oddsFormat=american&dateFormat=iso`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "The Odds API error", status: res.status, body: text },
        { status: res.status }
      );
    }

    const data = JSON.parse(text);

    // guarda cache
    cache.set(cacheKey, { ts: now, data });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server crash", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}