/**
 * A stand-in for Claude Code in the end-to-end test. The panel starts it exactly as it starts `claude -p`: the prompt
 * on stdin, stream-json events expected on stdout. Instead of a model it follows a fixed script, but every change goes
 * through the real MCP server (src/server.ts) over stdio, the same path the real agent uses.
 *
 * Scripts:
 *   "Prepare this client's website" (create-site): facts, content, the site files, build.
 *   "asks for this change" (revise): changes the home page heading through edit_site_file, build.
 *   "Answers arrive" (answers) and "left the comments below" (portal-comments): read the client, report what
 *   arrived as client data (the test checks it), change nothing.
 *
 * It also checks the boundaries the panel promises the agent runs in, and fails the job when one is broken:
 * no Cloudflare variables in its environment, and the dangerous tools denied on its command line.
 */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, passingSiteFiles } from "../helpers.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const NEW_HEADING = "Sourdough baked at dawn";

function emit(event: unknown): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function finish(ok: boolean, text: string): never {
  emit({
    type: "result",
    subtype: ok ? "success" : "error_during_execution",
    is_error: !ok,
    result: text,
    usage: { input_tokens: 1200, output_tokens: 300 },
    total_cost_usd: 0.01,
  });
  process.exit(0);
}

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** A valid design plan, as the real agent writes it with save_design_plan. */
const FAKE_PLAN = {
  concept: "Ekmeğin fırında kabarması: katmanlar, kabuk ve sıcak ışık.",
  source: "Logodaki somun biçimi",
  tone: ["sıcak", "ölçülü"],
  palette: [
    { name: "Kabuk", hex: "#8A4B16", role: "ana renk" },
    { name: "Un", hex: "#F6F1E4", role: "zemin" },
    { name: "Mürekkep", hex: "#1B1B1B", role: "metin" },
  ],
  fonts: { heading: "Fraunces", body: "Nunito" },
  hero: "Somun çizimi giriş alanının yarısını kaplar; başlık solda, büyük.",
  pages: [{ name: "Ana sayfa", sections: [{ name: "Giriş", purpose: "Markayı ve imza hareketini gösterir" }] }],
  signature: {
    name: "Katmanlı Kabarma",
    idea: "Somunun katmanları sırayla yükselir, kabuk çizgisi çizilir ve başlık yerine oturur.",
    trigger: "load",
    beats: [
      { atMs: 0, durationMs: 500, what: "Alt katman yükselir", easing: "ease-out" },
      { atMs: 250, durationMs: 700, what: "Kabuk çizgisi çizilir", easing: "ease-in-out" },
      { atMs: 700, durationMs: 450, what: "Başlık yerine oturur", easing: "spring" },
    ],
    totalMs: 1200,
    reducedMotion: "Son kare: somun ve başlık yerinde",
  },
  animations: [],
};
const SIGNATURE_HTML = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="İmza hareketi"><meta name="robots" content="noindex"><title>İmza hareketi</title>
<style>@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }</style><script src="/js/motion.js" defer></script></head>
<body><svg viewBox="0 0 100 60"><rect class="base" x="10" y="30" width="80" height="20"/><path class="crust" d="M10 30 Q50 0 90 30" fill="none" stroke="#8A4B16"/></svg><h1>Ekmek Evi</h1>
<script>document.addEventListener("DOMContentLoaded", function () { SFMotion.sequence([
{ target: ".base", keyframes: [{ transform: "scaleY(0)" }, { transform: "none" }], at: 0, duration: 500 },
{ target: ".crust", draw: true, at: 250, duration: 700 },
{ target: "h1", keyframes: [{ opacity: 0 }, { opacity: 1 }], at: 700, duration: 450 }]); });</script></body></html>`;

async function main(): Promise<void> {
  const prompt = await readStdin();
  const leaked = Object.keys(process.env).filter((k) => k.startsWith("SF_CF_"));
  if (leaked.length) finish(false, `BOUNDARY: Cloudflare variables reached the agent: ${leaked.join(", ")}`);
  const denied = process.argv.slice(process.argv.indexOf("--disallowedTools") + 1)[0] ?? "";
  for (const tool of ["Bash", "Edit", "Write", "mcp__site-factory__deploy"]) {
    if (!denied.split(",").includes(tool)) finish(false, `BOUNDARY: ${tool} is not denied (${denied.slice(0, 80)})`);
  }
  const sources = process.argv[process.argv.indexOf("--setting-sources") + 1];
  if (!process.argv.includes("--setting-sources") || sources !== "project,local")
    finish(false, `BOUNDARY: user settings (hooks, plugins) are not shut out (${sources ?? "no --setting-sources"})`);
  const slug = /client "([a-z0-9-]+)"/.exec(prompt)?.[1];
  if (!slug) finish(false, "No client in the prompt.");

  const client = new Client({ name: "e2e-agent", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: path.join(ROOT, "node_modules", ".bin", "tsx"),
      args: [path.join(ROOT, "src", "server.ts")],
      env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string")),
      stderr: "ignore",
    }),
  );
  let n = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    n += 1;
    emit({
      type: "assistant",
      message: {
        id: `m${n}`,
        content: [{ type: "tool_use", id: `t${n}`, name: `mcp__site-factory__${name}`, input: args }],
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    });
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    const text = res.content[0]?.text ?? "";
    if (res.isError) finish(false, `${name} failed: ${text.slice(0, 400)}`);
    return text;
  };

  if (prompt.includes("Prepare this client's website")) {
    const pasted = /<client_data>\n([\s\S]*?)\n<\/client_data>/.exec(prompt)?.[1] ?? "";
    const status = JSON.parse(await call("get_client_status", { slug })) as { designPlan?: { state: string } };
    await call("update_client_config", { slug, patch: COMPLETE_PATCH });
    await call("save_content", { slug, locale: "en", content: COMPLETE_CONTENT });
    // A new design: the plan first, then stop until the operator approves it in the panel (rules/custom/plan.md).
    if (status.designPlan?.state === "missing") {
      await call("save_design_plan", { slug, plan: FAKE_PLAN });
      await call("write_site_file", { slug, path: "brand/signature.html", content: SIGNATURE_HTML });
      await client.close();
      finish(true, `Tasarım planı hazır: ${FAKE_PLAN.signature.name}. Onayınızı bekliyor. Okunan bilgi: ${pasted.replace(/\s+/g, " ").slice(0, 300)}`);
    }
    for (const [p, content] of Object.entries(passingSiteFiles("Ekmek Evi"))) await call("write_site_file", { slug, path: p, content });
    await call("write_site_file", { slug, path: "brand/signature.html", content: SIGNATURE_HTML });
    const build = JSON.parse(await call("build_site", { slug })) as { passed: boolean };
    await client.close();
    finish(build.passed, `Site hazır. Okunan bilgi: ${pasted.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  if (prompt.includes("asks for this change")) {
    await call("read_site_file", { slug, path: "index.html" });
    await call("edit_site_file", {
      slug,
      path: "index.html",
      oldText: '<h1 class="dough-rise">Ekmek Evi</h1>',
      newText: `<h1 class="dough-rise">${NEW_HEADING}</h1>`,
    });
    const build = JSON.parse(await call("build_site", { slug })) as { passed: boolean };
    await client.close();
    finish(build.passed, "Başlık değişti.");
  }
  const data = (/<client_data>\n([\s\S]*?)\n<\/client_data>/.exec(prompt)?.[1] ?? "").replace(/\s+/g, " ").slice(0, 400);
  if (prompt.includes('flow step 3 ("Answers arrive")')) {
    await call("get_client_status", { slug });
    await client.close();
    finish(true, `Cevaplar işlendi: ${data}`);
  }
  if (prompt.includes("left the comments below")) {
    await call("site_map", { slug });
    await client.close();
    finish(true, `Yorumlar uygulandı: ${data}`);
  }
  finish(false, "This job is not in the fake agent's script.");
}

main().catch((error: unknown) => finish(false, `Fake agent crashed: ${(error as Error).message}`));
