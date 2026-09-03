import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema";

/**
 * Raw connection factory, safe to import from CLI scripts (no "server-only"
 * guard). App code should import { db } from "./index" instead.
 *
 * One driver, two environments:
 *   - local:  DATABASE_URL=file:./data/eurocup.sqlite   (a plain SQLite file)
 *   - Turso:  DATABASE_URL=libsql://<db>.turso.io  + DATABASE_AUTH_TOKEN=...
 * The schema/migrations are SQLite dialect and identical for both.
 */

export type Db = LibSQLDatabase<typeof schema>;

export function resolveDbUrl(): string {
  const raw = (process.env.DATABASE_URL ?? "file:./data/eurocup.sqlite").trim();
  if (!raw.startsWith("file:")) return raw;

  // normalise a relative file: URL to an absolute file:// URL and ensure the dir exists
  const rel = raw.slice("file:".length).replace(/^\/+/, "");
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(dirname(abs))) mkdirSync(dirname(abs), { recursive: true });
  return `file://${abs}`;
}

export function createDb(): { db: Db; client: Client } {
  const url = resolveDbUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
  const client = createClient(url.startsWith("file:") ? { url } : { url, authToken });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
