import { NextResponse } from "next/server";

/**
 * Devuelve un mapa: { "Team Full Name": "ABBR" }
 * Usamos ESPN teams API (NBA y Men's College Basketball).
 * Cache en memoria 24h para no pegarle a ESPN seguido.
 */

type CacheEntry = { ts: number; data: Record<string, string> };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const cache = new Map<string, CacheEntry>();

const ESPN_TEAMS_ENDPOINT: Record<string, string> = {
  basketball_nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams",
  basketball_ncaab:
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams",
};

function extractTeams(obj: any): Array<any> {
  // ESPN suele venir como sports->leagues->teams o directamente sports->teams
  // Manejamos varias formas sin romper.
  const out: any[] = [];

  const tryPushTeams = (teamsArr: any[]) => {
    for (const t of teamsArr ?? []) {
      const team = t?.team ?? t;
      if (team) out.push(team);
    }
  };

  // Forma común: obj.sports[0].leagues[0].teams
  const sports = obj?.sports;
  if (Array.isArray(sports)) {
    for (const s of sports) {
      const leagues = s?.leagues;
      if (Array.isArray(leagues)) {
        for (const l of leagues) {
          if (Array.isArray(l?.teams)) tryPushTeams(l.teams);
        }
      }
      if (Array.isArray(s?.teams)) tryPushTeams(s.teams);
    }
  }

  // Fallback: obj.leagues[0].teams
  const leagues = obj?.leagues;
  if (Array.isArray(leagues)) {
    for (const l of leagues) {
      if (Array.isArray(l?.teams)) tryPushTeams(l.teams);
    }
  }

  // Fallback: obj.teams
  if (Array.isArray(obj?.teams)) tryPushTeams(obj.teams);

  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get("sport") ?? "basketball_nba";

    const endpoint = ESPN_TEAMS_ENDPOINT[sport];
    if (!endpoint) {
      return NextResponse.json(
        { error: "sport inválido", allowed: Object.keys(ESPN_TEAMS_ENDPOINT) },
        { status: 400 }
      );
    }

    const now = Date.now();
    const hit = cache.get(sport);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.data);
    }

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "ESPN teams error", status: res.status, body: text },
        { status: 502 }
      );
    }

    const json = await res.json();
    const teams = extractTeams(json);

    const map: Record<string, string> = {};
    for (const t of teams) {
      // campos comunes:
      // name: "Denver Nuggets"
      // abbreviation: "DEN"
      const name = t?.name ?? t?.displayName ?? t?.shortDisplayName;
      const abbr = t?.abbreviation ?? t?.shortDisplayName;
      if (typeof name === "string" && typeof abbr === "string" && abbr.length > 0) {
        map[name] = abbr.toUpperCase();
      }
    }

    cache.set(sport, { ts: now, data: map });
    return NextResponse.json(map);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server crash", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}