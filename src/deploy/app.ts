import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "../lib/errors.js";
import type { RunOptions, RunResult } from "../lib/exec.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";
import type { ClientPaths } from "../lib/paths.js";
import { PRODUCT_IDS, PRODUCTS, type ProductId, type ProductModule } from "../products/registry.js";

/**
 * Publishing an app site (e-commerce, booking, restaurant): a Worker that serves the built pages and runs the
 * factory's ready-made parts, with its own database (D1), media bucket (R2) and secrets. Static sites keep the
 * plain path in tools/deploy.ts; this module only adds what an app needs, as one ordered pipeline:
 *
 *   resources (create once, ids kept in .factory/) → database backup → migrations (destructive ones only with
 *   Eren's typed confirmation) → secrets (stdin, never arguments) → wrangler deploy
 *
 * Preview and production never share data: each target has its own database and bucket. Everything that decides
 * what happens is written by the panel in .factory/, which the agent cannot write.
 */
export const PRODUCT_FILE = "product.json";
const RESOURCES_FILE = "resources.json";
const MIGRATIONS_LEDGER = "migrations.json";
const BACKUPS_DIR = "db-backups";
export const APP_ENTRY = "app/worker.js";
export const MIGRATIONS_DIR = "app/migrations";
export const WORKER_FIRST = ["/api/*", "/admin", "/admin/*", "/media/*"] as const;
const PLACEHOLDER_DB_ID = "00000000-0000-0000-0000-000000000000";

export type Target = "preview" | "production";
export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

/** What the panel records for a client: its kind and the secret names its parts need (set by part installers). */
export interface ProductRecord {
  readonly product: ProductId;
  readonly secrets?: readonly string[];
  /** Sent when the client set them (e.g. a notification webhook); a publish does not wait for them. */
  readonly optionalSecrets?: readonly string[];
}

const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

export function readProductRecord(paths: Pick<ClientPaths, "factoryDir">): ProductRecord {
  const raw = readJsonIfExists(path.join(paths.factoryDir, PRODUCT_FILE)) as Partial<ProductRecord> | undefined;
  const product = raw?.product && (PRODUCT_IDS as readonly string[]).includes(raw.product) ? raw.product : "showcase";
  return { product, secrets: names(raw?.secrets), optionalSecrets: names(raw?.optionalSecrets) };
}

/** Panel only: keeps the client's kind next to the approvals (business.json is not read by the deploy tool). */
export function writeProductRecord(paths: ClientPaths, record: ProductRecord): void {
  writeJson(path.join(paths.factoryDir, PRODUCT_FILE), record);
}

export interface AppPlan {
  readonly database: boolean;
  readonly media: boolean;
  readonly secrets: readonly string[];
  readonly optionalSecrets: readonly string[];
}

/** What an app needs, from the parts its kind is built from and the secrets its installed parts asked for. */
export function appPlanFor(module: ProductModule, record: ProductRecord): AppPlan {
  const parts = new Set(module.parts);
  return {
    database: ["catalog", "cart", "calendar", "admin"].some((p) => parts.has(p as never)),
    media: ["catalog", "menu-qr"].some((p) => parts.has(p as never)),
    secrets: [...new Set(record.secrets ?? [])].sort(),
    optionalSecrets: [...new Set(record.optionalSecrets ?? [])].sort(),
  };
}

export const isAppSite = (record: ProductRecord): boolean => PRODUCTS[record.product].deploy === "app";

export function resourceNames(slug: string, target: Target) {
  const base = target === "preview" ? `sf-${slug}-preview` : `sf-${slug}`;
  return { database: `${base}-db`, bucket: `${base}-media` };
}

interface TargetResources {
  database?: { name: string; id: string };
  bucket?: { name: string };
}
type ResourcesFile = Partial<Record<Target, TargetResources>>;

export function readResources(paths: ClientPaths): ResourcesFile {
  return (readJsonIfExists(path.join(paths.factoryDir, RESOURCES_FILE)) as ResourcesFile | undefined) ?? {};
}

/** The wrangler configuration of an app site: the Worker, its pages, and the bindings its parts use. */
export function appWranglerConfig(opts: {
  workerName: string;
  compatibilityDate: string;
  routes?: Array<{ pattern: string; custom_domain: boolean }>;
  plan: AppPlan;
  resources: TargetResources;
}) {
  return {
    name: opts.workerName,
    main: `./${APP_ENTRY}`,
    compatibility_date: opts.compatibilityDate,
    // The Worker answers its own paths first, so no page file can ever shadow the API or the admin screen.
    assets: { directory: "./dist", binding: "ASSETS", not_found_handling: "404-page", run_worker_first: [...WORKER_FIRST] },
    ...(opts.plan.database
      ? {
          d1_databases: [
            {
              binding: "DB",
              database_name: opts.resources.database?.name ?? "pending",
              database_id: opts.resources.database?.id ?? PLACEHOLDER_DB_ID,
              migrations_dir: MIGRATIONS_DIR,
            },
          ],
        }
      : {}),
    ...(opts.plan.media ? { r2_buckets: [{ binding: "MEDIA", bucket_name: opts.resources.bucket?.name ?? "pending" }] } : {}),
    ...(opts.routes ? { routes: opts.routes } : {}),
  };
}

// ---------------------------------------------------------------- migrations

export interface MigrationFile {
  readonly name: string;
  readonly hash: string;
  readonly sql: string;
}

export function migrationFiles(clientRoot: string): MigrationFile[] {
  const dir = path.join(clientRoot, MIGRATIONS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(dir, name), "utf8");
      return { name, sql, hash: createHash("sha256").update(sql).digest("hex").slice(0, 16) };
    });
}

/** Statements that lose data: they need Eren's typed confirmation, and always come after a backup. */
export function destructiveStatements(sql: string): string[] {
  const clean = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  const patterns = [
    /\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b[^;]*/gi,
    /\bALTER\s+TABLE\b[^;]*\bDROP\b[^;]*/gi,
    /\bDELETE\s+FROM\b[^;]*/gi,
    /\bTRUNCATE\b[^;]*/gi,
    /\bUPDATE\b[^;]*\bSET\b(?![^;]*\bWHERE\b)[^;]*/gi,
  ];
  for (const re of patterns) for (const m of clean.matchAll(re)) found.push(m[0].replace(/\s+/g, " ").trim().slice(0, 120));
  return found;
}

type Ledger = Partial<Record<Target, Array<{ name: string; hash: string; at: string }>>>;

function readLedger(paths: ClientPaths): Ledger {
  return (readJsonIfExists(path.join(paths.factoryDir, MIGRATIONS_LEDGER)) as Ledger | undefined) ?? {};
}

/** Migrations not yet applied to the target; an applied one that changed since is refused (never re-run). */
export function pendingMigrations(paths: ClientPaths, target: Target): MigrationFile[] {
  const applied = new Map((readLedger(paths)[target] ?? []).map((m) => [m.name, m.hash]));
  const files = migrationFiles(paths.root);
  const changed = files.filter((f) => applied.has(f.name) && applied.get(f.name) !== f.hash).map((f) => f.name);
  if (changed.length)
    throw new FactoryError(
      `Applied migration(s) changed: ${changed.join(", ")}.`,
      "An applied migration is never edited: add a new migration file for the change.",
    );
  return files.filter((f) => !applied.has(f.name));
}

// ---------------------------------------------------------------- the pipeline

export interface AppDeployContext {
  readonly paths: ClientPaths;
  readonly slug: string;
  readonly target: Target;
  readonly plan: AppPlan;
  readonly run: Runner;
  readonly wranglerJs: string;
  readonly env: Readonly<Record<string, string>>;
  readonly token: string;
  readonly timeoutMs: number;
  readonly log: (line: string) => void;
}

async function wrangler(ctx: AppDeployContext, args: readonly string[], input?: string): Promise<string> {
  const res = await ctx.run(process.execPath, [ctx.wranglerJs, ...args], {
    cwd: ctx.paths.root,
    timeoutMs: ctx.timeoutMs,
    env: ctx.env,
    secrets: [ctx.token],
    maxOutputChars: 60_000,
    ...(input !== undefined ? { input } : {}),
  });
  const out = `${res.stdout}\n${res.stderr}`;
  if (res.code !== 0) throw new FactoryError(`wrangler ${args.slice(0, 3).join(" ")} failed (${res.code}):\n${out.slice(-1200)}`);
  return out;
}

/** Creates the target's database and bucket once; their ids are kept, so later publishes reuse them. */
export async function ensureResources(ctx: AppDeployContext): Promise<TargetResources> {
  const all = readResources(ctx.paths);
  const have: TargetResources = { ...(all[ctx.target] ?? {}) };
  const names = resourceNames(ctx.slug, ctx.target);
  if (ctx.plan.database && !have.database) {
    const list = await wrangler(ctx, ["d1", "list", "--json"]);
    const found = parseD1List(list).find((d) => d.name === names.database);
    const id = found?.uuid ?? parseCreatedId(await wrangler(ctx, ["d1", "create", names.database]));
    if (!id) throw new FactoryError(`Could not read the id of database ${names.database}.`);
    have.database = { name: names.database, id };
    ctx.log(`Veritabanı hazır: ${names.database}`);
  }
  if (ctx.plan.media && !have.bucket) {
    const list = await wrangler(ctx, ["r2", "bucket", "list"]);
    if (!new RegExp(`\\b${names.bucket}\\b`).test(list)) await wrangler(ctx, ["r2", "bucket", "create", names.bucket]);
    have.bucket = { name: names.bucket };
    ctx.log(`Görsel deposu hazır: ${names.bucket}`);
  }
  writeJson(path.join(ctx.paths.factoryDir, RESOURCES_FILE), { ...all, [ctx.target]: have });
  return have;
}

function parseD1List(out: string): Array<{ name: string; uuid: string }> {
  const start = out.indexOf("[");
  if (start < 0) return [];
  try {
    const list = JSON.parse(out.slice(start, out.lastIndexOf("]") + 1)) as Array<{ name?: string; uuid?: string }>;
    return list.filter((d): d is { name: string; uuid: string } => typeof d.name === "string" && typeof d.uuid === "string");
  } catch {
    return [];
  }
}

const parseCreatedId = (out: string): string | null =>
  /"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/i.exec(out)?.[1] ?? /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(out)?.[1] ?? null;

/**
 * Applies pending migrations after exporting the database (kept in .factory/db-backups/). Destructive statements
 * stop the publish unless Eren confirmed them for this publish.
 */
export async function migrate(ctx: AppDeployContext, resources: TargetResources, allowDestructive: boolean): Promise<string[]> {
  if (!ctx.plan.database || !resources.database) return [];
  const pending = pendingMigrations(ctx.paths, ctx.target);
  if (!pending.length) return [];
  const risky = pending.flatMap((m) => destructiveStatements(m.sql).map((s) => `${m.name}: ${s}`));
  if (risky.length && !allowDestructive)
    throw new FactoryError(
      `These migrations delete or overwrite data:\n- ${risky.join("\n- ")}`,
      "Nothing was changed. Eren confirms them in the panel (a backup is taken first), or the migration is rewritten.",
    );
  const backups = path.join(ctx.paths.factoryDir, BACKUPS_DIR);
  mkdirSync(backups, { recursive: true });
  const file = path.join(backups, `${ctx.target}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  await wrangler(ctx, ["d1", "export", resources.database.name, "--remote", "--output", file]);
  ctx.log(`Veritabanı yedeği alındı: ${path.basename(file)}`);
  await wrangler(ctx, ["d1", "migrations", "apply", resources.database.name, "--remote"]);
  const ledger = readLedger(ctx.paths);
  const at = new Date().toISOString();
  writeJson(path.join(ctx.paths.factoryDir, MIGRATIONS_LEDGER), {
    ...ledger,
    [ctx.target]: [...(ledger[ctx.target] ?? []), ...pending.map((m) => ({ name: m.name, hash: m.hash, at }))],
  });
  ctx.log(`Uygulanan değişiklik: ${pending.map((m) => m.name).join(", ")}`);
  return pending.map((m) => m.name);
}

/** Checked before anything is created or migrated, so a missing key changes nothing on Cloudflare. */
export function assertSecrets(plan: AppPlan, values: Readonly<Record<string, string>>): void {
  const missing = plan.secrets.filter((n) => !values[n]);
  if (missing.length)
    throw new FactoryError(`Missing secret(s): ${missing.join(", ")}.`, "Eren enters them in the panel (client → Müşteri Bilgileri → Gizli anahtarlar).");
}

/** Sends the client's secrets to the Worker in one call, through stdin. */
export async function pushSecrets(ctx: AppDeployContext, workerName: string, values: Readonly<Record<string, string>>): Promise<number> {
  assertSecrets(ctx.plan, values);
  const send = [...ctx.plan.secrets, ...ctx.plan.optionalSecrets.filter((n) => values[n])];
  if (!send.length) return 0;
  const payload = Object.fromEntries(send.map((n) => [n, values[n]!]));
  const res = await ctx.run(process.execPath, [ctx.wranglerJs, "secret", "bulk", "--name", workerName], {
    cwd: ctx.paths.root,
    timeoutMs: ctx.timeoutMs,
    env: ctx.env,
    secrets: [ctx.token, ...Object.values(payload)],
    input: JSON.stringify(payload),
  });
  if (res.code !== 0) throw new FactoryError(`wrangler secret bulk failed (${res.code}).`, "Check the Cloudflare account and try again.");
  ctx.log(`${send.length} gizli anahtar yüklendi.`);
  return send.length;
}
