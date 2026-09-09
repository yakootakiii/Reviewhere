import { defineConfig } from "vitest/config";

/**
 * The security-rules suite runs against the Firestore emulator, so it lives
 * apart from the default config: `npm test` stays fast and needs no emulator,
 * and `npm run test:rules` wraps this one in `firebase emulators:exec`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["rules/**/*.test.ts"],
    // Rule evaluation against a real emulator is slower than a unit test.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
