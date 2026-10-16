import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * A client's contact form endpoint, set by Eren in the panel and stored in .factory/form.json (the agent cannot
 * write there, so a web page or client text can never redirect form posts somewhere else). Only well-known
 * form services are accepted; the global SF_FORM_ACTION still works as a fallback for every client.
 */
export const FORM_FILE = "form.json";
export const FORM_ACTION = /^https:\/\/(formspree\.io\/f\/[A-Za-z0-9]{4,20}|getform\.io\/f\/[A-Za-z0-9-]{4,40}|formsubmit\.co\/[A-Za-z0-9@._+-]{4,80}|api\.web3forms\.com\/submit)$/;
/** Web3Forms needs a public access key in a hidden field. */
export const WEB3FORMS_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientForm {
  readonly action: string;
  readonly accessKey?: string;
}

export function readClientForm(factoryDir: string): ClientForm | null {
  const f = path.join(factoryDir, FORM_FILE);
  if (!existsSync(f)) return null;
  try {
    const d = JSON.parse(readFileSync(f, "utf8")) as { action?: unknown; accessKey?: unknown };
    if (typeof d.action !== "string" || !FORM_ACTION.test(d.action)) return null;
    const key = typeof d.accessKey === "string" && WEB3FORMS_KEY.test(d.accessKey) ? d.accessKey : undefined;
    return { action: d.action, ...(key ? { accessKey: key } : {}) };
  } catch {
    return null;
  }
}

/** The endpoint forms may post to for this client: its own, else the factory-wide SF_FORM_ACTION (https only). */
export function effectiveFormAction(factoryDir: string): string | null {
  const own = readClientForm(factoryDir);
  if (own) return own.action;
  const env = process.env.SF_FORM_ACTION;
  return env && /^https:\/\//.test(env) ? env : null;
}
