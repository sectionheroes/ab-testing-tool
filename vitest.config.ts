import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    // The database-backed suite has its own config and script (`pnpm test:db`); it needs a migrated Postgres.
    exclude: ["**/node_modules/**", "**/*.db.test.ts"],
    environment: "node",
    setupFiles: ["lib/snippet/test/setup.ts"],
  },
});
