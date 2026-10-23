// Ayarlar: updating Arke Web Studio from the panel, and sharing clients with a team through one Git repository.
import { api, guarded, h, time, toast } from "./core.js";

const POLL_MS = 1500;

/** Version and update. Git installs update here; zip installs show the command. */
export function updateCard() {
  const card = h("section", { class: "card stack", id: "update-card" }, h("h2", { text: "Güncelleme" }), h("p", { class: "muted", text: "Yükleniyor…" }));
  const log = h("pre", { class: "update-log", hidden: true });
  const draw = (status, progress) => {
    const head = h("h2", { text: "Güncelleme" });
    const line = h("p", {}, h("strong", { text: `Sürüm ${status.current}` }), " · ", h("span", { text: status.message }));
    const check = h("button", { class: "btn btn-sm", type: "button", onclick: () => load(true) }, "Güncellemeleri Denetle");
    const actions = h("div", { class: "row" });
    if (status.mode === "git") {
      actions.append(check);
      if (status.behind > 0 && !status.dirty && !progress?.running)
        actions.append(
          h(
            "button",
            {
              class: "btn btn-sm btn-primary",
              type: "button",
              onclick: async () => {
                const r = await guarded(() => api("POST", "/api/update"));
                if (r) follow();
              },
            },
            `Güncelle (${status.current} → ${status.latest ?? "?"})`,
          ),
        );
    }
    const help =
      status.mode === "zip"
        ? h("p", { class: "muted small" }, "Zip ile kurulmuş. Yeni sürüm zip'ini indirip terminalde çalıştırın: ", h("code", { text: "arke-update <zip>" }))
        : h("p", { class: "muted small", text: "Güncelleme kurulum klasöründeki değişikliklerin üzerine yazmaz. Bitince paneli yeniden başlatmanız gerekir." });
    if (progress && (progress.running || progress.done || progress.error)) {
      log.hidden = false;
      log.textContent = [...progress.log, progress.error ? `\n${progress.error}` : ""].join("\n").trim();
    }
    card.replaceChildren(head, line, help, actions, log);
  };
  const load = async (fetchRemote = false) => {
    const r = await guarded(() => api("GET", `/api/update${fetchRemote ? "?check=1" : ""}`));
    if (r) draw(r.status, r.progress);
    return r;
  };
  const follow = async () => {
    const r = await load();
    if (r?.progress?.running) setTimeout(follow, POLL_MS);
    else if (r?.progress?.done) toast("Güncelleme bitti. Paneli yeniden başlatın.");
  };
  load().then((r) => r?.progress?.running && follow());
  return card;
}

/** Team sharing: connect the team's Git repository, sync, see who changed what. */
export function teamCard() {
  const card = h("section", { class: "card stack", id: "team-card" }, h("h2", { text: "Ekip" }), h("p", { class: "muted", text: "Yükleniyor…" }));
  const result = h("p", { class: "small", role: "status" });
  const connectForm = () => {
    const input = h("input", {
      id: "team-remote",
      type: "text",
      spellcheck: "false",
      autocomplete: "off",
      maxlength: 300,
      placeholder: "https://github.com/ekip/musteriler.git",
    });
    return h(
      "form",
      {
        class: "stack",
        onsubmit: async (e) => {
          e.preventDefault();
          const r = await guarded(() => api("PUT", "/api/team", { remote: input.value }));
          if (r) {
            toast(`Ekip deposu bağlandı (${r.sharedClients} paylaşılan müşteri).`);
            load();
          }
        },
      },
      h("label", { for: input.id }, "Ekip deposu (özel bir Git deposu)"),
      input,
      h("p", {
        class: "muted small",
        text: "Herkes aynı depoyu bağlar. Giriş bilgileri sizin git girişinizdir (ör. gh auth login); panel parola saklamaz. ArkeLab ekibinizin deposunu da kullanabilirsiniz.",
      }),
      h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Bağla")),
    );
  };
  const describe = (r) => {
    const parts = [];
    if (r.pushed.length) parts.push(`gönderilen: ${r.pushed.join(", ")}`);
    if (r.pulled.length) parts.push(`alınan: ${r.pulled.join(", ")}`);
    if (r.added.length) parts.push(`yeni gelen: ${r.added.join(", ")}`);
    if (r.conflicts.length)
      parts.push(`çakışma: ${r.conflicts.join(", ")} (aynı müşteride iki kişi değişiklik yapmış; birinin değişikliği alınmadan eşitlenmez)`);
    if (r.skipped.length) parts.push(`atlanan: ${r.skipped.map((s) => `${s.slug} (${s.reason})`).join(", ")}`);
    return parts.length ? parts.join(" · ") : "Her şey güncel.";
  };
  const draw = (t) => {
    const head = h("h2", { text: "Ekip" });
    if (!t.remote) {
      card.replaceChildren(
        head,
        h("p", {
          class: "muted small",
          text: "Aynı müşteriler üzerinde birkaç kişi çalışacaksa ekip deposunu bağlayın. Onaylar ve Cloudflare hesapları paylaşılmaz; herkes kendi panelinde onaylar ve kendi hesabıyla yayınlar.",
        }),
        connectForm(),
      );
      return;
    }
    const sync = h(
      "button",
      {
        class: "btn btn-primary btn-sm",
        type: "button",
        onclick: async () => {
          sync.disabled = true;
          result.textContent = "Eşitleniyor…";
          const r = await guarded(() => api("POST", "/api/team/sync"));
          sync.disabled = false;
          if (!r) {
            result.textContent = "";
            return;
          }
          result.className = `small ${r.conflicts.length ? "err" : "ok-text"}`;
          result.textContent = describe(r);
          load(false);
        },
      },
      "Şimdi Eşitle",
    );
    const leave = h(
      "button",
      {
        class: "btn btn-sm",
        type: "button",
        onclick: async () => {
          if (await guarded(() => api("DELETE", "/api/team"))) {
            toast("Bu panel artık eşitlemiyor; müşteriler yerinde duruyor.");
            load();
          }
        },
      },
      "Bağlantıyı Kes",
    );
    const rows = t.clients.map((c) =>
      h(
        "tr",
        {},
        h("td", { text: c.slug }),
        h("td", {}, h("span", { class: `badge ${c.shared ? "ok" : "warn"}`, text: c.shared ? "paylaşılıyor" : "henüz gönderilmedi" })),
        h("td", { text: c.ahead || c.behind ? `${c.ahead} gönderilecek · ${c.behind} alınacak` : "—" }),
        h("td", { text: c.lastBy ? `${c.lastBy}${c.lastAt ? ` · ${time(c.lastAt)}` : ""}` : "—" }),
      ),
    );
    card.replaceChildren(
      head,
      h("p", {}, h("span", { class: "badge ok", text: "bağlı" }), " ", h("code", { text: t.remote })),
      h("p", {
        class: "muted small",
        text: `Değişiklikler "${t.profileName || "profil adınız"}" adıyla kaydedilir. Paylaşılanlar: site bilgileri, metinler, görseller, site kodu, tasarım planı, araştırma notları, satış takibi.`,
      }),
      h("div", { class: "row" }, sync, leave),
      result,
      t.clients.length
        ? h(
            "div",
            { class: "table-scroll" },
            h(
              "table",
              { class: "data-table" },
              h("thead", {}, h("tr", {}, ...["Müşteri", "Durum", "Bekleyen", "Son değiştiren"].map((x) => h("th", { text: x })))),
              h("tbody", {}, ...rows),
            ),
          )
        : h("p", { class: "muted small", text: "Henüz müşteri yok. Eşitleyince ekibin müşterileri buraya gelir." }),
    );
  };
  const load = async () => {
    const t = await guarded(() => api("GET", "/api/team"));
    if (t) draw(t);
  };
  load();
  return card;
}
