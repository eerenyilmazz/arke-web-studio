import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installStubTemplate, tempFactory } from "./helpers.js";

/** Talks to the compiled server over stdio, exactly as Claude Code does. */
describe("MCP server over stdio", () => {
  const f = tempFactory();
  let client: Client;

  beforeAll(async () => {
    execFileSync("npx", ["tsc", "-p", "tsconfig.json"], { cwd: process.cwd(), stdio: "inherit" });
    installStubTemplate(f.templatesDir, "corporate-v1");
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(process.cwd(), "dist", "server.js")],
        env: { PATH: process.env.PATH ?? "", SF_CLIENTS_ROOT: f.clientsRoot, SF_INBOX_DIR: f.inboxDir, SF_TEMPLATES_DIR: f.templatesDir },
        stderr: "ignore",
      }),
    );
  }, 120_000);

  afterAll(async () => {
    await client?.close();
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    return { isError: Boolean(res.isError), text: res.content[0]?.text ?? "" };
  };

  it("exposes the tools, resources and prompt", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["build_site", "create_client", "delete_site_file", "deploy", "generate_design_system", "list_site_files", "read_site_file", "write_site_file", "generate_questionnaire", "get_client_status", "list_clients", "save_asset", "save_content", "update_client_config", "edit_site_file", "site_map", "read_site_file_part", "search_design_knowledge", "save_research_notes"].sort(),
    );
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("factory://rules/agents");
    expect(resources.map((r) => r.uri)).toContain("factory://rules/custom-site");
    const agents = await client.readResource({ uri: "factory://rules/agents" });
    expect(JSON.stringify(agents)).toContain("Approvals are human-only");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("new-site");
  });

  it("runs a tool, writes the audit log and reports errors with hints", async () => {
    const created = await call("create_client", { slug: "harbour-dental", businessName: "Harbour Dental", industry: "dental clinic", hostingModel: "client" });
    expect(created.isError).toBe(false);

    const status = await call("get_client_status", { slug: "harbour-dental" });
    expect(JSON.parse(status.text).stage).toBe("collecting-answers");

    const blocked = await call("deploy", { slug: "harbour-dental", target: "production" });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/not complete/);

    const badSlug = await call("get_client_status", { slug: "../etc" });
    expect(badSlug.isError).toBe(true);

    const log = readFileSync(path.join(f.clientsRoot, "harbour-dental", ".factory", "audit.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(log.map((l) => l.tool)).toEqual(["create_client", "get_client_status", "deploy"]);
    expect(log[2].ok).toBe(false);
  });
});
