import "server-only";

import { createDb, schema } from "./connection";

/**
 * Single DB access point for app (server component / route handler) code.
 * The step-4 swap to Neon Postgres only touches connection.ts + schema dialect.
 */
export const { db } = createDb();
export { schema };
