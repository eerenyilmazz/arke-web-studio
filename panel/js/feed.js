// Agent job blocks and the record of past work.
import { h, ICON, state, svg, time, usageLine } from "./core.js";
import { cancelJob, jobProgress, runAgent } from "./jobs.js";

export function toolChips(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  return h("div", { class: "tools" }, ...[...counts].map(([n, c]) => h("span", { class: "tool", text: c > 1 ? `${n} ×${c}` : n })));
}

/** The request for continuing a change request that stopped at its cap. */
export function continueText(request) {
  return `Bu talep token tavanında yarıda kaldı; yazılanlar duruyor. Yapılmış olanı yeniden yapma: önce site_map ve get_client_status ile neyin bittiğine bak, sonra yalnızca kalan adımları tamamla ve build al.\n\nÖnceki talep:\n${request}`.slice(
    0,
    19_000,
  );
}

export const STATUS_BADGE = { succeeded: ["ok", "tamamlandı"], failed: ["bad", "başarısız"], cancelled: ["skip", "iptal"], running: ["accent", "çalışıyor"] };

export function agentBlock(job, live) {
  const [cls, label] = STATUS_BADGE[job.status] || ["skip", job.status];
  const isAgent = !["build", "deploy"].includes(job.kind);
  const parts = [];
  if (live) {
    if (isAgent) parts.push(jobProgress(job));
    const lines = h("details", { class: "live-details" }, h("summary", { text: "Ayrıntılı kayıt" }), h("div", { class: "live-lines", id: "live-lines" }));
    appendLiveLines(lines.querySelector("#live-lines"), job.log || []);
    parts.push(lines);
    parts.push(
      h(
        "div",
        { class: "row" },
        h("span", { class: "typing", role: "img", "aria-label": "çalışıyor" }, h("span"), h("span"), h("span")),
        isAgent && h("button", { class: "btn btn-sm", type: "button", onclick: () => cancelJob(job.id) }, "Durdur"),
      ),
    );
  } else {
    if (job.tools?.length) parts.push(toolChips(job.tools));
    const used = usageLine(job);
    if (used) parts.push(used);
    if (job.summary) parts.push(richText(job.summary));
    const errs = job.errors || [];
    // A finished job's tool errors were stumbles the agent got past (a wrong field name, a site that did not
    // open): folded, so they do not read as a failure. A failed job shows them open.
    if (errs.length && job.status === "succeeded")
      parts.push(
        h(
          "details",
          { class: "job-errors" },
          h("summary", { text: `Yolda ${errs.length} hata oldu, agent devam etti` }),
          ...errs.map((e) => h("p", { class: "err", text: e })),
        ),
      );
    else for (const e of errs) parts.push(h("p", { class: "err", text: e }));
    // A change request stopped at its token cap: one press continues it, without redoing what was already written.
    const slug = state.detail?.status?.slug;
    if (job.status === "failed" && job.kind === "revise" && job.request && slug && errs.some((e) => e.includes("token tavanı")))
      parts.push(
        h(
          "div",
          { class: "row" },
          h(
            "button",
            { type: "button", class: "btn btn-sm", onclick: () => runAgent(slug, "revise", { request: continueText(job.request) }) },
            "Kaldığı yerden devam et",
          ),
        ),
      );
  }
  return h(
    "div",
    { class: "msg-agent" },
    h("span", { class: "who", "aria-hidden": "true" }, svg(isAgent ? ICON.spark : ICON.check, 16)),
    h(
      "div",
      { class: "body" },
      h(
        "div",
        { class: "head" },
        h("strong", { text: isAgent ? `Agent · ${job.title}` : job.title }),
        h("span", { class: `badge ${cls}`, text: label }),
        h("span", { text: time(job.endedAt || job.startedAt) }),
      ),
      ...parts,
    ),
  );
}

/**
 * The agent writes its summary in light Markdown (**bold**, - bullets, `code`). Rendered into DOM nodes
 * with textContent only, so nothing in the text can become HTML.
 */
export function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    out.push(m[1] !== undefined ? h("strong", { text: m[1] }) : h("code", { text: m[2] }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

export function richText(text) {
  const root = h("div", { class: "summary rich", "data-no-i18n": "" });
  let list = null;
  let depth = 0;
  for (const raw of text.split("\n")) {
    const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      const indent = bullet[1].length >= 2 ? 1 : 0;
      if (!list || indent !== depth) {
        if (indent > depth && list?.lastElementChild) {
          const sub = h("ul");
          list.lastElementChild.append(sub);
          list = sub;
        } else if (indent < depth || !list) {
          list = h("ul");
          root.append(list);
        }
        depth = indent;
      }
      list.append(h("li", {}, ...inline(bullet[2])));
      continue;
    }
    list = null;
    depth = 0;
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    root.append(heading ? h("p", { class: "rich-h" }, ...inline(heading[1])) : h("p", {}, ...inline(line)));
  }
  return root;
}

export function appendLiveLines(container, lines) {
  for (const line of lines) {
    if (line.kind === "tool") {
      let chips = container.lastElementChild;
      if (!chips || !chips.classList.contains("tools")) {
        chips = h("div", { class: "tools" });
        container.append(chips);
      }
      chips.append(h("span", { class: "tool", text: line.text.split("(")[0] }));
    } else if (line.kind === "error") container.append(h("p", { class: "err", text: line.text }));
    else if (line.kind === "result") container.append(richText(line.text));
    else container.append(h("p", { class: line.kind === "agent" ? "agent" : "info", text: line.text, "data-no-i18n": line.kind === "agent" ? "" : null }));
  }
}

export function drawFeed(feed, d) {
  const items = [];
  for (const job of d.history) {
    items.push(h("div", { class: "msg-user" }, job.request || job.title, h("span", { class: "when", text: time(job.startedAt) })));
    items.push(agentBlock(job, false));
  }
  const running = d.running;
  if (running) {
    items.push(h("div", { class: "msg-user" }, running.request || running.title, h("span", { class: "when", text: time(running.startedAt) })));
    items.push(agentBlock(running, true));
    state.logSince = running.logTotal ?? (running.log || []).length;
  }
  // The approval step itself is shown once, in the "now" card above the tabs.
  if (!items.length)
    items.push(
      h(
        "div",
        { class: "feed-empty" },
        h("p", { text: "Henüz talep bulunmuyor." }),
        h("p", { class: "small", text: "Formlarda bulunmayan bir değişikliği aşağıya yazabilirsiniz." }),
      ),
    );
  feed.replaceChildren(...items);
}
