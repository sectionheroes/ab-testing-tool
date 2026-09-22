import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
    setupFiles: ["lib/snippet/test/setup.ts"],
  },
});
