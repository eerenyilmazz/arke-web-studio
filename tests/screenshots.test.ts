import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { takeScreenshots } from "../src/lib/screenshots.js";

const BROWSER = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

describe("screenshots for the agent", () => {
  it("skips quietly when turned off", async () => {
    expect((await takeScreenshots("/nowhere", "/nowhere")).status).toBe("skip");
  });

  it.runIf(existsSync(BROWSER))("serves dist and saves a phone and a desktop image", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "shots-"));
    const dist = path.join(dir, "dist");
    mkdirSync(dist);
    writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>x</title><h1 style='color:#c00'>Hello</h1>");
    const prev = { s: process.env.SF_SCREENSHOTS, b: process.env.SF_BROWSER };
    process.env.SF_SCREENSHOTS = "on";
    process.env.SF_BROWSER = BROWSER;
    try {
      const r = await takeScreenshots(dist, path.join(dir, "shots"));
      expect(r.status).toBe("pass");
      expect(existsSync(path.join(dir, "shots", "telefon.png"))).toBe(true);
      expect(existsSync(path.join(dir, "shots", "masaustu.png"))).toBe(true);
    } finally {
      process.env.SF_SCREENSHOTS = prev.s;
      process.env.SF_BROWSER = prev.b;
    }
  }, 60_000);
});
