#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FACTORY_ROOT, loadFactoryConfig, type FactoryConfig } from "./config.js";
import { ASSET_KINDS } from "./lib/assets.js";
import { audit, summariseArgs } from "./lib/audit.js";
import { FactoryError } from "./lib/errors.js";
import { clientPaths } from "./lib/paths.js";
import { LOCALES, SLUG_PATTERN } from "./schema/site-config.js";
import * as tools from "./tools.js";

const slug = z.string().regex(SLUG_PATTERN).describe("Client slug, e.g. willow-thread");

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/**
 * Wraps a tool: runs it, writes one audit line to the client's log, and turns
 * FactoryError into a readable error result. Unexpected errors are not echoed in full.
 */
function handler<A extends Record<string, unknown>>(factory: FactoryConfig, name: string, fn: (args: A) => unknown) {
  return async (args: A): Promise<ToolResult> => {
    const started = Date.now();
    const logFile = typeof args.slug === "string" && SLUG_PATTERN.test(args.slug) ? clientPaths(factory.clientsRoot, args.slug).auditLog : null;
    try {
      const result = await fn(args);
      if (logFile && existsSync(path.dirname(path.dirname(logFile)))) {
        audit(logFile, { tool: name, ok: true, ms: Date.now() - started, args: summariseArgs(args) });
      }
      // Compact JSON: the agent parses it fine and indentation only adds tokens.
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const known = error instanceof FactoryError;
      const message = known ? error.message : "Internal error. Details were written to the server log.";
      if (!known) console.error(`[site-factory] ${name} failed:`, error);
      if (logFile && existsSync(path.dirname(path.dirname(logFile)))) {
        audit(logFile, { tool: name, ok: false, ms: Date.now() - started, args: summariseArgs(args), error: message.slice(0, 300) });
      }
      const text = known && error.hint ? `${message}\n\nHint: ${error.hint}` : message;
      return { content: [{ type: "text", text }], isError: true };
    }
  };
}

export function createServer(factory: FactoryConfig = loadFactoryConfig()): McpServer {
  const server = new McpServer(
    { name: "site-factory", version: "0.1.0" },
    {
      instructions:
        "Site Factory: produces small-business websites from a fixed template. Read AGENTS.md first. You write config and content through these tools; you never edit template code and never create approvals.",
    },
  );

  server.registerTool(
    "list_clients",
    { title: "List clients", description: "All client folders and their current stage.", inputSchema: {}, annotations: { readOnlyHint: true } },
    handler(factory, "list_clients", () => tools.listClients(factory)),
  );

  server.registerTool(
    "create_client",
    {
      title: "Create client",
      description: "Creates the client folder (own git repo), a draft site.config.json and empty content/assets folders. English is always included.",
      inputSchema: {
        slug,
        businessName: z.string().min(1).max(80),
        industry: z.string().min(2).max(60).describe("Short sector name in English, e.g. 'hair salon', 'family law solicitor'"),
        hostingModel: z.enum(["managed", "client"]).describe("managed = our Cloudflare account; client = the client's own. Ask Eren."),
        extraLocale: z.enum(LOCALES).optional().describe("Second language, only if the client asked for one"),
        template: z.string().regex(SLUG_PATTERN).optional(),
      },
    },
    handler(factory, "create_client", (a: Parameters<typeof tools.createClient>[1]) => tools.createClient(factory, a)),
  );

  server.registerTool(
    "get_client_status",
    {
      title: "Client status",
      description: "Stage, next step, missing/invalid fields, open questions, approvals and last build/deploy. Call this whenever unsure what to do next.",
      inputSchema: { slug },
      annotations: { readOnlyHint: true },
    },
    handler(factory, "get_client_status", (a: { slug: string }) => tools.getClientStatus(factory, a)),
  );

  server.registerTool(
    "generate_questionnaire",
    {
      title: "Generate client questionnaire",
      description:
        "Writes the client form (markdown + plain text) and returns the plain text for Eren to send. Round 1 = the 10 essentials; round 2 = only what is still missing, sector extras and a 'later' interest checklist.",
      inputSchema: { slug, round: z.union([z.literal(1), z.literal(2)]), replyBy: z.string().max(40).optional().describe("e.g. 'Friday 24 October'") },
    },
    handler(factory, "generate_questionnaire", (a: { slug: string; round: 1 | 2; replyBy?: string }) => tools.generateQuestionnaire(factory, a)),
  );

  server.registerTool(
    "update_client_config",
    {
      title: "Update client config",
      description:
        "Deep-merges a partial patch into site.config.json (objects merge, arrays replace). Rejects the whole patch if any value is invalid; missing fields are fine. Put answers that fit no field in `unmapped` and ask Eren, never drop them.",
      inputSchema: {
        slug,
        patch: z.record(z.string(), z.unknown()).describe("Partial site config, e.g. { contact: { email: 'a@b.co.uk' } }"),
        unmapped: z.array(z.object({ question: z.string(), answer: z.string(), note: z.string().optional() })).optional(),
        laterInterests: z.array(z.string()).optional().describe("Ids of ticked 'later' items, e.g. later-qr-code"),
      },
    },
    handler(factory, "update_client_config", (a: Parameters<typeof tools.updateClientConfig>[1]) => tools.updateClientConfig(factory, a)),
  );

  server.registerTool(
    "save_content",
    {
      title: "Save content",
      description: "Merges text into content/<locale>.json. Rejects invalid or too-long text; missing parts are fine until build. Every locale needs the same items.",
      inputSchema: {
        slug,
        locale: z.enum(LOCALES),
        content: z.record(z.string(), z.unknown()),
        replace: z.boolean().optional().describe("true = overwrite the file instead of merging"),
      },
    },
    handler(factory, "save_content", (a: Parameters<typeof tools.saveContent>[1]) => tools.saveContent(factory, a)),
  );

  server.registerTool(
    "save_asset",
    {
      title: "Save image",
      description: "Copies an image from the inbox folder into the client's assets after checking real type, size and (for SVG) unsafe content. Returns the path to reference.",
      inputSchema: {
        slug,
        inboxFile: z.string().min(1).max(200).describe("Path relative to the inbox folder"),
        kind: z.enum(ASSET_KINDS),
        name: z.string().max(60).optional(),
      },
    },
    handler(factory, "save_asset", (a: Parameters<typeof tools.saveAssetTool>[1]) => tools.saveAssetTool(factory, a)),
  );

  server.registerTool(
    "generate_design_system",
    {
      title: "Generate design system",
      description: "Runs UI UX Pro Max for the client's sector and tone (if installed) and returns its recommendation. You then save the chosen design with update_client_config.",
      inputSchema: { slug, query: z.string().max(120).optional() },
      annotations: { readOnlyHint: true },
    },
    handler(factory, "generate_design_system", (a: { slug: string; query?: string }) => tools.generateDesignSystem(factory, a)),
  );

  server.registerTool(
    "build_site",
    {
      title: "Build site",
      description: "Validates config and content, runs the template build into the client's dist/, runs quality checks and writes quality-report.md.",
      inputSchema: { slug },
    },
    handler(factory, "build_site", (a: { slug: string }) => tools.buildSite(factory, a)),
  );

  server.registerTool(
    "deploy",
    {
      title: "Deploy",
      description:
        "Deploys the last passing build to Cloudflare Workers. preview needs content+visual approvals; production also needs the production approval. dryRun checks everything without uploading.",
      inputSchema: { slug, target: z.enum(["preview", "production"]), dryRun: z.boolean().optional() },
      annotations: { destructiveHint: true },
    },
    handler(factory, "deploy", (a: { slug: string; target: "preview" | "production"; dryRun?: boolean }) => tools.deploy(factory, a)),
  );

  const agentsMd = path.join(FACTORY_ROOT, "AGENTS.md");
  const designMd = path.join(FACTORY_ROOT, "rules", "design-rules.md");
  for (const [name, file] of [
    ["agents", agentsMd],
    ["design-rules", designMd],
  ] as const) {
    server.registerResource(name, `factory://rules/${name}`, { mimeType: "text/markdown", title: path.basename(file) }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: existsSync(file) ? readFileSync(file, "utf8") : "(missing)" }],
    }));
  }

  server.registerPrompt(
    "new-site",
    {
      title: "Start a new site",
      description: "Starts the Site Factory flow for a new client.",
      argsSchema: { businessName: z.string(), industry: z.string() },
    },
    ({ businessName, industry }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Start a new Site Factory client: "${businessName}" (${industry}). Follow AGENTS.md: propose a slug, ask me only the internal questions (hosting model, extra language if known), create the client, then generate the round-1 questionnaire for me to send.`,
          },
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error("[site-factory] MCP server running on stdio");
}

const invokedDirectly = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error("[site-factory] fatal:", error);
    process.exit(1);
  });
}
