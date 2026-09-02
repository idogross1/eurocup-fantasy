/**
 * Thin client for the private Dunkest REST API that powers EuroCup Fantasy
 * Challenge. Read-only — we only pull the account owner's own data. Endpoints,
 * fields and IDs are undocumented and may change without notice, so parsing
 * everywhere is defensive.
 *
 * See euroleaguefantasyapicontext.md for the reverse-engineering notes.
 */

export const DUNKEST_BASE = "https://fantaking-api.dunkest.com/api/v1";

export const EUROCUP_LEAGUE_ID = 11;
export const GAME_MODE_CONTEST = 1;
export const GAME_ID = 7;

export class DunkestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "DunkestError";
  }
}

export type DunkestClient = {
  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T>;
};

export function makeClient(token: string): DunkestClient {
  const clean = token.trim().replace(/^"|"$/g, "");
  if (!clean) throw new DunkestError("no Dunkest token provided");

  async function get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(DUNKEST_BASE + path);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${clean}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch (e) {
      throw new DunkestError(`network error calling ${path}: ${(e as Error).message}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new DunkestError(
        "Dunkest rejected the token — log in at euroleaguefantasy.euroleaguebasketball.net " +
          "and paste a fresh flutter.authToken.",
        res.status,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DunkestError(`Dunkest ${res.status} on ${path}`, res.status, body.slice(0, 300));
    }
    return (await res.json()) as T;
  }

  return { get };
}
