import { desc, eq } from "drizzle-orm";

import { schema, type Db } from "@/db/connection";

type DB = Db;

/** settings table helpers — values are JSON-encoded. */

export async function getSetting<T = unknown>(db: DB, key: string): Promise<T | null> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

export async function setSetting(db: DB, key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await db
    .insert(schema.settings)
    .values({ key, value: v })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: v } });
}

export async function deleteSetting(db: DB, key: string): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
}

export const DUNKEST_TOKEN_KEY = "dunkestToken";

/** env var wins over the stored value so deploys can inject it. */
export async function resolveDunkestToken(db: DB): Promise<string | null> {
  const fromEnv = process.env.DUNKEST_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return getSetting<string>(db, DUNKEST_TOKEN_KEY);
}

export async function getLastSync(db: DB) {
  return (
    (await db
      .select()
      .from(schema.syncLog)
      .orderBy(desc(schema.syncLog.id))
      .limit(1)
      .get()) ?? null
  );
}
