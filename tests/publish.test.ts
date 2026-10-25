import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, PUBLISH_DIR, preparePublishDir } from "../src/deploy/publish-dir.js";
import { dirHash } from "../src/lib/files.js";
import { isTransientDeployError } from "../src/tools/deploy.js";

function dist() {
  const root = mkdtempSync(path.join(os.tmpdir(), "arke-publish-"));
  const d = path.join(root, "dist");
  const w = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    writeFileSync(path.join(d, rel), text);
  };
  w("index.html", "<h1>Home</h1>");
  w("robots.txt", "User-agent: *\nAllow: /\nSitemap: https://example.co.uk/sitemap.xml\n");
  w("brand/logo.svg", "<svg/>");
  w("brand/brand.json", "{}");
  w("brand/signature.html", "<p>demo</p>");
  w("brand/options/a.json", "{}");
  return { root, d };
}

describe("what Cloudflare receives", () => {
  it("leaves out the operator's brand files, keeps the logo, and never changes dist/", () => {
    const { root, d } = dist();
    const before = dirHash(d);
    expect(preparePublishDir(root, d, { target: "production", app: false, formAction: null })).toBe(`./${PUBLISH_DIR}`);
    const out = path.join(root, PUBLISH_DIR);
    expect(existsSync(path.join(out, "brand", "logo.svg"))).toBe(true);
    for (const gone of ["brand/brand.json", "brand/signature.html", "brand/options"]) expect(existsSync(path.join(out, gone))).toBe(false);
    expect(dirHash(d)).toBe(before);
    const headers = readFileSync(path.join(out, "_headers"), "utf8");
    expect(headers).toMatch(/Strict-Transport-Security/);
    expect(headers).toMatch(/Content-Security-Policy: default-src 'self'/);
    expect(headers).not.toMatch(/X-Robots-Tag/);
    expect(readFileSync(path.join(out, "robots.txt"), "utf8")).toMatch(/Allow: \//);
  });

  it("keeps a preview out of search engines, and app sites get no CSP", () => {
    const { root, d } = dist();
    preparePublishDir(root, d, { target: "preview", app: true, formAction: null });
    const out = path.join(root, PUBLISH_DIR);
    expect(readFileSync(path.join(out, "robots.txt"), "utf8")).toBe("User-agent: *\nDisallow: /\n");
    const headers = readFileSync(path.join(out, "_headers"), "utf8");
    expect(headers).toMatch(/X-Robots-Tag: noindex, nofollow/);
    expect(headers).not.toMatch(/Content-Security-Policy|Strict-Transport-Security/);
  });

  it("lets the contact form post to its own address and keeps the site's own header rules", () => {
    expect(contentSecurityPolicy("https://forms.example.com/f/abc")).toMatch(/form-action 'self' https:\/\/forms\.example\.com;/);
    const { root, d } = dist();
    writeFileSync(path.join(d, "_headers"), "/assets/*\n  Cache-Control: max-age=600\n");
    preparePublishDir(root, d, { target: "production", app: false, formAction: null });
    expect(readFileSync(path.join(root, PUBLISH_DIR, "_headers"), "utf8")).toMatch(/nosniff[\s\S]*\/assets\/\*\n {2}Cache-Control/);
  });

  it("retries only errors that can pass on their own", () => {
    expect(isTransientDeployError("✘ [ERROR] asset upload failed: fetch failed")).toBe(true);
    expect(isTransientDeployError("ERROR 503 Service Unavailable")).toBe(true);
    expect(isTransientDeployError("Authentication error [code: 10000]")).toBe(false);
    expect(isTransientDeployError("Missing entry-point")).toBe(false);
  });
});

describe("backup file names", () => {
  it("use this machine's own clock, like the list in the panel", async () => {
    const { localStamp } = await import("../src/panel/backup.js");
    const d = new Date(2026, 9, 25, 13, 43);
    expect(localStamp(d)).toBe("20261025-1343");
  });
});
