import type { IncomingMessage, ServerResponse } from "node:http";
import { assertSlug } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { clientInbox, closeLink, createLink, listLinks, portalStatus, pullOnce, setupPortal, updateEntry } from "../portal.js";
import { type ApiDeps, type Route, JSON_LIMIT, SLUG } from "./common.js";

/** Client portal: set-up (panel only, never an MCP tool), links per client, and what clients sent. */
export const portalRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/portal$/, handler: (_d, _r, res) => sendJson(res, 200, { ...portalStatus(), cloudflare: tools.cloudflareStatus() }) },
  { method: "POST", pattern: /^\/api\/portal\/setup$/, handler: setup },
  { method: "POST", pattern: /^\/api\/portal\/pull$/, handler: async (d, _r, res) => sendJson(res, 200, await pull(d)) },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/portal$`), handler: clientPortal },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/portal/links$`), handler: newLink },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}/portal/links/([A-Za-z0-9_-]{32,64})$`), handler: removeLink },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/portal/(intake|feedback)/([\\w:.-]{1,80})$`), handler: markEntry },
];

let settingUp = false;

async function setup(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (settingUp) throw new HttpError(409, "Portal kurulumu zaten sürüyor.");
  settingUp = true;
  const log: string[] = [];
  try {
    const url = await setupPortal(deps.factory, (t) => log.push(t));
    sendJson(res, 200, { url, log });
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  } finally {
    settingUp = false;
  }
}

async function pull(deps: ApiDeps) {
  try {
    return await pullOnce(deps.factory);
  } catch (error) {
    throw new HttpError(502, (error as Error).message);
  }
}

function clientPortal(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  sendJson(res, 200, { configured: portalStatus().configured, links: listLinks(deps.factory, s), ...clientInbox(deps.factory, s) });
}

async function newLink(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const kind = body.kind === "intake" || body.kind === "review" ? body.kind : null;
  if (!kind) throw new HttpError(400, "Link türü intake ya da review olmalı.");
  try {
    sendJson(res, 201, await createLink(deps.factory, s, kind));
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
}

async function removeLink(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug, token]: string[]): Promise<void> {
  try {
    await closeLink(deps.factory, assertSlug(slug!), token!);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  sendJson(res, 200, { ok: true });
}

const STATUSES = new Set(["open", "done"]);

async function markEntry(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, kind, id]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  const patch: Record<string, unknown> = kind === "intake" ? { used: body.used === true } : { status: STATUSES.has(str(body, "status", { max: 10 }) ?? "") ? body.status : "done" };
  try {
    updateEntry(deps.factory, s, kind as "intake" | "feedback", id!, patch);
  } catch (error) {
    throw new HttpError(404, (error as Error).message);
  }
  sendJson(res, 200, { ok: true });
}
