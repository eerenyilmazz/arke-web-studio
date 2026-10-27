import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/core/paths.js";
import { checkCounts, clientAnalytics, siteFacts } from "../src/panel/analytics.js";
import { writeBusiness } from "../src/panel/business.js";
import { appendHistory } from "../src/panel/history.js";
import type { JobRecord } from "../src/panel/jobs.js";
import * as tools from "../src/tools.js";
import { tempFactory } from "./helpers.js";

const write = (file: string, text: string | Buffer) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const job = (startedAt: string, minutes: number, status: JobRecord["status"] = "succeeded"): JobRecord => ({
  id: startedAt,
  kind: "create-site",
  title: "Siteyi hazırla",
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
  status,
  tools: [],
  errors: [],
});

describe("analysis table", () => {
  it("measures a built site: pages, page weight with shared CSS/JS, images and the largest one", () => {
    const f = tempFactory();
    const dist = path.join(f.base, "dist");
    expect(siteFacts(dist)).toBeNull();
    write(path.join(dist, "index.html"), "x".repeat(1000));
    write(path.join(dist, "about/index.html"), "x".repeat(3000));
    write(path.join(dist, "404.html"), "x".repeat(50_000)); // not a page of the site
    write(path.join(dist, "css/site.css"), "x".repeat(500));
    write(path.join(dist, "js/kit.js"), "x".repeat(100));
    write(path.join(dist, "img/hero.webp"), Buffer.alloc(90_000));
    write(path.join(dist, "img/logo.svg"), Buffer.alloc(2_000));
    const s = siteFacts(dist)!;
    expect(s.pages).toBe(2);
    expect(s.pageBytes).toBe(2000 + 600);
    expect(s.images).toBe(2);
    expect(s.imageBytes).toBe(92_000);
    expect(s.largestImage).toEqual({ file: "img/hero.webp", bytes: 90_000 });
  });

  it("counts the quality report's results", () => {
    const f = tempFactory();
    const file = path.join(f.base, "quality-report.md");
    expect(checkCounts(file)).toBeNull();
    write(file, "| Check | Result | Detail |\n| --- | --- | --- |\n| A | PASS | ok |\n| B | WARN | x |\n| C | PASS | ok |\n| D | FAIL | no |\n");
    expect(checkCounts(file)).toEqual({ pass: 2, warn: 1, fail: 1 });
  });

  it("joins business, money, jobs, checks and deploys per client, and flags what is late", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "an-co", businessName: "An Co", industry: "bakery", hostingModel: "managed", country: "GB" });
    await tools.createClient(f, { slug: "bare-co", businessName: "Bare Co", industry: "joinery", hostingModel: "client" });
    writeBusiness(f, "an-co", {
      price: 900,
      currency: "GBP",
      payment: "quoted",
      deadline: "2026-01-10",
      paymentDue: "2026-01-20",
      tags: ["Leeds"],
      costs: [{ label: "domain", amount: 15 }],
      budgetMode: "premium",
      addons: [{ id: "theme", price: 150 }],
    });
    appendHistory(f, "an-co", job("2026-01-01T10:00:00.000Z", 12));
    appendHistory(f, "an-co", job("2026-01-03T10:00:00.000Z", 3, "failed"));
    const p = clientPaths(f.clientsRoot, "an-co");
    write(p.lastDeploy, JSON.stringify({ hash: "h", at: "2026-01-06T10:00:00.000Z", target: "production", url: "https://an.example.com" }));
    write(p.qualityReport, "| A | PASS | ok |\n| B | FAIL | no |\n");

    const rows = clientAnalytics(f, new Date("2026-02-01T00:00:00Z"));
    const an = rows.find((r) => r.slug === "an-co")!;
    expect(an).toMatchObject({ name: "An Co", country: "GB", packageMode: "premium", addons: ["theme"], tags: ["Leeds"], currency: "GBP", price: 1050 });
    expect(an.extraCosts).toBe(15);
    expect(an.jobs).toMatchObject({ total: 2, failed: 1, minutes: 15 });
    expect(an.daysToLive).toBe(5);
    expect(an.checks).toEqual({ pass: 1, warn: 0, fail: 1 });
    expect(an.latePayment).toBe(true);
    expect(an.lateDelivery).toBe(an.stage !== "live");
    const bare = rows.find((r) => r.slug === "bare-co")!;
    expect(bare).toMatchObject({ hosting: "client", price: null, checks: null, site: null, daysToLive: null, latePayment: false, lateDelivery: false });
  });
});
