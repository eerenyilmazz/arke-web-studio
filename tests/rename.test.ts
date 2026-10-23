import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT, loadFactoryConfig } from "../src/config.js";
import { agentEnv } from "../src/panel/jobs.js";
import { baseWorkerName } from "../src/tools/deploy.js";

/** Installs from before the rename to Arke Web Studio (Site Factory, up to 1.29) keep working without any step. */
describe("rename to Arke Web Studio: older installs carry over", () => {
  /** A factory folder next to the given client folders, with the real factory.config.json. */
  function factoryWith(folders: string[]) {
    const base = mkdtempSync(path.join(os.tmpdir(), "arke-rename-"));
    const root = path.join(base, "factory");
    mkdirSync(root);
    cpSync(path.join(FACTORY_ROOT, "factory.config.json"), path.join(root, "factory.config.json"));
    for (const f of folders) mkdirSync(path.join(base, f));
    return { base, root };
  }

  it("uses the old client and inbox folders while only they exist, the new ones otherwise", () => {
    const keep = { c: process.env.ARKE_CLIENTS_ROOT, i: process.env.ARKE_INBOX_DIR };
    delete process.env.ARKE_CLIENTS_ROOT;
    delete process.env.ARKE_INBOX_DIR;
    try {
      const old = factoryWith(["sf-clients", "sf-inbox"]);
      expect(loadFactoryConfig(old.root)).toMatchObject({ clientsRoot: path.join(old.base, "sf-clients"), inboxDir: path.join(old.base, "sf-inbox") });
      const both = factoryWith(["sf-clients", "arke-clients"]);
      expect(loadFactoryConfig(both.root).clientsRoot).toBe(path.join(both.base, "arke-clients"));
      const fresh = factoryWith([]);
      expect(loadFactoryConfig(fresh.root).clientsRoot).toBe(path.join(fresh.base, "arke-clients"));
    } finally {
      if (keep.c !== undefined) process.env.ARKE_CLIENTS_ROOT = keep.c;
      if (keep.i !== undefined) process.env.ARKE_INBOX_DIR = keep.i;
    }
  });

  it("keeps a published client's sf- Worker, and names new ones arke-", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "arke-worker-"));
    const wrangler = path.join(dir, "wrangler.jsonc");
    const config = { slug: "mavi-kapi", hosting: { workerName: null } };
    expect(baseWorkerName(wrangler, config)).toBe("arke-mavi-kapi");
    writeFileSync(wrangler, '// Generated\n{ "name": "sf-mavi-kapi-preview", "main": "x" }');
    expect(baseWorkerName(wrangler, config)).toBe("sf-mavi-kapi");
    writeFileSync(wrangler, '{ "name": "sf-other-site" }');
    expect(baseWorkerName(wrangler, config)).toBe("arke-mavi-kapi");
    expect(baseWorkerName(wrangler, { slug: "mavi-kapi", hosting: { workerName: "custom-name" } })).toBe("custom-name");
  });

  it("never hands Cloudflare secrets to the agent under either name", () => {
    const env = agentEnv({
      PATH: "/usr/bin",
      SF_CF_MANAGED_API_TOKEN: "old-token",
      ARKE_CF_MANAGED_API_TOKEN: "new-token",
      SF_CF_CLIENT_X_API_TOKEN: "client-token",
      SF_ACCOUNTS_DIR: "/a",
      ARKE_ACCOUNTS_DIR: "/b",
    });
    expect(env).toEqual({ PATH: "/usr/bin", ARKE_NO_ACCOUNTS: "1" });
  });
});
