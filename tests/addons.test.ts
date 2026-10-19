import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/paths.js";
import { addonsNote, addonsTotal } from "../src/panel/addons.js";
import { readBusiness, writeBusiness } from "../src/panel/business.js";
import { clientProfit } from "../src/panel/profit.js";
import { finalPrompt } from "../src/panel/prompts.js";
import * as tools from "../src/tools.js";
import { tempFactory } from "./helpers.js";

describe("extras sold per client", () => {
  it("tells the agent exactly what was sold, and nothing for clients without a list", () => {
    expect(addonsNote(undefined)).toBeNull();
    const none = addonsNote([])!;
    expect(none).toMatch(/One theme only/);
    expect(none).toMatch(/No WhatsApp button/);
    expect(none).toMatch(/No blog/);
    const some = addonsNote([
      { id: "theme", price: 500 },
      { id: "language", price: null, value: "de" },
    ])!;
    expect(some).toMatch(/Light and dark theme/);
    expect(some).toMatch(/second language \(German\)/);
    expect(some).toMatch(/No online booking button/);
    const prompt = finalPrompt("Do it.", { skills: "none", screenshots: true, addons: some });
    expect(prompt).toContain("What Eren sold to this client");
    expect(finalPrompt("Do it.", { skills: "none", screenshots: true, addons: null })).not.toContain("What Eren sold");
  });

  it("keeps old business records as they are and counts extras into the total and profit", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "add-co", businessName: "Add Co", industry: "bakery", hostingModel: "managed" });
    writeBusiness(f, "add-co", { price: 1000, currency: "GBP" });
    expect(readBusiness(f, "add-co")!.addons).toBeUndefined(); // an old client stays "no list": the agent works as before
    expect(clientProfit(f, "add-co", "Add Co").price).toBe(1000);
    writeBusiness(f, "add-co", {
      price: 1000,
      currency: "GBP",
      addons: [
        { id: "theme", price: 150 },
        { id: "blog", price: null },
      ],
    });
    const b = readBusiness(f, "add-co")!;
    expect(addonsTotal(b.addons)).toBe(150);
    expect(clientProfit(f, "add-co", "Add Co").price).toBe(1150);
    expect(() => writeBusiness(f, "add-co", { addons: [{ id: "theme" }, { id: "theme" }] })).toThrow();
    expect(() => writeBusiness(f, "add-co", { addons: [{ id: "rocket" }] })).toThrow();
    // Never shown to the agent: the record lives in .factory, which the agent cannot read.
    expect(readFileSync(path.join(clientPaths(f.clientsRoot, "add-co").factoryDir, "business.json"), "utf8")).toContain('"theme"');
  });
});
