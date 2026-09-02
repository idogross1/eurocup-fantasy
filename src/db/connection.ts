import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import * as schema from "./schema";

/**
 * Raw connection factory, safe to import from CLI scripts (no "server-only"
 * guard). App code should import { db } from "./index" instead.
 */

export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "./data/eurocup.sqlite";
  return resolve(process.cwd(), url);
}

export function createDb() {
  const dbPath = resolveDbPath();
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite, { schema }), sqlite };
}

export { schema };
