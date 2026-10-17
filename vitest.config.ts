import { defineConfig } from "vitest/config";

// Only the factory's own tests: vendor/ (UI UX Pro Max) and templates/ ship their own test files.
// Screenshots are off in tests (they would open a real browser); tests/screenshots.test.ts turns them on itself.
// 20 s per test: the update script runs the suite on Eren's machine, where a busy WSL must not fail an update.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], env: { SF_SCREENSHOTS: "off" }, testTimeout: 20_000 },
});
