# Site Factory

Küçük işletmelere (İngiltere) tanıtım sitesi üreten MCP server + kurallar.
Agent soruları üretir, cevapları doğrulanmış config'e işler, sabit bir şablon siteyi üretir,
kalite kontrolünden geçirir ve onaylarından sonra Cloudflare'e yayınlar.

**Agent kod yazmaz.** Sadece MCP tool'ları üzerinden config, içerik ve görsel kaydeder.

## Güncelleme

Yeni sürüm `site-factory-X.Y.Z.zip` olarak gelir. İndirilenler'e kaydet, WSL'de:

```bash
cd ~/projects/site-factory
bash scripts/update.sh /mnt/c/Users/<kullanıcı>/Downloads/site-factory-X.Y.Z.zip
```

Müşteriler, ayarlar ve araçlar korunur; önceki durum git'e kaydedilir (`git reset --hard HEAD~1` ile geri alınır).

## Yayından kaldırma (1.12.0)

Müşteri Bilgileri → Yayın → **Yayından kaldır**: "Önizlemeyi kaldır" ya da "Canlı siteyi kaldır" (canlı için kısa adı yeniden yazmak gerekir). Cloudflare'deki Worker silinir; müşterinin dosyaları, sürümleri ve onayları durur, yeniden yayınlanabilir. Agent bunu yapamaz (MCP aracı değil, sadece panel).

## Güvenlik düzeltmeleri (1.11.1)

- Agent yalnızca fabrika, müşteri ve inbox klasörlerini okuyabilir (önce her dosyayı okuyabiliyordu). `/proc`, `~/.ssh`, `~/.claude`, `~/.config`, kabuk profilleri (`~/.bashrc` vb.), `.env` dosyaları ayrıca açıkça yasak: müşteri metnine ya da bir web sayfasına gizlenmiş talimat, Cloudflare token'ını ya da anahtarları okutamaz.
- Ekran görüntüsü sunucusu yalnızca `dist/` içinden dosya verir (adı "dist" ile başlayan komşu klasör artık açılamaz).
- Marka kartındaki imza önizlemesinde güvenlik politikası (CSP) belgenin en başında.

## Kod kalitesi (1.11.0)

- `npm run lint`: Biome, sadece uyarı verir (boş blok, kullanılmayan import, 80 satırı aşan fonksiyon). Derlemeyi ve testleri durdurmaz.
- Panel API alanlara bölündü (`src/panel/api/`); iş türleri ve düzenleme formları birer kayıt tablosunda: yeni iş türü = tek kayıt.
- Panel arayüzü ES modüllerine bölündü (`panel/js/`, derleme adımı yok). Bir modülde import edilmeyen isim testte yakalanır.
- Arayüz duman testleri (`tests/ui.test.ts`) gerçek tarayıcıda ana ekranları açar. Linux'ta Chromium/Chrome yoksa (ör. WSL'de sadece Windows tarayıcısı) atlanır; `SF_UI_TESTS=off` ile kapatılır.
- Davranış değişikliği yok.

## Kütüphane: sabit alanlar ve başlangıç tasarımı (1.10.0)

- **Sabit alanlar:** Tasarım Kütüphanesi → "Sabit alanları yönet". Tasarımda geçen müşteriye özel metni (ad, telefon, e-posta, adres, saatler, alan adı, harita, Instagram, Facebook) bir alana bağla. Kaydederken kaynak müşterinin bilgileri otomatik eklenir; her satırın yanında tasarımda kaç yerde geçtiği görünür.
- **Kullanırken:** Panel bu metinleri yeni müşterinin bilgisiyle kendisi değiştirir (agent'sız). Müşterinin o bilgisi yoksa metin kalır, agent'a bırakılır ve derleme o metin değişene kadar başarısız olur.
- **Yeni Müşteri formu:** "Başlangıç tasarımı" seçilebilir (sektöre uyanlar ★ ile önce). İlk "Siteyi Oluştur" çalışmasında bir kez uygulanır; sonraki çalışmalar siteyi tekrar değiştirmez.

## Kaynak tasarrufu (1.9.0)

- **Doğrudan düzenleme:** Renk kodu, sayfada birebir geçen metin, e-posta / adres / çalışma saatleri değişiklikleri agent'sız yapılır, site yeniden derlenir ("Kaynak kullanılmadı"). Değer bulunamazsa iş agent'a gider; tahminle değiştirilmez.
- **Kısa geçmiş:** Küçük işlere önceki girdilerin yalnızca en yenileri (~4.000 karakter) verilir; tasarım işleri tamamını alır.
- **Kural arama:** Düzeltme ve derleme-onarım işleri kuralları baştan sona okumaz; `search_design_knowledge`, `site_map`, `read_site_file_part`, `edit_site_file` ile gerekeni alır.
- **Yazarken kontrol:** `write_site_file` / `edit_site_file` güvenlik sorunlarını hemen bildirir; derleme sonunda tekrar tur atılmaz.
- **Temel CSS:** Serbest tasarımlara `css/base.css` (reset, düzen, buton, form, azaltılmış hareket) bir kez kopyalanır; agent bunları tekrar yazmaz. Var olan dosyaya dokunulmaz.
- **Araştırma notları:** Doğrulanan bilgiler `<müşteri>/research.md`'ye kaydedilir, sonraki işler web'i tekrar taramaz.
- **İkinci dil ayrı iş:** Tasarım yalnızca varsayılan dilde yapılır; başarıyla bitince "Diğer diller" işi daha ucuz modelle otomatik başlar.

## Serbest tasarım (yeni müşterilerin varsayılanı)

Agent her müşteri için önce **marka kimliğini** tasarlar (konsept, logo, renkler, yazı tipleri, görsel dil ve o işe özel 2–4 imza animasyonu: turşucuda kavanozun dolması, kabarcıklar, kapağın açılması gibi), sonra siteyi sıfırdan yazar. Kurallar `rules/custom-site.md`, örnek `rules/examples/uzunoglu/`.

**Marka kartı (Marka Atölyesi):** her markanın bir sloganı, bir **imza hareketi** (adı, fikri ve kendi canlı demosu `site/brand/signature.html`) ve tipografi örneği olur. Panelde müşterinin **Marka** sekmesi bunu koyu bir kart olarak gösterir: logo ve slogan, adlandırılmış renkler, canlı imza hareketi, yazı tipleri, logonun koyu zeminde hâli, "Logoyu indir" ve "Yazdır / PDF". Eksikse kart "Marka kartını tamamlat" düğmesi gösterir; build durmaz, uyarı verir (eski siteler bozulmaz). İmza demosu panelde kum havuzunda çalışır: panele, çereze ve internete erişemez.

**1.8.0 — yeni panel düzeni:** kurumsal tema (petrol ve pirinç, koyu menü), resmî adlandırma; müşteri sayfasında durum şeridi (adımlar + yapılacak iş), solda canlı önizleme (telefon / masaüstü, kontroller, sürüm geçmişi), sağda 4 sekme: Düzenleme (hızlı düzenleme formları + Özel Talep), Marka Kimliği, Teklif, Müşteri Bilgileri (iş takibi, metinler, görseller, onay ve yayın). Ayarlar; Genel, Kaynak Kullanımı, Yayın ve Yedek bölümlerine ayrıldı. Paketler: Temel / Standart / Premium. Animasyonlar skill'lerin hareket kurallarıyla (kısa, ease-out, sayfa başına bir kez; hareket azaltma açıksa yok).

**1.7.0 — token bütçesi:**
- **Modlar** (Ayarlar → Token bütçesi; müşteri bazında Bilgiler → iş bilgileri): *Ekonomik* (tasarım sonnet, düzenleme haiku, araştırma kapalı, ekran görüntüsüne bakmaz), *Dengeli* (varsayılan: tasarım opus, düzenleme sonnet), *Premium* (her şey opus, skill'ler tam yüklenir). Mod; modeli, adım sınırını ve iş başına token tavanını belirler; tavanı aşan iş durdurulur, yazdıkları kalır.
- **Ölçüm:** her işin token'ı, modeli ve tahmini maliyeti sohbette; müşteri toplamı iş bilgilerinde; aylık toplam ve bütçe çubuğu Ayarlar'da. Aylık bütçe dolunca yeni iş başlamaz (0 = sınırsız). "Token" ağırlıklıdır: önbellekten okunan 1/10 sayılır.
- **Ucuz düzenleme araçları:** agent önce `site_map` ile sitenin haritasına bakar, sadece gereken parçayı okur (`read_site_file_part`) ve sadece değişen satırları değiştirir (`edit_site_file`); dosyaları baştan yazmaz.
- **Tasarım bilgisi araması:** `search_design_knowledge` kurallar ve skill'ler içinde arar, birkaç ilgili parça döner; Ekonomik ve Dengeli modda skill'ler bütünüyle yüklenmez.
- **Kütüphane araması:** kütüphanede arama kutusu; yeni müşteride sektörüne uyan tasarımlar ★ ile önce gelir.

**1.6.0 ile gelenler:**
- **Düzenle sekmesi:** sohbet yerine formlar. Renkler (renk seçici), sayfalar (işaretle), hizmetler ve fiyatlar (tablo), metin değiştir, iletişim formu, hızlı düzenleme. Agent'a sadece o değişikliği yapan net bir talimat gider; basit olanları panel kendisi kaydeder.
- **Tasarım kütüphanesi** (üstteki kitap simgesi): Marka sekmesinden "Kütüphaneye kaydet"; yeni müşteride "Başlangıç tasarımı" olarak seç ya da "Bu tasarımla yeniden kur". Logo ve müşterinin bilgileri taşınmaz; eski müşterinin adı, telefonu, e-postası sitede kalırsa build durur.
- **Gruplama:** ana sayfada duruma / sektöre / etikete göre; etiketler Bilgiler → iş bilgilerinde.
- **Teklif:** Bilgiler → "Teklif hazırla"; metinler tıklanıp düzeltilir, Yazdır / PDF. Gönderen bilgileri Ayarlar → Teklif.
- **Yedek:** Ayarlar → Yedek; klasör seç (ör. OneDrive). İş bittikçe otomatik (en sık 30 dakikada bir), son 10 yedek.
- **Agent sitesini görür:** build telefon ve masaüstü ekran görüntüsü alır (Windows'taki Edge/Chrome ya da Linux Chrome; yoksa atlanır), agent bakıp düzeltir. Gerekirse `export SF_BROWSER=/yol/chrome`.
- **İletişim formu:** Düzenle → İletişim formu; Formspree / Getform / FormSubmit / Web3Forms adresini sadece sen girersin.

**Önce araştır, sor, sonra tasarla** (`rules/research.md`): agent emin olmadığı hiçbir bilgiyi uydurmaz, sana sorar. "Siteyi hazırla"da "Önce araştırsın ve bana sorsun" işaretliyse (varsayılan) önce işletmeyi ve sektördeki iyi siteleri araştırır, bulduklarını kaynaklarıyla (doğrulanmış / tahmin / doğrulanamayan) ve en fazla 5 soruyla getirir, tasarıma geçmez; cevapları yapıştırıp tekrar basınca devam eder. İnternet erişimi Ayarlar → "İnternet araştırması" ile açılıp kapanır (varsayılan açık).

**İmza tasarım:** her sayfada marka hissedilmeli: kahramanda büyük imza hareketi, marka etiketleri (ör. `No. 01 · Saç kesimi · 30 dk`), en az bir kompozisyon bölümü, logonun grafik olarak tekrar kullanımı, ekranı dolduran düzen. Build "Design depth" uyarısıyla düz sayfaları yakalar. Var olan bir siteyi bu seviyeye çekmek için **Marka** sekmesinde "Markayla yeniden tasarla" (bilgiler ve fiyatlar aynı kalır).

**Tasarım skill'leri:** agent `.claude/skills/` altındaki **Impeccable**, **taste-skill** ve **UI UX Pro Max** skill'lerini yükler (lisansları klasörlerinde; UI UX Pro Max `scripts/link-skills.sh` ile vendor'dan kopyalanır, kurulum ve güncelleme bunu kendisi çalıştırır). Skill'lerin script'leri çalışmaz (agent'ta Bash yok); çakışırsa fabrikanın kuralları geçerli.

Build her seferinde kontrol eder: marka dosyası ve logo var mı, renkler ve animasyonlar gerçekten kullanılmış mı, dışarıdan script / yönlendirme / takip / gömülü içerik var mı, linkler çalışıyor mu, başlık-açıklama-alt metin tam mı. Onaylar ve yayın aynı.

## Şablonlar

- **corporate-v2** (yeni müşterilerin varsayılanı): sektöre göre üç kişilik (cesur / premium / samimi) ve animasyonlu sektör motifi (turşu kavanozu, kod editörü, fincan, makas…). Agent seçer; kurallar `rules/design-rules.md`.
- **corporate-v1**: eski siteler aynen çalışır, çıktıları değişmez. Panelde müşteri sayfasında **Yeni şablona geç** butonu çıkar; basınca agent siteyi v2'ye taşır ve build alır, sen bakıp onaylarsın.

## Panel (günlük kullanım)

```bash
cd ~/projects/site-factory
npm run panel
```

Terminal bir bağlantı yazar (`http://127.0.0.1:4777/login?key=…`); Windows'taki tarayıcıda açın.
Anahtar her başlatmada yenilenir ve sadece o oturumda geçerlidir. Panel sadece bu bilgisayardan erişilebilir.

**En kısa yol:** müşteri sayfasının üstündeki kutuya bildiklerini yapıştır → **Siteyi hazırla**. Agent bilgileri kaydeder,
tasarımı seçer, metinleri yazar, siteyi oluşturur. Eksik varsa Türkçe sorar; cevabı yazıp tekrar basarsın.
Site hazır olunca **Siteye bak**, beğenirsen tek onay: `npm run approve -- <slug> site` (metin + görünüm).

| Sekme | Ne yaparsınız |
| --- | --- |
| Yeni müşteri | İşletme adı, sektör, barındırma, dil |
| Sorular | 1./2. tur formunu üretir, metni kopyalayıp müşteriye gönderirsiniz |
| Cevaplar | Cevapları soru soru ya da serbest metin olarak girer, logo/fotoğraf yüklersiniz → **Cevapları agent'a işlet** |
| Agent | **Tasarım ve metinleri oluştur**, serbest **Değişiklik iste**, metinleri okuma |
| Build | Build + kalite raporu, **Önizlemeyi aç** (http://127.0.0.1:4778) |
| Onay ve yayın | Onay komutlarını kopyalarsınız (terminalde verilir), önizleme / canlı yayın |

Agent işleri arka planda Claude Code ile (`claude -p`) çalışır, sağdaki kayıtta canlı görünür.
Agent bu işlerde **sadece** site-factory araçlarını kullanabilir: shell, dosya düzenleme, yayın ve müşteri oluşturma kapalı;
Cloudflare değişkenleri agent'a hiç verilmez. Aynı anda tek iş çalışır.
**Onay:** panelde **Onayla** butonu. Panel, başlattığın terminalde yazan 6 haneli **onay kodunu** sorar; kod sadece o terminalde görünür, tarayıcıya ve agent'a gitmez, her başlatmada değişir, 5 yanlış denemede kilitlenir. İstersen eskisi gibi terminalden de onaylayabilirsin: `npm run approve -- <slug> <site|production>`.

**Diğerleri:**
- **Ülke:** yeni müşteride Türkiye (Türkçe, ₺) ya da İngiltere (İngilizce, £).
- **İlerleme:** uzun işlerde aşama, geçen süre ve tahmini süre; bitince ses ve bildirim.
- **Ayarlar (dişli simgesi):** Cloudflare kurulum adımları ve bağlantı testi.
- **Site ve yayın:** telefon/masaüstü görünümü, hızlı düzenleme (telefon, e-posta, adres, saat, WhatsApp), önceki sürümlere dönme, 3 tasarım önerisi (serbest tasarımda).
- **Bilgiler:** iş takibi (fiyat, ödeme durumu, teslim tarihi, not); anasayfadaki kartlarda görünür, geciken teslim kırmızı.

**Müşteri arşivleme:** müşteri sayfasındaki **Arşivle** düğmesi (kısa adı yazarak onaylanır). Silmez:
`sf-clients/<slug>` ve `sf-inbox/<slug>` klasörleri `_archive/<slug>-<tarih>` altına taşınır. Geri almak için klasörü
eski yerine taşıyıp adını `<slug>` yapın. Yayındaki site kapanmaz; Cloudflare'den ayrıca kaldırılır.

## Klasör yapısı

```
site-factory/            ← bu repo (fabrika)
├── AGENTS.md            ← agent'ın akış ve kuralları (CLAUDE.md buna yönlendirir)
├── rules/design-rules.md← tasarım kuralları + görsel onay kontrol listesi
├── src/schema/          ← Zod şema (TEK KAYNAK) + soru listesi (questions.ts)
├── schema/*.json        ← Zod'dan üretilir (npm run schema), elle düzenlenmez
├── src/tools.ts         ← MCP tool'ları
├── src/panel/api.ts     ← panel API rotaları; işleyiciler src/panel/api/ (clients, edit, agent, library, ops)
├── panel/app.js         ← panel arayüzü girişi; ekranlar panel/js/ (core, shell, home, client, brand, library…)
├── templates/           ← şablonlar (corporate-v1, corporate-v2) — senin agent'la yapacağın kısım
└── factory.config.json  ← klasör yolları ve limitler

../sf-clients/<slug>/    ← her müşteri ayrı klasör + ayrı git repo
├── site.config.json     ← yapı ve dilden bağımsız bilgiler
├── content/en.json      ← tüm metinler (dil başına bir dosya)
├── assets/              ← logo ve görseller (save_asset ile)
├── questionnaires/      ← müşteriye gönderilen formlar
├── dist/                ← üretilen site
├── quality-report.md    ← son build'in kontrol raporu
└── .factory/            ← onaylar, son build/deploy kaydı, audit log

../sf-inbox/             ← müşteriden gelen dosyaları buraya koyarsın
```

## Kurulum (Windows: WSL2 içinde)

Projeyi WSL'in kendi diskine koy (`~/projects/site-factory`), Windows sürücüsüne (`/mnt/c/...`) değil.
Claude Code'u da WSL içine kur ve bu klasörden çalıştır; sandbox sadece böyle devreye girer.

```bash
mkdir -p ~/projects && cd ~/projects
unzip /mnt/c/Users/<kullanıcı>/Downloads/site-factory.zip      # site-factory/ klasörü çıkar
cd site-factory
bash scripts/setup-wsl.sh --check   # sadece kontrol, hiçbir şeyi değiştirmez
bash scripts/setup-wsl.sh           # klasörler + settings.local.json + git init + npm ci/build/test
```

Script `../sf-clients` ve `../sf-inbox` klasörlerini oluşturur, eksik araç varsa kurulum komutunu yazar
(kendisi sistem paketi kurmaz, hiçbir şeyi silmez). Windows'tan erişim: `\\wsl$\Ubuntu\home\<kullanıcı>\projects`.

Elle kurulum:

```bash
npm install
npm run build          # dist/server.js
npm test               # 31 test: güvenlik, akış, MCP stdio, düzeltmeler, onay sabitleme
```

Claude Code bu klasörde açıldığında `.mcp.json` ile server'ı otomatik bulur (`node dist/server.js`).
Kod değiştirince `npm run build` yeniden çalıştır.

İsteğe bağlı:
- **UI UX Pro Max** (sektöre göre tasarım önerisi) ve **Impeccable** (tasarım hataları kontrolü) `scripts/setup-wsl.sh` ile kurulur.
  Impeccable uyarıları kalite raporuna yazılır, build'i durdurmaz; sadece "error" seviyesi durdurur.

## Akış (kısaca)

| Adım | Kim | Ne |
| --- | --- | --- |
| 1 | Sen → agent | "Yeni site: Willow & Thread, bridal salon" (veya `/mcp__site-factory__new-site`) |
| 2 | Agent | `create_client` + 1. tur formu (10 soru). Sen müşteriye gönderirsin |
| 3 | Sen | Cevabı agent'a yapıştırırsın, dosyaları `../sf-inbox/`'a koyarsın |
| 4 | Agent | Cevapları kaydeder, eksik varsa 2. tur form |
| 5 | Agent | Tasarım sistemi + tüm metinler |
| 6 | **Sen** | `npm run approve -- <slug> content` |
| 7 | Agent | `build_site` → `quality-report.md` |
| 8 | **Sen** | `dist/`'i aç, design-rules.md'deki listeyle bak → `npm run approve -- <slug> visual` |
| 9 | Agent | `deploy` preview → link abine/müşteriye |
| 10 | **Sen** | Müşteri onaylayınca `npm run approve -- <slug> production` |
| 11 | Agent | `deploy` production |

Herhangi bir adımda: agent'a "durum ne?" de → `get_client_status`.

## Onaylar neden terminalde?

Onaylar sadece sen etkileşimli terminalde slug'ı yazınca verilir. Agent'ın shell'i TTY olmadığı için
onay veremez; ayrıca `.claude/settings.json` bu komutu agent'a yasaklar. Her onay o anki içerik
hash'ine bağlıdır: config, metin veya görselde en küçük değişiklik onayı geçersiz kılar.
`visual` ve `production` onayları ayrıca son build'in `dist/` hash'ine bağlıdır: şablon değişip çıktı farklılaşırsa
ya da `dist/` elle değiştirilirse onay geçmez ve deploy durur. Geçerli bir build yoksa bu onaylar verilemez.
Onay sırasında içerik değişirse (slug'ı yazarken) onay kaydedilmez.

## Cloudflare (deploy için)

MCP server'ın ortamında (Claude Code'u başlattığın shell'de) tanımla, dosyalara yazma:

```bash
# hosting.model = managed (senin hesabın)
export SF_CF_MANAGED_API_TOKEN=...
export SF_CF_MANAGED_ACCOUNT_ID=...
# hosting.model = client (müşterinin hesabı), slug: harbour-dental
export SF_CF_CLIENT_HARBOUR_DENTAL_API_TOKEN=...
export SF_CF_CLIENT_HARBOUR_DENTAL_ACCOUNT_ID=...
```

İletişim formu için (isteğe bağlı) aynı ortamda `export SF_FORM_ACTION=https://...` tanımla; build_site bunu şablona geçirir. Yoksa form yerine e-posta/telefon/WhatsApp butonları çıkar.

İlk kez: Cloudflare panelinde **Workers & Pages** sayfasını bir kez açıp workers.dev alt alan adını seç (ör. `eren.workers.dev`).
Önizleme `sf-<slug>-preview.<alt-alan>.workers.dev` adresine, canlı site `sf-<slug>` Worker'ına (+ alan adı) gider.

Token yetkisi: sadece *Workers Scripts: Edit* (+ alan adı bağlanacaksa ilgili zone için DNS/Workers Routes).
Tokenlar log'lara ve tool çıktısına `***` olarak düşer. `deploy` `dryRun: true` ile yükleme yapmadan kontrol eder.

## Şablon sözleşmesi (örnekleri agent'la yaparken)

`build_site` şablondan sadece şunu bekler (detay AGENTS.md → "Working on templates"):

- `templates/<ad>/package.json` içinde `npm run build`
- Girdi: `SF_CLIENT_DIR` ortam değişkenindeki klasör (`site.config.json`, `content/<dil>.json`, `assets/`)
- Çıktı: `SF_OUT_DIR` klasörüne statik site (`index.html` zorunlu)
- Bir kez `npm install` (node_modules yoksa build durur)

İlk şablon için agent'a şunu diyebilirsin:
> "AGENTS.md'deki şablon sözleşmesine ve design-rules.md'ye göre templates/corporate-v1'i Astro + Tailwind ile kur.
> Şemayı schema/*.schema.json'dan oku, varyantları (a/b/c) ve bölüm registry'sini kur. Sonra demo bir müşteriyle build_site çalıştır."

## Güvenlik özeti

- Slug ve tüm yollar doğrulanır; müşteri klasörü/inbox dışına çıkılamaz (symlink dahil).
- Görseller içerikten tanınır (uzantıya bakılmaz); zararlı SVG (script, olay, dış referans, entity) reddedilir.
- Komutlar shell'siz, argüman listesiyle çalışır; alt sürece sadece izinli ortam değişkenleri geçer.
- Geçersiz değer içeren patch'in hiçbir parçası kaydedilmez; kayıtlar atomik yazılır.
- Her tool çağrısı `.factory/audit.log`'a (sırlar maskeli) yazılır.
- Yanlış yazılmış alan adları (`contakt` gibi) reddedilir; `meta` sadece `unmapped`/`laterInterests` ile değişir.
- `visual`/`production` onayları `dist/` hash'ine bağlıdır; deploy, onaylanan çıktıdan farklı bir `dist/` yüklemez.

### Agent'a karşı neyin gerçek sınır olduğu

Agent seninle aynı kullanıcı olarak çalışır. Şunlar **tek başına sınır değildir**, sadece yönlendirir:
`AGENTS.md`, `permissions.deny` kuralları (Bash kalıpları aşılabilir) ve onay CLI'ının TTY kontrolü
(`script`/`expect` gibi araçlarla sahte terminal açılabilir).

Gerçek sınır **Claude Code sandbox'ı** (`.claude/settings.json` → `sandbox`, macOS'ta işletim sistemi uygular):
- Agent'ın Bash komutları sadece bu klasöre, geçici klasöre ve `~/.npm`'e yazabilir. `../sf-clients/` dışarıda kaldığı için
  agent Bash ile `approvals.json`'a, `dist/`'e veya müşteri dosyalarına yazamaz; onay CLI'ı da sandbox içinden onay kaydedemez.
- Ağ sadece listedeki alan adlarına açık (npm, GitHub, Google Fonts). Cloudflare'e doğrudan erişim yok.
- `SF_CF_MANAGED_*` değişkenleri agent'ın komutlarından silinir.
- `allowUnsandboxedCommands: false` + `failIfUnavailable: true`: sandbox dışına kaçış yok; sandbox çalışmazsa Claude Code açılmaz.

MCP server ve senin kendi terminalin sandbox dışında çalışır; build, deploy ve onay normal işler.

Kurulumdan sonra bir kez yapılacaklar:
1. `.claude/settings.local.json.example` dosyasını `.claude/settings.local.json` olarak kopyala, `sf-clients` klasörünün
   **mutlak** yolunu yaz (agent'ın Edit/Write araçları sandbox dışında çalışır, bu kural onları durdurur).
2. `client` hosting modelindeki her müşterinin `SF_CF_CLIENT_<SLUG>_*` değişkenlerini aynı dosyadaki listeye ekle.
3. Claude Code'da `/sandbox` → Config sekmesinde kuralların göründüğünü kontrol et.

Bir şey bozulursa (ör. agent'ın ihtiyaç duyduğu bir alan adı engelleniyorsa) `network.allowedDomains`'e ekle;
sandbox'ı tamamen kapatmak için `sandbox` bloğunu silmek yeterli (geri alma).

## Henüz yok (bilinçli)

Lighthouse otomasyonu, görsel regresyon, rollback/domain tool'ları, config migrator, izleme script'leri.
Plan dokümanındaki "Büyüyünce" bölümü — ihtiyaç doğunca eklenecek.
