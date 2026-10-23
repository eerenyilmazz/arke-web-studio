import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { destructiveStatements, migrate, pendingMigrations, writeProductRecord, type AppDeployContext } from "../src/deploy/app.js";
import { saveClientSecret, saveCloudflare } from "../src/lib/accounts.js";
import { addApproval, approvalPins } from "../src/lib/approvals.js";
import type { BuildRecord } from "../src/lib/client.js";
import { contentHash } from "../src/lib/files.js";
import type { RunOptions } from "../src/lib/exec.js";
import { clientPaths } from "../src/lib/paths.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

const SLUG = "shop-co";
const SECRET = "sk_test_value_that_must_never_be_an_argument";
const keepDir = process.env.SF_ACCOUNTS_DIR;
beforeEach(() => {
  process.env.SF_ACCOUNTS_DIR = mkdtempSync(path.join(os.tmpdir(), "sf-app-acc-"));
});
afterEach(() => {
  process.env.SF_ACCOUNTS_DIR = keepDir;
});

/** Records every wrangler call and answers like wrangler would. */
function fakeWrangler() {
  const calls: Array<{ args: string[]; input?: string }> = [];
  const runner = async (_cmd: string, args: readonly string[], opts: RunOptions) => {
    const a = args.slice(1);
    calls.push({ args: a, ...(opts.input !== undefined ? { input: opts.input } : {}) });
    const j = a.join(" ");
    const stdout = j.startsWith("d1 list")
      ? "[]"
      : j.startsWith("d1 create")
        ? 'database_id = "11111111-2222-3333-4444-555555555555"'
        : j === "deploy"
          ? "Deployed https://sf-shop-co-preview.example.workers.dev"
          : "ok";
    return { code: 0, stdout, stderr: "" };
  };
  return { calls, runner };
}

async function appClient() {
  const f = tempFactory();
  installStubTemplate(f.templatesDir);
  await tools.createClient(f, { slug: SLUG, businessName: "Shop Co", industry: "shop", hostingModel: "managed" });
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  const paths = clientPaths(f.clientsRoot, SLUG);
  mkdirSync(path.join(paths.root, "app", "migrations"), { recursive: true });
  writeFileSync(path.join(paths.root, "app", "worker.js"), "export default { fetch: (r, env) => env.ASSETS.fetch(r) };");
  writeFileSync(path.join(paths.root, "app", "migrations", "0001_products.sql"), "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT);");
  writeProductRecord(paths, { product: "ecommerce", secrets: ["IYZICO_API_KEY"] });
  addApproval(paths.approvals, { kind: "content", by: "test", at: new Date().toISOString(), hash: contentHash(paths.root) });
  expect((await tools.buildSite(f, { slug: SLUG })).passed).toBe(true);
  const build = JSON.parse(readFileSync(paths.buildRecord, "utf8")) as BuildRecord;
  addApproval(paths.approvals, { kind: "visual", by: "test", at: new Date().toISOString(), ...approvalPins("visual", paths.root, paths.distDir, build) });
  return { f, paths };
}

describe("publishing an app site", () => {
  it("creates its resources, backs up, migrates, sends secrets by stdin, then deploys; the next publish reuses them", async () => {
    const { f, paths } = await appClient();
    saveCloudflare({ accountId: "0123456789abcdef0123456789abcdef", token: "TokenTokenTokenTokenTokenTokenTok" });
    const w = fakeWrangler();
    // A needed secret that is missing stops the publish before the Worker is touched.
    await expect(tools.deploy(f, { slug: SLUG, target: "preview", runner: w.runner })).rejects.toThrow(/Missing secret\(s\): IYZICO_API_KEY/);
    expect(w.calls).toHaveLength(0); // checked before anything is created or migrated

    saveClientSecret(SLUG, "IYZICO_API_KEY", SECRET);
    w.calls.length = 0;
    const r = await tools.deploy(f, { slug: SLUG, target: "preview", runner: w.runner });
    expect(r.url).toBe("https://sf-shop-co-preview.example.workers.dev");
    const order = w.calls.map((c) => c.args.slice(0, 3).join(" "));
    expect(order).toEqual([
      "d1 list --json",
      "d1 create sf-shop-co-preview-db",
      "r2 bucket list",
      "r2 bucket create",
      "d1 export sf-shop-co-preview-db",
      "d1 migrations apply",
      "secret bulk --name",
      "deploy",
    ]);
    const bulk = w.calls.find((c) => c.args[0] === "secret")!;
    expect(JSON.parse(bulk.input!)).toEqual({ IYZICO_API_KEY: SECRET });
    expect(w.calls.flatMap((c) => c.args).join(" ")).not.toContain(SECRET);
    const cfg = readFileSync(paths.wranglerConfig, "utf8");
    expect(cfg).toContain('"database_id": "11111111-2222-3333-4444-555555555555"');
    expect(cfg).toContain('"migrations_dir": "app/migrations"');
    expect(cfg).toContain('"bucket_name": "sf-shop-co-preview-media"');
    expect(cfg).toContain('"main": "./app/worker.js"');

    w.calls.length = 0;
    await tools.deploy(f, { slug: SLUG, target: "preview", runner: w.runner });
    expect(w.calls.map((c) => c.args[0])).toEqual(["secret", "deploy"]); // nothing to create, nothing to migrate
  });

  it("finds a migration that loses data, refuses it without confirmation, and never re-runs an edited one", async () => {
    expect(destructiveStatements("-- DROP TABLE x\nCREATE TABLE a (id INT);")).toEqual([]);
    expect(destructiveStatements("ALTER TABLE a DROP COLUMN b; DELETE FROM a; UPDATE a SET x = 1;")).toHaveLength(3);
    expect(destructiveStatements("UPDATE a SET x = 1 WHERE id = 2;")).toEqual([]);

    const { paths } = await appClient();
    writeFileSync(path.join(paths.root, "app", "migrations", "0002_cleanup.sql"), "DROP TABLE products;");
    const w = fakeWrangler();
    const ctx: AppDeployContext = {
      paths,
      slug: SLUG,
      target: "production",
      plan: { database: true, media: false, secrets: [] },
      run: w.runner,
      wranglerJs: "/w.js",
      env: {},
      token: "t",
      timeoutMs: 1000,
      log: () => undefined,
    };
    const db = { database: { name: "sf-shop-co-db", id: "1" } };
    await expect(migrate(ctx, db, false)).rejects.toThrow(/delete or overwrite data/);
    expect(w.calls).toHaveLength(0); // not even a backup: nothing was changed
    expect(await migrate(ctx, db, true)).toEqual(["0001_products.sql", "0002_cleanup.sql"]);
    expect(w.calls[0]!.args.slice(0, 2)).toEqual(["d1", "export"]); // the backup comes first
    writeFileSync(path.join(paths.root, "app", "migrations", "0001_products.sql"), "CREATE TABLE products (id INTEGER);");
    expect(() => pendingMigrations(paths, "production")).toThrow(/Applied migration\(s\) changed: 0001_products.sql/);
  });

  it("leaves showcase sites on the plain path, and puts app code under the approvals", async () => {
    const { paths } = await appClient();
    const before = contentHash(paths.root);
    writeFileSync(path.join(paths.root, "app", "worker.js"), "export default {};");
    expect(contentHash(paths.root)).not.toBe(before);
  });
});
