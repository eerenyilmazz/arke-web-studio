# Privacy notices (KVKK, UK GDPR, GDPR)

Read this when a site collects personal data: a contact form, an inquiry form, later bookings and orders. The law
follows the client's **market** (`business.country`), not the page language. `get_client_status` → `privacy` gives
the facts to state: `law`, `notice` (the page name), `messagesKeptDays`, `requestDays`, `dataRegion`.

## Rules

- State only these facts and the client's config facts. Never invent a retention period, a processor, a register
  number, a DPO or a legal basis that is not listed here. A fact that is missing (the business address for a KVKK notice,
  a company number): ask the operator, and do not publish a notice with a gap as if complete.
- Write `messagesKeptDays` as months or years in the page language (365 → "12 ay" / "12 months").
- Who processes the data:
  - **App sites (forms post to `/api/inbox`):** the messages are kept in the site's own database at the hosting
    provider, Cloudflare, Inc. With `dataRegion: "EU"`: "stored in the European Union".
  - **Showcase sites with a form service (`contactForm.action`):** the form service named by the address
    (Formspree, Getform, FormSubmit or Web3Forms) receives the message and emails it to the business.
  - **No form:** no notice page is needed; a short privacy paragraph in the footer.
- Under every form, one short line linking to the notice. Never a pre-ticked box; no box at all is needed for answering
  an enquiry.
- Page: `privacy/` (`gizlilik/` on Turkish-only sites), linked from every footer, listed in the sitemap.
- In your summary, tell the operator that the client should read the notice before going live.

## Türkiye: KVKK Aydınlatma Metni (template)

Fill the {{…}} parts; keep the headings. Plain, short sentences.

```
KVKK Aydınlatma Metni

Veri sorumlusu: {{business.name}}{{legal.companyName ? " (" + legal.companyName + ")" : ""}}, {{contact.address}}.
İletişim: {{contact.email}}

Hangi verileri işliyoruz: İletişim formuna yazdığınız ad, telefon veya e-posta ve mesajınız.
Amacı: Talebinize yanıt vermek ve sizinle iletişime geçmek.
Hukuki sebebi: Bir sözleşmenin kurulmasıyla doğrudan ilgili olması ve meşru menfaatimiz (KVKK m.5/2-c ve f).
Kimlere aktarılır: {{processor sentence}}. Bu hizmet sağlayıcının sunucuları yurt dışında olabilir; verileriniz
yalnızca bu amaçla ve kanuna uygun güvencelerle aktarılır.
Saklama süresi: Mesajlar {{messagesKeptDays as months}} sonra otomatik olarak silinir.
Haklarınız (KVKK m.11): Verilerinizin işlenip işlenmediğini öğrenme, bilgi isteme, düzeltilmesini veya silinmesini
isteme, itiraz etme ve zararın giderilmesini talep etme. Başvurularınızı {{contact.email}} adresine iletebilirsiniz;
en geç {{requestDays}} gün içinde yanıtlanır.
```

## UK, Ireland, EU: privacy notice (template, English)

```
Privacy notice

Who we are: {{business.name}}{{legal.companyName ? ", " + legal.companyName : ""}}, {{contact.address}}. Contact: {{contact.email}}.

What we collect: the name, phone number or email address and message you send through our contact form.
Why: to reply to your enquiry (our legitimate interest, or steps before a contract at your request).
Who handles it: {{processor sentence}}.
How long we keep it: messages are deleted automatically after {{messagesKeptDays as months}}.
Your rights: you can ask to see, correct or delete your data, or object to its use. Write to {{contact.email}};
we reply within one month. You can also complain to {{regulator}}.
```

Regulator: ICO (UK), Data Protection Commission (Ireland), the data protection authority of the state (Germany),
Autoriteit Persoonsgegevens (Netherlands). Germany also needs an Impressum (rules/markets.md).

## United States (template)

```
Privacy

We use the details you send through our contact form (name, phone or email, message) only to reply to you.
{{processor sentence}}. Messages are deleted after {{messagesKeptDays as months}}. Questions: {{contact.email}}.
```

These templates are a starting point. The operator should have them checked by a lawyer once before selling sites
(ROADMAP: open topics).
