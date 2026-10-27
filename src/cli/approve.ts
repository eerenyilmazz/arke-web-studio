/**
 * Human approval: npm run approve -- <slug> <content|visual|production> [note]
 *
 * Runs only in an interactive terminal and asks you to type the slug back, so an agent
 * running shell commands cannot approve on your behalf. The approval pins the current
 * content hash; any later edit to config, text or images invalidates it.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { loadFactoryConfig } from "../config.js";
import { APPROVAL_KINDS, SITE_APPROVAL, addApproval, approvalPins, approvalTargets, type ApprovalPins } from "../lib/client/approvals.js";
import { clientStatus } from "../lib/client/client.js";
import { assertSlug, clientPaths } from "../lib/core/paths.js";

async function main(): Promise<void> {
  const [slugArg, kindArg, ...noteParts] = process.argv.slice(2);
  const kinds = kindArg ? approvalTargets(kindArg) : null;
  if (!slugArg || !kindArg || !kinds) {
    console.error(`Usage: npm run approve -- <slug> <${[...APPROVAL_KINDS, SITE_APPROVAL].join("|")}> [note]   (site = content + visual)`);
    process.exit(2);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Approvals must be given by a person in an interactive terminal.");
    process.exit(3);
  }

  const factory = loadFactoryConfig();
  const slug = assertSlug(slugArg);
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!existsSync(paths.config)) {
    console.error(`Client "${slug}" not found in ${factory.clientsRoot}`);
    process.exit(2);
  }

  const status = clientStatus(factory, slug);
  // Throws (nothing approved) if visual/production has no passing, untouched build to pin.
  const pinsNow = (): ApprovalPins[] => kinds.map((k) => approvalPins(k, paths.root, paths.distDir, clientStatus(factory, slug).lastBuild));
  const shown = pinsNow();
  const first = shown[shown.length - 1]!;
  console.log(`\nClient: ${slug}   stage: ${status.stage}   content hash: ${first.hash}${first.distHash ? `   build: ${first.distHash}` : ""}`);
  console.log(`Approving: ${kinds.join(" + ")}`);
  if (status.lastBuild && kinds.some((k) => k !== "content")) console.log(`Last build: ${status.lastBuild.at} passed`);
  if (kinds.includes("visual") && existsSync(paths.qualityReport)) {
    console.log(`\n${readFileSync(paths.qualityReport, "utf8").split("\n").slice(0, 8).join("\n")}\n…`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Type the slug to approve "${kindArg}": `)).trim();
  rl.close();
  if (typed !== slug) {
    console.error("Slug did not match. Nothing approved.");
    process.exit(1);
  }

  // Re-check: if anything changed while the prompt was open, the person approved something else.
  const now = pinsNow();
  if (now.some((p, i) => p.hash !== shown[i]!.hash || p.distHash !== shown[i]!.distHash)) {
    console.error("Content or build changed while you were reviewing. Nothing approved; run the command again.");
    process.exit(1);
  }
  const at = new Date().toISOString();
  kinds.forEach((kind, i) => {
    const { hash, distHash } = now[i]!;
    addApproval(paths.approvals, {
      kind,
      by: os.userInfo().username,
      at,
      hash,
      ...(distHash ? { distHash } : {}),
      ...(noteParts.length ? { note: noteParts.join(" ") } : {}),
    });
  });
  console.log(`Approved ${kinds.join(" + ")} for ${slug} at content hash ${first.hash}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
