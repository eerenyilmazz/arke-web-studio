// Client portal: setup card (Settings → Yayın) and the per-client links card (Müşteri Bilgileri).
import { api, ask, copyButton, guarded, h, isBusy, time, toast } from "./core.js";
import { runAgent } from "./jobs.js";
import { render } from "./router.js";

const LINK_KIND_TR = { intake: "Bilgi formu", review: "Yorum ve onay" };

/** Settings card: one-time setup on Eren's Cloudflare account. The secret is never shown. */
export function portalSettingsCard() {
  const card = h(
    "section",
    { class: "card stack portal-settings" },
    h("h2", { text: "Müşteri Portalı" }),
    h("p", { class: "muted small", text: "Yükleniyor…" }),
  );
  void (async () => {
    const st = await guarded(() => api("GET", "/api/portal"));
    if (!st) return;
    const out = h("p", { class: "small", role: "status" });
    const setup = async (btn) => {
      btn.disabled = true;
      out.className = "small";
      out.textContent = "Kuruluyor… (1–2 dakika sürebilir)";
      const r = await guarded(() => api("POST", "/api/portal/setup"));
      btn.disabled = false;
      if (r) {
        toast("Portal hazır.");
        render();
      } else out.textContent = "";
    };
    const cfReady = st.cloudflare?.managed?.token && st.cloudflare?.managed?.accountId;
    card.replaceChildren(
      h(
        "div",
        { class: "row", style: "justify-content:space-between" },
        h("h2", { text: "Müşteri Portalı" }),
        h("span", { class: `badge ${st.configured ? "ok" : "warn"}`, text: st.configured ? "hazır" : "kurulmadı" }),
      ),
      h("p", {
        class: "muted small",
        text: "Müşteriye bir link gönderirsiniz: bilgilerini ve fotoğraflarını bir formdan yollar ya da önizlemeye bakıp yorum yazar ve onaylar. Gelenler 5 dakikada bir panele alınır. Cloudflare'in ücretsiz planında çalışır (günde 1.000 gönderime kadar).",
      }),
      st.configured && h("p", { class: "small" }, "Adres: ", h("code", { text: st.url }), " · kuruldu: ", time(st.at)),
      h(
        "ol",
        { class: "setup-steps" },
        h(
          "li",
          {},
          h("strong", { text: "Token'a izin ekle: " }),
          "Cloudflare → Profil → API Tokens → mevcut token'da ",
          h("em", { text: "Edit" }),
          " → Permissions'a ",
          h("em", { text: "Account · Workers KV Storage · Edit" }),
          " ekle → Continue → Update. Token değişmez, yeniden kaydetmen gerekmez.",
        ),
        h(
          "li",
          {},
          h("strong", { text: st.configured ? "Güncelle: " : "Kur: " }),
          h(
            "button",
            { class: "btn btn-sm", type: "button", disabled: !cfReady, onclick: (e) => setup(e.currentTarget) },
            st.configured ? "Portalı güncelle" : "Portalı kur",
          ),
          !cfReady ? h("span", { class: "muted small", text: " Önce yukarıdaki Cloudflare bağlantısını tamamlayınız." }) : null,
          " ",
          out,
        ),
      ),
      h("p", {
        class: "muted small",
        text: "Portal anahtarı yalnızca bu bilgisayarda (~/.config/site-factory) durur; agent'a hiç verilmez. Linkler 60 gün geçerlidir; istediğinizde kapatabilirsiniz.",
      }),
    );
  })();
  return card;
}

/** Per-client card: links, what the client sent, approval. */
export function portalCard(d) {
  const slug = d.status.slug;
  const box = h("div", { class: "stack portal-card" }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  const load = async () => {
    const p = await guarded(() => api("GET", `/api/clients/${slug}/portal`));
    if (!p) return;
    if (!p.configured) {
      box.replaceChildren(
        h("p", { class: "muted small" }, "Müşteri portalı kurulmadı. ", h("a", { href: "#/ayarlar" }, "Ayarlar → Yayın → Müşteri Portalı"), "."),
      );
      return;
    }
    const create = async (kind) => {
      const link = await guarded(() => api("POST", `/api/clients/${slug}/portal/links`, { kind }));
      if (link) {
        toast(`${LINK_KIND_TR[kind]} linki hazır.`);
        load();
      }
    };
    const close = async (l) => {
      if (!(await ask({ title: "Link kapatılsın mı?", body: "Müşteri bu linki artık açamaz. Gelmiş olanlar silinmez.", confirm: "Kapat", danger: true })))
        return;
      if (await guarded(() => api("DELETE", `/api/clients/${slug}/portal/links/${l.token}`))) load();
    };
    const pull = async (btn) => {
      btn.disabled = true;
      const r = await guarded(() => api("POST", "/api/portal/pull"));
      btn.disabled = false;
      if (r) {
        toast(r.intake + r.comments + r.approvals ? `Yeni: ${r.intake} form, ${r.comments} yorum, ${r.approvals} onay` : "Yeni bir şey yok.");
        load();
      }
    };
    const mark = async (kind, id, patch) => {
      if (await guarded(() => api("POST", `/api/clients/${slug}/portal/${kind}/${encodeURIComponent(id)}`, patch))) load();
    };
    const useIntake = async (e) => {
      const answers = Object.fromEntries(Object.entries(e.answers).map(([id, a]) => [id, a.answer]));
      if (await runAgent(slug, "answers", { answers, freeText: e.freeText })) mark("intake", e.id, { used: true });
    };
    const open = p.comments.filter((f) => f.status === "open");

    const links = p.links.length
      ? h(
          "ul",
          { class: "portal-links" },
          ...p.links.map((l) =>
            h(
              "li",
              { class: "row" },
              h("strong", { text: LINK_KIND_TR[l.kind] }),
              h("code", { class: "portal-url", text: l.url }),
              copyButton(l.url, "Linki kopyala"),
              h("span", { class: "muted small", text: `${time(l.expiresAt)} tarihine kadar` }),
              h("button", { class: "btn btn-sm", type: "button", onclick: () => close(l) }, "Kapat"),
            ),
          ),
        )
      : h("p", { class: "muted small", text: "Henüz link yok." });

    const intake = p.intake.length
      ? h(
          "div",
          { class: "stack" },
          h("h3", { text: "Gelen bilgi formları" }),
          ...p.intake
            .slice()
            .reverse()
            .map((e) =>
              h(
                "details",
                { class: "card portal-entry" },
                h(
                  "summary",
                  {},
                  `${time(e.at)} · ${Object.keys(e.answers).length} cevap${e.files.length ? `, ${e.files.length} dosya` : ""}`,
                  e.used ? h("span", { class: "badge ok", text: "işlendi" }) : null,
                ),
                h("dl", { class: "portal-kv" }, ...Object.values(e.answers).flatMap((a) => [h("dt", { text: a.question }), h("dd", { text: a.answer })])),
                e.freeText ? h("p", { class: "portal-free", text: e.freeText }) : null,
                e.files.length ? h("p", { class: "muted small", text: `Dosyalar (Logo ve Görseller'de): ${e.files.join(", ")}` }) : null,
                h(
                  "div",
                  { class: "row" },
                  h("button", { class: "btn btn-sm btn-primary", type: "button", disabled: isBusy(), onclick: () => useIntake(e) }, "Agent'a işlet"),
                ),
              ),
            ),
        )
      : null;

    const comments = p.comments.length
      ? h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "row", style: "justify-content:space-between" },
            h("h3", { text: "Müşteri yorumları" }),
            open.length
              ? h(
                  "button",
                  {
                    class: "btn btn-sm btn-primary",
                    type: "button",
                    disabled: isBusy(),
                    onclick: async () => {
                      if (await runAgent(slug, "portal-comments", { ids: open.map((f) => f.id) })) load();
                    },
                  },
                  `Açık ${open.length} yorumu agent'a ilet`,
                )
              : null,
          ),
          h(
            "ul",
            { class: "portal-comments" },
            ...p.comments
              .slice()
              .reverse()
              .map((f) =>
                h(
                  "li",
                  { class: `portal-comment ${f.status}` },
                  h(
                    "div",
                    { class: "row" },
                    h("strong", { text: f.page || "genel" }),
                    h("span", { class: "muted small", text: time(f.at) }),
                    h("span", {
                      class: `badge ${f.status === "open" ? "warn" : "ok"}`,
                      text: f.status === "open" ? "açık" : f.status === "sent" ? "agent'a iletildi" : "çözüldü",
                    }),
                    f.status !== "done"
                      ? h("button", { class: "btn btn-sm", type: "button", onclick: () => mark("comments", f.id, { status: "done" }) }, "Çözüldü")
                      : null,
                  ),
                  h("p", { text: f.text }),
                ),
              ),
          ),
        )
      : null;

    const approval = p.approval
      ? h(
          "p",
          { class: "portal-approval" },
          h("span", { class: "badge ok", text: "Müşteri onayladı" }),
          ` ${p.approval.name} · ${time(p.approval.at)}. `,
          h("span", { class: "muted small", text: "Bilgi amaçlıdır; yayın onayını yine siz kodla verirsiniz." }),
        )
      : null;

    box.replaceChildren(
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn btn-sm", type: "button", onclick: () => create("intake") }, "Bilgi formu linki oluştur"),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => create("review") }, "Yorum ve onay linki oluştur"),
        h("button", { class: "btn btn-sm", type: "button", style: "margin-inline-start:auto", onclick: (ev) => pull(ev.currentTarget) }, "Gelenleri şimdi al"),
      ),
      approval || "",
      links,
      intake || "",
      comments || "",
    );
  };
  void load();
  return box;
}
