// Who uses this panel: name, studio and panel language. Asked once on the home screen (a card, never a blocking
// dialog), editable later in Ayarlar → Hesabım. The agent addresses this person by name.
import { getLang, LANGS, setLang } from "./i18n.js";
import { api, guarded, h, ignoreOptional, toast } from "./core.js";

/** The profile form; `welcome` draws it as the first-start card on the home screen. */
export function profileCard({ welcome = false, onSaved } = {}) {
  const name = h("input", { id: "prof-name", maxlength: 60, autocomplete: "name", required: true, placeholder: "Ad Soyad" });
  const studio = h("input", { id: "prof-studio", maxlength: 80, autocomplete: "organization", placeholder: "ör. Atölye Web" });
  const lang = h("select", { id: "prof-lang" }, ...Object.entries(LANGS).map(([k, v]) => h("option", { value: k, "data-no-i18n": "" }, v)));
  lang.value = getLang();
  api("GET", "/api/settings")
    .then((s) => {
      name.value = s.profile?.name || "";
      studio.value = s.profile?.studio || "";
      lang.value = s.panelLanguage || getLang();
    })
    .catch(ignoreOptional);
  const save = h("button", { class: "btn btn-primary", type: "submit" }, welcome ? "Başla" : "Kaydet");
  return h(
    "form",
    {
      class: `card stack${welcome ? " welcome-card" : ""}`,
      id: welcome ? "welcome-profile" : "profile-card",
      onsubmit: async (e) => {
        e.preventDefault();
        save.disabled = true;
        const before = getLang();
        const s = await guarded(() => api("PUT", "/api/settings", { profile: { name: name.value, studio: studio.value }, panelLanguage: lang.value }));
        save.disabled = false;
        if (!s) return;
        toast("Profil kaydedildi.");
        if (s.panelLanguage !== before) {
          setLang(s.panelLanguage);
          location.reload();
          return;
        }
        onSaved?.(s);
      },
    },
    h("h2", { text: welcome ? "Hoş geldiniz" : "Profil" }),
    h("p", {
      class: "muted small",
      text: welcome
        ? "Bu panel size özel: kendi müşterileriniz, kendi hesaplarınız. Agent size adınızla hitap eder; onaylar yalnızca sizdedir."
        : "Agent size bu adla hitap eder. Stüdyo adı isteğe bağlıdır.",
    }),
    h("label", { for: name.id }, "Adınız"),
    name,
    h("label", { for: studio.id }, "Stüdyo adı (isteğe bağlı)"),
    studio,
    h("label", { for: lang.id }, "Panel dili"),
    lang,
    h("div", {}, save),
  );
}

/** Home: the first-start card while no name is set; empty otherwise. */
export function welcomeSlot() {
  const slot = h("div", { class: "welcome-slot" });
  api("GET", "/api/settings")
    .then((s) => {
      if (!s.profile?.name) slot.replaceChildren(profileCard({ welcome: true, onSaved: () => slot.replaceChildren() }));
    })
    .catch(ignoreOptional);
  return slot;
}
