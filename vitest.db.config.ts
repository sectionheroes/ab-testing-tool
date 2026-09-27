import { defineConfig } from "vitest/config";

// Database-backed integration tests (`pnpm test:db`). They need a migrated local Postgres in DATABASE_URL and run
// each case inside a rolled-back transaction, so they never write anything permanent. Kept out of the default suite
// so `pnpm test` stays runnable without infrastructure; CI runs both.
export default defineConfig({
  test: {
    include: ["**/*.db.test.ts"],
    environment: "node",
    // One database, shared fixtures at the table level – serial keeps the transactions from fighting over locks.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
