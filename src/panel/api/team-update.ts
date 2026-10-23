import type { IncomingMessage, ServerResponse } from "node:http";
import { FACTORY_ROOT } from "../../config.js";
import { HttpError, readJsonBody, sendJson } from "../http.js";
import { readSettings, writeSettings } from "../settings.js";
import { remoteClients, safeRemote, syncTeam, teamStatus, validRemote } from "../team.js";
import { applyUpdate, checkForUpdate, type Runner, updateProgress } from "../updater.js";
import { type ApiDeps, type Route, JSON_LIMIT } from "./common.js";

/** Updating Site Factory from the panel, and team sharing of clients through one Git repository. */
export const teamUpdateRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/update$/, handler: getUpdate },
  { method: "POST", pattern: /^\/api\/update$/, handler: postUpdate },
  { method: "GET", pattern: /^\/api\/team$/, handler: getTeam },
  { method: "PUT", pattern: /^\/api\/team$/, handler: putTeam },
  { method: "DELETE", pattern: /^\/api\/team$/, handler: deleteTeam },
  { method: "POST", pattern: /^\/api\/team\/sync$/, handler: postSync },
];

const asBad = (e: unknown) => (e instanceof HttpError ? e : new HttpError(400, (e as Error).message));
const runnerOf = (deps: ApiDeps): Runner | undefined => deps.gitRunner;
const factoryRoot = (deps: ApiDeps): string => deps.factoryRoot ?? FACTORY_ROOT;

async function getUpdate(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const fetch = new URL(req.url ?? "/", "http://x").searchParams.get("check") === "1";
  const run = runnerOf(deps);
  sendJson(res, 200, { status: await checkForUpdate(factoryRoot(deps), { fetch, ...(run ? { run } : {}) }), progress: updateProgress() });
}

async function postUpdate(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (deps.jobs.running()) throw new HttpError(409, "Bir agent işi sürüyor; bittiğinde güncelleyin.");
  const run = runnerOf(deps);
  try {
    sendJson(res, 202, { progress: await applyUpdate(factoryRoot(deps), run ? { run } : {}) });
  } catch (e) {
    throw asBad(e);
  }
}

function me(deps: ApiDeps) {
  const s = readSettings(deps.factory);
  return { name: s.profile.name, email: s.sender.email };
}

async function getTeam(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const remote = readSettings(deps.factory).team.remote || null;
  const run = runnerOf(deps);
  sendJson(res, 200, { ...(await teamStatus(deps.factory.clientsRoot, remote, run ? { run } : {})), profileName: me(deps).name });
}

async function putTeam(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  try {
    const remote = validRemote(typeof body.remote === "string" ? body.remote : "");
    if (!me(deps).name) throw new Error("Önce profilde adınızı yazın: ekip değişiklikleri sizin adınızla kaydedilir.");
    const run = runnerOf(deps);
    const shared = await remoteClients(remote, { cwd: deps.factory.clientsRoot, ...(run ? { run } : {}) });
    writeSettings(deps.factory, { team: { remote } });
    sendJson(res, 200, { remote: safeRemote(remote), sharedClients: shared.length });
  } catch (e) {
    throw asBad(e);
  }
}

function deleteTeam(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  // Only this panel stops syncing; the team repository and every local client stay as they are.
  writeSettings(deps.factory, { team: { remote: "" } });
  sendJson(res, 200, { remote: null });
}

async function postSync(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): Promise<void> {
  const remote = readSettings(deps.factory).team.remote;
  if (!remote) throw new HttpError(400, "Ekip deposu bağlı değil.");
  const running = deps.jobs.running();
  const run = runnerOf(deps);
  try {
    const result = await syncTeam(deps.factory.clientsRoot, remote, me(deps), { busy: running ? [running.slug] : [], ...(run ? { run } : {}) });
    sendJson(res, 200, result);
  } catch (e) {
    throw asBad(e);
  }
}
