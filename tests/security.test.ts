import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkSvg, saveAsset, sniffImageType } from "../src/lib/assets.js";
import { redact, run } from "../src/lib/exec.js";
import { deepMerge } from "../src/lib/merge.js";
import { assertSlug, clientPaths, safeJoin } from "../src/lib/paths.js";
import { PNG_1PX, tempFactory } from "./helpers.js";

describe("slug and paths", () => {
  it("accepts normal slugs and rejects dangerous ones", () => {
    expect(assertSlug("willow-thread")).toBe("willow-thread");
    for (const bad of ["../etc", "a", "Willow", "has space", "x;rm -rf", "-start", "end-", "a/b", "a".repeat(41)]) {
      expect(() => assertSlug(bad)).toThrow();
    }
  });

  it("safeJoin blocks traversal and absolute paths", () => {
    const f = tempFactory();
    expect(safeJoin(f.inboxDir, "logo.png")).toBe(path.join(f.inboxDir, "logo.png"));
    expect(() => safeJoin(f.inboxDir, "../clients/x")).toThrow();
    expect(() => safeJoin(f.inboxDir, "/etc/passwd")).toThrow();
    expect(() => safeJoin(f.inboxDir, "a\0b")).toThrow();
  });

  it("safeJoin blocks symlinks that point outside", () => {
    const f = tempFactory();
    mkdirSync(path.join(f.base, "secret"));
    symlinkSync(path.join(f.base, "secret"), path.join(f.inboxDir, "link"));
    expect(() => safeJoin(f.inboxDir, "link/key.txt")).toThrow();
  });

  it("locale paths reject anything but two letters", () => {
    const f = tempFactory();
    const p = clientPaths(f.clientsRoot, "abc");
    expect(() => p.content("../x")).toThrow();
    expect(p.content("en")).toMatch(/content[\\/]en\.json$/);
  });
});

describe("images", () => {
  it("detects real type regardless of extension", () => {
    expect(sniffImageType(PNG_1PX)).toBe("png");
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe("svg");
    expect(sniffImageType(Buffer.from("MZ executable"))).toBeNull();
  });

  it("rejects unsafe SVG", () => {
    const cases = [
      "<svg><script>alert(1)</script></svg>",
      "<svg onload='x()'></svg>",
      "<svg><a href='javascript:x'>a</a></svg>",
      "<svg><foreignObject></foreignObject></svg>",
      "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg>&x;</svg>",
      "<svg><image href='https://evil.example/x.png'/></svg>",
      "<svg><style>@import url(https://evil.example/a.css)</style></svg>",
    ];
    for (const svg of cases) expect(checkSvg(svg).length, svg).toBeGreaterThan(0);
  });

  it("accepts a plain SVG with internal references", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"/></defs><use href="#g"/><rect fill="url(#g)"/></svg>`;
    expect(checkSvg(svg)).toEqual([]);
  });

  it("rejects fake images, oversized files and symlinks; names files safely", () => {
    const f = tempFactory();
    const assets = path.join(f.base, "assets");
    writeFileSync(path.join(f.inboxDir, "fake.png"), "not an image");
    expect(() => saveAsset({ sourceAbs: path.join(f.inboxDir, "fake.png"), assetsDir: assets, kind: "logo", name: "fake.png", maxBytes: 1000 })).toThrow(
      /Not a supported image/,
    );

    writeFileSync(path.join(f.inboxDir, "big.png"), Buffer.concat([PNG_1PX, Buffer.alloc(5000)]));
    expect(() => saveAsset({ sourceAbs: path.join(f.inboxDir, "big.png"), assetsDir: assets, kind: "logo", name: "big", maxBytes: 1000 })).toThrow(/limit/);

    writeFileSync(path.join(f.base, "outside.png"), PNG_1PX);
    symlinkSync(path.join(f.base, "outside.png"), path.join(f.inboxDir, "ln.png"));
    expect(() => saveAsset({ sourceAbs: path.join(f.inboxDir, "ln.png"), assetsDir: assets, kind: "logo", name: "ln", maxBytes: 1000 })).toThrow(
      /regular file/,
    );

    writeFileSync(path.join(f.inboxDir, "ok.jpg"), PNG_1PX);
    const saved = saveAsset({ sourceAbs: path.join(f.inboxDir, "ok.jpg"), assetsDir: assets, kind: "logo", name: "My Logo; rm -rf.JPG", maxBytes: 1000 });
    expect(saved.relPath).toBe("assets/logo-my-logo-rm-rf.png");
  });
});

describe("exec", () => {
  it("passes arguments literally (no shell injection)", async () => {
    const res = await run(process.execPath, ["-e", "console.log(process.argv[1])", "$(echo hacked); echo hacked"], { cwd: process.cwd(), timeoutMs: 10_000 });
    expect(res.stdout.trim()).toBe("$(echo hacked); echo hacked");
  });

  it("does not leak parent env and masks secrets in output", async () => {
    process.env.SF_TEST_PARENT_SECRET = "parent-secret-value";
    const res = await run(process.execPath, ["-e", "console.log(process.env.SF_TEST_PARENT_SECRET ?? 'none', process.env.TOKEN)"], {
      cwd: process.cwd(),
      timeoutMs: 10_000,
      env: { TOKEN: "super-secret-token" },
      secrets: ["super-secret-token"],
    });
    expect(res.stdout.trim()).toBe("none ***");
    expect(redact("a short b", ["short"])).toBe("a short b");
  });
});

describe("merge", () => {
  it("merges objects, replaces arrays, keeps null, blocks prototype pollution", () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9], n: null })).toEqual({ a: { b: 1, c: 3 }, l: [9], n: null });
    expect(() => deepMerge({}, JSON.parse('{"__proto__": {"x": 1}}'))).toThrow();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("agent jobs ignore the operator's user settings", () => {
  it("loads only the factory's settings, so user hooks and plugins never run in a job", async () => {
    const { claudeArgs } = await import("../src/panel/jobs.js");
    const args = claudeArgs(10, false, []);
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("project,local");
  });
});

describe("the factory's own permission rules", () => {
  it("protects client folders and .factory with Edit rules (they cover Write too), with no dead Write rules", async () => {
    const { readFileSync } = await import("node:fs");
    const settings = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", ".claude", "settings.json"), "utf8"));
    const deny: string[] = settings.permissions.deny;
    expect(deny).toEqual(expect.arrayContaining(["Edit(../sf-clients/**)", "Edit(**/.factory/**)"]));
    expect(deny.filter((r) => /^Write\(/.test(r))).toEqual([]);
    expect(settings.sandbox.enabled).toBe(true);
  });
});
