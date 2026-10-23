// The person's own accounts (Ayarlar → Hesabım). Everyone uses the panel with their own Cloudflare account; the
// token is typed once, checked with Cloudflare, kept encrypted on this computer and never shown again.
import { api, ask, guarded, h, time, toast } from "./core.js";

const TOKEN_PAGE = "https://dash.cloudflare.com/profile/api-tokens";

function steps() {
  return h(
    "ol",
    { class: "setup-steps" },
    h(
      "li",
      {},
      h("strong", { text: "Cloudflare hesabı açın " }),
      "(ücretsiz): ",
      h("a", { href: "https://dash.cloudflare.com/sign-up", target: "_blank", rel: "noopener", text: "dash.cloudflare.com" }),
    ),
    h(
      "li",
      {},
      h("strong", { text: "Token oluşturun: " }),
      "Profil → API Tokens → Create Token → ",
      h("em", { text: "Edit Cloudflare Workers" }),
      " şablonu → Continue → Create. Çıkan token'ı kopyalayın (bir kez gösterilir). ",
      h("a", { href: TOKEN_PAGE, target: "_blank", rel: "noopener", text: "Token sayfası" }),
    ),
    h("li", {}, h("strong", { text: "Hesap kimliğini alın: " }), "Workers & Pages sayfasının sağında ", h("em", { text: "Account ID" }), " yazar."),
  );
}

/** Account ID + token fields; `onSaved` gets the new status. Nothing typed is kept in the page after saving. */
function accountForm(onSaved, idPrefix) {
  const accountId = h("input", {
    id: `${idPrefix}-id`,
    autocomplete: "off",
    spellcheck: "false",
    maxlength: 32,
    placeholder: "32 karakter, ör. 0123abcd…",
    required: true,
  });
  const token = h("input", { id: `${idPrefix}-token`, type: "password", autocomplete: "new-password", spellcheck: "false", maxlength: 200, required: true });
  const result = h("p", { class: "small", role: "status" });
  const save = h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet ve Test Et");
  const form = h(
    "form",
    {
      class: "account-form",
      onsubmit: async (e) => {
        e.preventDefault();
        save.disabled = true;
        result.className = "small";
        result.textContent = "Cloudflare ile deneniyor…";
        try {
          const r = await api("PUT", "/api/account/cloudflare", { accountId: accountId.value, token: token.value });
          token.value = "";
          accountId.value = "";
          result.className = "small ok-text";
          result.textContent = r.message;
          onSaved(r.cloudflare);
        } catch (err) {
          result.className = "small err";
          result.textContent = err.message;
        } finally {
          save.disabled = false;
        }
      },
    },
    h("label", { for: accountId.id }, "Hesap kimliği (Account ID)", accountId),
    h("label", { for: token.id }, "API token", token),
    h("div", { class: "row" }, save),
    result,
  );
  return form;
}

function statusLine(st) {
  if (!st?.configured) return h("p", { class: "muted", text: "Henüz bir Cloudflare hesabı eklenmedi. Önizleme ve canlı yayın için gereklidir." });
  const parts = [`Hesap ${st.accountId}`, `token ${st.tokenHint}`];
  if (st.verifiedAt) parts.push(`son test ${time(st.verifiedAt)}`);
  return h(
    "p",
    { class: "account-status" },
    h("span", { class: "badge ok", text: "bağlı" }),
    " ",
    h("span", { text: parts.join(" · ") }),
    st.source === "env" ? h("span", { class: "muted small", text: " (terminal ortam değişkeninden)" }) : null,
  );
}

/** Ayarlar → Hesabım: the Cloudflare account card. */
export function accountCard() {
  const card = h("section", { class: "card stack account-card", id: "account-cloudflare" }, h("p", { class: "muted", text: "Yükleniyor…" }));
  const draw = (st) => {
    const test = h("p", { class: "small", role: "status" });
    const testBtn = h(
      "button",
      {
        class: "btn btn-sm",
        type: "button",
        onclick: async () => {
          testBtn.disabled = true;
          test.textContent = "Deneniyor…";
          const r = await guarded(() => api("POST", "/api/cloudflare/test"));
          testBtn.disabled = false;
          if (r) {
            test.textContent = r.message;
            test.className = `small ${r.ok ? "ok-text" : "err"}`;
          }
        },
      },
      "Bağlantıyı Test Et",
    );
    const remove = h(
      "button",
      {
        class: "btn btn-sm btn-danger",
        type: "button",
        onclick: async () => {
          const yes = await ask({
            title: "Cloudflare hesabını kaldır",
            body: "Bu bilgisayardaki kayıtlı hesap silinir. Yayınlanmış siteler etkilenmez; yeni yayın için hesap yeniden istenir.",
            confirm: "Kaldır",
            danger: true,
          });
          if (!yes) return;
          const r = await guarded(() => api("DELETE", "/api/account/cloudflare"));
          if (r) {
            toast("Hesap kaldırıldı.");
            draw(r.cloudflare);
          }
        },
      },
      "Hesabı Kaldır",
    );
    const replace = h(
      "details",
      { class: "account-replace", open: !st?.configured },
      h("summary", { text: st?.configured ? "Hesabı değiştir" : "Hesap ekle" }),
      steps(),
      accountForm(draw, "acc"),
    );
    card.replaceChildren(
      h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { text: "Cloudflare Hesabım" })),
      h("p", {
        class: "muted small",
        text: "Herkes kendi hesabıyla yayın yapar. Token Cloudflare ile denenip bu bilgisayarda şifreli saklanır, bir daha gösterilmez ve agent'a hiçbir zaman verilmez.",
      }),
      statusLine(st),
      // replaceChildren() prints a null as text, so the row is always a node (empty when there is no account).
      st?.configured ? h("div", { class: "row" }, testBtn, st.source === "panel" ? remove : null) : document.createDocumentFragment(),
      test,
      replace,
      h("p", {
        class: "muted small",
        text: "Token'ı kimseyle paylaşmayın. Sızdığını düşünürseniz Cloudflare'de silip yenisini oluşturun ve burada değiştirin.",
      }),
    );
  };
  guarded(() => api("GET", "/api/account")).then((r) => draw(r?.cloudflare ?? null));
  return card;
}

/** Asked at publish time when no account is set: resolves true once one is saved. */
export function askAccount() {
  return new Promise((resolve) => {
    const dialog = h("dialog", { class: "ask-dialog account-dialog", "aria-labelledby": "acc-dlg-title" });
    let saved = false;
    const close = () => {
      dialog.close();
      dialog.remove();
      resolve(saved);
    };
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    dialog.append(
      h("h2", { id: "acc-dlg-title", text: "Cloudflare hesabınızı ekleyin" }),
      h("p", { class: "muted", text: "Yayın sizin Cloudflare hesabınıza yapılır. Bilgiler bir kez girilir, denenir ve bu bilgisayarda şifreli saklanır." }),
      steps(),
      accountForm(() => {
        saved = true;
        toast("Cloudflare hesabı eklendi; yayına devam ediliyor.");
        close();
      }, "acc-dlg"),
      h("div", { class: "row ask-actions" }, h("button", { class: "btn", type: "button", onclick: close }, "Vazgeç")),
    );
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector("input")?.focus();
  });
}
