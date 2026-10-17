import { describe, expect, it } from "vitest";
import { applyHtmlChanges, contentTexts, decodeEntities, htmlTexts, setContentText } from "../src/lib/site-texts.js";

const PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Mono &amp; Co | Ana sayfa</title>
<meta name="description" content="Ankara&#39;da erkek kuaförü"></head>
<body><header><a href="/">Mono</a></header>
<main><h1 class="hero">Kesim &amp; sakal</h1><p>Randevu   için
 arayın.</p><ul><li>Saç kesimi</li><li>Sakal</li></ul>
<img src="/a.jpg" alt="Dükkanın içi"><script>const x = "<p>not a text</p>";</script>
<svg><text>logo</text></svg><button>Ara</button></main></body></html>`;

describe("texts of a page, by id", () => {
  it("lists title, description and visible texts with stable ids", () => {
    const items = htmlTexts(PAGE);
    const byId = Object.fromEntries(items.map((t) => [t.id, t.text]));
    expect(items[0]!.id).toBe("title");
    expect(byId["meta-description"]).toBe("Ankara'da erkek kuaförü");
    expect(byId["h1-1"]).toBe("Kesim & sakal");
    expect(byId["p-1"]).toBe("Randevu için arayın.");
    expect(byId["li-2"]).toBe("Sakal");
    expect(byId["alt-1"]).toBe("Dükkanın içi");
    expect(byId["button-1"]).toBe("Ara");
    // Scripts and SVG text are not page texts.
    expect(items.some((t) => t.text.includes("not a text") || t.text === "logo")).toBe(false);
  });

  it("writes changes exactly where they were, escaped, and refuses stale ones", () => {
    const out = applyHtmlChanges(PAGE, [
      { id: "h1-1", oldText: "Kesim & sakal", newText: "Kesim, sakal & bakım" },
      { id: "meta-description", oldText: "Ankara'da erkek kuaförü", newText: 'Ankara\'nın "en iyi" kuaförü' },
      { id: "p-1", oldText: "Randevu için arayın.", newText: "Randevu <hemen>" },
    ]);
    expect(out).toContain("<h1 class=\"hero\">Kesim, sakal &amp; bakım</h1>");
    expect(out).toContain('content="Ankara\'nın &quot;en iyi&quot; kuaförü"');
    expect(out).toContain("<p>Randevu &lt;hemen&gt;</p>");
    expect(out).toContain("<li>Saç kesimi</li>");
    expect(htmlTexts(out).find((t) => t.id === "h1-1")?.text).toBe("Kesim, sakal & bakım");
    expect(() => applyHtmlChanges(PAGE, [{ id: "h1-1", oldText: "Something else", newText: "x" }])).toThrow(/değişmiş/);
  });

  it("template sites: content fields by JSON path", () => {
    const content = { hero: { title: "Hello", cta: "/contact" }, services: [{ title: "Cut", description: "A good cut" }], seo: { home: { description: "Barber in Leeds" } } };
    const ids = contentTexts(content).map((t) => t.id);
    expect(ids).toEqual(["hero.title", "services.0.title", "services.0.description", "seo.home.description"]);
    const next = setContentText(content, "services.0.description", "A good cut", "The best cut") as typeof content;
    expect(next.services[0]!.description).toBe("The best cut");
    expect(content.services[0]!.description).toBe("A good cut");
    expect(() => setContentText(content, "__proto__.x", "", "y")).toThrow();
    expect(() => setContentText(content, "hero.title", "Old", "y")).toThrow(/değişmiş/);
  });

  it("decodes the usual entities", () => {
    expect(decodeEntities("A&nbsp;&rsquo;B&#x27;&#39;&amp;")).toBe("A ’B''&");
  });
});
