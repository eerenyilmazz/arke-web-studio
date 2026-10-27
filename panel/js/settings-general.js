// Settings → Genel and Yedek: the proposal sender, panel language and backups.
import { getLang, LANGS, locale, setLang } from "./i18n.js";
import { api, guarded, h, ignoreOptional, toast } from "./core.js";

/** Who proposals are from. */
export function senderCard() {
  const f = (id, label, attrs = {}) => {
    const i = h("input", { id: `snd-${id}`, ...attrs });
    return [i, h("label", { for: `snd-${id}` }, label, i)];
  };
  const [name, nameL] = f("name", "Ad / firma", { maxlength: 80 });
  const [email, emailL] = f("email", "E-posta", { type: "email", maxlength: 120 });
  const [phone, phoneL] = f("phone", "Telefon", { type: "tel", maxlength: 40 });
  const [web, webL] = f("web", "Web", { maxlength: 120 });
  api("GET", "/api/settings")
    .then((s) => {
      name.value = s.sender?.name || "";
      email.value = s.sender?.email || "";
      phone.value = s.sender?.phone || "";
      web.value = s.sender?.web || "";
    })
    .catch(ignoreOptional);
  return h(
    "form",
    {
      class: "card stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (await guarded(() => api("PUT", "/api/settings", { sender: { name: name.value, email: email.value, phone: phone.value, web: web.value } })))
          toast("Teklif bilgileri kaydedildi.");
      },
    },
    h("h2", { text: "Teklif" }),
    h("p", { class: "muted small", text: "Tekliflerin altında görünen gönderen bilgileri." }),
    nameL,
    emailL,
    phoneL,
    webL,
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")),
  );
}

/** Backups to a folder the operator chooses; automatic after jobs (at most every 30 minutes) and on demand. */
export function backupCard() {
  const dir = h("input", { id: "bk-dir", placeholder: "/mnt/c/Users/<kullanıcı>/OneDrive/ArkeWebStudio-Yedek", maxlength: 400 });
  const list = h("ul", { class: "files" });
  const status = h("p", { class: "small", role: "status" });
  /** Unpacks the backup in a temporary folder and checks every client in it; the real folders are not touched. */
  const verify = async (file, btn) => {
    btn.disabled = true;
    status.textContent = "Yedek açılıp kontrol ediliyor…";
    const r = await guarded(() => api("POST", `/api/backups/${encodeURIComponent(file)}/verify`));
    btn.disabled = false;
    if (!r) return (status.textContent = "");
    status.className = `small ${r.ok ? "ok-text" : "err"}`;
    status.textContent = r.ok ? `Yedek sağlam: ${r.clients.length} müşteri, ${r.files} dosya geri yüklenebilir.` : `Yedekte sorun var: ${r.problems.join(" ")}`;
  };
  const load = () =>
    api("GET", "/api/backups")
      .then((r) => {
        dir.value = r.dir || "";
        // A backup needs a folder first; the button says why it waits.
        now.disabled = !r.dir;
        now.title = r.dir ? "" : "Önce bir yedek klasörü kaydedin.";
        list.replaceChildren(
          ...r.backups
            .slice(0, 5)
            .map((b) =>
              h(
                "li",
                {},
                h("span", { text: b.file }),
                h("span", { class: "muted", text: `${(b.bytes / 1048576).toFixed(1)} MB · ${new Date(b.at).toLocaleString(locale())}` }),
                h("button", { class: "btn btn-sm", type: "button", onclick: (e) => verify(b.file, e.currentTarget) }, "Geri yüklenebilir mi?"),
              ),
            ),
        );
        if (!r.backups.length) list.replaceChildren(h("li", { class: "muted small", text: r.dir ? "Henüz yedek yok." : "Yedekleme kapalı." }));
      })
      .catch(ignoreOptional);
  load();
  const now = h(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: async () => {
        now.disabled = true;
        status.textContent = "Yedek alınıyor…";
        const r = await guarded(() => api("POST", "/api/backups"));
        now.disabled = false;
        status.textContent = r ? `Yedek alındı: ${r.file}` : "";
        load();
      },
    },
    "Şimdi yedekle",
  );
  return h(
    "form",
    {
      class: "card stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (await guarded(() => api("PUT", "/api/settings", { backupDir: dir.value.trim() }))) {
          toast(dir.value.trim() ? "Yedek klasörü kaydedildi." : "Otomatik yedek kapatıldı.");
          load();
        }
      },
    },
    h("h2", { text: "Yedek" }),
    h("p", {
      class: "muted small",
      text: "Bütün müşteriler, sürüm geçmişleri, tasarım kütüphanesi ve ayarlar tek dosya (.tar.gz) olarak bu klasöre yedeklenir. İş bittikçe otomatik (en sık 30 dakikada bir); son 10 yedek tutulur. OneDrive ya da Google Drive klasörü seçersen bulutta da durur.",
    }),
    h("label", { for: "bk-dir" }, "Klasör (WSL yolu; Windows'taki C:\\Users\\… = /mnt/c/Users/…)", dir),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet"), now),
    status,
    list,
  );
}

/** Panel language. Client sites keep their own languages; the agent writes its notes to the operator in this language. */
export function languageCard() {
  const select = h("select", { id: "panel-lang", disabled: true }, ...Object.entries(LANGS).map(([k, v]) => h("option", { value: k, "data-no-i18n": "" }, v)));
  select.value = getLang();
  select.disabled = false;
  select.addEventListener("change", async () => {
    select.disabled = true;
    const s = await guarded(() => api("PUT", "/api/settings", { panelLanguage: select.value }));
    select.disabled = false;
    if (!s) return;
    setLang(s.panelLanguage);
    // Texts already on the page were changed in place; a reload draws everything in the new language.
    location.reload();
  });
  return h(
    "section",
    { class: "card stack" },
    h("h2", { text: "Panel dili" }),
    h("p", {
      class: "muted small",
      text: "Panelin ve agent'ın sana yazdığı notların dili. Müşteri sitelerinin dili değişmez; o, müşterinin bilgilerindeki site dilidir.",
    }),
    h("label", { for: "panel-lang" }, "Dil"),
    select,
  );
}
