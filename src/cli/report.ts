/**
 * Read-only factory report: npm run report -- [folder] [--no-network]
 *
 * Writes arke-report-<date>.md into the folder (default: the current folder) and prints a short summary. Token and
 * secret values are never written. --no-network skips the live checks of published addresses and the portal.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadFactoryConfig } from "../config.js";
import { buildReport } from "../panel/report.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const network = !args.includes("--no-network");
  const dir = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const { markdown, checks } = await buildReport(loadFactoryConfig(), { network });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const file = path.join(dir, `arke-report-${stamp}.md`);
  writeFileSync(file, markdown);
  const n = (v: string) => checks.filter((c) => c.verdict === v).length;
  console.log(`\nRapor hazır: ${file}`);
  console.log(`Kontroller: ${n("fail")} kaldı · ${n("warn")} uyarı · ${n("pass")} geçti`);
  for (const c of checks.filter((x) => x.verdict === "fail")) console.log(`  KALDI  ${c.area}: ${c.text}`);
  console.log("\nBu dosyayı Claude'a gönderebilirsin; token ve anahtarlar içinde yok.\n");
}

main().catch((error) => {
  console.error(`Rapor oluşturulamadı: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
