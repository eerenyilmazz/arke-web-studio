// Panel API tests: brand board, research, logos, the design plan and the design library.
import { describe, expect, it } from "vitest";
import { COMPLETE_PATCH, SAMPLE_PLAN as PLAN } from "../helpers.js";
import { fakeSpawn, start, waitFor, usePanelCleanup, type SpawnCall } from "./harness.js";
import * as tools from "../../src/tools.js";

usePanelCleanup();

describe("brand board", () => {
  it("serves the board read-only, allows design skills but not Bash, and refuses the board job on template sites", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth, factory } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "tpl-site", businessName: "Tpl", industry: "bakery", hostingModel: "managed", template: "stub-v1" }),
    });
    const board = (await (await fetch(`${base}/api/clients/tpl-site/brand`, { headers: auth })).json()) as { source: string; name: string };
    expect(board.name).toBe("Tpl");
    if (board.source === "template") {
      expect((await fetch(`${base}/api/clients/tpl-site/agent/brand-board`, { method: "POST", headers: json, body: "{}" })).status).toBe(409);
    }
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "own-brand", businessName: "Own", industry: "bakery", hostingModel: "managed", template: "custom" }),
    });
    (await import("../../src/tools.js")).updateClientConfig(factory, { slug: "own-brand", patch: { template: "custom" } });
    const own = (await (await fetch(`${base}/api/clients/own-brand/brand`, { headers: auth })).json()) as { source: string; brand: unknown; missing: string[] };
    expect(own.source).toBe("custom");
    expect(own.brand).toBeNull();
    expect((await fetch(`${base}/api/clients/own-brand/brand`)).status).toBe(401);
    const res = await fetch(`${base}/api/clients/own-brand/agent/brand-board`, { method: "POST", headers: json, body: "{}" });
    expect(res.status).toBe(202);
    const args = calls[0]!.args.join(" ");
    expect(args).toMatch(/--allowedTools \S*Skill/);
    expect(args).toMatch(/--disallowedTools Bash/);
    expect(calls[0]!.stdin).toMatch(/signature\.html/);
    expect(calls[0]!.stdin).toMatch(/mcp__arke-web__get_client_status/);
    // A custom showcase site: the prompt names the kind's own page rules.
    expect(calls[0]!.stdin).toContain("rules/products/showcase.md");
    // Balanced mode searches the design knowledge instead of loading whole skills.
    expect(calls[0]!.stdin).toMatch(/search_design_knowledge/);
    expect(calls[0]!.stdin).not.toMatch(/\[\[DESIGN_SKILLS\]\]/);
  });
});

describe("research first", () => {
  it("lets the agent search the web only while the setting is on, and asks before designing", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    expect(((await (await fetch(`${base}/api/settings`, { headers: auth })).json()) as { webResearch: boolean }).webResearch).toBe(true);
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "web-on", businessName: "Web", industry: "barber shop", hostingModel: "managed" }),
    });
    expect(
      (await fetch(`${base}/api/clients/web-on/agent/create-site`, { method: "POST", headers: json, body: JSON.stringify({ freeText: "Berber, Ankara" }) }))
        .status,
    ).toBe(202);
    const on = calls[0]!;
    expect(on.args[on.args.indexOf("--allowedTools") + 1]).toMatch(/WebSearch,WebFetch/);
    expect(on.args[on.args.indexOf("--disallowedTools") + 1]).not.toMatch(/WebFetch/);
    expect(on.stdin).toMatch(/STOP before design/);
    expect(on.stdin).toMatch(/choose nothing for them/);
    expect(on.stdin).not.toMatch(/Senin yerine seçtiklerim:" choices/);
    expect(on.stdin).toMatch(/Önerilerim:" your proposals/);
    expect(on.stdin).toMatch(/do not make it up/);
    await waitFor(async () => !((await (await fetch(`${base}/api/meta`, { headers: auth })).json()) as { running: unknown }).running);

    expect((await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ webResearch: false }) })).status).toBe(200);
    expect((await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ webResearch: "yes" }) })).status).toBe(400);
    await fetch(`${base}/api/clients/web-on/agent/create-site`, { method: "POST", headers: json, body: JSON.stringify({ freeText: "x", askFirst: false }) });
    const off = calls[1]!;
    expect(off.args[off.args.indexOf("--allowedTools") + 1]).not.toMatch(/WebSearch/);
    expect(off.args[off.args.indexOf("--disallowedTools") + 1]).toMatch(/WebSearch,WebFetch/);
    expect(off.stdin).toMatch(/Web research is turned off/);
    expect(off.stdin).not.toMatch(/STOP before design/);
    expect(off.stdin).toMatch(/Senin yerine seçtiklerim:" choices/);
  });
});

describe("client logo from the panel", () => {
  it("shows uploads as thumbnails and sets the logo without the agent", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "logo-co", businessName: "Logo Co", industry: "agency", hostingModel: "managed" }),
    });
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7a9a0b70000000049454e44ae426082",
      "hex",
    );
    expect(
      (
        await fetch(`${base}/api/clients/logo-co/inbox/My%20Logo.png`, {
          method: "PUT",
          headers: { ...auth, "Content-Type": "application/octet-stream" },
          body: png,
        })
      ).status,
    ).toBe(201);
    const img = await fetch(`${base}/api/clients/logo-co/inbox/My-Logo.png`, { headers: auth });
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect((await fetch(`${base}/api/clients/logo-co/inbox/My-Logo.png`)).status).toBe(401);
    const r = await fetch(`${base}/api/clients/logo-co/logo`, { method: "POST", headers: json, body: JSON.stringify({ name: "My-Logo.png", from: "inbox" }) });
    expect(r.status).toBe(200);
    const { logo } = (await r.json()) as { logo: string };
    expect(logo).toMatch(/^assets\//);
    const detail = (await (await fetch(`${base}/api/clients/logo-co`, { headers: auth })).json()) as { logo: string; assets: { name: string }[] };
    expect(detail.logo).toBe(logo);
    expect(detail.assets.map((a) => `assets/${a.name}`)).toContain(logo);
    expect(
      (await fetch(`${base}/api/clients/logo-co/logo`, { method: "POST", headers: json, body: JSON.stringify({ name: "../x.png", from: "assets" }) })).status,
    ).toBe(404);
  });
});

describe("design plan in the panel", () => {
  it("marks a new design, refuses approval without a plan, approves it, and asks the agent for a new idea", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth, factory } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "Plan hazır." }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "plan-shop", businessName: "Plan Shop", industry: "bakery", hostingModel: "managed", country: "TR" }),
    });
    tools.updateClientConfig(factory, { slug: "plan-shop", patch: { template: "custom" } });
    const idle = () =>
      waitFor(async () => ((await (await fetch(`${base}/api/clients/plan-shop`, { headers: auth })).json()) as { running: unknown }).running === null);
    await fetch(`${base}/api/clients/plan-shop/agent/create-site`, { method: "POST", headers: json, body: JSON.stringify({ freeText: "Fırın." }) });
    await idle();
    expect(calls[0]!.stdin).toMatch(/Design plan: look at designPlan/);
    const plan = async () => (await (await fetch(`${base}/api/clients/plan-shop/design-plan`, { headers: auth })).json()) as { state: string; plan: unknown };
    expect((await plan()).state).toBe("missing");
    expect((await fetch(`${base}/api/clients/plan-shop/design-plan/approve`, { method: "POST", headers: json, body: "{}" })).status).toBe(409);

    tools.writeSiteFileTool(factory, { slug: "plan-shop", path: "brand/signature.html", content: "<!doctype html><title>demo</title>" });
    tools.saveDesignPlanTool(factory, { slug: "plan-shop", plan: PLAN });
    expect((await plan()).state).toBe("awaiting");
    const newIdea = await fetch(`${base}/api/clients/plan-shop/agent/new-plan`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ notes: "Daha sade bir giriş." }),
    });
    expect(newIdea.status).toBe(202);
    await idle();
    expect(calls[1]!.stdin).toMatch(/asks for a new idea/);
    expect(calls[1]!.stdin).toContain("<eren_notes>\nDaha sade bir giriş.");
    const ok = await fetch(`${base}/api/clients/plan-shop/design-plan/approve`, { method: "POST", headers: json, body: "{}" });
    expect(ok.status).toBe(200);
    expect((await plan()).state).toBe("approved");
  });
});

describe("library fixed places from the panel", () => {
  it("edits fixed places, preselects the start design and fills them without the agent", async () => {
    const calls: SpawnCall[] = [];
    const ctx = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...ctx.auth, "Content-Type": "application/json" };
    await fetch(`${ctx.base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "src-co", businessName: "Source Bakery", industry: "bakery", hostingModel: "managed" }),
    });
    tools.updateClientConfig(ctx.factory, { slug: "src-co", patch: { ...COMPLETE_PATCH, template: "custom" } });
    tools.writeSiteFileTool(ctx.factory, {
      slug: "src-co",
      path: "index.html",
      content: '<!doctype html><html lang="en"><head><title>Source Bakery</title></head><body><h1>Source Bakery</h1><p>Call 07700 900123</p></body></html>',
    });
    const saved = (await (
      await fetch(`${ctx.base}/api/clients/src-co/library`, { method: "POST", headers: json, body: JSON.stringify({ name: "Fırın" }) })
    ).json()) as { id: string; slots: Array<{ text: string; field: string }> };
    const put = await fetch(`${ctx.base}/api/library/${saved.id}`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ slots: [...saved.slots, { text: "07700 900123", field: "phone" }] }),
    });
    expect(put.status).toBe(200);
    const detail = (await put.json()) as { counts: number[]; fields: Record<string, string> };
    expect(detail.counts.at(-1)).toBe(1);
    expect(detail.fields.phone).toBe("Telefon");
    expect(
      (await fetch(`${ctx.base}/api/library/${saved.id}`, { method: "PUT", headers: json, body: JSON.stringify({ slots: [{ text: "", field: "nope" }] }) }))
        .status,
    ).toBe(400);

    await fetch(`${ctx.base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "new-co", businessName: "New Bakery", industry: "bakery", hostingModel: "managed", startDesign: saved.id }),
    });
    const nd = (await (await fetch(`${ctx.base}/api/clients/new-co`, { headers: ctx.auth })).json()) as { startDesign: string | null };
    expect(nd.startDesign).toBe(saved.id);
    tools.updateClientConfig(ctx.factory, { slug: "new-co", patch: { template: "custom" } });
    const r = await fetch(`${ctx.base}/api/clients/new-co/agent/create-site`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ freeText: "Phone +447700900999", libraryId: saved.id }),
    });
    expect(r.status).toBe(202);
    expect(tools.readSiteFileTool(ctx.factory, { slug: "new-co", path: "index.html" }).content).toContain("New Bakery");
    expect(calls[0]!.stdin + calls[0]!.args.join(" ")).toMatch(/Panel filled: İşletme adı/);
    const after = (await (await fetch(`${ctx.base}/api/clients/new-co`, { headers: ctx.auth })).json()) as { startDesign: string | null };
    expect(after.startDesign).toBeNull();
  });
});

describe("removing a logo and deleting images", () => {
  it("takes the logo off without deleting it, and deletes only images nothing uses", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "logo-co", businessName: "Logo Co", industry: "bakery", hostingModel: "managed" }),
    });
    const { PNG_1PX } = await import("../helpers.js");
    const up = (name: string) =>
      fetch(`${base}/api/clients/logo-co/inbox/${name}`, { method: "PUT", headers: { ...auth, "Content-Type": "application/octet-stream" }, body: PNG_1PX });
    expect((await up("logo.png")).status).toBe(201);
    expect((await up("extra.png")).status).toBe(201);
    const set = (await (
      await fetch(`${base}/api/clients/logo-co/logo`, { method: "POST", headers: json, body: JSON.stringify({ name: "logo.png", from: "inbox" }) })
    ).json()) as {
      logo: string;
    };
    const assetName = set.logo.slice("assets/".length);
    const del = (where: string, name: string) => fetch(`${base}/api/clients/logo-co/${where}/${encodeURIComponent(name)}`, { method: "DELETE", headers: auth });
    const refused = await del("assets", assetName);
    expect(refused.status).toBe(409); // still the logo
    expect(((await refused.json()) as { error: string }).error).toMatch(/Logoyu kaldır/);

    expect((await fetch(`${base}/api/clients/logo-co/logo`, { method: "DELETE", headers: auth })).status).toBe(200);
    const detail = (await (await fetch(`${base}/api/clients/logo-co`, { headers: auth })).json()) as { logo: string | null; assets: Array<{ name: string }> };
    expect(detail.logo).toBeNull();
    expect(detail.assets.map((a) => a.name)).toContain(assetName); // the file stays

    const gone = await del("assets", assetName);
    expect(gone.status).toBe(200);
    expect(((await gone.json()) as { assets: unknown[] }).assets).toEqual([]);
    expect((await del("inbox", "extra.png")).status).toBe(200);
    expect((await del("inbox", "extra.png")).status).toBe(404);
    expect((await del("inbox", "..%2F..%2Fsite.config.json")).status).toBeGreaterThanOrEqual(400);
  });
});
