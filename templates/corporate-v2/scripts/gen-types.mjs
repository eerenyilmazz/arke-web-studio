// Generates TypeScript types from the factory's JSON Schema (the template contract).
// `--check` fails if the committed types are out of date, so template code never drifts from the schema.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(here, "..", "..", "..", "schema");
const outDir = path.resolve(here, "..", "src", "generated");
const targets = [
  ["site.config.schema.json", "SiteConfig", "site-config.d.ts"],
  ["content.schema.json", "Content", "content.d.ts"],
];
const check = process.argv.includes("--check");
let stale = false;

for (const [schemaFile, typeName, outFile] of targets) {
  const schema = JSON.parse(readFileSync(path.join(schemaDir, schemaFile), "utf8"));
  delete schema.$schema;
  const ts = await compile(schema, typeName, {
    bannerComment: `/* Generated from schema/${schemaFile} by scripts/gen-types.mjs. Do not edit. */`,
    additionalProperties: false,
    maxItems: -1,
    style: { singleQuote: false },
  });
  const target = path.join(outDir, outFile);
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== ts) {
      console.error(`out of date: src/generated/${outFile} (run npm run types)`);
      stale = true;
    }
  } else {
    writeFileSync(target, ts);
    console.log(`wrote src/generated/${outFile}`);
  }
}
if (stale) process.exit(1);
