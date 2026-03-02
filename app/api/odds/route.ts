import { NextResponse } from "next/server";

type CacheEntry = { ts: number; data: any };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get("sport") ?? "basketball_nba";

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Falta ODDS_API_KEY" }, { status: 500 });

    const regions = "us";
    const markets = "h2h,spreads,totals"; // ✅ moneyline + spread + O/U
    const bookmakers = "betmgm";

    const cacheKey = `${sport}|${regions}|${markets}|${bookmakers}`;
    const now = Date.now();
    const hit = cache.get(cacheKey);
    if (hit && now - hit.ts < CACHE_TTL_MS) return NextResponse.json(hit.data);

    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=${encodeURIComponent(regions)}` +
      `&markets=${encodeURIComponent(markets)}` +
      `&bookmakers=${encodeURIComponent(bookmakers)}` +
      `&oddsFormat=american&dateFormat=iso`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Odds API error", status: res.status, body: text },
        { status: res.status }
      );
    }

    const data = JSON.parse(text);
    cache.set(cacheKey, { ts: now, data });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "Server crash", detail: e?.message ?? String(e) }, { status: 500 });
  }
}