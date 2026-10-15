import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/paths.js";
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
    const { checkInputs } = await import("../src/lib/quality.js");
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
  it("new clients use corporate-v2, and both templates ship", () => {
    const factory = JSON.parse(readFileSync("factory.config.json", "utf8"));
    expect(factory.defaultTemplate).toBe("corporate-v2");
    for (const t of ["corporate-v1", "corporate-v2"]) expect(existsSync(`templates/${t}/package.json`)).toBe(true);
  });
});
