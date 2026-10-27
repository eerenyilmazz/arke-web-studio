import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloudflareAccountStatus, managedCloudflare, readCloudflare, removeCloudflare, saveCloudflare, validateCloudflare } from "../src/lib/core/accounts.js";
import { agentEnv } from "../src/panel/jobs.js";
import { cloudflareCredentials } from "../src/tools/shared.js";

const ACCOUNT = { accountId: "0123456789abcdef0123456789abcdef", token: "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-zz" };
const keep = {
  dir: process.env.ARKE_ACCOUNTS_DIR,
  t: process.env.ARKE_CF_MANAGED_API_TOKEN,
  a: process.env.ARKE_CF_MANAGED_ACCOUNT_ID,
  no: process.env.ARKE_NO_ACCOUNTS,
};

beforeEach(() => {
  process.env.ARKE_ACCOUNTS_DIR = mkdtempSync(path.join(os.tmpdir(), "arke-acc-"));
  delete process.env.ARKE_CF_MANAGED_API_TOKEN;
  delete process.env.ARKE_CF_MANAGED_ACCOUNT_ID;
  delete process.env.ARKE_NO_ACCOUNTS;
});
afterEach(() => {
  for (const [k, v] of [
    ["ARKE_ACCOUNTS_DIR", keep.dir],
    ["ARKE_CF_MANAGED_API_TOKEN", keep.t],
    ["ARKE_CF_MANAGED_ACCOUNT_ID", keep.a],
    ["ARKE_NO_ACCOUNTS", keep.no],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("the person's own Cloudflare account", () => {
  it("checks the shape of what was typed", () => {
    expect(() => validateCloudflare({ accountId: "abc", token: ACCOUNT.token })).toThrow(/32 karakter/);
    expect(() => validateCloudflare({ accountId: ACCOUNT.accountId, token: "short" })).toThrow(/token biçimi/);
    expect(validateCloudflare({ accountId: ` ${ACCOUNT.accountId.toUpperCase()} `, token: ` ${ACCOUNT.token} ` })).toEqual(ACCOUNT);
  });

  it("keeps the token encrypted in a private file and reads it back", () => {
    saveCloudflare(ACCOUNT);
    const file = path.join(process.env.ARKE_ACCOUNTS_DIR!, "accounts.json");
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain(ACCOUNT.token);
    expect(raw).toContain(ACCOUNT.accountId);
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(path.join(process.env.ARKE_ACCOUNTS_DIR!, "accounts.key")).mode & 0o777).toBe(0o600);
    }
    expect(readCloudflare()).toEqual(ACCOUNT);
    const st = cloudflareAccountStatus();
    expect(st).toMatchObject({ configured: true, source: "panel", accountId: "0123…cdef", tokenHint: `…${ACCOUNT.token.slice(-4)}` });
    expect(JSON.stringify(st)).not.toContain(ACCOUNT.token);
  });

  it("is used before the environment variables, which still work on their own", () => {
    process.env.ARKE_CF_MANAGED_API_TOKEN = "env-token-value-1234567890";
    process.env.ARKE_CF_MANAGED_ACCOUNT_ID = "ffffffffffffffffffffffffffffffff";
    expect(cloudflareCredentials("managed", "x")?.token).toBe("env-token-value-1234567890");
    expect(cloudflareAccountStatus().source).toBe("env");
    saveCloudflare(ACCOUNT);
    expect(cloudflareCredentials("managed", "x")).toEqual(ACCOUNT);
    removeCloudflare();
    expect(managedCloudflare()?.token).toBe("env-token-value-1234567890");
  });

  it("is never read in an agent process, and the agent's environment says so", () => {
    saveCloudflare(ACCOUNT);
    process.env.ARKE_NO_ACCOUNTS = "1";
    expect(readCloudflare()).toBeNull();
    expect(cloudflareCredentials("managed", "x")).toBeNull();
    const env = agentEnv({ HOME: "/h", ARKE_ACCOUNTS_DIR: "/x", ARKE_CF_MANAGED_API_TOKEN: "t" });
    expect(env).toEqual({ HOME: "/h", ARKE_NO_ACCOUNTS: "1" });
  });
});
