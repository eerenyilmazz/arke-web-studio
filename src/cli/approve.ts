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
import { APPROVAL_KINDS, addApproval, approvalPins, type ApprovalKind } from "../lib/approvals.js";
import { clientStatus } from "../lib/client.js";
import { assertSlug, clientPaths } from "../lib/paths.js";

async function main(): Promise<void> {
  const [slugArg, kindArg, ...noteParts] = process.argv.slice(2);
  if (!slugArg || !kindArg || !APPROVAL_KINDS.includes(kindArg as ApprovalKind)) {
    console.error(`Usage: npm run approve -- <slug> <${APPROVAL_KINDS.join("|")}> [note]`);
    process.exit(2);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Approvals must be given by a person in an interactive terminal.");
    process.exit(3);
  }

  const factory = loadFactoryConfig();
  const slug = assertSlug(slugArg);
  const kind = kindArg as ApprovalKind;
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!existsSync(paths.config)) {
    console.error(`Client "${slug}" not found in ${factory.clientsRoot}`);
    process.exit(2);
  }

  const status = clientStatus(factory, slug);
  // Throws (nothing approved) if visual/production has no passing, untouched build to pin.
  const shown = approvalPins(kind, paths.root, paths.distDir, status.lastBuild);
  console.log(`\nClient: ${slug}   stage: ${status.stage}   content hash: ${shown.hash}${shown.distHash ? `   build: ${shown.distHash}` : ""}`);
  if (status.lastBuild && kind !== "content") console.log(`Last build: ${status.lastBuild.at} passed`);
  if (kind === "visual" && existsSync(paths.qualityReport)) {
    console.log(`\n${readFileSync(paths.qualityReport, "utf8").split("\n").slice(0, 8).join("\n")}\n…`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await rl.question(`Type the slug to approve "${kind}": `)).trim();
  rl.close();
  if (typed !== slug) {
    console.error("Slug did not match. Nothing approved.");
    process.exit(1);
  }

  // Re-check: if anything changed while the prompt was open, the person approved something else.
  const now = approvalPins(kind, paths.root, paths.distDir, clientStatus(factory, slug).lastBuild);
  if (now.hash !== shown.hash || now.distHash !== shown.distHash) {
    console.error("Content or build changed while you were reviewing. Nothing approved; run the command again.");
    process.exit(1);
  }
  const { hash, distHash } = now;
  addApproval(paths.approvals, {
    kind,
    by: os.userInfo().username,
    at: new Date().toISOString(),
    hash,
    ...(distHash ? { distHash } : {}),
    ...(noteParts.length ? { note: noteParts.join(" ") } : {}),
  });
  console.log(`Approved ${kind} for ${slug} at content hash ${hash}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
