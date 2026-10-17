import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SLOT_FIELDS, deleteFromLibrary, libraryPreview, listLibrary, saveToLibrary, slotCounts, updateLibraryEntry, type ApplyResult } from "../library.js";
import { assertSlug } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, asHttp } from "./common.js";

/** Design library: save, list, fixed places, delete. */
export const libraryRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/library\/([a-z0-9-]{2,41})\/preview\.png$/, handler: (d, _r, res, [id]) => {
    const f = libraryPreview(d.factory, id!);
    if (!f) throw new HttpError(404, "Önizleme yok.");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(readFileSync(f));
  } },
  { method: "GET", pattern: /^\/api\/library$/, handler: (d, _r, res) => sendJson(res, 200, { designs: listLibrary(d.factory) }) },
  { method: "GET", pattern: /^\/api\/library\/([a-z0-9-]{2,41})$/, handler: (d, _r, res, [id]) => libraryDetail(d, res, id!) },
  { method: "PUT", pattern: /^\/api\/library\/([a-z0-9-]{2,41})$/, handler: patchLibrary },
  { method: "DELETE", pattern: /^\/api\/library\/([a-z0-9-]{2,41})$/, handler: (d, _r, res, [id]) => { asHttp(() => deleteFromLibrary(d.factory, id!)); sendJson(res, 200, { designs: listLibrary(d.factory) }); } },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/library$`), handler: saveDesign },
];

async function saveDesign(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const name = str(body, "name", { max: 60 })!;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 30)) : [];
  const meta = asHttp(() => saveToLibrary(deps.factory, s, { name, tags }));
  sendJson(res, 201, meta);
}

function libraryDetail(deps: ApiDeps, res: ServerResponse, id: string): void {
  const entry = listLibrary(deps.factory).find((e) => e.id === id);
  if (!entry) throw new HttpError(404, "Kütüphanede böyle bir tasarım yok.");
  sendJson(res, 200, { design: entry, counts: slotCounts(deps.factory, id), fields: SLOT_FIELDS });
}

async function patchLibrary(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [id]: string[]): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  const name = str(body, "name", { optional: true, max: 60 });
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 30)) : undefined;
  asHttp(() => updateLibraryEntry(deps.factory, id!, { ...(name ? { name } : {}), ...(tags ? { tags } : {}), ...(body.slots !== undefined ? { slots: body.slots } : {}) }));
  libraryDetail(deps, res, id!);
}

/** One line for the agent and for Eren: what the panel already filled from the design's fixed places. */
export function filledNote(r: ApplyResult): string {
  const done = r.filled.map((f) => `${f.label} (${f.count})`).join(", ");
  return [done ? `Panel filled: ${done}.` : "", r.missing.length ? `Not filled (client has no value yet): ${r.missing.join(", ")}.` : ""].filter(Boolean).join(" ");
}
