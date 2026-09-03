import "server-only";

import { createDb, schema, type Db } from "./connection";

/**
 * Single DB access point for app (server component / route handler) code.
 *
 * Lazily created: `createClient()` runs on first query, never at import time.
 * That keeps `next build`'s "collect page data" step (which imports route
 * modules without running them) from needing a live DATABASE_URL.
 */
let real: Db | undefined;
function get(): Db {
  if (!real) real = createDb().db;
  return real;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const value = Reflect.get(get() as object, prop, receiver);
    return typeof value === "function" ? value.bind(get()) : value;
  },
});

export { schema };
export type { Db };
