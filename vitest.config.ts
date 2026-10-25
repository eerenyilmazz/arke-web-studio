import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Only the factory's own tests: vendor/ (UI UX Pro Max) and templates/ ship their own test files.
// Screenshots and font downloads are off in tests (they would open a real browser); tests/screenshots.test.ts turns them on itself.
// ARKE_ACCOUNTS_DIR points away from ~/.config: the suite runs on Eren's machine during an update and must never
// see (or use) the Cloudflare account he saved in the panel.
// 20 s per test: the update script runs the suite on Eren's machine, where a busy WSL must not fail an update.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { ARKE_SCREENSHOTS: "off", ARKE_SELF_HOST_FONTS: "off", ARKE_ACCOUNTS_DIR: path.join(os.tmpdir(), `arke-accounts-test-${process.pid}`) },
    testTimeout: 20_000,
  },
});
