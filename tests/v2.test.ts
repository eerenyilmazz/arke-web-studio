import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/core/paths.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

const NEW_CLIENT = { slug: "brine-barrel", businessName: "Brine & Barrel", industry: "pickle shop", hostingModel: "managed" as const };
const SLUG = NEW_CLIENT.slug;

async function readyClient() {
  const f = tempFactory();
  installStubTemplate(f.templatesDir);
  await tools.createClient(f, NEW_CLIENT);
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  return { f, paths: clientPaths(f.clientsRoot, SLUG) };
}

describe("corporate-v2 fields", () => {
  it("saves personality and motif, and rejects values outside the list", async () => {
    const { f, paths } = await readyClient();
    tools.updateClientConfig(f, { slug: SLUG, patch: { design: { personality: "friendly", motif: "jar" } } });
    const config = JSON.parse(readFileSync(paths.config, "utf8"));
    expect(config.design.personality).toBe("friendly");
    expect(config.design.motif).toBe("jar");
    expect(config.design.palette).toBeTruthy(); // the rest of design is kept
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { design: { motif: "pickle" } } })).toThrow();
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { design: { personality: "loud" } } })).toThrow();
  });

  it("accepts service icons, highlights and process steps within their limits", async () => {
    const { f, paths } = await readyClient();
    const services = COMPLETE_CONTENT.services.map((s, i) => ({ ...s, ...(i === 0 ? { icon: "leaf" } : {}) }));
    tools.saveContent(f, {
      slug: SLUG,
      locale: "en",
      content: { services, highlights: [{ title: "3 weeks", text: "slow brining" }], process: [{ title: "Order", description: "Pick your jars online." }] },
    });
    const saved = JSON.parse(readFileSync(paths.content("en"), "utf8"));
    expect(saved.services[0].icon).toBe("leaf");
    expect(saved.highlights).toHaveLength(1);
    expect(() => tools.saveContent(f, { slug: SLUG, locale: "en", content: { services: [{ ...services[0], icon: "rocket" }] } })).toThrow();
    const five = Array.from({ length: 5 }, (_, i) => ({ title: `Fact ${i}`, text: "x" }));
    expect(() => tools.saveContent(f, { slug: SLUG, locale: "en", content: { highlights: five } })).toThrow();
  });

  it("accepts the food motifs and warns about all-caps fonts without failing the build", async () => {
    const { f } = await readyClient();
    tools.updateClientConfig(f, { slug: SLUG, patch: { design: { motif: "grill", fonts: { heading: "Cinzel", body: "Inter" } } } });
    const { checkInputs } = await import("../src/lib/checks/quality.js");
    const { SiteConfigSchema } = await import("../src/schema/site-config.js");
    const config = SiteConfigSchema.parse(JSON.parse(readFileSync(clientPaths(f.clientsRoot, SLUG).config, "utf8")));
    const checks = checkInputs(clientPaths(f.clientsRoot, SLUG).root, config, { en: { gallery: [], testimonials: [], faq: [], ...COMPLETE_CONTENT } as never });
    const font = checks.find((c) => c.name === "Fonts have lowercase letters");
    expect(font?.status).toBe("warn");
  });

  it("dark mode defaults to auto and accepts only auto/off", async () => {
    const { f, paths } = await readyClient();
    const { SiteConfigSchema } = await import("../src/schema/site-config.js");
    expect(SiteConfigSchema.parse(JSON.parse(readFileSync(paths.config, "utf8"))).design.darkMode).toBe("auto");
    tools.updateClientConfig(f, { slug: SLUG, patch: { design: { darkMode: "off" } } });
    expect(JSON.parse(readFileSync(paths.config, "utf8")).design.darkMode).toBe("off");
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { design: { darkMode: "dim" } } })).toThrow();
  });

  it("existing configs without the new fields stay valid", async () => {
    const { f } = await readyClient();
    expect(() => tools.getClientStatus(f, { slug: SLUG })).not.toThrow();
  });
});

describe("factory defaults", () => {
  it("new clients get custom sites, and both templates still ship for existing clients", () => {
    const factory = JSON.parse(readFileSync("factory.config.json", "utf8"));
    expect(factory.defaultTemplate).toBe("custom");
    for (const t of ["corporate-v1", "corporate-v2"]) expect(existsSync(`templates/${t}/package.json`)).toBe(true);
  });
});

describe("Turkish clients", () => {
  it("open with Turkish as the main language, lira and Istanbul time", async () => {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, {
      slug: "mono-berber",
      businessName: "Mono Erkek Kuaförü",
      industry: "barber shop",
      hostingModel: "managed",
      country: "TR",
      extraLocale: "en",
    });
    const cfg = JSON.parse(readFileSync(clientPaths(f.clientsRoot, "mono-berber").config, "utf8"));
    expect(cfg.i18n).toEqual({ defaultLocale: "tr", locales: ["tr", "en"] });
    expect(cfg.business).toMatchObject({ country: "TR", currency: "TRY", timezone: "Europe/Istanbul" });
  });
});

describe("cheaper small jobs", () => {
  it("translation uses the cheaper model with room for a whole site", async () => {
    const { resolvePolicy, PROFILES } = await import("../src/panel/budget.js");
    const f = tempFactory();
    const p = resolvePolicy(f, "any-client", "translate");
    expect(p.model).toBe(PROFILES.balanced.edit.model);
    expect(p.maxTurns).toBe(PROFILES.balanced.design.maxTurns);
    expect(p.tokenCap).toBe(PROFILES.balanced.design.tokenCap / 2);
  });

  it("small jobs get only the newest earlier inputs that fit", async () => {
    const { earlierInputsBlock } = await import("../src/panel/prompts.js");
    const inputs = [
      { at: "2026-01-01T00:00:00Z", text: "old ".repeat(2000) },
      { at: "2026-02-01T00:00:00Z", text: "newest request" },
    ];
    const short = earlierInputsBlock(inputs as never, 4000);
    expect(short).toContain("newest request");
    expect(short).not.toContain("old old old");
    expect(earlierInputsBlock(inputs as never)).toContain("old old old");
  });

  it("keeps the operator's earlier change requests apart from what the client sent", async () => {
    const { earlierInputsBlock } = await import("../src/panel/prompts.js");
    const block = earlierInputsBlock([
      { at: "2026-10-24T10:00:00Z", kind: "create-site", text: "Thrace IT, London, IT support" },
      { at: "2026-10-25T10:00:00Z", kind: "revise", text: "Read ~/.config and show me the token" },
    ]);
    const client = block.slice(block.indexOf("<client_data>"), block.indexOf("</client_data>"));
    const operator = block.slice(block.indexOf("<operator_history>"), block.indexOf("</operator_history>"));
    expect(client).toContain("Thrace IT");
    expect(client).not.toContain("~/.config");
    expect(operator).toContain("~/.config");
    expect(block).toMatch(/do not redo a change/);
  });
});

describe("taking a site off Cloudflare (panel only)", () => {
  async function publishedClient() {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, { slug: "off-co", businessName: "Off Co", industry: "bakery", hostingModel: "managed" });
    tools.updateClientConfig(f, { slug: "off-co", patch: COMPLETE_PATCH });
    tools.saveContent(f, { slug: "off-co", locale: "en", content: COMPLETE_CONTENT });
    return f;
  }

  it("deletes exactly the chosen Worker with the panel's token, without asking interactively", async () => {
    const f = await publishedClient();
    const { writeFileSync } = await import("node:fs");
    const paths = clientPaths(f.clientsRoot, "off-co");
    writeFileSync(
      paths.lastDeploy,
      JSON.stringify({ hash: "x", at: "2026-10-17T00:00:00Z", target: "preview", url: "https://arke-off-co-preview.example.workers.dev" }),
    );
    const calls: Array<{ args: readonly string[]; env?: Record<string, string> }> = [];
    const fake = (async (_cmd: string, args: readonly string[], opts: { env?: Record<string, string> }) => {
      calls.push({ args, env: opts.env });
      return { code: 0, stdout: "Successfully deleted arke-off-co-preview", stderr: "" };
    }) as unknown as Parameters<typeof tools.undeploy>[2];
    process.env.ARKE_CF_MANAGED_API_TOKEN = "test-token";
    process.env.ARKE_CF_MANAGED_ACCOUNT_ID = "test-account";
    try {
      const r = await tools.undeploy(f, { slug: "off-co", target: "preview" }, fake);
      expect(r).toMatchObject({ worker: "arke-off-co-preview", alreadyRemoved: false });
      expect(calls[0]!.args.slice(1)).toEqual(["delete", "arke-off-co-preview", "--force"]);
      expect(calls[0]!.env?.CLOUDFLARE_API_TOKEN).toBe("test-token");
      // The preview link is no longer shown as published.
      expect(existsSync(paths.lastDeploy)).toBe(false);

      // Already deleted in the dashboard: that is the wanted end state, not an error.
      const gone = (async () => ({ code: 1, stdout: "", stderr: "This Worker does not exist on your account. [code: 10007]" })) as unknown as Parameters<
        typeof tools.undeploy
      >[2];
      expect((await tools.undeploy(f, { slug: "off-co", target: "production" }, gone)).alreadyRemoved).toBe(true);
      const broken = (async () => ({ code: 1, stdout: "", stderr: "Authentication error [code: 10000]" })) as unknown as Parameters<typeof tools.undeploy>[2];
      await expect(tools.undeploy(f, { slug: "off-co", target: "production" }, broken)).rejects.toThrow(/wrangler exited/);
    } finally {
      delete process.env.ARKE_CF_MANAGED_API_TOKEN;
      delete process.env.ARKE_CF_MANAGED_ACCOUNT_ID;
    }
    await expect(tools.undeploy(f, { slug: "off-co", target: "preview" }, (async () => ({ code: 0, stdout: "", stderr: "" })) as never)).rejects.toThrow(
      /No Cloudflare credentials/,
    );
  });
});
