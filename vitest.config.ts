import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    testTimeout: 30000,
    globalSetup: ["./tests/fixture/global-setup.ts"],
    setupFiles: ["./tests/fixture/test-setup.ts"],
    coverage: {
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
  },
});
