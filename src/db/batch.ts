import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "./connection";

type Item = BatchItem<"sqlite">;

/**
 * Run many write statements in as few network round-trips as possible.
 * `db.batch()` sends a whole chunk in one request — critical against a remote
 * Turso DB, where an interactive transaction is one hop per statement (a full
 * sync went from ~200s of per-row hops to a few seconds with this).
 */
export async function runBatched(db: Db, statements: Item[], chunkSize = 200): Promise<void> {
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await db.batch(chunk as [Item, ...Item[]]);
  }
}
