import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    testTimeout: 0,
    globalSetup: ["./tests/fixture/global-setup.ts"],
    setupFiles: ["./tests/fixture/test-setup.ts"],
    coverage: {
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
    // Tests share a MongoDB instance and run sequentially ordered operations,
    // so we force a single worker to avoid race conditions.
    maxWorkers: 1,
    minWorkers: 1,
  },
});
