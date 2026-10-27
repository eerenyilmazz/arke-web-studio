// Panel API tests: structured and direct edits, texts, extra pages and earlier inputs.
import { describe, expect, it } from "vitest";
import { COMPLETE_CONTENT, COMPLETE_PATCH, PNG_1PX } from "../helpers.js";
import { fakeSpawn, start, waitFor, usePanelCleanup, type SpawnCall } from "./harness.js";
import * as tools from "../../src/tools.js";

usePanelCleanup();

describe("structured edits (Düzenle)", () => {
  it("saves services itself, gives the agent a narrow instruction, and validates the forms", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth, factory } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "edit-me", businessName: "Edit Me", industry: "barber shop", hostingModel: "managed" }),
    });
    tools.updateClientConfig(factory, { slug: "edit-me", patch: { ...COMPLETE_PATCH, template: "custom" } });
    tools.saveContent(factory, { slug: "edit-me", locale: "en", content: COMPLETE_CONTENT });
    const post = (type: string, payload: unknown) =>
      fetch(`${base}/api/clients/edit-me/edit/${type}`, { method: "POST", headers: json, body: JSON.stringify(payload) });

    expect((await post("colors", { colors: { primary: "not-a-colour" } })).status).toBe(400);
    expect((await post("pages", { pages: ["contact"] })).status).toBe(400);
    expect((await post("text", { page: "home", oldText: "", newText: "x" })).status).toBe(400);

    const r = await post("services", { services: [{ title: "Saç kesimi", price: "400 TL", description: "Yıkama dahil." }, { title: "" }] });
    expect(r.status).toBe(202);
    const saved = (await import("node:fs")).readFileSync((await import("node:path")).join(factory.clientsRoot, "edit-me", "content", "en.json"), "utf8");
    expect(JSON.parse(saved).services).toEqual([{ title: "Saç kesimi", description: "Yıkama dahil.", price: "400 TL" }]);
    const prompt = calls[0]!.stdin;
    expect(prompt).toMatch(/1\. Saç kesimi — 400 TL/);
    expect(prompt).toMatch(/Change nothing else/);
    expect(calls[0]!.args.join(" ")).toMatch(/--disallowedTools Bash/);
  });
});

describe("edits without the assistant", () => {
  async function customSite(calls: SpawnCall[]) {
    const ctx = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...ctx.auth, "Content-Type": "application/json" };
    await fetch(`${ctx.base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "direct-co", businessName: "Direct & Co", industry: "bakery", hostingModel: "managed" }),
    });
    tools.updateClientConfig(ctx.factory, { slug: "direct-co", patch: { ...COMPLETE_PATCH, template: "custom" } });
    tools.saveContent(ctx.factory, { slug: "direct-co", locale: "en", content: COMPLETE_CONTENT });
    const w = (p: string, c: string) => tools.writeSiteFileTool(ctx.factory, { slug: "direct-co", path: p, content: c });
    w(
      "brand/brand.json",
      JSON.stringify({
        concept: "Bread from a wood oven, crust and flour dust.",
        personality: ["warm", "honest"],
        palette: { crust: "#8A4B16", flour: "#F6F1E4", ink: "#1B1B1B" },
        fonts: { heading: "Fraunces", body: "Inter" },
        visualLanguage: "Loaves, flour dust and oven light.",
        voice: "Short and warm.",
        animations: [
          { id: "dough-rise", idea: "Dough rises on scroll in the hero.", trigger: "scroll" },
          { id: "flour-dust", idea: "Flour dust falls from the cursor.", trigger: "pointer" },
        ],
      }),
    );
    w("css/site.css", ":root{--crust:#8A4B16;--flour:#F6F1E4;--ink:#1B1B1B}");
    w(
      "index.html",
      '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Direct &amp; Co</title></head><body><h1 class="dough-rise">Fresh bread every morning</h1></body></html>',
    );
    return { ...ctx, json };
  }

  it("changes colours and exact text itself (no agent run) and asks the agent only when the text is not found", async () => {
    const calls: SpawnCall[] = [];
    const { base, json, auth, factory } = await customSite(calls);
    const r1 = await fetch(`${base}/api/clients/direct-co/edit/colors`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ colors: { crust: "#123456" } }),
    });
    expect(r1.status).toBe(202);
    expect(((await r1.json()) as { kind: string }).kind).toBe("build");
    await waitFor(async () => !((await (await fetch(`${base}/api/meta`, { headers: auth })).json()) as { running: unknown }).running);
    expect(tools.readSiteFileTool(factory, { slug: "direct-co", path: "css/site.css" }).content).toContain("#123456");
    const r2 = await fetch(`${base}/api/clients/direct-co/edit/text`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ page: "home", oldText: "Fresh bread every morning", newText: "Bread & butter, daily" }),
    });
    expect(((await r2.json()) as { kind: string }).kind).toBe("build");
    await waitFor(async () => !((await (await fetch(`${base}/api/meta`, { headers: auth })).json()) as { running: unknown }).running);
    expect(tools.readSiteFileTool(factory, { slug: "direct-co", path: "index.html" }).content).toContain("Bread &amp; butter, daily");
    expect(calls.length).toBe(0);
    const r3 = await fetch(`${base}/api/clients/direct-co/edit/text`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ page: "home", oldText: "Not on the page", newText: "x" }),
    });
    expect(((await r3.json()) as { kind: string }).kind).toBe("edit-text");
    expect(calls.length).toBe(1);
  });
});

describe("1.13: archive, texts by id, extra page, logo checks", () => {
  async function customCo(calls: SpawnCall[], slug = "text-co", name = "Text Co") {
    const ctx = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...ctx.auth, "Content-Type": "application/json" };
    await fetch(`${ctx.base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug, businessName: name, industry: "barber shop", hostingModel: "managed" }),
    });
    tools.updateClientConfig(ctx.factory, { slug, patch: { ...COMPLETE_PATCH, template: "custom" } });
    tools.saveContent(ctx.factory, { slug, locale: "en", content: COMPLETE_CONTENT });
    const { writePassingCustomSite } = await import("../helpers.js");
    writePassingCustomSite(ctx.factory, slug, name);
    return { ...ctx, json };
  }
  const idle = async (base: string, auth: Record<string, string>) =>
    waitFor(async () => !((await (await fetch(`${base}/api/meta`, { headers: auth })).json()) as { running: unknown }).running);

  it("archives, lists, restores and deletes for good only with the short name", async () => {
    const calls: SpawnCall[] = [];
    const { base, json, auth } = await customCo(calls, "arch-co", "Arch Co");
    await fetch(`${base}/api/clients/arch-co`, { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "arch-co" }) });
    let list = ((await (await fetch(`${base}/api/archive`, { headers: auth })).json()) as { archived: Array<{ id: string; slug: string; name: string }> })
      .archived;
    expect(list[0]).toMatchObject({ slug: "arch-co", name: "Arch Co" });
    const r = await fetch(`${base}/api/archive/${list[0]!.id}/restore`, { method: "POST", headers: json });
    expect(r.status).toBe(200);
    expect(
      ((await (await fetch(`${base}/api/clients`, { headers: auth })).json()) as { clients: Array<{ slug: string }> }).clients.map((c) => c.slug),
    ).toContain("arch-co");
    await fetch(`${base}/api/clients/arch-co`, { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "arch-co" }) });
    list = ((await (await fetch(`${base}/api/archive`, { headers: auth })).json()) as { archived: Array<{ id: string; slug: string; name: string }> }).archived;
    expect((await fetch(`${base}/api/archive/${list[0]!.id}`, { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "wrong" }) })).status).toBe(
      400,
    );
    expect((await fetch(`${base}/api/archive/${list[0]!.id}`, { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "arch-co" }) })).status).toBe(
      200,
    );
    expect(((await (await fetch(`${base}/api/archive`, { headers: auth })).json()) as { archived: unknown[] }).archived).toEqual([]);
    expect((await fetch(`${base}/api/archive/..%2F..%2Fetc/restore`, { method: "POST", headers: json })).status).toBe(404);
  });

  it("edits page texts by id without the agent, saving the version before the change", async () => {
    const calls: SpawnCall[] = [];
    const { base, json, auth, factory } = await customCo(calls);
    const t = (await (await fetch(`${base}/api/clients/text-co/texts?page=home`, { headers: auth })).json()) as {
      pages: string[];
      page: string;
      items: Array<{ id: string; text: string }>;
    };
    expect(t.pages).toEqual(["home", "contact"]);
    const h1 = t.items.find((i) => i.id === "h1-1")!;
    expect(h1.text).toBe("Text Co");
    const r = await fetch(`${base}/api/clients/text-co/edit/text`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ page: "home", changes: [{ id: "h1-1", oldText: "Text Co", newText: "Fresh cuts & shaves" }] }),
    });
    expect(r.status).toBe(202);
    await idle(base, auth);
    expect(calls.length).toBe(0);
    expect(tools.readSiteFileTool(factory, { slug: "text-co", path: "index.html" }).content).toContain("Fresh cuts &amp; shaves");
    const { listVersions } = await import("../../src/lib/client/versions.js");
    const { clientPaths } = await import("../../src/lib/core/paths.js");
    const { execFileSync } = await import("node:child_process");
    const before = (await listVersions(clientPaths(factory.clientsRoot, "text-co").root)).find((v) => v.message.startsWith("Önce: Metin"))!;
    const old = execFileSync("git", ["show", `${before.id}:site/index.html`], { cwd: clientPaths(factory.clientsRoot, "text-co").root, encoding: "utf8" });
    expect(old).toContain(">Text Co</h1>");
    // Stale edit (the page changed since it was opened): nothing written.
    expect(
      (
        await fetch(`${base}/api/clients/text-co/edit/text`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ page: "home", changes: [{ id: "h1-1", oldText: "Text Co", newText: "x" }] }),
        })
      ).status,
    ).toBe(409);
  });

  it("adds an extra page through a narrow agent job", async () => {
    const calls: SpawnCall[] = [];
    const { base, json } = await customCo(calls);
    const r = await fetch(`${base}/api/clients/text-co/agent/add-page`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Sıkça Sorulan Sorular", purpose: "Randevu ve ödeme soruları" }),
    });
    expect(r.status).toBe(202);
    expect(calls[0]!.stdin).toMatch(/at sikca-sorulan-sorular\/index\.html/);
    expect(calls[0]!.stdin).toMatch(/<client_data>\nRandevu ve ödeme soruları/);
    expect((await fetch(`${base}/api/clients/text-co/agent/add-page`, { method: "POST", headers: json, body: JSON.stringify({ name: "css" }) })).status).toBe(
      400,
    );
  });

  it("writes a blog post and forwards client comments by id, only as client data", async () => {
    const calls: SpawnCall[] = [];
    const { base, json, factory } = await customCo(calls);
    expect((await fetch(`${base}/api/clients/text-co/agent/blog-post`, { method: "POST", headers: json, body: JSON.stringify({ title: "ab" }) })).status).toBe(
      400,
    );
    expect(
      (await fetch(`${base}/api/clients/text-co/agent/portal-comments`, { method: "POST", headers: json, body: JSON.stringify({ ids: ["x"] }) })).status,
    ).toBe(400);
    const { clientPaths } = await import("../../src/lib/core/paths.js");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const fdir = clientPaths(factory.clientsRoot, "text-co").factoryDir;
    mkdirSync(fdir, { recursive: true });
    writeFileSync(`${fdir}/client-feedback.json`, JSON.stringify([{ id: "1-a", at: "2026-10-01", page: "home", text: "Bigger logo please", status: "open" }]));
    const r = await fetch(`${base}/api/clients/text-co/agent/portal-comments`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ ids: ["1-a"], text: "injected" }),
    });
    expect(r.status).toBe(202);
    expect(calls[0]!.stdin).toMatch(/<client_data>\n1\. \[home\] Bigger logo please\n<\/client_data>/);
    expect(calls[0]!.stdin).not.toContain("injected");
    const { portalMessages } = await import("../../src/panel/portal.js");
    expect(portalMessages(factory, "text-co").comments[0]!.status).toBe("sent");
  });

  it("stops another client's logo, and marks the brand stale when the logo changes", async () => {
    const calls: SpawnCall[] = [];
    const { base, json, auth } = await customCo(calls, "barber-co", "Barber Co");
    // A second client whose logo is the same file.
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "pickle-co", businessName: "Pickle Co", industry: "pickle shop", hostingModel: "managed" }),
    });
    const png = PNG_1PX;
    for (const slug of ["pickle-co", "barber-co"])
      await fetch(`${base}/api/clients/${slug}/inbox/logo.png`, { method: "PUT", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: png });
    expect(
      (await fetch(`${base}/api/clients/pickle-co/logo`, { method: "POST", headers: json, body: JSON.stringify({ name: "logo.png", from: "inbox" }) })).status,
    ).toBe(200);
    const dup = await fetch(`${base}/api/clients/barber-co/logo`, { method: "POST", headers: json, body: JSON.stringify({ name: "logo.png", from: "inbox" }) });
    expect(dup.status).toBe(409);
    expect((await dup.json()) as { code: string; owner: { name: string } }).toMatchObject({ code: "shared-logo", owner: { name: "Pickle Co" } });
    expect(
      (
        await fetch(`${base}/api/clients/barber-co/logo`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ name: "logo.png", from: "inbox", force: true }),
        })
      ).status,
    ).toBe(200);
    const detail = (await (await fetch(`${base}/api/clients/barber-co`, { headers: auth })).json()) as {
      brandStale: unknown;
      sharedLogo: { slug: string } | null;
    };
    expect(detail.brandStale).toBeTruthy();
    expect(detail.sharedLogo?.slug).toBe("pickle-co");
    // A design job is not started with another client's logo unless the operator confirms it.
    const job = await fetch(`${base}/api/clients/barber-co/agent/redesign`, { method: "POST", headers: json, body: "{}" });
    expect(job.status).toBe(409);
    expect(calls.length).toBe(0);
    const ok = await fetch(`${base}/api/clients/barber-co/agent/redesign`, { method: "POST", headers: json, body: JSON.stringify({ allowSharedLogo: true }) });
    expect(ok.status).toBe(202);
    expect(calls[0]!.stdin).toMatch(/logo changed after the brand was made/);
    await idle(base, auth);
    expect(((await (await fetch(`${base}/api/clients/barber-co`, { headers: auth })).json()) as { brandStale: unknown }).brandStale).toBeNull();
  });
});

describe("quick edit", () => {
  it("normalises local phone numbers to the client's country", async () => {
    const { normalisePhone } = await import("../../src/panel/api.js");
    expect(normalisePhone("0534 985 63 19", "TR")).toBe("+905349856319");
    expect(normalisePhone("07700 900123", "GB")).toBe("+447700900123");
    expect(normalisePhone("+90 (506) 101-81-82", "TR")).toBe("+905061018182");
    expect(normalisePhone("00447700900123", "TR")).toBe("+447700900123");
    expect(normalisePhone("087 123 4567", "IE")).toBe("+353871234567");
    expect(normalisePhone("030 1234567", "DE")).toBe("+49301234567");
    expect(normalisePhone("(212) 555-0142", "US")).toBe("+12125550142");
    expect(normalisePhone("0612345678", "XX")).toBe("0612345678"); // unknown market: kept as typed
  });
});

describe("earlier inputs are kept between agent jobs", () => {
  it("gives the next job everything pasted before, as client data", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "mono-barber", businessName: "Mono", industry: "barber shop", hostingModel: "managed" }),
    });
    const first = await fetch(`${base}/api/clients/mono-barber/agent/create-site`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ freeText: "Saç kesimi 500 TL. Pazartesi–Cumartesi 09:00–22:00." }),
    });
    expect(first.status).toBe(202);
    await waitFor(async () => ((await (await fetch(`${base}/api/clients/mono-barber`, { headers: auth })).json()) as { running: unknown }).running === null);
    const second = await fetch(`${base}/api/clients/mono-barber/agent/revise`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ request: "E-posta: a@b.co" }),
    });
    expect(second.status).toBe(202);
    const prompt = calls[1]!.stdin;
    expect(prompt).toContain("Earlier information about this client from previous jobs");
    expect(prompt).toContain("Saç kesimi 500 TL");
    expect(prompt.lastIndexOf("<client_data>")).toBeLessThan(prompt.lastIndexOf("Saç kesimi 500 TL"));
  });
});
