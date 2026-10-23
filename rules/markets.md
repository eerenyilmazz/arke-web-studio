# Markets: language, money, contact details and the legal minimum

Clients can be anywhere. Most are in Turkey or English-speaking countries. **English is the shared language**: every
site's main language is English except in Turkey, where it is Turkish. Other languages are extra locales that the operator
chooses. The client's market (`business.country`, set when the client is created) decides everything below.

This is a checklist for the site, not legal advice. When a legal fact is missing (company number, registered address,
data controller), leave it out and ask the operator. Never invent one.

## The markets

| Market | Main language | Spelling, register | Currency and price format | Phone (saved as) | Privacy law |
|---|---|---|---|---|---|
| GB United Kingdom | en | UK English (colour, organise), plain and direct | £45, £1,250 | +44… | UK GDPR, PECR |
| IE Ireland | en | UK/Irish English | €45, €1,250 | +353… | GDPR |
| US United States | en | US English (color, organize) | $45, $1,250 | +1… | State laws (e.g. CCPA in California) |
| DE Germany | en (de as extra) | UK English unless the operator says US | 45 €, 1.250 € in German; €45 in English | +49… | GDPR, Impressum duty |
| NL Netherlands | en (nl not offered) | UK English | €45, €1.250 in Dutch; €45 in English | +31… | GDPR |
| TR Türkiye | tr | Everyday Turkish, "siz" form | 450 ₺ or 450 TL, 1.250 ₺ (dot for thousands) | +90… | KVKK |

- Dates: UK, IE and EU `18 October 2026`; US `October 18, 2026`; Turkish `18 Ekim 2026`. Times 24-hour except US.
- Opening hours in the local style: `Mon–Sat 9:00–18:00` (UK, EU), `Mon–Sat 9am–6pm` (US), `Pzt–Cmt 09.00–18.00` (TR).
- Phone numbers are saved in international form (`+90…`) and shown in the local form people recognise
  (`0534 985 63 19`, `07700 900123`, `(212) 555-0142`). `tel:` links always use the international form.
- An extra locale is written natively (see Writing), never as a word-for-word translation of the main one.

## Legal minimum on every site

What every market needs:

- **Who runs the site**: the business name in the footer. For a limited company add the registered name, number and
  registered office (`config.legal`).
- **No cookies by default**, so no cookie banner. Anything that would set non-essential cookies (analytics, embedded
  maps or videos) needs consent first, so the factory does not add them.
- **A privacy notice when the site collects personal data**, which means whenever there is a contact form. Without a
  form (phone, email and WhatsApp links only) a short privacy paragraph in the footer is enough.

Per market:

- **UK, IE, EU (GDPR)**: the privacy notice says who the controller is (business name and contact), what the form
  collects, why (to answer the enquiry), how long it is kept, who processes it (the form service), and the visitor's
  rights (access, correction, deletion, complaint to the regulator: ICO in the UK, DPC in Ireland, the state authority
  in Germany, AP in the Netherlands).
- **Germany**: an **Impressum** page is required for business sites: name, address, contact email and phone, and for
  companies the register court and number and the VAT ID. Missing facts: ask the operator, never publish a partial Impressum
  as if complete.
- **US**: a short privacy notice (what is collected, why, contact for questions). No GDPR wording.
- **Türkiye (KVKK)**: when there is a form, a **KVKK Aydınlatma Metni** page: veri sorumlusu (business name, address),
  which data is collected, purpose (talebe yanıt vermek), legal basis, who it is shared with (the form service), how
  long it is kept, and the rights under KVKK article 11 with a contact address. Under the form, a short line that links
  to it ("Kişisel verileriniz Aydınlatma Metni kapsamında işlenir."). Do not use a pre-ticked box. An e-commerce
  site would need more (mesafeli satış, ETBİS); that is out of scope.

Legal pages are extra pages: `privacy/` (`gizlilik/` on Turkish-only sites), `impressum/` for Germany, linked from the
footer of every page and listed in the sitemap. Write them plainly from the config facts; tell the operator in the summary
that they should have the client check them.

## Writing

### English (every site's shared language)

- Plain, specific, short sentences. Say what the business does, for whom and where in the first screen.
- No hype or filler: cutting-edge, world-class, unleash, elevate, seamless, solutions, passionate about,
  "we pride ourselves", "look no further", "one-stop shop".
- Use the client's own facts and words: prices, years, areas served, how they work. A specific detail beats an
  adjective ("Same-day repairs in Leeds" over "Fast, reliable service").
- Headings are statements or questions a customer would ask, not slogans with no information.
- Calls to action name the action: "Book a haircut", "Call for a quote", "See the menu". One main action per page.
- Match the spelling of the market (UK or US); never mix them on one site.

### Turkish

- Günlük, sıcak ve net Türkçe; ziyaretçiye "siz" diye hitap edin. Çeviri kokan cümle kurmayın.
- Kaçının: "en iyi", "kaliteli hizmet", "müşteri memnuniyeti odaklı", "sektörün öncüsü", "profesyonel ekibimizle",
  "uygun fiyat garantisi", "siz değerli müşterilerimiz". Bunların yerine somut bilgi: hizmet, süre, fiyat, semt.
- Başlıklar ne yapıldığını söyler: "Sincan'da erkek kuaförü", "Aynı gün kombi servisi".
- Eylem çağrısı fiil ile: "Randevu alın", "WhatsApp'tan yazın", "Hemen arayın", "Menüyü görün".
- Yazım: Türk Dil Kurumu yazım kuralları; büyük harfte İ ve I ayrımı (`text-transform: uppercase` Türkçe
  sayfada `lang="tr"` olmadan bozulur; büyük harf başlıkları elle yazın ya da dili doğru verin).
- Para: `450 ₺` ya da `450 TL`, binlik ayırıcı nokta (`1.250 ₺`). Saat: `09.00–18.00`.

### Both

- Never invent facts, numbers, reviews, awards or years. Missing → leave out and ask the operator.
- Every image has alt text in the page's language describing what is in it.
- Field limits: SEO title ≤ 60 characters, meta description ≤ 160.

## Standard words

The same words for the same things on every site, so menus, buttons and forms read naturally and the two
languages match. Use these unless the business has its own word (a restaurant's "Menü", a salon's "Fiyatlar").

| Thing | Turkish | English (UK) |
|---|---|---|
| Home | Ana sayfa | Home |
| About | Hakkımızda | About us |
| Services / products | Hizmetler / Ürünler | Services / Products |
| Prices | Fiyatlar | Prices |
| Gallery | Galeri | Gallery |
| Blog | Blog | Blog |
| Contact | İletişim | Contact |
| Main action: call | Hemen arayın | Call us |
| Main action: write | WhatsApp'tan yazın | Message us on WhatsApp |
| Main action: book | Randevu alın | Book online |
| Get directions | Yol tarifi alın | Get directions |
| Opening hours | Çalışma saatleri | Opening hours |
| Closed | Kapalı | Closed |
| Address | Adres | Address |
| Form: name / phone / message / send | Adınız / Telefonunuz / Mesajınız / Gönder | Your name / Phone / Message / Send |
| Form sent | Mesajınız iletildi, en kısa sürede dönüş yapacağız. | Thanks, we will get back to you soon. |
| Skip link | İçeriğe geç | Skip to content |
| Menu button | Menü | Menu |
| Theme toggle labels | Koyu temaya geç / Açık temaya geç | Switch to dark theme / Switch to light theme |
| Language link | EN / TR (with `hreflang` and `lang`) | TR / EN |
| Privacy page | Gizlilik / KVKK Aydınlatma Metni | Privacy notice |
| 404 | Sayfa bulunamadı · Ana sayfaya dönün | Page not found · Back to the home page |

In US English use the US spelling and "Contact us", "Book now" where it reads more naturally; never mix the two.

