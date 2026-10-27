import type { IncomingMessage, ServerResponse } from "node:http";
import { FactoryError } from "../lib/core/errors.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

/** Reads the request body up to `limit` bytes; larger bodies are rejected before they fill memory. */
export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, `Dosya çok büyük (sınır ${(limit / 1048576).toFixed(0)} MB).`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const raw = (await readBody(req, limit)).toString("utf8");
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Geçersiz JSON.");
  }
}

/** Errors the operator can act on keep their message; anything else is logged and shown generically. */
export function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
  if (error instanceof FactoryError) return sendJson(res, 400, { error: error.message, hint: error.hint });
  console.error("[panel] unexpected error:", error);
  sendJson(res, 500, { error: "Beklenmeyen hata. Ayrıntı terminalde." });
}

export function str(body: Record<string, unknown>, key: string, opts: { optional?: boolean; max?: number } = {}): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (opts.optional) return undefined;
    throw new HttpError(400, `"${key}" gerekli.`);
  }
  if (typeof value !== "string") throw new HttpError(400, `"${key}" metin olmalı.`);
  if (opts.max && value.length > opts.max) throw new HttpError(400, `"${key}" en fazla ${opts.max} karakter.`);
  return value;
}
