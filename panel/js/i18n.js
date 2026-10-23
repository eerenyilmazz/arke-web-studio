// Panel language. The panel is written in Turkish; in English mode every text that reaches the page (built by h(),
// set with textContent, a toast, a server message) is translated where it lands, from the dictionary in
// i18n-en.js. One place, no change to the screens: a text without an entry simply stays Turkish.
// Client data must not be translated: mark its container with data-no-i18n (portal answers, agent messages…).
import { EN } from "./i18n-en.js";

export const LANGS = { tr: "Türkçe", en: "English" };
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
const STORE_KEY = "arke-lang";

let lang = "tr";
const exact = new Map(Object.entries(EN.exact));
const patterns = EN.patterns.map(([tr, en]) => ({
  re: new RegExp(
    `^${tr
      .split("{}")
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("([\\s\\S]+?)")}$`,
  ),
  en,
}));
/** Texts seen in English mode without an entry: names and data, or a gap in the dictionary (the tests read it). */
export const missing = new Set();

export function getLang() {
  return lang;
}

/** Locale for dates and numbers. */
export function locale() {
  return lang === "en" ? "en-GB" : "tr-TR";
}

/** Texts that already are English (a translated text seen again is not "missing"). */
const english = new Set([...exact.values()]);
const MAX_DEPTH = 3;

/** One text without its surrounding spaces, or undefined. Variable parts are translated the same way, then as a list. */
function translateCore(core, depth) {
  const hit = exact.get(core);
  if (hit !== undefined || depth >= MAX_DEPTH) return hit;
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    let i = 1;
    return p.en.replace(/\{\}/g, () => part(m[i++] ?? "", depth + 1));
  }
  return undefined;
}

/** A variable part: as a whole, else item by item ("Home, Contact"), else as it is (a name, a number). */
function part(text, depth) {
  const core = text.trim();
  const whole = translateCore(core, depth);
  if (whole !== undefined) return text.replace(core, whole);
  for (const sep of [", ", "; "]) {
    if (core.includes(sep))
      return core
        .split(sep)
        .map((x) => translateCore(x, depth) ?? x)
        .join(sep);
  }
  return text;
}

/** The English of one Turkish text, or the text itself. */
export function t(text) {
  if (lang === "tr" || typeof text !== "string") return text;
  const core = text.trim();
  if (!core) return text;
  const out = translateCore(core, 0);
  if (out === undefined) {
    if (/\p{L}/u.test(core) && !english.has(core)) missing.add(core);
    return text;
  }
  return text.replace(core, out);
}

const translated = new WeakSet();

function skip(el) {
  return !el || SKIP_TAGS.has(el.tagName) || Boolean(el.closest?.("[data-no-i18n]"));
}

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (translated.has(node) || skip(node.parentElement)) return;
    const next = t(node.nodeValue);
    translated.add(node);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest("[data-no-i18n]")) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v) {
      const next = t(v);
      if (next !== v) node.setAttribute(a, next);
    }
  }
  if (SKIP_TAGS.has(node.tagName)) return;
  for (const child of node.childNodes) translateNode(child);
}

let observer = null;

/** Sets the language and, for English, translates the page now and everything added to it from then on. */
export function setLang(next) {
  lang = next === "en" ? "en" : "tr";
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    // private window: the server setting still applies at the next start
  }
  observer?.disconnect();
  observer = null;
  if (lang === "tr") return;
  translateNode(document.body);
  document.title = t(document.title);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") {
        translated.delete(r.target);
        translateNode(r.target);
      } else if (r.type === "attributes") translateNode(r.target);
      else for (const n of r.addedNodes) translateNode(n);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** The language remembered in this browser, used until the server setting arrives (no Turkish flash). */
export function rememberedLang() {
  try {
    return localStorage.getItem(STORE_KEY) === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
}
