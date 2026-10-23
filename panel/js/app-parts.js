// App sites (e-commerce, booking, restaurant): the client's own admin screen and where new messages are sent.
// Passwords and addresses are typed once, kept encrypted on this computer and never shown again.
import { api, guarded, h, toast } from "./core.js";

const PART_NAMES = {
  admin: "Yönetim ekranı",
  catalog: "Katalog",
  notifications: "Bildirimler",
  cart: "Sepet",
  payments: "Ödeme",
  calendar: "Takvim",
  "menu-qr": "QR menü",
  "legal-pages": "Yasal sayfalar",
};

function secretForm({ id, label, type, placeholder, hint, button, field, url, onSaved }) {
  const input = h("input", {
    id,
    type,
    autocomplete: type === "password" ? "new-password" : "off",
    spellcheck: "false",
    maxlength: 2000,
    placeholder,
    required: true,
  });
  const result = h("p", { class: "small", role: "status" });
  const save = h("button", { class: "btn btn-sm", type: "submit" }, button);
  return h(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          const r = await api("PUT", url, { [field]: input.value });
          input.value = "";
          result.className = "small ok-text";
          result.textContent = "Kaydedildi. Bir sonraki yayında siteye gönderilir.";
          onSaved(r);
        } catch (err) {
          result.className = "small err";
          result.textContent = err.message;
        } finally {
          save.disabled = false;
        }
      },
    },
    h("label", { for: id }, label, input),
    hint ? h("p", { class: "muted small", text: hint }) : document.createDocumentFragment(),
    h("div", { class: "row" }, save),
    result,
  );
}

const LAW_NAMES = { KVKK: "KVKK", UK_GDPR: "UK GDPR", GDPR: "GDPR", NONE: "Genel" };
const months = (days) => `${Math.round(days / 30.4)} ay`;

/** The client's personal-data profile (by market): what the site keeps, for how long, and where. */
function privacyBox(p) {
  const rows = [
    ["Kural", LAW_NAMES[p.law] ?? p.law],
    ["Form mesajları", `${months(p.retentionDays.messages)} sonra otomatik silinir`],
    ["Kişinin talebi", `en geç ${p.requestDays} gün içinde yanıtlanır (yönetim ekranı → Kişisel veri)`],
    ["Veri bölgesi", p.jurisdiction === "eu" ? "Avrupa Birliği" : "Cloudflare varsayılanı"],
  ];
  return h(
    "div",
    { class: "privacy-box" },
    h("strong", { text: "Kişisel veri" }),
    h("dl", { class: "privacy-list" }, ...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])),
    h("p", {
      class: "muted small",
      text: "Pazara göre belirlenir. Veri bölgesi veritabanı ilk kurulurken seçilir, sonradan değiştirilemez. Gizlilik metni bu bilgilere göre yazılır; müşteri yayından önce okumalı.",
    }),
  );
}

/** The card, or null for static sites (tanıtım). */
export async function appPartsCard(slug) {
  const v = await guarded(() => api("GET", `/api/clients/${slug}/app`));
  if (!v?.app) return null;
  const card = h("div", { class: "card stack", id: "app-parts" });
  const draw = (st) => {
    const state = (ok, yes, no) => h("span", { class: `badge ${ok ? "ok" : "warn"}`, text: ok ? yes : no });
    card.replaceChildren(
      h("p", {
        class: "muted small",
        text: "Site, müşterinin kendi yönetim ekranıyla gelir (site adresi/admin). Kayıtları ve gelen mesajları oradan yönetir.",
      }),
      h(
        "p",
        { class: "row" },
        ...st.parts.map((p) => h("span", { class: "chip", text: PART_NAMES[p] ?? p })),
        ...st.pendingParts.map((p) => h("span", { class: "chip muted", title: "Sonraki sürümlerde", text: `${PART_NAMES[p] ?? p} (yakında)` })),
      ),
      h("div", { class: "row" }, h("strong", { text: "Yönetim parolası" }), state(st.adminPassword, "tanımlı", "tanımlı değil")),
      secretForm({
        id: "app-admin-password",
        label: st.adminPassword ? "Yeni parola" : "Parola",
        type: "password",
        placeholder: "en az 10 karakter",
        hint: "Parolayı müşteriye güvenli bir yoldan iletin. Burada yalnızca şifrelenmiş özeti tutulur; parola bir daha gösterilmez.",
        button: st.adminPassword ? "Parolayı Değiştir" : "Parolayı Kaydet",
        field: "password",
        url: `/api/clients/${slug}/app/admin-password`,
        onSaved: (r) => {
          toast("Yönetim parolası kaydedildi.");
          draw(r);
        },
      }),
      h("div", { class: "row" }, h("strong", { text: "Bildirim adresi (isteğe bağlı)" }), state(st.notifyWebhook, "tanımlı", "yok")),
      secretForm({
        id: "app-notify-webhook",
        label: "Webhook adresi",
        type: "url",
        placeholder: "https://…",
        hint: "Yeni mesajlar ayrıca bu adrese gönderilir (Slack, Discord ya da bir Telegram aktarıcısı). Boş bırakılırsa mesajlar yalnızca yönetim ekranında görünür.",
        button: "Adresi Kaydet",
        field: "url",
        url: `/api/clients/${slug}/app/notify-webhook`,
        onSaved: (r) => {
          toast("Bildirim adresi kaydedildi.");
          draw(r);
        },
      }),
      st.privacy ? privacyBox(st.privacy) : document.createDocumentFragment(),
      st.missingSecrets.length
        ? h("p", {
            class: "small err",
            text: `Yayın için eksik: ${st.missingSecrets.includes("ADMIN_PASSWORD_HASH") ? "yönetim parolası" : st.missingSecrets.join(", ")}.`,
          })
        : document.createDocumentFragment(),
    );
  };
  draw(v);
  return card;
}
