import "dotenv/config";

import { migrate } from "drizzle-orm/libsql/migrator";
import { rmSync } from "node:fs";

import { createDb, resolveDbUrl } from "../src/db/connection";

async function main() {
  if (process.argv.includes("--reset")) {
    const url = resolveDbUrl();
    if (url.startsWith("file:")) {
      const p = url.slice("file:".length);
      for (const suffix of ["", "-shm", "-wal"]) rmSync(p + suffix, { force: true });
      console.log("reset: removed", p);
    } else {
      console.error("reset only supported for local file: databases — skipping");
    }
  }

  const { db, client } = createDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  client.close();
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
