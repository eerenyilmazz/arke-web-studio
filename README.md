# Site Factory — Web Stüdyosu

Küçük işletmelere web sitesi üreten bir **web stüdyosu**: yerel bir yönetim paneli, bir MCP sunucusu ve kurallar.
Paneli kullanan kişi (kurallarda **operatör**) müşteriyi ekler. Agent (Claude Code ya da Codex) işletmeyi araştırır,
tasarım planı önerir. Operatör planı onaylayınca agent markayı ve siteyi hazırlar. Fabrika siteyi kalite
kontrolünden geçirir; operatör onayladıktan sonra site operatörün kendi Cloudflare hesabında yayına alınır.

Herkes kendi bilgisayarında kendi panelini kullanır: kendi müşterileri, kendi hesapları, kendi onayları.
Birden çok kişi aynı müşteriler üzerinde çalışacaksa bir Git deposu üzerinden ekip olarak eşitleme yapılabilir
(bkz. [Ekip çalışması](#ekip-çalışması)).

> Sürüm notları: [`CHANGELOG.md`](CHANGELOG.md) · Agent kuralları: [`AGENTS.md`](AGENTS.md) · Tasarım ve pazar kuralları: [`rules/`](rules/)

---

## İçindekiler

1. [Neler yapar](#neler-yapar)
2. [Kurulum](#kurulum)
3. [İlk açılış](#ilk-açılış)
4. [Günlük kullanım](#günlük-kullanım)
5. [Site türleri ve hazır parçalar](#site-türleri-ve-hazır-parçalar)
6. [Yayın ve Cloudflare](#yayın-ve-cloudflare)
7. [Ekip çalışması](#ekip-çalışması)
8. [Güncelleme](#güncelleme)
9. [Güvenlik modeli](#güvenlik-modeli)
10. [Klasör yapısı ve mimari](#klasör-yapısı-ve-mimari)
11. [Geliştirme](#geliştirme)
12. [Sorun giderme](#sorun-giderme)

---

## Neler yapar

| Alan | Ne sunar |
| --- | --- |
| **Müşteri akışı** | Yeni müşteri sihirbazı (paket, ülke, dil, logo ve fotoğraflar), soru formları, müşteri portalı (form ve önizleme linki), araştırma notları |
| **Tasarım** | Her müşteriye özel marka kimliği (logo, renk, yazı tipi, imza hareketi), **tasarım planı onayı**, 3 tasarım önerisi, tasarım kütüphanesi |
| **Kalite** | Her derlemede kontroller: güvenlik (dış script yok, yönlendirme yok), erişilebilirlik ve kontrast, SEO, linkler, dil tutarlılığı, imza hareketi, telefon ve masaüstü ekran görüntüleri |
| **Onay** | Onaylar sadece insandan gelir. Panel, sadece başlatıldığı terminalde görünen tek kullanımlık bir kod ister. Her onay o anki içeriğin parmak izine bağlıdır; içerik değişince onay düşer |
| **Yayın** | Önizleme ve canlı ayrı Worker'larda, geri alma, yayından kaldırma. Uygulama sitelerinde ayrıca veritabanı (D1), görsel deposu (R2), veritabanı değişiklikleri ve gizli anahtarlar |
| **İş takibi** | Teklif (yazdır/PDF), ödeme ve teslim takibi, kâr hesabı, Analiz ekranı (filtreli tablolar, CSV) |
| **Kaynak yönetimi** | Paketlere göre model seçimi, iş başına ve aylık token sınırı, Claude Code ya da Codex |
| **Ekip ve bakım** | Profil, ekip eşitleme (Git), panelden güncelleme, otomatik yedek, `sf-report` durum raporu |

**Agent'ın sınırları:** agent sadece fabrikanın araçlarıyla (MCP) çalışır:
- Kabuk komutu çalıştıramaz, dosyaları doğrudan düzenleyemez.
- Yayın yapamaz, onay veremez.
- Cloudflare hesabına ve gizli anahtarlara erişemez.
- Müşteriden gelen metinleri ve okuduğu web sayfalarını talimat değil, veri olarak işler.

---

## Kurulum

**Gerekenler:** Linux, Windows'ta **WSL2 (Ubuntu)** ya da macOS; `git`; **Node.js ≥ 22.12**; ayrıca agent olarak
[Claude Code](https://docs.claude.com/en/docs/claude-code) ya da Codex CLI.

### Tek komutla

```bash
# Depo GitHub'daysa (adres kendi deponuz):
curl -fsSL https://raw.githubusercontent.com/<sahip>/<depo>/main/scripts/install.sh | bash -s -- https://github.com/<sahip>/<depo>.git

# ya da önce indirip:
git clone https://github.com/<sahip>/<depo>.git ~/projects/site-factory
bash ~/projects/site-factory/scripts/install.sh
```

`scripts/install.sh` şunları yapar. Tekrar çalıştırmak güvenlidir; hiçbir şeyi silmez ve sistem paketi kurmaz,
eksik olanın kurulum komutunu yazar.

1. `git` ve Node sürümünü kontrol eder.
2. Depoyu `~/projects/site-factory` klasörüne indirir (başka bir yer için `SF_HOME=/yol`). Bir kopyanın içinden çalıştırılırsa o kopyayı kullanır.
3. `scripts/setup-wsl.sh` betiğini çalıştırır:
   - `../sf-clients` ve `../sf-inbox` klasörlerini oluşturur.
   - Agent'ın müşteri klasörlerine doğrudan yazmasını engelleyen `.claude/settings.local.json` dosyasını yazar.
   - `npm ci`, derleme ve testleri çalıştırır, tasarım skill'lerini kurar.
4. Kabuğa iki komut ekler (`~/.bashrc`, varsa `~/.zshrc`):
   - **`sf-panel`**: paneli başlatır.
   - **`sf-update`**: Site Factory'yi günceller.

**Windows notu:** her şeyi WSL'in kendi diskine kurun (`~/projects/...`), `/mnt/c/...` altına kurmayın. Windows
diski yavaştır ve OneDrive eşitlemesi dosyaları bozabilir. Claude Code'u da WSL içine kurun; sandbox sadece böyle
devreye girer. WSL klasörlerine Windows'tan `\\wsl$\Ubuntu\home\<kullanıcı>\projects` adresiyle erişebilirsiniz.

**Zip ile kurulum (eski yol):** sürüm zip'ini açın, klasöre girin, `bash scripts/install.sh` çalıştırın.

### Elle

```bash
npm ci && npm run build && npm test
npm run panel
```

---

## İlk açılış

```bash
sf-panel          # ya da: cd ~/projects/site-factory && npm run panel
```

Terminal panelin adresini yazar (`http://127.0.0.1:4777/login?key=…`); adresi tarayıcıda açın. Bu anahtar her
başlatmada yenilenir. Panel sadece bu bilgisayardan açılır (başka port için `PANEL_PORT`).

1. **Profil:** ana ekrandaki "Hoş geldiniz" kartına adınızı, stüdyo adınızı (isteğe bağlı) ve panel dilini
   (Türkçe/English) yazın. Agent size bu adla hitap eder; teklif gönderen alanı boşsa stüdyo adı kullanılır.
   Sonradan Ayarlar → Hesabım → Profil'den değiştirebilirsiniz.
2. **Cloudflare hesabı:** ilk yayında istenir; isterseniz önceden Ayarlar → Hesabım'dan da ekleyebilirsiniz
   (bkz. [Yayın ve Cloudflare](#yayın-ve-cloudflare)).
3. **Onay kodu:** paneli başlattığınız terminal 6 haneli bir kod yazar. Panelde onay verirken bu kod istenir.
   Kod tarayıcıya ve agent'a gitmez, her başlatmada değişir, 5 hatalı denemede kilitlenir.

Arayüz ArkeLab tasarım sistemini kullanır: varsayılan tema koyu, sağ üstten açık temaya geçebilirsiniz.

---

## Günlük kullanım

### Yeni müşteri

**Yeni Müşteri** sihirbazı sırayla şunları sorar: site türü, paket (Temel / Standart / Premium) ve ekler, işletme
bilgileri, ülke ve dil, logo ve fotoğraflar, müşteriden gelen serbest metin. Ülke dili, yazım kurallarını, para
birimini ve yasal gereklilikleri belirler (`rules/markets.md`). Varsayılan olarak site İngilizcedir, Türkiye'de
Türkçedir; ikinci dil ek olarak satılır.

### Araştırma ve tasarım planı

"Önce araştırsın ve bana sorsun" işaretliyse (varsayılan) agent önce işletmeyi ve sektördeki iyi örnekleri
araştırır. Bulduklarını kaynaklarıyla getirir ve en fazla 5 soru sorar. Emin olmadığı bilgiyi **uydurmaz**.

Yeni tasarımlarda agent sayfa yazmadan önce bir **tasarım planı** kaydeder:
- konsept ve kaynağı
- renk paleti, yazı tipleri, hero bölümü
- sayfalar ve bölümler
- **imza hareketi** (resmî adı, adım adım zamanlaması, hareket azaltma hâli)

Plan panelde zaman çizelgesi ve canlı önizlemeyle gösterilir. **Planı Onayla** dersiniz ya da notunuzu yazıp yeni
fikir istersiniz. Onaydan önce agent sayfa yazamaz, derleme de geçmez.

### Düzenleme

Müşteri sayfasında solda canlı önizleme (telefon/masaüstü) ve sürüm geçmişi, sağda sekmeler bulunur:

- **Düzenleme:** hızlı formlar (renk paleti, sayfalar, hizmetler ve fiyatlar, metin, iletişim bilgileri, iletişim
  formu, logo ve görseller) ve "Özel Talep" sohbeti. Basit değişiklikleri panel kendisi kaydeder, gerisi agent'a
  kısa ve net bir iş olarak gider.
- **Marka Kimliği:** marka kartı (logo, slogan, renkler, canlı imza hareketi, tipografi), kütüphaneye kaydetme,
  "Markayla yeniden tasarla".
- **Teklif:** yazdırılabilir teklif ve iş raporu.
- **Müşteri Bilgileri:** iş takibi, müşteri linkleri (portal), eksik bilgiler, metinler, dosyalar, onay ve yayın.
  Uygulama sitelerinde ayrıca **Müşteri Yönetim Ekranı** bölümü bulunur.

### Onay ve yayın

1. Site hazır olunca **Siteye bak** → beğenirseniz **Onayla** (terminaldeki kodla). Bu tek onay hem metni hem görünümü kapsar.
2. **Önizleme** yayınlanır (`sf-<kısa-ad>-preview.<alt-alan>.workers.dev`). Linki müşteriye portal üzerinden de gönderebilirsiniz.
3. Müşteri onaylayınca **Canlı yayın**: canlı yayın onayı verilir, site yayına girer (varsa alan adıyla).

Her değişiklik onayları sıfırlar. Canlı site **Önceki sürüme dön** ile saniyeler içinde geri alınabilir; yayından
kaldırma da panelden yapılır. Canlı sitede bu iki işlem müşterinin kısa adını yazarak onaylanır.

### Diğer ekranlar

- **Analiz:** müşteri, iş, maliyet ve site verileri; filtreler, KPI'lar, para birimine göre toplamlar, CSV dışa aktarma.
- **Tasarım Kütüphanesi:** beğendiğiniz tasarımları saklayın, yeni müşteride başlangıç olarak kullanın. Eski müşterinin bilgileri sitede kalırsa derleme durur.
- **Arşiv:** müşteri silinmez; klasörleri `_archive/` altına taşınır.
- **Ayarlar:** Hesabım (profil, Cloudflare), Genel (dil, teklif, bildirimler), Ekip, Kaynak Kullanımı (paket, agent ve model, kâr, internet araştırması), Yayın (portal), Yedek, Güncelleme.

### Komut satırı (isteğe bağlı)

| Komut | Ne yapar |
| --- | --- |
| `npm run approve -- <kısa-ad> <site\|production>` | Onayı terminalden verir (panelin yerine) |
| `npm run report -- <klasör>` | Fabrikanın durum raporu (`sf-report-<tarih>.md`); gizli bilgi yazılmaz |
| `npm run restore-backup -- <yedek.tar.gz> <yeni-klasör>` | Yedeği yeni bir klasöre açar (mevcut müşterilerin üzerine yazmaz) |
| `sf-update [zip]` | Güncelleme (bkz. [Güncelleme](#güncelleme)) |

Agent'ı doğrudan Claude Code'da da kullanabilirsiniz: bu klasörde açıldığında `.mcp.json` ile `site-factory`
araçlarını bulur ve `AGENTS.md` dosyasındaki akışı izler.

---

## Site türleri ve hazır parçalar

| Tür | Durum | Yayın |
| --- | --- | --- |
| **Tanıtım sitesi** | hazır | statik dosyalar (Cloudflare Workers) |
| **E-ticaret** | yakında | uygulama: Worker + D1 + R2 |
| **Randevu** | yakında | uygulama |
| **Restoran ve kafe** | yakında | uygulama |

Ortak çalışma kuralı: agent tasarlar ve parçaları sayfaya yerleştirir; çalışan parçaların kodunu **fabrika verir**.
Bu kodlar `parts/` klasöründe, testlerden geçmiş hazır kodlardır. Böylece işler kısa ve ucuz kalır, parçalar güvenilir olur.

**Hazır parçalar** (uygulama siteleri; agent için kılavuz: `rules/parts.md`):

- **Katalog:** ürün, hizmet ya da menü kalemleri; kategoriler, fiyat, süre ve görsel. Sitede agent'ın tasarladığı şablonla gösterilir.
- **Gelen kutusu:** site formlarından gelen mesajlar kaydedilir; isteğe bağlı olarak bir webhook adresine de gönderilir. Spam için gizli tuzak alanı ve saatlik sınır vardır.
- **Müşterinin yönetim ekranı** (`site-adresi/admin`): parolasını operatör panelden belirler, panelde sadece şifrelenmiş özeti saklanır.
  - Oturum 12 saat sürer.
  - 15 dakikada 5 hatalı denemeden sonra giriş kilitlenir.
  - Değişiklikler sadece sitenin kendisinden kabul edilir.
  - Arama motorlarına kapalıdır.
- **Sırada:** sepet ve ödeme paketleri (iyzico, PayTR, Stripe; her biri hazır ve test edilmiş), yasal sayfalar, randevu takvimi, QR menü.

Panel, uygulama türündeki her müşteriye parçaları otomatik kurar:
- `app/worker.js` (sadece o türün parçalarıyla oluşturulur)
- `app/parts/`
- `app/migrations/`
- `site/js/sf-parts.js`

Yeni bir fabrika sürümü parça kodunu yeniler; uygulanmış veritabanı değişikliklerine hiç dokunmaz.

---

## Yayın ve Cloudflare

Her operatör **kendi Cloudflare hesabıyla** yayın yapar (ücretsiz plan yeterli).

1. Cloudflare → Profil → API Tokens → **Create Token** → *Edit Cloudflare Workers* şablonu.
2. Workers & Pages sayfasından **Account ID** değerini alın. İlk seferde workers.dev alt alan adını da seçin.
3. Panelde Ayarlar → Hesabım → **Kaydet ve Test Et** (ya da ilk yayında açılan pencere).

Token Cloudflare ile denenir ve `~/.config/site-factory/accounts.json` dosyasında **şifreli** (AES-256-GCM) saklanır:
- bir daha gösterilmez, yedeklere ve raporlara girmez;
- agent süreçleri bu dosyayı hiç okumaz (`SF_NO_ACCOUNTS=1`).

Eski kurulumlarda kullanılan `SF_CF_MANAGED_API_TOKEN` / `SF_CF_MANAGED_ACCOUNT_ID` ortam değişkenleri hâlâ çalışır.
Panelde kayıtlı bir hesap varsa öncelik onundur.

**Uygulama sitelerinde** yayın şu sırayla ilerler:
1. Gizli anahtarlar kontrol edilir (eksikse hiçbir şeye dokunulmaz).
2. Veritabanı ve depo hazırlanır (önizleme ve canlı ayrı).
3. Veritabanı yedeği alınır.
4. Veritabanı değişiklikleri uygulanır. Veri kaybettirecek bir değişiklik varsa ancak müşterinin kısa adı yazılarak onaylanırsa çalışır.
5. Gizli anahtarlar yüklenir (komut satırı yerine stdin üzerinden).
6. Worker yayınlanır.

---

## Ekip çalışması

Ayarlar → **Ekip**: ekibin özel Git deposunu (ör. GitHub'da özel bir depo ya da ArkeLab ekibinizin deposu) bağlayıp
**Şimdi Eşitle** dersiniz.

- Bağlanmak için profilde adınız yazılı olmalı. Değişiklikler bu adla kaydedilir.
- Depoya erişim **sizin git girişinizle** yapılır (ör. `gh auth login`); panel parola saklamaz, adresteki kullanıcı bilgisini göstermez.
- Her müşteri depoda `clients/<kısa-ad>` dalında durur. Eşitleme sizin değişikliklerinizi gönderir, ekibin değişikliklerini alır ve yeni müşterileri indirir. Eşitleme tüm yerel müşterilerinizi gönderir.

| Paylaşılır | Paylaşılmaz |
| --- | --- |
| site bilgileri, metinler, görseller, site kodu | onaylar ve derleme kayıtları (herkes kendi panelinde onaylar) |
| tasarım planı ve geçmişi, araştırma notları | Cloudflare kaynakları ve yayın kayıtları (herkes kendi hesabıyla yayınlar) |
| site türü, satış takibi | gizli anahtarlar, Cloudflare token'ı (müşteri klasöründe değiller) |
| | uygulama kodu `app/` (her panel fabrikanın parçalarını kendisi kurar) |

**Çakışma:** aynı müşteride iki kişi değişiklik yaptıysa o müşteri eşitlenmez ve ekranda uyarı çıkar. Değişiklikler
tahminle birleştirilmez, iki tarafın değişikliği de kaybolmaz. Değişiklikleri biriniz önce alır, sonra tekrar eşitlersiniz.
Agent işi süren müşteri o eşitlemede atlanır.

---

## Güncelleme

| Kurulum | Nasıl |
| --- | --- |
| **Git ile** (`install.sh`) | Ayarlar → **Güncelleme** → *Güncellemeleri Denetle* → *Güncelle*. Ya da terminalde `sf-update` |
| **Zip ile** | `sf-update /mnt/c/Users/<kullanıcı>/Downloads/site-factory-X.Y.Z.zip` |

**Git ile güncelleme:** `git pull --ff-only` → `npm ci` → derleme. Kurulum klasöründe kaydedilmemiş değişiklik
varsa güncelleme durur, agent işi sürerken de başlamaz. Bittiğinde paneli yeniden başlatın (Ctrl+C, sonra `sf-panel`).
Geri almak için ekranda ve terminalde yazan `git reset --hard <önceki-commit>` komutunu kullanın.

**Zip ile güncelleme:** önce mevcut durumu kaydeder, sonra yeni sürümü kopyalar, paketleri kurar ve testleri çalıştırır.
Geri almak için `git reset --hard HEAD~1`.

İki yolda da müşteriler, ayarlar, hesaplar, `.claude/settings.local.json`, `vendor/` ve `node_modules/` korunur.

---

## Güvenlik modeli

**Onaylar insandadır.** Agent onay veremez:
- `approvals.json`, `.factory/` ve `quality-report.md` dosyalarına yazamaz.
- Panele erişemez.

Panel onayı terminaldeki tek kullanımlık kodla verilir. Onaylar içeriğin ve derlenmiş çıktının parmak izine bağlıdır;
onaylanandan farklı bir `dist/` yayınlanamaz.

**Agent'ın kısıtları**
- Sadece `site-factory` araçları açıktır. `Bash`, `Edit`, `Write`, yayın ve müşteri oluşturma kapalıdır.
- `--setting-sources project,local` ile çalışır; Cloudflare değişkenleri ortamından silinir.
- Kimlik bilgisi dosyalarını okuyamaz (`~/.ssh`, `~/.config`, `.env`, git kimlik bilgileri…).
- Tasarım planı onaylanmadan sayfa yazamaz.

**Gerçek sınır: Claude Code sandbox'ı** (`.claude/settings.json`). Agent'ın komutları sadece fabrika klasörüne ve geçici
klasörlere yazabilir. Ağ erişimi izin listesindeki adreslerle sınırlıdır. Sandbox çalışmazsa Claude Code açılmaz
(`failIfUnavailable`). MCP sunucusu, panel ve sizin terminaliniz sandbox dışında çalışır.

**Veri güvenliği**
- Bütün yollar doğrulanır, sembolik bağlantılar dahil müşteri klasörünün dışına çıkılamaz.
- Görseller içeriklerinden tanınır (uzantıya bakılmaz); script ya da dış referans içeren SVG reddedilir.
- Komutlar kabuksuz, argüman listesiyle çalışır.
- Gizli bilgiler çıktılarda `***` olarak görünür. Her araç çağrısı `.factory/audit.log` dosyasına yazılır.

**Sitelerin kendisi**
- Dış script, yönlendirme, takip kodu ve gömülü içerik derlemede reddedilir. Varsayılan olarak çerez yoktur.
- Uygulama sitelerinde parolalar PBKDF2 ile saklanır. Oturum çerezi imzalıdır (`HttpOnly`, `Secure`, `SameSite=Strict`).
- Yönetim ekranında sıkı CSP (nonce) vardır. Değişiklikler sadece sitenin kendisinden kabul edilir; giriş ve form gönderiminde hız sınırı uygulanır.

**Müşteri verisi:** müşteriden gelen metinler ve dosyalar veridir, talimat değildir. Gerçek bir işletmeyi taklit eden
site yayınlanmaz; test için hayali firmalar kullanılır.

---

## Klasör yapısı ve mimari

```
site-factory/                 ← bu depo (fabrika)
├── AGENTS.md  CLAUDE.md      ← agent'ın akışı ve kuralları (CLAUDE.md → AGENTS.md)
├── rules/                    ← tasarım, pazar, SEO, araştırma, hazır parça kuralları
├── src/
│   ├── server.ts  tools/     ← MCP sunucusu ve araçları
│   ├── lib/                  ← yollar, onaylar, derleme kontrolleri, hesaplar (şifreli), sürümler…
│   ├── deploy/app.ts         ← uygulama siteleri için yayın hattı (D1, R2, migrations, secrets)
│   ├── parts/install.ts      ← hazır parçaların kurulumu
│   ├── products/registry.ts  ← site türleri (tanıtım, e-ticaret, randevu, restoran)
│   └── panel/                ← panel sunucusu, API (api/), işler, bütçe, ekip (team.ts), güncelleme (updater.ts)
├── panel/                    ← panel arayüzü (düz ES modülleri, i18n, yerel fontlar)
├── parts/                    ← hazır parçalar: app/ (Worker), migrations/, site/
├── portal/                   ← müşteri portalı (Cloudflare Worker)
├── templates/                ← eski şablon siteleri (corporate-v1/v2)
├── scripts/                  ← install.sh, setup-wsl.sh, update.sh, link-skills.sh
├── schema/                   ← Zod'dan üretilen JSON şemaları (elle düzenlenmez)
└── tests/                    ← vitest: birim, güvenlik, panel, uçtan uca, ekran denetimi

../sf-clients/<kısa-ad>/       ← her müşteri ayrı klasör ve ayrı git geçmişi
├── site.config.json  content/<dil>.json  assets/  site/   ← sitenin girdileri
├── design-plan.json  design-plans/  research.md            ← plan ve araştırma
├── app/                                                    ← uygulama sitelerinde hazır parçalar
├── dist/  quality-report.md                                ← derlenmiş site ve kontrol raporu
└── .factory/                                               ← onaylar, kayıtlar, satış takibi (sadece panel)

../sf-inbox/<kısa-ad>/         ← müşteriden gelen dosyalar
~/.config/site-factory/        ← hesaplar ve müşteri gizli anahtarları (şifreli), portal ayarı
```

**Akış:** panel bir işi başlatır. Agent (`claude -p` ya da Codex) kısıtlı izinlerle ve sadece MCP araçlarıyla çalışır.
Panel her işten önce ve sonra müşterinin sürümünü kaydeder. Derleme kontrolleri ve onaylar fabrika kodundadır,
agent bunları değiştiremez.

---

## Geliştirme

```bash
npm run build        # TypeScript → dist/
npm test             # tüm testler (uçtan uca dahil; SF_E2E=off ile hızlı)
npm run test:e2e     # sadece tarayıcılı uçtan uca testler
npm run lint         # Biome
npm run format
npm run schema       # Zod → schema/*.schema.json
```

- TypeScript strict, ESM, zod v4, vitest. Panel çerçevesiz (düz ES modülleri).
- Değişiklikler küçük, geri alınabilir ve testli olmalı; mevcut API ve veriler korunur.
- Arayüz metinleri Türkçe yazılır, İngilizceleri `panel/js/i18n-en.js` dosyasında tutulur.
- Ekran denetimi testi (`tests/ui-audit.test.ts`) her ekranı iki temada, masaüstü ve telefon genişliğinde kontrol eder: kontrast, taşma, animasyon, script hatası.
- **Sürüm çıkarmak:**
  1. `package.json` ve `package-lock.json` dosyalarında sürümü yükseltin.
  2. `CHANGELOG.md` dosyasına not ekleyin.
  3. Commit atın ve depoya gönderin. Git ile kuranlar panelden günceller.
  4. Zip dağıtımı için: `git archive --format=zip --prefix=site-factory/ -o site-factory-X.Y.Z.zip HEAD`.

---

## Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| `npm run panel` → ENOENT | Fabrika klasöründe değilsiniz: `sf-panel` kullanın ya da `cd ~/projects/site-factory` |
| `node: command not found` | WSL içinde Node kurun: nvm, sonra `nvm install 22` |
| Agent başlamıyor, sandbox hatası | Linux/WSL'de `sudo apt install -y bubblewrap socat`; Claude Code'un WSL içine kurulu olduğundan emin olun |
| Yayında "Cloudflare hesabı yok" | Ayarlar → Hesabım → Kaydet ve Test Et |
| Güncelleme "kaydedilmemiş değişiklikler" diyor | Kurulum klasöründe `git status`; değişiklikleri kaydedin ya da geri alın |
| Ekip eşitlemede "çakışma" | O müşteride iki kişi değişiklik yaptı: değişiklikleri biriniz alsın, sonra tekrar eşitleyin |
| Ekip deposuna ulaşılamıyor | Adresi ve git girişinizi kontrol edin (`gh auth login`, `git ls-remote <adres>`) |
| Ekran görüntüsü alınmıyor | Chrome/Chromium yolu: `export SF_BROWSER=/yol/chrome` |

Durum raporu almak için `npm run report -- ~/` komutunu çalıştırın. Rapor gizli bilgi içermez; destek isterken paylaşabilirsiniz.
