import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Per-file environment via a docblock `@vitest-environment jsdom` in the
    // integration test keeps the unit tests on the fast node environment.
  },
});
