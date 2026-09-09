import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // `server-only` throws unless resolved under the react-server condition,
      // which vitest doesn't set. The package ships an empty module for exactly
      // this case; pointing at it keeps the marker meaningful in the app build
      // while letting server modules be unit-tested.
      "server-only": new URL("./node_modules/server-only/empty.js", import.meta.url).pathname,
    },
  },
});
