import { EventEmitter } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { afterEach } from "vitest";
import { createPanel, type Panel, type PanelOptions } from "../../src/panel/server.js";
import { clientPaths } from "../../src/lib/core/paths.js";
import { tempFactory } from "../helpers.js";

export const KEY = "k".repeat(64);
let panel: Panel | null = null;

/** Asks the OS for a free port, so tests never collide with something already running on the machine. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export interface SpawnCall {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
  stdin: string;
}

/** Stands in for `claude -p`: records the call and replays stream-json events. */
export function fakeSpawn(calls: SpawnCall[], events: object[], exitCode = 0) {
  return (command: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
    const child = new EventEmitter() as ChildProcess;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    Object.assign(child, { stdin, stdout, stderr: new PassThrough(), kill: () => true });
    const call: SpawnCall = { command, args, options, stdin: "" };
    calls.push(call);
    stdin.on("data", (c: Buffer) => (call.stdin += c.toString()));
    stdin.on("finish", () => {
      for (const e of events) stdout.write(`${JSON.stringify(e)}\n`);
      stdout.end();
      setTimeout(() => child.emit("close", exitCode), 10);
    });
    return child;
  };
}

/** A first page, so the client counts as having a site (change jobs need one). */
export function withSite(factory: ReturnType<typeof tempFactory>, slug: string) {
  const dir = path.join(clientPaths(factory.clientsRoot, slug).root, "site");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>x</title>");
}

export async function start(spawn?: ReturnType<typeof fakeSpawn>, approvalCode?: string, verifyCloudflare?: PanelOptions["verifyCloudflare"]) {
  const factory = tempFactory();
  const port = await freePort();
  const previewPort = await freePort();
  panel = createPanel({
    factory,
    port,
    previewPort,
    sessionKey: KEY,
    ...(spawn ? { spawn } : {}),
    ...(approvalCode ? { approvalCode } : {}),
    ...(verifyCloudflare ? { verifyCloudflare } : {}),
  });
  await panel.listen();
  const base = `http://127.0.0.1:${port}`;
  const auth = { Cookie: `arke_panel=${KEY}`, Origin: base };
  return { factory, base, auth, port };
}

/** fetch() ignores a custom Host header, so DNS-rebinding is simulated with node:http. */
export function rawStatus(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/clients", headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

export async function waitFor(fn: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("timeout");
}

/** Every test file calls this once: the panel a test started is closed after it. */
export function usePanelCleanup(): void {
  afterEach(() => {
    panel?.close();
    panel = null;
  });
}
