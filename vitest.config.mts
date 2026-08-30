import { defineConfig } from "vitest/config";


export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /*
     * The migration test builds a real SQLite file and runs every migration
     * over it, twice. That takes about two seconds idle but comfortably
     * exceeds the five-second default on a loaded machine — it failed at
     * 5.1s and again at 13.3s while a dev server was running, and passed
     * every time in isolation. A slow disk is not a broken migration, so it
     * gets room rather than a false alarm in CI.
     */
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
