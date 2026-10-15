import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/*
 * The panel can create clients, run the agent and deploy, so only the person who started it may use it:
 *  - it listens on 127.0.0.1 only;
 *  - a random session key is printed in the terminal once and kept only in memory; the browser gets it as an
 *    HttpOnly, SameSite=Strict cookie, so other local programs and web pages cannot call the API;
 *  - the Host header must be the panel's own address (blocks DNS-rebinding), and state-changing requests
 *    must come from the panel's own origin.
 */

export const COOKIE_NAME = "sf_panel";

export function newSessionKey(): string {
  return randomBytes(32).toString("hex");
}

export function cookieHeader(key: string): string {
  return `${COOKIE_NAME}=${key}; HttpOnly; SameSite=Strict; Path=/`;
}

function readCookie(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hasSession(req: IncomingMessage, key: string): boolean {
  const cookie = readCookie(req);
  return cookie !== null && safeEqual(cookie, key);
}

export function allowedHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host ?? "";
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** For POST/PUT/DELETE: browsers always send Origin; it must be the panel itself. */
export function allowedOrigin(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}
