import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/paths.js";
import { listVersions, restoreVersion, snapshot } from "../src/lib/versions.js";
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
});
