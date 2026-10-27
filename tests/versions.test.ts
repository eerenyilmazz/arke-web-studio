import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/core/paths.js";
import { listVersions, restoreVersion, saveUnsavedVersions, snapshot, UNSAVED_MESSAGE } from "../src/lib/client/versions.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

describe("version history", () => {
  it("records versions and restores config, content and site files, never approvals", async () => {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, {
      slug: "willow-thread",
      businessName: "Willow & Thread",
      industry: "bridal salon",
      hostingModel: "managed",
      template: "custom",
    });
    tools.updateClientConfig(f, { slug: "willow-thread", patch: COMPLETE_PATCH });
    tools.saveContent(f, { slug: "willow-thread", locale: "en", content: COMPLETE_CONTENT });
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "index.html", content: "<p>v1</p>" });
    const p = clientPaths(f.clientsRoot, "willow-thread");
    const v1 = await snapshot(p.root, "first");
    expect(v1).toMatch(/^[0-9a-f]{40}$/);
    expect(await snapshot(p.root, "nothing changed")).toBeNull();

    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "index.html", content: "<p>v2</p>" });
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "extra.html", content: "<p>new</p>" });
    tools.updateClientConfig(f, { slug: "willow-thread", patch: { contact: { email: "new@willow.co.uk" } } });
    writeFileSync(p.approvals, JSON.stringify({ approvals: [] }));
    await snapshot(p.root, "second");

    await restoreVersion(p.root, v1!);
    expect(readFileSync(path.join(p.root, "site", "index.html"), "utf8")).toBe("<p>v1</p>");
    expect(() => readFileSync(path.join(p.root, "site", "extra.html"))).toThrow();
    expect(JSON.parse(readFileSync(p.config, "utf8")).contact.email).toBe("hello@willow.co.uk");
    expect(readFileSync(p.approvals, "utf8")).toBe(JSON.stringify({ approvals: [] }));
    const list = await listVersions(p.root);
    expect(list[0]!.message).toBe("Geri alındı: first");
    await expect(restoreVersion(p.root, "deadbeef")).rejects.toThrow(/Geçersiz/);
  });

  async function client() {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, {
      slug: "willow-thread",
      businessName: "Willow & Thread",
      industry: "bridal salon",
      hostingModel: "managed",
      template: "custom",
    });
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "index.html", content: "<p>v1</p>" });
    return { f, p: clientPaths(f.clientsRoot, "willow-thread") };
  }

  it("records two snapshots started together one after the other, losing neither", async () => {
    const { f, p } = await client();
    const first = snapshot(p.root, "job finished");
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "about.html", content: "<p>about</p>" });
    const second = snapshot(p.root, "Önce: Metin değiştir");
    const [a, b] = await Promise.all([first, second]);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(b === null || /^[0-9a-f]{40}$/.test(b)).toBe(true);
    expect((await listVersions(p.root)).map((v) => v.message)).toContain("job finished");
  });

  it("throws a clear error when git cannot record, instead of returning null silently", async () => {
    const { f, p } = await client();
    await snapshot(p.root, "first");
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "index.html", content: "<p>v2</p>" });
    writeFileSync(path.join(p.root, ".git", "index.lock"), "");
    await expect(snapshot(p.root, "blocked")).rejects.toThrow(/Sürüm kaydedilemedi/);
    rmSync(path.join(p.root, ".git", "index.lock"));
    expect(await snapshot(p.root, "after unlock")).toMatch(/^[0-9a-f]{40}$/);
  }, 15_000);

  it("saves at start-up what a job left behind when the panel stopped mid-job", async () => {
    const { f, p } = await client();
    await snapshot(p.root, "Önce: Siteyi hazırla");
    tools.writeSiteFileTool(f, { slug: "willow-thread", path: "index.html", content: "<p>half built</p>" });
    expect(await saveUnsavedVersions(f.clientsRoot)).toEqual(["willow-thread"]);
    expect((await listVersions(p.root))[0]!.message).toBe(UNSAVED_MESSAGE);
    expect(await saveUnsavedVersions(f.clientsRoot)).toEqual([]);
  });
});
