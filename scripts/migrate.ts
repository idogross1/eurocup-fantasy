import "dotenv/config";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { rmSync } from "node:fs";

import { createDb, resolveDbPath } from "../src/db/connection";

if (process.argv.includes("--reset")) {
  const p = resolveDbPath();
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(p + suffix, { force: true });
  }
  console.log("reset: removed", p);
}

const { db, sqlite } = createDb();
migrate(db, { migrationsFolder: "./drizzle" });
sqlite.close();
console.log("migrations applied");
