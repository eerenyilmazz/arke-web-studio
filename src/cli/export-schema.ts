/**
 * Writes schema/*.schema.json from the Zod definitions.
 * The JSON files exist only for editors and templates; Zod stays the source of truth.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FACTORY_ROOT } from "../config.js";
import { ContentSchema } from "../schema/content.js";
import { SiteConfigSchema } from "../schema/site-config.js";

export function buildJsonSchemas(): Record<string, unknown> {
  return {
    "site.config.schema.json": z.toJSONSchema(SiteConfigSchema, { io: "input" }),
    "content.schema.json": z.toJSONSchema(ContentSchema, { io: "input" }),
  };
}

function main(): void {
  const outDir = path.join(FACTORY_ROOT, "schema");
  mkdirSync(outDir, { recursive: true });
  for (const [file, schema] of Object.entries(buildJsonSchemas())) {
    writeFileSync(path.join(outDir, file), `${JSON.stringify(schema, null, 2)}\n`);
    console.log(`wrote schema/${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).includes("export-schema")) main();
