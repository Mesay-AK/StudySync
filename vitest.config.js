import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    globalSetup: ["test/helpers/globalSetup.js"],
    // All files share one live server + database; running them one at a time
    // keeps the shared auth rate-limit counters and timing-based socket
    // assertions deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 600_000,
  },
});
