import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PRODUCT_IDS } from "../products/registry.js";
import type { FactoryConfig } from "../config.js";
import { readJsonIfExists, writeJson } from "../lib/core/files.js";
import { clientPaths } from "../lib/core/paths.js";
import { AddonsSchema } from "./addons.js";

/**
 * Sales tracking per client (quote, payment, delivery date, a note), for the operator.
 * Kept in .factory/business.json: panel only, never shown to the agent, not part of the site.
 */
const FILE = "business.json";

export const PAYMENT_STATES = ["none", "quoted", "deposit", "paid"] as const;

export const BusinessSchema = z.object({
  price: z.number().nonnegative().max(10_000_000).nullable().default(null),
  currency: z.enum(["TRY", "GBP", "EUR", "USD"]).default("TRY"),
  payment: z.enum(PAYMENT_STATES).default("none"),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  /** When the (rest of the) payment is due; past it and not paid = overdue on the dashboard. */
  paymentDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  note: z.string().max(2000).default(""),
  /** The operator's own labels for grouping clients (e.g. "tavsiye", "acil", "İzmir"). */
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  /** The operator's own costs for this client, in the same currency as the price (domain, stock photos, a form plan…). */
  costs: z
    .array(z.object({ label: z.string().trim().min(1).max(60), amount: z.number().nonnegative().max(10_000_000) }))
    .max(20)
    .default([]),
  /** This client's budget mode; empty = the panel-wide one. */
  budgetMode: z.enum(["", "economy", "balanced", "premium"]).default(""),
  /** Extras sold on top of the base site; absent = a client from before extras existed (agent works as before). */
  addons: AddonsSchema.optional(),
  /** The kind of site (src/products); absent = a showcase site (clients from before kinds existed). */
  product: z.enum(PRODUCT_IDS).optional(),
});
export type Business = z.infer<typeof BusinessSchema> & { updatedAt?: string };

function file(factory: FactoryConfig, slug: string): string {
  return path.join(clientPaths(factory.clientsRoot, slug).factoryDir, FILE);
}

export function readBusiness(factory: FactoryConfig, slug: string): Business | null {
  const f = file(factory, slug);
  if (!existsSync(f)) return null;
  const parsed = BusinessSchema.safeParse(readJsonIfExists(f));
  return parsed.success ? { ...parsed.data, updatedAt: (readJsonIfExists(f) as { updatedAt?: string }).updatedAt } : null;
}

export function writeBusiness(factory: FactoryConfig, slug: string, input: unknown): Business {
  const data = BusinessSchema.parse(input);
  const record = { ...data, updatedAt: new Date().toISOString() };
  writeJson(file(factory, slug), record);
  return record;
}
