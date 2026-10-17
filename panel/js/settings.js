// Settings: publishing, budget, sender, backups, web research.
import { $, api, copyButton, fmtTokens, guarded, h, ignoreOptional, MODE_TR, MODEL_TR, toast } from "./core.js";
import { askNotifyPermission, chime } from "./shell.js";
import { portalSettingsCard } from "./portal.js";

// ---------------------------------------------------------------- settings: publishing setup

/** Step-by-step Cloudflare setup with live checks. Only whether a value is set is ever shown, never the value. */
export async function renderSettings() {
  const st = await guarded(() => api("GET", "/api/cloudflare"));
  const ok = (b) => h("span", { class: `badge ${b ? "ok" : "warn"}`, text: b ? "tamam" : "eksik" });
  const result = h("p", { class: "small", role: "status" });
  const test = async (btn) => {
    btn.disabled = true; result.textContent = "Deneniyor…";
    const r = await guarded(() => api("POST", "/api/cloudflare/test"));
    btn.disabled = false;
    if (r) { result.textContent = r.message; result.className = `small ${r.ok ? "ok-text" : "err"}`; }
  };
  const lines = 'export SF_CF_MANAGED_API_TOKEN="buraya-token"\nexport SF_CF_MANAGED_ACCOUNT_ID="buraya-hesap-kimligi"';
  const ready = st && st.managed.token && st.managed.accountId;
  const group = (id, title, ...cards) => h("section", { class: "settings-group", id: `ayar-${id}`, "data-enter": "1" }, h("h2", { class: "settings-title", text: title }), ...cards);
  const nav = h("nav", { class: "settings-nav", "aria-label": "Ayar bölümleri" }, ...[["genel", "Genel"], ["kullanim", "Kaynak Kullanımı"], ["yayin", "Yayın"], ["yedek", "Yedek"]].map(([id, label]) =>
    h("a", { href: `#ayar-${id}`, onclick: (e) => { e.preventDefault(); $(`#ayar-${id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); } }, label)));
  const cloudflare = h("section", { class: "card stack" },
      h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { text: "Cloudflare Bağlantısı" }), ready ? h("span", { class: "badge ok", text: "hazır" }) : h("span", { class: "badge warn", text: "kurulmadı" })),
      h("p", { class: "muted small", text: "Önizleme linki ve canlı yayın için bir kez yapılır. Token panelde ya da dosyada saklanmaz; sadece terminal ortamında durur ve agent'a hiç verilmez." }),
      st && h("ul", { class: "checks" },
        h("li", {}, ok(st.managed.token), " API token (SF_CF_MANAGED_API_TOKEN)"),
        h("li", {}, ok(st.managed.accountId), " Hesap kimliği (SF_CF_MANAGED_ACCOUNT_ID)"),
        h("li", {}, ok(st.wrangler), " Yayın aracı (wrangler)"),
      ),
      h("ol", { class: "setup-steps" },
        h("li", {}, h("strong", { text: "Cloudflare hesabı aç " }), "(ücretsiz): ", h("a", { href: "https://dash.cloudflare.com/sign-up", target: "_blank", rel: "noopener", text: "dash.cloudflare.com" })),
        h("li", {}, h("strong", { text: "Token oluştur: " }), "Profil → API Tokens → Create Token → ", h("em", { text: "Edit Cloudflare Workers" }), " şablonu → Continue → Create. Çıkan token'ı kopyala (bir kez gösterilir). ", h("a", { href: "https://dash.cloudflare.com/profile/api-tokens", target: "_blank", rel: "noopener", text: "Token sayfası" })),
        h("li", {}, h("strong", { text: "Hesap kimliğini al: " }), "Cloudflare'de Workers & Pages sayfasının sağında ", h("em", { text: "Account ID" }), " yazar."),
        h("li", {}, h("strong", { text: "WSL'de kaydet: " }), h("code", { text: "nano ~/.bashrc" }), " ile dosyanın en altına şu iki satırı ekle (tırnak içine kendi değerlerini yaz), kaydet:",
          h("div", { class: "copybox" }, h("pre", { text: lines }), copyButton(lines))),
        h("li", {}, h("strong", { text: "Paneli yeniden başlat: " }), "terminalde Ctrl+C, sonra ", h("code", { text: "source ~/.bashrc && npm run panel" }), "."),
        h("li", {}, h("strong", { text: "Dene: " }), h("button", { class: "btn btn-sm", type: "button", onclick: (e) => test(e.currentTarget) }, "Bağlantıyı test et"), " ", result),
      ),
      h("p", { class: "muted small", text: "Token'ı kimseyle, bana da gönderme. Sızdığını düşünürsen Cloudflare'de silip yenisini oluştur." }),
    );
  const approvalCode = h("section", { class: "card stack" },
    h("h2", { text: "Onay Kodu" }),
    h("p", { class: "muted small", text: "Onay sırasında istenen 6 haneli kod, paneli başlattığınız terminalde \"Onay kodu\" satırında yer alır. Her başlatmada değişir; 5 hatalı denemede onay kilitlenir (paneli yeniden başlatınız)." }));
  const notifications = h("section", { class: "card stack" },
    h("h2", { text: "Bildirimler" }),
    h("p", { class: "muted small", text: "Uzun işlemler tamamlandığında sesli uyarı verilir; panel arka plandaysa sistem bildirimi gönderilir." }),
    h("div", { class: "row" },
      h("button", { class: "btn btn-sm", type: "button", onclick: () => { askNotifyPermission(); toast("Tarayıcı izin isteyebilir; lütfen izin veriniz."); } }, "Bildirimlere İzin Ver"),
      h("button", { class: "btn btn-sm", type: "button", onclick: () => chime(true) }, "Sesi Dene")));
  return h("div", { class: "settings-page" },
    h("div", { class: "settings-head", "data-enter": "0" }, h("h1", { text: "Ayarlar" }), nav),
    h("div", { class: "settings stack" },
      group("genel", "Genel", senderCard(), notifications, approvalCode),
      group("kullanim", "Kaynak Kullanımı", budgetCard(), agentsCard(), profitSettingsCard(), webResearchCard()),
      group("yayin", "Yayın", cloudflare, portalSettingsCard()),
      group("yedek", "Yedek", backupCard())));
}


/** Budget mode, monthly budget and this month's use. */
export function budgetCard() {
  const mode = h("select", { id: "bd-mode" }, ...Object.entries(MODE_TR).map(([k, v]) => h("option", { value: k }, v)));
  const monthly = h("input", { id: "bd-month", type: "number", min: 0, step: 1, placeholder: "0 = sınırsız" });
  const meter = h("div", { class: "meter" }, h("span"));
  const stats = h("p", { class: "small", role: "status" });
  const profile = h("ul", { class: "small muted profile" });
  let modes = [];
  const showProfile = () => {
    const m = modes.find((x) => x.id === mode.value);
    if (!m) return;
    const skills = { full: "tasarım rehberleri tamamen kullanılır", search: "tasarım rehberlerinde yalnızca arama yapılır", none: "tasarım rehberi kullanılmaz" }[m.skills];
    profile.replaceChildren(
      h("li", { text: `Tasarım işlemleri: ${MODEL_TR[m.design.model] || m.design.model}, en fazla ${m.design.maxTurns} adım, işlem başına ${fmtTokens(m.design.tokenCap)} birim` }),
      h("li", { text: `Düzenlemeler: ${MODEL_TR[m.edit.model] || m.edit.model}, en fazla ${m.edit.maxTurns} adım, işlem başına ${fmtTokens(m.edit.tokenCap)} birim` }),
      h("li", { text: `${skills} · internet araştırması ${m.research ? "açık" : "kapalı"} · ekran görüntüsü ${m.screenshots ? "incelenir" : "incelenmez"}` }));
  };
  mode.addEventListener("change", showProfile);
  const load = () => api("GET", "/api/usage").then((u) => {
    modes = u.modes;
    mode.value = u.mode;
    monthly.value = u.monthlyBudget ? String(Math.round(u.monthlyBudget / 1e6)) : "";
    const pct = u.monthlyBudget ? Math.min(100, Math.round((u.monthTokens / u.monthlyBudget) * 100)) : 0;
    meter.firstChild.style.width = `${pct}%`;
    meter.className = `meter ${pct >= 90 ? "bad" : pct >= 70 ? "warn" : ""}`;
    stats.textContent = `Bu ay: ${fmtTokens(u.monthTokens)} birim, ${u.monthJobs} işlem${u.monthCostUsd ? `, tahmini ~$${u.monthCostUsd.toFixed(2)}` : ""}${u.monthlyBudget ? ` · sınır ${fmtTokens(u.monthlyBudget)} (%${pct})` : ""}`;
    showProfile();
  }).catch(ignoreOptional);
  load();
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", "/api/settings", { budget: { mode: mode.value, monthlyTokens: Math.max(0, Math.round(Number(monthly.value || 0) * 1e6)) } }));
    if (r) { toast("Kaydedildi; bir sonraki işlemden itibaren geçerlidir."); load(); }
  } },
    h("h2", { text: "Paket ve Bütçe" }),
    h("p", { class: "muted small", text: "Paket; her işlemde kullanılacak modeli, adım sınırını ve en fazla kaynak miktarını belirler. Sınırı aşan işlem durdurulur, yapılan değişiklikler korunur. Müşteri bazında paket, Müşteri Bilgileri → İş Takibi bölümünden seçilir." }),
    h("label", { for: "bd-mode" }, "Varsayılan paket", mode), profile,
    h("label", { for: "bd-month" }, "Aylık sınır (milyon birim; 0 = sınırsız)", monthly),
    meter, stats,
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}

/** Who proposals are from. */
export function senderCard() {
  const f = (id, label, attrs = {}) => { const i = h("input", { id: `snd-${id}`, ...attrs }); return [i, h("label", { for: `snd-${id}` }, label, i)]; };
  const [name, nameL] = f("name", "Ad / firma", { maxlength: 80 });
  const [email, emailL] = f("email", "E-posta", { type: "email", maxlength: 120 });
  const [phone, phoneL] = f("phone", "Telefon", { type: "tel", maxlength: 40 });
  const [web, webL] = f("web", "Web", { maxlength: 120 });
  api("GET", "/api/settings").then((s) => { name.value = s.sender?.name || ""; email.value = s.sender?.email || ""; phone.value = s.sender?.phone || ""; web.value = s.sender?.web || ""; }).catch(ignoreOptional);
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    if (await guarded(() => api("PUT", "/api/settings", { sender: { name: name.value, email: email.value, phone: phone.value, web: web.value } }))) toast("Teklif bilgileri kaydedildi.");
  } }, h("h2", { text: "Teklif" }), h("p", { class: "muted small", text: "Tekliflerin altında görünen gönderen bilgileri." }), nameL, emailL, phoneL, webL, h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}

/** Backups to a folder Eren chooses; automatic after jobs (at most every 30 minutes) and on demand. */
export function backupCard() {
  const dir = h("input", { id: "bk-dir", placeholder: "/mnt/c/Users/eeren/OneDrive/SiteFactory-Yedek", maxlength: 400 });
  const list = h("ul", { class: "files" });
  const status = h("p", { class: "small", role: "status" });
  const load = () => api("GET", "/api/backups").then((r) => {
    dir.value = r.dir || "";
    list.replaceChildren(...r.backups.slice(0, 5).map((b) => h("li", {}, h("span", { text: b.file }), h("span", { class: "muted", text: `${(b.bytes / 1048576).toFixed(1)} MB · ${new Date(b.at).toLocaleString("tr-TR")}` }))));
    if (!r.backups.length) list.replaceChildren(h("li", { class: "muted small", text: r.dir ? "Henüz yedek yok." : "Yedekleme kapalı." }));
  }).catch(ignoreOptional);
  load();
  const now = h("button", { class: "btn", type: "button", onclick: async () => {
    now.disabled = true; status.textContent = "Yedek alınıyor…";
    const r = await guarded(() => api("POST", "/api/backups"));
    now.disabled = false; status.textContent = r ? `Yedek alındı: ${r.file}` : "";
    load();
  } }, "Şimdi yedekle");
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    if (await guarded(() => api("PUT", "/api/settings", { backupDir: dir.value.trim() }))) { toast(dir.value.trim() ? "Yedek klasörü kaydedildi." : "Otomatik yedek kapatıldı."); load(); }
  } },
    h("h2", { text: "Yedek" }),
    h("p", { class: "muted small", text: "Bütün müşteriler, sürüm geçmişleri, tasarım kütüphanesi ve ayarlar tek dosya (.tar.gz) olarak bu klasöre yedeklenir. İş bittikçe otomatik (en sık 30 dakikada bir); son 10 yedek tutulur. OneDrive ya da Google Drive klasörü seçersen bulutta da durur." }),
    h("label", { for: "bk-dir" }, "Klasör (WSL yolu; Windows'taki C:\\Users\\… = /mnt/c/Users/…)", dir),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet"), now),
    status, list);
}

/** The agent's web access (search and page reading), on by default; applies from the next job. */
export function webResearchCard() {
  const box = h("input", { type: "checkbox", id: "web-research", disabled: true });
  const note = h("p", { class: "small muted", role: "status" });
  api("GET", "/api/settings").then((s) => { box.checked = s.webResearch; box.disabled = false; }).catch(() => (note.textContent = "Ayar okunamadı."));
  box.addEventListener("change", async () => {
    box.disabled = true;
    const s = await guarded(() => api("PUT", "/api/settings", { webResearch: box.checked }));
    box.disabled = false;
    if (s) { box.checked = s.webResearch; note.textContent = s.webResearch ? "Açık: bir sonraki işten itibaren agent araştırma yapabilir." : "Kapalı: agent sadece senin verdiğin bilgilerle çalışır."; }
  });
  return h("section", { class: "card stack" },
    h("h2", { text: "İnternet araştırması" }),
    h("p", { class: "muted small", text: "Agent işletmeyi internette ve haritalarda arar, sektördeki iyi siteleri inceler; bulduklarını kaynaklarıyla gösterir, emin olmadığını sana sorar. Okuduğu sayfalardaki yazılar sadece bilgi sayılır; yayın yapamaz, onay veremez, anahtarları göremez." }),
    h("label", { for: "web-research", class: "check" }, box, " Agent internette araştırma yapabilsin"),
    note,
  );
}

// ---------------------------------------------------------------- agents per kind of job, profit settings

const GROUP_TR = { design: ["Tasarım işleri", "Siteyi hazırla, yeniden tasarla, öneriler, kütüphaneden kur"], edit: ["Düzenlemeler", "Özel talepler, form düzenlemeleri, hata düzeltme"], translate: ["Çeviri", "Diğer dilleri yazma ve güncelleme"], page: ["Ek sayfa", "Standart sayfalar dışındaki yeni sayfalar"] };

/**
 * Which agent does which kind of job: Claude Code (default) or Codex, with its own model, step limit and token cap.
 * Empty / 0 keeps the package's value. Codex needs to be installed and signed in on this computer.
 */
export function agentsCard() {
  const rows = Object.entries(GROUP_TR).map(([id, [label, help]]) => {
    const provider = h("select", { id: `ag-${id}-p`, "aria-label": `${label}: agent` }, h("option", { value: "" }, "Paket (Claude)"), h("option", { value: "claude" }, "Claude Code"), h("option", { value: "codex" }, "Codex"));
    const model = h("input", { type: "text", id: `ag-${id}-m`, maxlength: 60, placeholder: "boş = paket", "aria-label": `${label}: model`, pattern: "[A-Za-z0-9._:-]*" });
    const turns = h("input", { type: "number", id: `ag-${id}-t`, min: 0, max: 500, step: 1, placeholder: "adım", "aria-label": `${label}: en fazla adım` });
    const cap = h("input", { type: "number", id: `ag-${id}-c`, min: 0, max: 50, step: 0.1, placeholder: "M birim", "aria-label": `${label}: token tavanı (milyon)` });
    const el = h("div", { class: "agent-row" }, h("div", { class: "agent-name" }, h("strong", { text: label }), h("span", { class: "muted small", text: help })), provider, model, turns, cap);
    return { id, provider, model, turns, cap, el };
  });
  const note = h("p", { class: "small", role: "status" });
  api("GET", "/api/settings").then((st) => {
    for (const r of rows) {
      const a = st.agents?.[r.id] || {};
      r.provider.value = a.provider || "";
      r.model.value = a.model || "";
      r.turns.value = a.maxTurns ? String(a.maxTurns) : "";
      r.cap.value = a.tokenCap ? String(a.tokenCap / 1e6) : "";
    }
  }).catch(ignoreOptional);
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const agents = Object.fromEntries(rows.map((r) => [r.id, { provider: r.provider.value, model: r.model.value.trim(), maxTurns: Math.max(0, Math.round(Number(r.turns.value || 0))), tokenCap: Math.max(0, Math.round(Number(r.cap.value || 0) * 1e6)) }]));
    const saved = await guarded(() => api("PUT", "/api/settings", { agents }));
    if (saved) { toast("Kaydedildi; bir sonraki işten itibaren geçerlidir."); note.textContent = rows.some((r) => r.provider.value === "codex") ? "Codex seçili işler bu bilgisayardaki Codex ile çalışır (npm i -g @openai/codex, ardından codex login). Codex'te shell, tarayıcı ve eklentiler kapalıdır; sadece site-factory araçlarını kullanır." : ""; }
  } },
    h("h2", { text: "Agent ve Sınırlar" }),
    h("p", { class: "muted small", text: "Her iş türü için hangi agent'ın, hangi modelle ve hangi sınırlarla çalışacağını seçiniz. Boş bırakılan alan paketin değerini kullanır. Claude modelleri: opus, sonnet, haiku. Codex modelleri Codex'in kendi adlarıdır (boş = Codex varsayılanı)." }),
    h("div", { class: "agent-head muted small", "aria-hidden": "true" }, h("span", { text: "İş türü" }), h("span", { text: "Agent" }), h("span", { text: "Model" }), h("span", { text: "En fazla adım" }), h("span", { text: "Tavan (M)" })),
    ...rows.map((r) => r.el),
    note,
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}

/** USD rates for turning the agent's cost into the client's currency, and a price for jobs without a reported cost. */
export function profitSettingsCard() {
  const field = (id, label, attrs) => { const i = h("input", { type: "number", id, min: 0, step: "any", ...attrs }); return [i, h("label", { for: id }, label, i)]; };
  const [tr, trL] = field("pf-try", "1 USD = ? ₺", { placeholder: "ör. 41.5" });
  const [gbp, gbpL] = field("pf-gbp", "1 USD = ? £", { placeholder: "ör. 0.75" });
  const [eur, eurL] = field("pf-eur", "1 USD = ? €", { placeholder: "ör. 0.86" });
  const [ppm, ppmL] = field("pf-ppm", "Codex işleri: 1M birim kaç USD?", { placeholder: "ör. 2" });
  api("GET", "/api/settings").then((st) => {
    const p = st.profit || {};
    tr.value = p.usdRates?.TRY || ""; gbp.value = p.usdRates?.GBP || ""; eur.value = p.usdRates?.EUR || ""; ppm.value = p.usdPerMillionUnits || "";
  }).catch(ignoreOptional);
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const n = (i) => Math.max(0, Number(i.value || 0));
    if (await guarded(() => api("PUT", "/api/settings", { profit: { usdRates: { TRY: n(tr), GBP: n(gbp), EUR: n(eur) }, usdPerMillionUnits: n(ppm) } }))) toast("Kâr hesabı ayarları kaydedildi.");
  } },
    h("h2", { text: "Kâr Hesabı" }),
    h("p", { class: "muted small", text: "Agent maliyeti dolar olarak tutulur; müşterinin para birimine bu kurlarla çevrilir. Kur girilmezse kâr hesaplanmaz, sadece dolar maliyeti gösterilir. Claude her iş için kendi maliyetini bildirir; Codex bildirmediği için alttaki birim fiyat kullanılır." }),
    h("div", { class: "two" }, trL, gbpL), h("div", { class: "two" }, eurL, ppmL),
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}
