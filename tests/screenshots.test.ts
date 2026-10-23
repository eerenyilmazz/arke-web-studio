import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { takeScreenshots, takeSignatureFrames } from "../src/lib/screenshots.js";

const BROWSER = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

describe("screenshots for the agent", () => {
  it("skips quietly when turned off", async () => {
    expect((await takeScreenshots("/nowhere", "/nowhere")).status).toBe("skip");
  });

  it.runIf(existsSync(BROWSER))(
    "serves dist and saves a phone and a desktop image",
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "shots-"));
      const dist = path.join(dir, "dist");
      mkdirSync(dist);
      writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>x</title><h1 style='color:#c00'>Hello</h1>");
      const prev = { s: process.env.ARKE_SCREENSHOTS, b: process.env.ARKE_BROWSER };
      process.env.ARKE_SCREENSHOTS = "on";
      process.env.ARKE_BROWSER = BROWSER;
      try {
        const r = await takeScreenshots(dist, path.join(dir, "shots"));
        expect(r.status).toBe("pass");
        expect(existsSync(path.join(dir, "shots", "telefon.png"))).toBe(true);
        expect(existsSync(path.join(dir, "shots", "masaustu.png"))).toBe(true);
      } finally {
        process.env.ARKE_SCREENSHOTS = prev.s;
        process.env.ARKE_BROWSER = prev.b;
      }
    },
    60_000,
  );
});

describe("signature motion frames", () => {
  it.runIf(existsSync(BROWSER))(
    "films brand/signature.html as four stills that differ as the motion plays",
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "frames-"));
      const dist = path.join(dir, "dist");
      mkdirSync(path.join(dist, "brand"), { recursive: true });
      writeFileSync(
        path.join(dist, "brand", "signature.html"),
        "<!doctype html><style>body{margin:0;background:#fff}.bar{height:200px;width:10px;background:#c00;animation:grow 1s linear forwards}@keyframes grow{to{width:800px}}</style><div class=bar></div>",
      );
      const prev = { s: process.env.ARKE_SCREENSHOTS, b: process.env.ARKE_BROWSER };
      process.env.ARKE_SCREENSHOTS = "on";
      process.env.ARKE_BROWSER = BROWSER;
      try {
        const r = await takeSignatureFrames(dist, path.join(dir, "shots"), 1000);
        expect(r?.status).toBe("pass");
        const frames = [1, 2, 3, 4].map((i) => readFileSync(path.join(dir, "shots", `imza-${i}.png`)));
        expect(frames[0]!.equals(frames[3]!)).toBe(false); // the bar has grown between the first and the last
      } finally {
        process.env.ARKE_SCREENSHOTS = prev.s;
        process.env.ARKE_BROWSER = prev.b;
      }
    },
    90_000,
  );
});

describe("screenshot server stays inside dist/", () => {
  it("refuses a sibling folder whose name starts like dist", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { serveDistForTest } = await import("../src/lib/screenshots.js");
    const base = mkdtempSync(path.join(os.tmpdir(), "sf-shot-"));
    mkdirSync(path.join(base, "dist"));
    mkdirSync(path.join(base, "dist2"));
    writeFileSync(path.join(base, "dist", "index.html"), "<p>ok</p>");
    writeFileSync(path.join(base, "dist2", "secret.txt"), "nope");
    const { url, close } = await serveDistForTest(path.join(base, "dist"));
    try {
      expect((await fetch(`${url}/`)).status).toBe(200);
      // fetch() would normalise "..", so the raw path goes out through node:http, as a local process could send it.
      const { request } = await import("node:http");
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(`${url}/`, { path: "/../dist2/secret.txt" }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      close();
    }
  });
});
