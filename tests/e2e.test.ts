import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { clientPaths } from "../src/lib/core/paths.js";
import { CODE, apiGet, type Browser, type FakePanel, findBrowser, idle, jobDone, launchBrowser, openPanel, startPanel } from "./e2e/harness.js";
import { PNG_1PX, tempFactory } from "./helpers.js";

/**
 * End to end, in a real browser, the way the operator works: new client from the form → the agent job builds the site
 * through the real MCP server → approval with the terminal code (a wrong code first) → a trial publish → a change
 * request that rebuilds the site and resets the approval. Only the model is replaced, by tests/e2e/fake-agent.ts,
 * which follows a fixed script and fails the job if the agent's boundaries are broken (Cloudflare variables in its
 * environment, dangerous tools not denied). Nothing is uploaded: the publish runs wrangler with --dry-run.
 * Skipped without a Linux Chromium, like the UI smoke tests; ARKE_E2E=off skips it on purpose.
 */
const SLUG = "ekmek-evi";
const executable = findBrowser();
const factory = { ...tempFactory(), defaultTemplate: "custom" };
const savedToken = process.env.ARKE_CF_MANAGED_API_TOKEN;
let browser: Browser | null = null;
let fp: FakePanel | null = null;

interface Detail {
  status: { stage: string; contentHash: string };
  approvals: Array<{ kind: string; valid: boolean }>;
}

beforeAll(async () => {
  browser = await launchBrowser(executable);
  if (!browser) return;
  // A token in the panel's environment: the agent must never see it (the fake agent fails the job if it does).
  process.env.ARKE_CF_MANAGED_API_TOKEN = "e2e-token-must-not-reach-the-agent";
  fp = await startPanel(factory);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  fp?.panel.close();
  if (savedToken === undefined) delete process.env.ARKE_CF_MANAGED_API_TOKEN;
  else process.env.ARKE_CF_MANAGED_API_TOKEN = savedToken;
});

const e2e = () => (executable ? it : it.skip);
const siteApproved = async (base: string) =>
  (await apiGet<Detail>(base, `/api/clients/${SLUG}`)).approvals.filter((a) => a.kind !== "production").every((a) => a.valid);

describe("end to end: new client to a trial publish", { timeout: 300_000 }, () => {
  e2e()("builds, approves, publishes on trial and takes a change request, all from the panel", async (ctx) => {
    if (!browser || !fp) return ctx.skip();
    const { base } = fp;
    const { page, errors } = await openPanel(browser, base, "#/yeni");

    // 1. The new-client wizard: business, package and price, logo and photos, information, then the summary.
    const next = () => page.click("#nc-next");
    await page.fill("#nc-name", "Ekmek Evi");
    await page.fill("#nc-industry", "bakery");
    await page.selectOption("#nc-country", "GB");
    await next();
    // Package, price and the extras the client asked for: recorded before the first job, so the design follows them.
    await page.click('label[for="nc-package-premium"]');
    await page.fill("#nc-price", "900");
    await page.check("#nc-ad-theme");
    await page.fill("#nc-ad-theme-price", "150");
    await page.check("#nc-ad-whatsapp");
    await next();
    // The logo and a photo are uploaded once the client exists.
    await page.setInputFiles("#nc-logo", { name: "ekmek-logo.png", mimeType: "image/png", buffer: PNG_1PX });
    await page.setInputFiles("#nc-photos", { name: "loaves.png", mimeType: "image/png", buffer: PNG_1PX });
    await next();
    await page.fill("#nc-info", "Family bakery in Leeds. Sourdough £4.50. Phone 0113 496 0000.");
    await next();
    // The summary shows everything before anything is saved or spent.
    const review = page.locator(".nc-review");
    await expect.poll(() => review.textContent()).toContain("Toplam £1.050");
    expect(await review.textContent()).toContain("ekmek-logo.png");
    expect(await review.textContent()).toContain("Premium");
    await page.click("#nc-start");
    await page.waitForURL(new RegExp(`#/musteri/${SLUG}`));
    const created = await jobDone(base, SLUG, "create-site", 1);
    expect(created.status, created.summary).toBe("succeeded");
    expect(created.summary).toContain("Family bakery in Leeds"); // the pasted text reached the agent as client data
    const paths = clientPaths(factory.clientsRoot, SLUG);
    const biz = await apiGet<{ businessTracking: { currency: string; budgetMode: string; price: number; payment: string; addons: Array<{ id: string }> } }>(
      base,
      `/api/clients/${SLUG}`,
    );
    expect(biz.businessTracking.budgetMode).toBe("premium"); // chosen in the form, before the first job
    expect(biz.businessTracking).toMatchObject({ price: 900, payment: "quoted" });
    expect(biz.businessTracking.currency).toBe("GBP");
    expect(biz.businessTracking.addons.map((a) => a.id).sort()).toEqual(["theme", "whatsapp"]);
    // Set as the client's logo before the job started (saved into assets; the scripted agent then rewrites the config).
    const { assets } = await apiGet<{ assets: Array<{ name: string }> }>(base, `/api/clients/${SLUG}`);
    expect(assets.length).toBe(1);
    expect(existsSync(path.join(paths.assetsDir, assets[0]!.name))).toBe(true);
    expect(existsSync(path.join(factory.inboxDir, SLUG, "loaves.png"))).toBe(true); // the photo waits for the agent
    expect(fp.agentRuns[0]!.args).toContain("--disallowedTools");
    // A new design stops at its plan: nothing is built until the operator approves it.
    expect(created.summary).toContain("Tasarım planı hazır");
    expect(existsSync(path.join(paths.distDir, "index.html"))).toBe(false);
    expect(existsSync(path.join(paths.root, "site", "index.html"))).toBe(false);

    // 1b. The plan card: read it, approve it, and the site is built to it.
    await page.reload();
    await page.waitForSelector("#view h1");
    await expect.poll(() => page.locator(".strip-next p").textContent()).toContain("Tasarım planını");
    const plan = page.locator("#design-plan");
    await expect.poll(() => plan.textContent()).toContain("Katmanlı Kabarma");
    expect(await plan.locator(".plan-beats tbody tr").count()).toBe(3);
    expect(await plan.locator("iframe.sig-frame").count()).toBe(1); // the motion plays live in the card
    // The kit is put inline in the sandboxed preview, so the sequence really runs and ends composed.
    const heading = page.frameLocator("iframe.sig-frame").locator("h1");
    expect(await heading.evaluate(() => typeof (window as unknown as { ArkeMotion?: unknown }).ArkeMotion)).toBe("object");
    // The sequence ran on the heading (its animation exists); an off-screen frame may be throttled, so no end-state timing here.
    await expect.poll(() => heading.evaluate((el) => el.getAnimations().length), { timeout: 10_000 }).toBe(1);
    await idle(base);
    await page.click("#plan-approve");
    const built = await jobDone(base, SLUG, "create-site", 2);
    expect(built.status, built.summary).toBe("succeeded");
    expect(existsSync(path.join(paths.distDir, "index.html"))).toBe(true);
    const report = readFileSync(paths.qualityReport, "utf8");
    expect(report).toMatch(/Design plan \(approved by the operator\) \| PASS/);
    expect(report).toMatch(/Signature motion .* \| PASS/);

    // 2. The panel shows the next step: review and approve. A wrong code is refused, the right one approves.
    await page.reload();
    await page.waitForSelector("#view h1");
    await expect.poll(() => page.locator(".strip-next p").textContent()).toContain("onaylayınız");
    await page.locator(".strip-next").getByRole("button", { name: "Onayla" }).click();
    const dialog = page.locator(".approve-dialog");
    await page.fill("#approve-code", "000000");
    await dialog.getByRole("button", { name: "Onayla" }).click();
    await expect.poll(() => dialog.locator(".err").textContent()).toMatch(/Kod yanlış/);
    expect(await siteApproved(base)).toBe(false);
    await page.fill("#approve-code", CODE);
    await dialog.getByRole("button", { name: "Onayla" }).click();
    await expect.poll(() => siteApproved(base)).toBe(true);

    // 3. A trial publish of the preview (wrangler --dry-run: nothing leaves the machine, no deploy is recorded).
    await page.goto(`${base}/#/musteri/${SLUG}/bilgiler`);
    await page.waitForSelector("#view h1");
    await page.check("#dry");
    await page.getByRole("button", { name: "Önizleme yayınla" }).click();
    const deployed = await jobDone(base, SLUG, "deploy", 1);
    expect(deployed.status, deployed.summary).toBe("succeeded");
    expect(existsSync(clientPaths(factory.clientsRoot, SLUG).lastDeploy)).toBe(false);

    // 4. A change request: the agent edits the page, the site is rebuilt and the approval is reset.
    const hashBefore = (await apiGet<Detail>(base, `/api/clients/${SLUG}`)).status.contentHash;
    await page.goto(`${base}/#/musteri/${SLUG}/duzenle`);
    await page.waitForSelector("#composer");
    await idle(base);
    await page.fill("#composer", "Ana başlığı 'Sourdough baked at dawn' yapın.");
    await page.press("#composer", "Control+Enter");
    await expect.poll(() => page.inputValue("#composer")).toBe(""); // the box is emptied once the request is sent
    const revised = await jobDone(base, SLUG, "revise", 1);
    expect(revised.status, revised.summary).toBe("succeeded");
    expect(readFileSync(path.join(clientPaths(factory.clientsRoot, SLUG).distDir, "index.html"), "utf8")).toContain("Sourdough baked at dawn");
    expect((await apiGet<Detail>(base, `/api/clients/${SLUG}`)).status.contentHash).not.toBe(hashBefore);
    expect(await siteApproved(base)).toBe(false);

    // 5. Every job left a version to go back to, and no screen threw.
    const { versions } = await apiGet<{ versions: Array<{ message: string }> }>(base, `/api/clients/${SLUG}/versions`);
    expect(versions.some((v) => v.message.startsWith("Önce:"))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe("the fake agent's boundary checks", { timeout: 60_000 }, () => {
  it("fail the job when a Cloudflare variable or an allowed shell reaches the agent", () => {
    const tsx = path.join(FACTORY_ROOT, "node_modules", ".bin", "tsx");
    const agent = path.join(FACTORY_ROOT, "tests", "e2e", "fake-agent.ts");
    const run = (env: NodeJS.ProcessEnv, args: string[]) => {
      const r = spawnSync(tsx, [agent, ...args], { input: 'Arke Web Studio, client "x-co".', encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
      return (JSON.parse(r.stdout.trim().split("\n").at(-1)!) as { result: string }).result;
    };
    expect(run({ ARKE_CF_MANAGED_API_TOKEN: "t" }, ["--disallowedTools", "Bash,Edit,Write,mcp__arke-web__deploy"])).toMatch(/^BOUNDARY: Cloudflare/);
    expect(run({}, ["--disallowedTools", "Edit,Write"])).toMatch(/^BOUNDARY: Bash is not denied/);
  });
});
