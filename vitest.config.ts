import { defineConfig } from "vitest/config";

// Only the factory's own tests: vendor/ (UI UX Pro Max) and templates/ ship their own test files.
// Screenshots are off in tests (they would open a real browser); tests/screenshots.test.ts turns them on itself.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], env: { SF_SCREENSHOTS: "off" } },
});
