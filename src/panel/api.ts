import type { IncomingMessage, ServerResponse } from "node:http";
import { agentRoutes } from "./api/agent.js";
import { clientRoutes } from "./api/clients.js";
import type { ApiDeps, Route } from "./api/common.js";
import { editRoutes } from "./api/edit.js";
import { libraryRoutes } from "./api/library.js";
import { publishRoutes } from "./api/publish.js";
import { systemRoutes } from "./api/system.js";
import { teamUpdateRoutes } from "./api/team-update.js";
import { portalRoutes } from "./api/portal.js";
import { HttpError } from "./http.js";

/**
 * The panel's JSON API: one route table, handlers grouped by area in ./api/. Order matters only where two
 * patterns could match the same path (the library preview image before the library entry).
 */
export type { ApiDeps } from "./api/common.js";
export { startTranslation } from "./api/common.js";
export { normalisePhone } from "./api/edit.js";
export { safeFileName } from "./api/common.js";

const routes: readonly Route[] = [
  ...clientRoutes,
  ...libraryRoutes,
  ...editRoutes,
  ...agentRoutes,
  ...publishRoutes,
  ...systemRoutes,
  ...teamUpdateRoutes,
  ...portalRoutes,
];

export async function handleApi(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = pathname.match(route.pattern);
    if (m) return route.handler(deps, req, res, m.slice(1));
  }
  throw new HttpError(404, "Bilinmeyen adres.");
}
