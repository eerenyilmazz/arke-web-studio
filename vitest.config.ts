import { defineConfig } from "vitest/config";

// Only the factory's own tests: vendor/ (UI UX Pro Max) and templates/ ship their own test files.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
