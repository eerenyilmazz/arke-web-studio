import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { clientPaths } from "../src/lib/core/paths.js";
import * as tools from "../src/tools.js";
import { tempFactory } from "./helpers.js";

/**
 * The terminal approval is one of the locks that keep approvals human-only: an agent that could run commands
 * has no terminal, so the command must refuse whenever stdin or stdout is not a TTY, before touching anything.
 */
const TSX = path.join(FACTORY_ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(FACTORY_ROOT, "src", "cli", "approve.ts");

function approve(f: ReturnType<typeof tempFactory>, args: string[], input = "") {
  return spawnSync(TSX, [CLI, ...args], {
    input, // piped stdin and stdout: what an agent's shell would have
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, ARKE_CLIENTS_ROOT: f.clientsRoot, ARKE_INBOX_DIR: f.inboxDir, ARKE_TEMPLATES_DIR: f.templatesDir },
  });
}

describe("terminal approval command", { timeout: 60_000 }, () => {
  it("refuses without an interactive terminal and writes no approval, even when the slug is typed", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "cli-co", businessName: "CLI Co", industry: "cafe", hostingModel: "managed" });
    const r = approve(f, ["cli-co", "content"], "cli-co\n");
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/interactive terminal/);
    expect(existsSync(clientPaths(f.clientsRoot, "cli-co").approvals)).toBe(false);
  });

  it("explains its usage for a missing or unknown approval kind", () => {
    const f = tempFactory();
    for (const args of [[], ["cli-co"], ["cli-co", "everything"]]) {
      const r = approve(f, args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/Usage: npm run approve/);
    }
  });
});
