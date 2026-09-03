import "server-only";

import { createDb, schema, type Db } from "./connection";

/**
 * Single DB access point for app (server component / route handler) code.
 * Swapping databases only touches connection.ts.
 */
export const { db, client } = createDb();
export { schema };
export type { Db };
