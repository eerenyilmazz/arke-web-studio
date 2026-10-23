# Sürüm notları

En yeni sürüm üstte. Kurulum ve kullanım için `README.md`.

## 2.2.2: Metin listesinde "!doctype html>" satırı

- Hızlı Düzenleme → Metin listesinde sayfanın `<!doctype html>` satırı metin gibi görünüyordu. Artık doctype, XML bildirimi ve benzeri satırlar atlanıyor. Diğer metinlerin kimlikleri değişmedi.

## 2.2.1: Ayarlarda tek menü

- Geniş ekranda Ayarlar bölümleri (Hesabım, Genel, Ekip…) artık sol ana menüde, "Ayarlar"ın altında açılıyor. Yan yana iki menü yok. Telefonda bölümler sayfanın üstünde kalıyor.
- Sayfanın sağa kayıp kesilmesi düzeldi; içerik tek sütun ve ortada.
- Bölümle aynı adı taşıyan kartın başlığı (ör. Yedek altında "Yedek") tekrar etmiyor.
- Ekran denetimine 1024 piksel genişlik eklendi.

## 2.2.0: Hızlı Düzenleme, Yeni Müşteri ve Ayarlar yeniden tasarlandı

**Hızlı Düzenleme**
- Düğme yığını yerine sitenin bugünkü hâlini gösteren bir liste: renk örnekleri, açık sayfalar, hizmet sayısı, telefon ve e-posta, form durumu, logo.
- Satıra tıklayınca düzenleyici aynı kartta açılır ("← Hızlı Düzenleme" ile dönülür). Her düzenleyicinin altında aynı çubuk: kaç değişiklik var, "Vazgeç", uygula. Değişiklik yoksa ya da bir hata varsa uygula kapalı.
- **Renk Paleti:** renk kartları, kodu elle yazma, her renkte eskiye dönme, canlı önizleme (başlık, paragraf, buton) ve okunurluk ölçümü (kontrast oranı).
- **Sayfalar:** her sayfa için açma/kapama düğmesi ve kısa açıklama; "eklenecek" / "kaldırılacak" etiketleri. Siteye özel ek sayfalar artık listede ve uygulayınca kaybolmuyor. Ek sayfa ve blog yazısı açılır kapanır bölümlerde.
- **Hizmetler ve Fiyatlar:** sürükleyerek ya da oklarla sıralama, sıra numarası, adı boş satır ve 12 sınırı uyarısı.
- **Metin:** sayfa seçimi, arama, "sadece değişenler" süzgeci, sekme başlığı (60) ve arama açıklaması (160) için uzunluk sayacı, metin başına geri alma.
- **İletişim Bilgileri:** gruplu alanlar, e-posta ve telefon denetimi, değişen alan işareti.
- **İletişim Formu:** üç adımlı durum (servisi aç, adresi kaydet, siteye ekle), adres yazılırken servis tanınıyor (Formspree, Getform, FormSubmit, Web3Forms); erişim anahtarı yalnızca Web3Forms'ta isteniyor; adres kaldırılabiliyor.
- **Logo ve Görseller:** logo alanı, görsellerin ızgara hâlinde durumu (Sitede / Bekliyor), sürükle-bırak yükleme. Müşteri Bilgileri'ndeki görseller de aynı görünümde.

**Yeni Müşteri**
- Solda adımlar ve her adımda girilenlerin özeti (ad ve sektör, paket ve toplam, logo ve fotoğraf sayısı, metin uzunluğu); altında siteyi başlatmak için eksikler.
- Adımlar başlıklı bölümlere ayrıldı. Sektör için örnek düğmeleri; barındırma ve paket açıklamalı kartlarla seçiliyor; fiyat kutusunda para birimi; ek seçeneklerin altında canlı teklif toplamı.
- Logo ve fotoğraflar sürükle-bırak; fotoğraflar küçük resimlerle görünüyor ve sonradan eklenebiliyor.
- Bilgiler adımında metinde telefon, e-posta, adres, saatler, fiyat ve hizmet olup olmadığı gösteriliyor.
- Özet adımı gruplu; her grubun "Düzenle" düğmesi ilgili adıma dönüyor. "İleri" düğmesi bir sonraki adımın adını söylüyor.

**Ayarlar**
- Solda gruplu menü (Kişisel, Çalışma, Sistem) ve simgeler; sağda bölüm başlığı ve açıklaması.
- Her kart başlık, içerik ve düğme çubuğu olarak düzenlendi; alanlar okunur genişlikte.

**Teknik**
- Yeni görünüm ayrı bir stil dosyasında (`panel/studio.css`); kaldırılırsa eski görünüme dönülür. Sunucu tarafı ve API değişmedi.
- İngilizce panel testi artık her düzenleyiciyi, her ayar bölümünü ve sihirbazın her adımını da denetliyor; ekran denetimi bu ekranların görüntülerini de alıyor.

## 2.1.0: ilk gerçek denemeden çıkan düzeltmeler

**Panel**
- **Site türü:** dört büyük kart yerine tek satırlık bir seçici; seçilen türün açıklaması altında görünüyor, hazır olmayan türlerde "yakında" yazıyor.
- **Yeni müşteri formu:** açıklamalar kutuların altına alındı; İşletme adı ve Kısa ad kutuları artık aynı hizada.
- **Ayarlar sekmeli:** her seferinde tek bölüm görünüyor (Hesabım, Genel, Ekip…), son açılan bölüm hatırlanıyor. Sayfa içindeki bölüm linkleri ilgili sekmeyi açıyor.
- **Müşteri Bilgileri sekmeli:** İş Takibi, Müşteri Linkleri, Metinler, Logo ve Görseller, Onay ve Yayın, Soru Formu ayrı sekmeler. Site onay bekliyorsa ya da yayındaysa ilk açılışta Onay ve Yayın sekmesi geliyor.
- **Analiz filtreleri sade:** arama, Hepsi / Gecikenler / Kontrol hatası görünümleri ve "Filtre ekle" düğmesi var. Seçili filtreler, tek tıkla kaldırılabilen küçük etiketler olarak görünüyor.
- **Adım çubuğu doğru:** site henüz kurulmamışken "Onay Bekleniyor" yerine "Site Oluşturuluyor" görünüyor.
- **Menü ve üst bar:** açık bir menü artık üst barın üstüne binmiyor.
- **İş sürerken:** "Site oluşturuluyor" kartında yazı kutusu ve düğmeler gizleniyor.
- **3 tasarım önerisi:** artık önce onay soruyor; onaylı bir plan varsa bunu ayrıca belirtiyor.
- **Profil:** "Stüdyo adı" alanı kaldırıldı (2.0.1).

**Agent**
- **Talep doğru işe gidiyor:** site henüz kurulmamışken Özel Talep'e yazılanlar değişiklik işi olarak değil, "Siteyi hazırla"nın devamı olarak gidiyor. Böylece önceki bütün bilgiler de işe dahil oluyor.
- **Bilgiler kendi alanlarına kaydediliyor:** iletişim, çalışma saatleri, sosyal medya, WhatsApp ve şirket unvanı hemen kaydediliyor. Hizmet, fiyat, SSS ve yorumlar metinler yazılırken kendi alanlarına taşınıyor; alanı olan bilgi "eşlenmemiş notlar"da kalmıyor.
- **En fazla 5 soru:** sadece site için gerçekten gerekli bilgiler soruluyor. Panelde senin ayarladığın konular (form servisi, barındırma, diller, ekler) ve isteğe bağlı şeyler (harita linki, beğenilen siteler) sorulmuyor.
- **İşletme adı korunuyor:** agent işletme adını değiştiremiyor. Şirket unvanını ayrı bir alana yazıyor; farklı bir ad görürse sana soruyor.
- **Her işte müşterinin kısa adı veriliyor;** araçlar artık kısa ad olmadan çağrılmıyor.
- **Sade dil:** özetlerde dosya, alan ve araç adları geçmiyor.
- **Tasarım planı:**
  - Başlık yazı tipi sistem fontu olamıyor; karakterli bir Google Font gerekiyor.
  - İmza hareketinin canlı önizlemesi yazılmadan plan kaydedilmiyor.
- **Tek tema:** açık temada bütün sayfa açık, koyu temada bütün sayfa koyu. Yarı açık yarı koyu bantlar artık yok.

## 2.0.1: geniş ekran düzeni, profil sadeleşti

- **Geniş ekranlarda sayfalar ortalandı:** Yeni Müşteri, Arşiv ve boş ana ekran artık sol kenara yaslı durmuyor.
- **Ayarlar iki sütunlu:** kartlar 1200px ve üstünde iki sütuna diziliyor; tek kartlı bölümler, agent tablosu, Ekip ve Güncelleme tam genişlikte.
- **Profilden "Stüdyo adı" alanı kaldırıldı:** sadece adınız ve panel diliniz soruluyor. Teklifte gönderen boşsa adınız yazılıyor.

## 2.0.0: yeni ad, Arke Web Studio (temiz başlangıç)

1.30.0 zip'inin yerini alır; o sürüm kullanılmamalı (eski adlara uyumluluk tutuyordu).

- **Ürünün adı her yerde Arke Web Studio:** panel, belgeler, agent kuralları ve komutları.
- **Teknik adlar da tamamen değişti; eski adlara uyumluluk tutulmadı:**

  | Ne | Yeni ad |
  | --- | --- |
  | paket, klasör, zip | `arke-web-studio` |
  | MCP sunucusu | `arke-web` (`mcp__arke-web__*`) |
  | komutlar | `arke-panel`, `arke-update` |
  | klasörler | `../arke-clients`, `../arke-inbox` |
  | ayarlar | `~/.config/arke-web-studio` |
  | ortam değişkenleri | `ARKE_` önekiyle |
  | Worker'lar | `arke-<kısa-ad>`, `arke-portal` |
  | site içindeki adlar | `data-arke-*`, `js/arke-parts.js`, `ArkeMotion`, yönetim ekranı çerezi `__Host-arke_admin` |

- **Eski kurulumlar bozulur:**
  - Eski müşteri klasörleri, hesaplar ve ortam değişkenleri artık okunmuyor; kendin taşıman gerekiyor (aşağıda).
  - Daha önce yayınlanmış `sf-…` Worker'ları yenisiyle değiştirilmez, Cloudflare'de ayrıca durur.
  - Eski sitelerin sayfaları yeni hareket ve parça adlarıyla yeniden oluşturulmalı.
  - Panel çerezi ve tarayıcı tercihleri sıfırlanır.
- **Güvenlik:** agent'ın ortamından Cloudflare değişkenleri (`ARKE_CF_*`) ve wrangler'ın kendi değişkenleri (`CLOUDFLARE_*`) siliniyor.
- **Eski verileri elle taşımak için** (paneli kapatıp):

  ```bash
  mv ~/projects/sf-clients ~/projects/arke-clients
  mv ~/projects/sf-inbox ~/projects/arke-inbox
  mv ~/.config/site-factory ~/.config/arke-web-studio
  ```

## 1.29.1: belgeler ve proje düzeni

- **`AGENTS.md` yeniden yazıldı:** bugünkü akış öne alındı (serbest tasarım, araştırma, tasarım planı, panelden onay). Hangi kuralın hangi dosyada olduğunu gösteren bir tablo eklendi. Şablon akışı "eski müşteriler" bölümüne indi.
- **Serbest tasarım kuralları bölündü:** `rules/custom-site.md` artık başlangıç dosyası; ayrıntılar `rules/custom/` altında (`plan.md`, `brand.md`, `build.md`, `changes.md`). Her iş sadece kendine gereken dosyayı okuyor; örneğin plan aşaması yazım kurallarını, marka kartı işi sayfa kurallarını okumuyor. Bu daha az token demek.
- **Kurallar tek kaynakta:** agent komutları kuralları tekrar etmiyor, sadece hangi dosyanın okunacağını söylüyor. Kontrol edildi: komutlarda kurallardan kopyalanmış cümle yok.
- **`ROADMAP.md` eklendi:** adımlar, açık konular ve alınmış kararlar.
- **CI:** her gönderimde GitHub Actions ile lint, tip kontrolü, derleme ve testler çalışıyor.
- **`SPEC.md` taşındı:** ilk yapım planı artık `docs/history/SPEC.md` dosyasında.
- Uygulamanın davranışı değişmedi.

## 1.29.0: kolay kurulum, panelden güncelleme, ekip paylaşımı

- **Tek komutla kurulum** (`scripts/install.sh`): Linux, WSL2 ve macOS'ta git ve Node'u kontrol eder, depoyu indirir, kurulum betiğini çalıştırır, kabuğa `sf-panel` ve `sf-update` komutlarını ekler. Sistem paketi kurmaz, hiçbir şeyi silmez.
- **Panelden güncelleme** (Ayarlar → Güncelleme): git ile kurulduysa yeni sürümü denetler ve tek tıkla kurar (git pull, npm ci, build). Kurulum klasöründe kaydedilmemiş değişiklik varsa durur. Agent işi sürerken güncelleme yapılmaz. Zip ile kurulduysa `sf-update <zip>` komutu gösterilir.
- **`sf-update` iki yolla çalışır:** argümansız çalıştırınca depodan günceller, zip verilirse eskisi gibi zip'ten kurar.
- **Ekip paylaşımı** (Ayarlar → Ekip): aynı müşteriler tek bir özel Git deposu üzerinden paylaşılır (ArkeLab ekibinin deposu da olur).
  - Her müşteri depoda `clients/<kısa-ad>` dalında durur.
  - Değişiklikler profildeki adla kaydedilir.
  - Onaylar, yayın kayıtları, Cloudflare kaynakları ve gizli anahtarlar paylaşılmaz.
  - Aynı müşteride iki kişi değişiklik yaptıysa o müşteri eşitlenmez ve uyarı verilir; tahminle birleştirme yapılmaz. Agent işi süren müşteri atlanır.
- **macOS desteği:** kurulum kontrolü bubblewrap ve socat istemez.
- **Belgeler yenilendi:** README baştan yazıldı, sürüm notları `CHANGELOG.md` dosyasına taşındı, `AGENTS.md` güncellendi.

## Herkes için tek panel: kişisel izler kaldırıldı (1.28.0)

Site Factory artık tek bir kişiye göre yazılmış değil; her kullanıcı kendi panelini kendi adıyla kullanır.
- **İlk açılışta profil:** ana ekranda "Hoş geldiniz" kartı çıkar ve ad, stüdyo adı (isteğe bağlı) ve panel dilini sorar. Kart engellemez; dilediğiniz zaman Ayarlar → Hesabım → Profil'den değiştirebilirsiniz.
- **Agent size adınızla hitap eder.** Kurallarda, araç mesajlarında ve agent komutlarında geçen kişi adı kaldırıldı; hepsinde "the operator" (paneli kullanan kişi) yazıyor. Her işe profilden tek satır eklenir: "the operator is <ad> of <stüdyo>".
- **Teklif gönderen bilgisi boşsa** stüdyo adı (o da yoksa ad) kullanılır.
- **Örnekler genelleştirildi:** yedek klasörü yolu ve etiket örneklerinden kişisel bilgiler çıkarıldı.
- **Yeni bir test**, kodda, kurallarda, panelde ve portalda tek bir kişinin adı geçerse uyarır.
- Onay kuralları değişmedi: onaylar yine yalnızca paneli kullanan kişidedir; agent onay veremez.

## Panel ArkeLab görünümünde (1.27.1)

Panelin renk teması ve yazı tipi ArkeLab'ın tasarım sistemine (`DESIGN.md`) uyarlandı; panel ArkeLab'ın içinde aynı ürün gibi görünecek. Ekranların yapısı ve işleyişi değişmedi.
- **Koyu tema varsayılan:** kömür zemin (`#191918`), açık taş yazılar. Daha önce bir tema seçtiyseniz o seçim korunur. Açık tema aynı renk rolleriyle duruyor.
- **Vurgu rengi bakır** (`#d6a584`): marka, seçim ve odak için kullanılır. Hardal kaldırıldı.
- **Birincil düğmeler açık taş zemin, koyu yazı;** koyu temada böyle, açık temada tersi.
- **Yazı tipi Manrope Variable:** panelin kendi dosyasından yüklenir, OFL lisanslı, Türkçe karakterleri kapsar. Public Sans kaldırıldı.
- **Köşeler:** kontrollerde 6px, panellerde 9px.
- **Odak çizgisi:** 2px bakır.
- **Durum renkleri ArkeLab tonlarında:**
  - agent çalışırken lila
  - müşteri beklenirken mavi-gri
  - yayında adaçayı yeşili
  - hata durumunda mercan
- Kontrast her iki temada da otomatik ekran denetiminden geçti.
- Müşteri sitelerinin yönetim ekranı (`/admin`) bu değişikliğin dışında; o ekranı müşteri kullanıyor.

## Ortak hazır parçalar: katalog, yönetim ekranı, bildirimler (1.27.0)

Uygulama sitelerinin (E-ticaret, Randevu, Restoran-Kafe) ilk hazır parçaları geldi. Kodlar fabrikanın `parts/` klasöründe ve testli; agent bunları yazmaz, yalnızca sayfaya yerleştirip tasarlar (`rules/parts.md`). Tanıtım siteleri etkilenmez.
- **Katalog:** ürün, hizmet ya da menü kalemleri; kategoriler, fiyat (kuruş cinsinden), süre (hizmetler için), görsel (R2, en fazla 5 MB, yalnız JPG/PNG/WebP/AVIF). Sitede agent'ın tasarladığı şablonla gösterilir; kalemler yönetim ekranından değişir, siteye bir dakika içinde yansır.
- **Gelen kutusu (bildirimler):** sitedeki formlardan gelen mesajlar veritabanına kaydedilir. İstenirse bir webhook adresine de iletilir (Slack, Discord, Telegram aktarıcısı). Gizli tuzak alanı ve adres başına saatlik sınır vardır. Sonraki adımlarda sipariş ve randevular da buraya düşecek.
- **Müşterinin yönetim ekranı (site adresi/admin):** parolayı panelden siz belirlersiniz (Müşteri Bilgileri → Müşteri Yönetim Ekranı). Panelde parolanın kendisi değil, yalnızca şifrelenmiş özeti saklanır.
  - Oturum 12 saat sürer.
  - 15 dakikada 5 hatalı denemeden sonra giriş kilitlenir.
  - Değişiklikler yalnızca sitenin kendisinden kabul edilir.
  - Ekranın sıkı güvenlik başlıkları vardır ve arama motorlarına kapalıdır.
- **Kurulum otomatik:** site türü bir uygulama türüyse panel parçaları müşteri klasörüne kopyalar: `app/worker.js` (yalnızca o türün parçalarıyla oluşturulur), `app/parts/`, `app/migrations/0001–0003` ve `site/js/sf-parts.js`. Oturum anahtarı da otomatik oluşturulur. Yeni bir fabrika sürümü parça kodunu yeniler; uygulanmış veritabanı değişikliklerine hiç dokunmaz.
- **Sayfalar API'yi gölgeleyemez:** Worker `/api/*`, `/admin` ve `/media/*` adreslerini her zaman kendisi karşılar.
- Uygulama türleri hâlâ "yakında" durumunda: ödeme ve yasal sayfalar 4. adımda (E-ticaret) gelecek.

## Uygulama siteleri için yayın modülü (1.26.0)

E-ticaret, Randevu ve Restoran-Kafe "uygulama" sitesi olacak: sayfaların yanında çalışan bir Worker, kendi veritabanı (D1), görsel deposu (R2) ve gizli anahtarları. Bu sürüm onları yayınlayacak ortak altyapıyı ekler; tanıtım siteleri eskisi gibi yayınlanır (değişiklik yok).
- **Sıra:** gizli anahtarlar eksik mi (eksikse hiçbir şeye dokunulmaz) → veritabanı ve depo (bir kez oluşturulur, kimlikleri `.factory/resources.json`) → veritabanı yedeği (`.factory/db-backups/`) → veritabanı değişiklikleri → gizli anahtarlar (komut satırında değil, stdin ile) → Worker yayını.
- **Önizleme ve canlı ayrı:** her birinin kendi veritabanı ve deposu var; önizleme denemesi canlı veriye dokunmaz.
- **Veri kaybettiren değişiklikler** (tablo/sütun silme, koşulsuz silme veya güncelleme) yedek alınsa bile ancak müşterinin kısa adı yazılarak onaylanırsa çalışır. Uygulanmış bir değişiklik dosyası düzenlenirse yayın durur (yeni dosya eklenmeli).
- **Müşterinin gizli anahtarları** (ör. ödeme sağlayıcısı): panelde müşteri bazında, şifreli ve yalnız sizin okuyabildiğiniz dosyada; yalnız adları gösterilir; agent'a gitmez.
- **Onaylar uygulama kodunu da kapsar:** `app/` (Worker ve veritabanı değişiklikleri) içerik özetine dahil; onaydan sonra değişirse onay yenilenir. Tanıtım sitelerinde `app/` olmadığı için özetleri değişmez.
- Sitenin türü panel tarafından `.factory/product.json` dosyasına yazılır; yayın aracı türü oradan okur (agent değiştiremez).

## Web Stüdyosu temeli ve bireysel hesaplar (1.25.0)

**Bireysel Cloudflare hesabı:** Panel herkes tarafından kullanılabilsin diye yayın hesabı kişiye ait.
- **Ayarlar → Hesabım → Cloudflare Hesabım:** Hesap kimliği (Account ID) ve API token girilir, **Kaydet ve Test Et**. Cloudflare kabul etmezse kaydedilmez. Ekranda yalnızca özet görünür (hesap `0123…cdef`, token `…x7Kq`, son test); token bir daha gösterilmez.
- Hesap yokken **Önizleme Oluştur / Yayına Al / Yayından Kaldır / Geri Al** basılırsa aynı form bir pencerede açılır; kaydedilince işlem kaldığı yerden sürer.
- Saklama: `~/.config/site-factory/accounts.json` (yalnız sizin okuyabildiğiniz dosya), token AES-256-GCM ile şifreli; anahtar yanındaki `accounts.key`. WSL'de işletim sistemi anahtar deposu olmadığından bu, dosyanın yanlışlıkla paylaşılmasına (yedek, rapor, ekran görüntüsü) karşı korur; aynı kullanıcıyla bilgisayara girmiş birine karşı korumaz. ArkeLab'a geçişte yerini ArkeLab'ın şifreli deposu alacak.
- Agent'a hiçbir zaman gitmez: agent süreçleri ve başlattıkları MCP sunucusu hesap dosyasını okumaz (`SF_NO_ACCOUNTS=1`), agent `~/.config` okuyamaz. Yedeklere ve `sf-report` çıktısına girmez; raporda maskelenir. Müşteri portalı da bu hesabı kullanır.
- Geriye uyum: `SF_CF_MANAGED_*` ortam değişkenleri çalışmaya devam eder; panelde kayıtlı hesap varsa önce o kullanılır.
- Testler hiçbir zaman sizin kayıtlı hesabınızı görmez (ayrı geçici klasör kullanır).

**Web Stüdyosu yapısı (site türleri):** Yeni Müşteri'nin ilk adımında **Site türü**: Tanıtım sitesi (aktif), E-ticaret, Randevu, Restoran ve kafe ("Yakında"). Analiz ekranında **Tür** sütunu ve filtresi var.
- Ortak çekirdek: müşteri ve iş takibi, agent motoru, onaylar, sürümler, marka sistemi (tasarım planı, imza hareketi, hareket kiti), kontroller, yayın, hesaplar, portal, analiz.
- Her tür yalnızca kendine ait olanı tanımlar (`src/products/registry.ts`): yayın tipi (statik / uygulama), ekstralar, kullandığı hazır fabrika parçaları (katalog, sepet, ödeme entegrasyonları, takvim, QR menü, yönetim ekranı, bildirimler, yasal sayfalar) ve kuralları.
- İlke: işlevi fabrika yapar, agent tasarlar. Ödeme gibi parçalar hazır ve test edilmiş paketlerdir, panel scriptle kurar; agent yazmaz (az token, az hata). Ödeme sağlayıcısı ve içerik yönetimi (biz / müşteri) müşteriye sorulur.
- Mevcut müşteriler tanıtım sitesi sayılır; davranışları değişmez.

## Tasarım planı onayı ve güçlü imza hareketleri (1.24.0)

**Tasarım planı (yeni tasarımlar):** Agent siteyi kurmadan önce nasıl tasarlayacağını anlatır ve durur. Müşteri ekranında **Tasarım Planı** kartı çıkar:
- Konsept ve kaynağı (logo, zanaatın malzemesi, yer), ton, renk paleti, yazı tipleri, giriş alanı, sayfalar ve bölümleri.
- **İmza hareketi:** resmî adı, fikri, adım adım zaman planı (başlangıç, süre, hareket, eğri) ve zaman çizelgesi; agent yazdıysa canlı önizlemesi.
- **Planı Onayla ve Siteyi Kur:** site bu plana göre kurulur. **Yeni Fikir İste:** isteğe bağlı notlarla agent öncekilerden gerçekten farklı yeni bir plan hazırlar (eski planlar saklanır).
- Onay sizde: panel `.factory/` içine yazar, agent onaylayamaz. Onaydan sonra plan değişirse onay düşer. Onaysız sayfa yazılamaz (yalnızca imza önizlemesi) ve site derlenmez; boşa kaynak harcanmaz.
- Eski siteler etkilenmez. Yeniden tasarlama yeni plan ister; 3 tasarım önerisinden birini seçmek o yönün onayı sayılır.

**İmza hareketleri:**
- Adlar resmî ve sitenin dilinde ("Katmanlı Açılış", "Kavanoz Dolumu"); şaka ya da benzetme yok.
- Sektörlere göre hazır fikir listesi kaldırıldı (her fırına "un tozu", her yazılımcıya "kendini yazan kod" çıkıyordu). Yerine yöntem: kaynaktan (logo, malzeme, süreç) 3–8 adımlık koreografi, örtüşen adımlar, yaylı oturma; klişeler logodan gelmedikçe yasak.
- animate skill'i yalnızca arayüz hareketlerinde; imza hareketine kısıtlayıcı "hareket etmeli mi?" yaklaşımı uygulanmaz.
- **Hareket kiti** (`js/motion.js`, fabrikanın): `SFMotion.sequence` planın adımlarını birebir oynatır; ayrıca sırayla açılma, SVG çizgi çizimi, yazıyı kelime kelime açma, kaydırmaya bağlı sahne ve sayı sayma. Agent sıfırdan yazmaz, daha zengin ve daha az token.
- **Agent hareketi görür:** derleme imza sayfasını tarayıcıda oynatıp 4 kare yakalar (başlangıç → son); agent bunlara bakıp düzeltir.
- **Gerçek kontrol (yeni tasarımlarda zorunlu):** imza sayfası yoksa, planın adım sayısından (en az 3) az hareketli adım varsa ya da hareket azaltma durumu yoksa derleme geçmez. Eski sitelerde uyarı.

## rreinware denemesinden çıkan düzeltmeler (1.23.2)

- **Çeviri boşa çalışmaz:** Tasarım işi bitince otomatik çeviri yalnızca o iş siteyi başarıyla derlediyse başlar. Agent soru sorup durduysa çeviri başlamaz (önceden kütüphane dosyaları yüzünden başlıyor, boşa kaynak harcıyordu). "Diğer dilleri güncelle" de geçen bir derleme yoksa açıklamayla reddedilir.
- **Yanlış alan adı tahmini azalır:** Agent var olmayan bir alana yazmaya çalışınca hata, o yerde hangi alanların olduğunu da söyler (ör. `whatsapp.enabled (fields there: number, floatingButton)`); aynı hatayı tekrar tekrar deneyip token harcamaz.
- **Kütüphane tasarımı başka işletmenin bilgilerini taşımaz:** Randevu bağlantısı, sosyal hesaplar ve şirket unvanı/numarası da "kaynağa ait" sayılır; site bunlar dururken derlenmez. Agent'a fiyatların, saatlerin, yorumların ve vaka çalışmalarının da kaynak işletmeye ait olduğu, taşınmayacağı söylenir. Daha önce kaydedilmiş tasarımlar için de geçerli (kaynak müşterinin bugünkü bilgileri okunur).
- **Takılmalar başarısızlık gibi görünmez:** Biten bir işte agent'ın aşıp geçtiği hatalar (yanlış alan, açılmayan site) katlanmış "Yolda N hata oldu, agent devam etti" satırında durur; başarısız işte açık görünür.
- **Token tavanında kalan talep tek tuşla sürer:** Tavanda duran bir değişiklik isteğinin altında "Kaldığı yerden devam et" düğmesi var; agent yapılmış olanı tekrar yapmaz, kalan adımları tamamlar.

## Ekran denetimi düzeltmeleri (1.23.1)

Her ekran (ana ekran, Analiz, Kütüphane, Arşiv, Ayarlar, Yeni Müşteri'nin adımları, müşteri sekmeleri, menü ve onay penceresi) iki temada, masaüstünde ve telefonda denetlendi; bundan sonra her güncellemede otomatik denetlenir (tests/ui-audit.test.ts: yazı kontrastı WCAG AA, çalışan animasyon yok, yana kayma yok, kutusundan taşan yazı yok, script hatası yok).
- Telefonda kenar çubuğu tek satır oldu: Yeni Müşteri + yana kaydırılan menü; müşteri listesi telefonda gizli (ana ekrandaki tablo zaten gösteriyor). Sayfalar artık bir ekran dolusu menüyle başlamıyor.
- Yeni Müşteri'de telefondaki Geri/İleri çubuğu yazıların üstüne binmiyor; logo/fotoğraf adımında kutu içinde kutu kalktı.
- Koyu temada seçili müşterinin alt yazısı daha okunur. Klavye odağı her temada belirgin (mürekkep rengi çerçeve + hardal hale).
- Müşteri menüsündeki seçenekler tek satır; teklifte "Ek seçenekler" başlığının üstünde boşluk.

## Yeni panel görünümü ve Analiz ekranı (1.23.0)

Görünüm (sadece CSS ve küçük çizim değişiklikleri; işlevler, adresler ve API aynı):
- Tema "Grafit ve hardal": neredeyse siyah-beyaz; tek renk hardal ve yalnızca "şimdi yapılacak" şeylerde (Yeni Müşteri, Onayla, seçili sekme, onayını bekleyen müşteriler). Diğer durumlar sakin: agent çalışırken mor, müşteriden bilgi beklerken gri-mavi, yayında yeşil, hata kırmızı.
- Ana ekran bir kontrol masası: müşteriler tek tabloda satır satır (durum, sektör, ilerleme, sıradaki adım, ücret); dört büyük kutu yerine tek satır sayaç. Tek "Yeni Müşteri" düğmesi (kenar çubuğunda); ana ekranda kenar çubuğundaki müşteri listesi gizlenir.
- Müşteri ekranında sekmeler alt çizgili, adlar kesilmez. Avatarlar nötr gri.
- Animasyonlar kaldırıldı (sayfa açılış kayması, kart yükselmesi, logo zıplaması, yanıp sönen noktalar, tıklama küçülmesi). Kalan: kısa renk geçişleri, bildirim ve onay penceresinin hafifçe belirmesi.
- Yazı tipi Public Sans, panelin içinde (panel/fonts, OFL lisansı). Google Fonts bağlantısı yok; internet yokken de aynı görünür.

Analiz ekranı (menüde **Analiz**, yalnızca okur, hiçbir şeyi değiştirmez):
- Her müşteri tek satır: durum, sektör, ülke, diller, paket, ekstralar, fiyat, ödeme, teslim, gider, agent maliyeti, kâr, iş sayısı (başarısızlar), agent süresi, son iş, yayına kadar geçen gün, kontrol sonuçları, sayfa sayısı, sayfa ağırlığı, görseller, en büyük görsel, yayın.
- Sütun başlığına tıklayınca sıralar; arama, durum, ülke, paket, ödeme, sektör, etiket filtreleri; "Gecikenler" ve "Kontrol hatası olanlar". Filtreler tarayıcıda hatırlanır.
- Üstte özet: müşteri, yayında, para birimine göre ciro ve kâr (kârı hesaplanamayanlar sayılmaz, "1/2 müşteri" diye yazar), agent maliyeti, başarısız iş oranı, ortalama yayına kadar gün, geciken teslim ve ödeme. Altta para birimine göre toplamlar; para birimleri hiç karışmaz.
- "CSV indir": görünen satırlar, Excel'de Türkçe harflerle açılır.
- Performans dürüst ölçülür: sayfa ağırlığı (ortalama sayfa + ortak CSS/JS, görseller hariç), görsel sayısı ve boyutu, en büyük görsel; ağır olanlar kırmızı. Lighthouse puanı ölçülmediği için gösterilmez.

## Yeni müşteri: logo ve fotoğraflar ilk adımda (1.19.0)

- Yeni Müşteri formu üç adım: **1. İşletme**, **2. Logo ve fotoğraflar**, **3. Müşteriden gelen bilgiler**. Altta "Oluşturunca: …" satırı butona basınca ne olacağını söyler.
- Logo seçilirse müşteri oluşturulur oluşturulmaz logo olarak kaydedilir ve marka ondan çıkarılır; fotoğraflar agent'a gider.
- Bilgi yapıştırılmış ama logo seçilmemişse iş başlamadan sorulur: "Yazı logosuyla başla" ya da "Önce logo ekleyeceğim". Böylece logosuz yapılıp sonra yeniden tasarlanan iş (ve harcanan kaynak) olmaz.
- Logo başka bir müşterinin logosuyla aynıysa önce onay istenir; onaylanmazsa tasarım işi başlamaz.

## Panel görünümü cilalandı (1.22.1)

Impeccable'ın "polish" adımıyla, panel bir iş aracı olduğu için "Operate" kurallarıyla (taste-skill tanıtım sayfaları için, panel ekranlarına uygulanmaz):
- Tüm alanlar tek tip: sayı, tarih, fiyat kutuları ve açılır listeler artık tarayıcının varsayılan görünümüne düşmüyor; açılır listelerde tek tip ok, odakta yumuşak halka, devre dışıyken gri.
- Düğmeler: basınca küçük bir tepki; devre dışı düğmeler (ör. "Arşivle" yazılmadan) soluk kırmızı yerine nötr gri.
- Onay pencereleri kısa bir geçişle açılıyor; yazılması gereken kelime küçük bir etiket olarak görünüyor.
- Ayarlar ve kenar çubuğundaki büyük harfli mono etiketler normal başlık oldu; seçim rengi ve kaydırma çubuğu panel renklerinde.

## Yeni müşteri adım adım (1.22.0)

- Yeni Müşteri artık 5 adımlı: **1. İşletme**, **2. Paket ve fiyat** (paket, site fiyatı, teslim tarihi, ek seçenekler ve fiyatları), **3. Logo ve fotoğraflar**, **4. Bilgiler**, **5. Özet ve başlat**.
- Son adıma kadar hiçbir şey kaydedilmez ve hiç kaynak harcanmaz. Özet her şeyi gösterir (toplam fiyat, logo var mı, eksikler) ve iki seçenek sunar: "Kaydet, siteyi sonra başlat" (ücretsiz) ya da "Kaydet ve siteyi yapmaya başla".
- Bilgi girilmediyse site başlatılamaz, sadece kaydedilir. Fiyat girildiyse ödeme durumu "Teklif verildi" olarak kaydedilir.
- 1.21.2 ile gelenler de bu sürümde: para birimi kontrolü, paket değişince ipucu, ilk ekran kuralı.

## Para birimi kontrolü, paket ipucu (1.21.2)

- Yeni derleme kontrolü: sayfalarda müşterinin para birimi dışında bir işaretle yazılmış tutar (ör. Türk müşteride "£100,000") derlemeyi durdurur; her dilde fiyatlar içerikteki para birimiyle kalır.
- İş Takibi'nde paket değişince panel söyler: paket sonraki işlerde geçerli, mevcut site kendiliğinden değişmez; yeni paketle tasarım için "Marka Kimliğiyle Yeniden Tasarla".
- Kural: ilk ekran markayı iki temada da tam güçte taşır (sade ≠ boş); sadelik kuralları süs için, hero için değil.

## Tasarım uyarılarının yeri, dil linkleri (1.21.1)

- Impeccable tasarım uyarıları artık nerede olduklarını da söylüyor (sayfa ya da dosya, satır ve ölçülen değer, ör. "gray-on-color: text #b9c0d0 on bg #172544 · about/, blog/"). Agent uyarıların yerini tahmin etmek zorunda kalmıyor.
- Dil düğmesinde tam adres (https://alanadi/en/about/) kullanılabiliyor; sitenin kendi alan adıysa aynı sayfa sayılır.
- Çeviri işi 404 sayfasını ve imza hareketi demosunu çevirmiyor.

## Tasarım ve dil kuralları gözden geçirildi (1.21.0)

- Başlık üstü "No. 01 · …" etiketleri artık zorunlu değil, yasak: etiket sadece gerçek bir bilgi taşıyorsa (fiyat, süre, sıra, ürün kodu).
- Ana sayfada "en az 5 bölüm" şartı kalktı (dolgu bölüm üretiyordu); her bölüm ekranı içerikle doldurmalı, yarım boş bölüm yok.
- Dekor sadece bir işe yarıyorsa: anlamsız nokta, şekil, yarım daire yok. Ana sayfada logodan başka en az bir anlamlı çizim yeter.
- Bölümler arası boşluk yaklaşık yarıya indi (fabrikanın base.css'i; var olan sitelere bir sonraki agent işinde gelir).
- Agent ekran görüntülerine bir kontrol listesiyle bakar: telefonda menü katlı mı, yazı taşıyor mu, sabit buton bir şeyi örtüyor mu, dekor taşıyor mu.
- Tasarım işi başka dilde sayfa yazmaz; yarım çeviri derlemeyi durdurur ve mesaj çeviri işini gösterir.
- `rules/markets.md` → "Standard words": menü, buton ve form kelimelerinin Türkçe/İngilizce standart listesi.
- Eski şablon kuralları `rules/legacy-templates.md` dosyasına taşındı; tasarım aramalarına karışmaz.
- **Logo ve Görseller:** "Logoyu kaldır" (dosya kalır, sonraki tasarımda yazı logosu çizilir) ve her görselde ✕ ile silme. Logo, içerikte ya da sayfalarda kullanılan görsel silinmez (nedeni yazılır); silinen kayıtlı görsel Sürüm Geçmişi'nden geri gelir.

## Hazır site parçaları ve dil kontrolleri (1.20.0)

- **Fabrika parçaları:** tema düğmesi (güneş/ay ikonlu, hangi temaya geçeceğini söyler, seçimi hatırlar) ve telefon menüsü (48rem altında katlanır) `js/kit.js` + `css/base.css` olarak her siteye kopyalanır; agent kendisi yazmaz. Fabrika güncellenince bu iki dosya bir sonraki agent işinde siteye yenisi olarak gelir (elle yazılmış bir base.css'e dokunulmaz).
- **Yeni derleme kontrolleri:**
  - Dil: yarım çeviri, başka sayfaya giden dil düğmesi (Hakkımızda → /en/ yerine /en/about/ olmalı) ve çeviri içinden varsayılan dile kaçan link derlemeyi durdurur. Çeviri hiç yazılmadıysa sadece uyarı (çeviri işi tasarımdan sonra çalışır).
  - Parçalar: tema düğmesi ya da menü düğmesi olup `kit.js` yüklemeyen sayfa derlemeyi durdurur; 4'ten fazla menü linki olup telefon menüsü olmayan sayfa uyarı verir.
- **Kurallar:** sabit butonlar (`float-btn`) içeriği örtmez; dekor bölüm dışına taşmaz; ızgara ile altındaki düğme arasında boşluk; yarım boş ekran yok.
- Var olan bir siteyi düzeltmek: Düzenleme → "Diğer dilleri güncelle", sonra "Siteyi yeniden oluştur", kontrol hata verirse "Hataları agent düzeltsin".

## Paket seçimi en başta, talep kutusu düzeltmesi (1.19.1)

- Yeni Müşteri'nin 1. adımında **Paket** (Varsayılan / Temel / Standart / Premium) seçilir; ilk tasarım işi bu paketle çalışır. Sonra İş Takibi'nden değiştirilebilir.
- Özel Talep kutusu, talep gönderilince artık boşalıyor (iş başlamazsa yazılan geri gelir).

## Yeni müşteri adımları ve ek seçenekler (1.19.0)

- **Yeni Müşteri** üç adım: 1. İşletme (ek seçenekler dahil), 2. Logo ve fotoğraflar, 3. Müşteriden gelen bilgiler. Altta "Oluşturunca: …" ne olacağını söyler.
  - Logo seçilirse müşteri oluşturulur oluşturulmaz logo olarak kaydedilir, marka ondan çıkarılır; fotoğraflar agent'a gider.
  - Bilgi var ama logo yoksa iş başlamadan sorulur: "Yazı logosuyla başla" ya da "Önce logo ekleyeceğim".
- **Ek seçenekler**: ikinci dil, koyu/açık tema, blog, WhatsApp butonu, online randevu.
  - Yeni müşteride işaretlenir; İş Takibi'nde her birine fiyat girilir. Toplam = site fiyatı + ek seçenekler; kâr da bunu kullanır.
  - Teklif PDF'inde "Ek seçenekler" listesi ve fiyat dökümü (Site, her ek, Toplam) çıkar.
  - Agent sadece seçilenleri yapar (ör. tema seçilmediyse tek tema, düğme yok). Ek seçenek kaydı olmayan eski müşterilerde agent önceki gibi çalışır; İş Takibi'ni açıp kaydetmek bunu değiştirmez, sadece ek seçeneklere dokununca kayıt oluşur.
  - İkinci dil seçilince sitenin dillerine eklenir; işaret kaldırılınca dil silinmez.
- Kalite: şirket numarası uyarısı sadece İngiltere ve İrlanda'da; 404 ve imza demosunda işletme adı aranmaz. Rapordaki boş "agent:" satırı düzeldi.

## İzin kuralları ve tarayıcı testleri (1.18.3)

- `.claude/settings.json`: işe yaramayan `Write(...)` yasakları kaldırıldı; Claude Code'a göre dosya yasakları sadece `Edit(...)` ile işler ve `Edit` Write'ı da kapsar. Koruma aynı (müşteri klasörleri, `.factory`). Kendi `.claude/settings.local.json` dosyandaki `Write(...)` satırını da silebilirsin; `Edit(...)` satırı kalmalı.
- Tarayıcılı testler (UI, uçtan uca) WSL'de çalışsın diye bir kez:

```bash
cd ~/projects/site-factory
npx playwright-core install chromium
sudo npx playwright-core install-deps chromium
```

## Kod haritası: graphify (1.18.2, sadece senin Claude Code'un için)

[graphify](https://github.com/Graphify-Labs/graphify) projenin fonksiyon, modül ve bağımlılıklarını bir grafiğe çıkarır; Claude Code dosya dosya okumak yerine önce grafiğe bakar. Site agent'ı için değil, senin geliştirme oturumların için.

Kurulum (bir kez, WSL):

```bash
pipx install graphifyy        # paket adı iki y ile; pipx yoksa: sudo apt install pipx && pipx ensurepath
graphify install              # skill'i ~/.claude/skills/graphify'a kopyalar
```

Sonra Claude Code'u `~/projects/site-factory` içinde aç ve `/graphify .` yaz. Çıktı `graphify-out/` klasörüne gider (git'e girmez, güncellemede silinmez).

**Yapma:** proje içinde `graphify claude install` ya da `--project` ile kurulum. Bu, projenin `.claude/settings.json` dosyasına (agent'ın sandbox ve yasak ayarları) hook ekler.
Agent işleri artık sadece fabrikanın kendi ayarlarıyla çalışır (`--setting-sources project,local`); senin kullanıcı ayarlarındaki hook ve eklentiler agent'a geçmez.

## Hareket skill'i: animate (1.18.1)

Emil Kowalski'nin **animate** skill'i (MIT) `.claude/skills/animate` içinde, değiştirilmeden (kaynak ve sürüm: `UPSTREAM`).
- Premium: agent sadece animasyonlara ve imza hareketine gelince yükler; her animasyon için "hareket etmeli mi, hangi özellik, hangi eğri ve süre, azaltılmış hareket" sırasını izler.
- Standart: tamamı yüklenmez, `search_design_knowledge` ile içinden arama yapılır. Temel: kullanılmaz.
- Sitelerde sadece CSS ve WAAPI yolu geçerli; Motion kütüphanesi ya da npm paketi yok (`rules/custom-site.md` kazanır).

## İkinci dil, geri alma, yedek kontrolü (1.18.0)

- **Panel İngilizce de olabilir:** Ayarlar → Genel → Panel dili. Seçim sunucuda saklanır, sayfa yeni dilde yeniden açılır. Müşteri verileri (agent'ın yazdıkları, portal cevapları ve yorumları, sitedeki metinler) çevrilmez. Panel İngilizceyken agent da sana özetlerini ve sorularını İngilizce yazar; sitelerin dili değişmez.
- **Müşteri soruları müşterinin dilinde:** Türkçe siteli müşteriye soru formu ve portal bilgi formu Türkçe, diğerlerine İngilizce gider.
- **Canlı siteyi geri al:** Müşteri Bilgileri → Yayın → "Önceki sürüme dön". Cloudflare'deki bir önceki yayın saniyeler içinde geri gelir; bilgisayardaki dosyalar değişmez. Canlı site için müşterinin kısa adını yazarak onaylarsın. Sadece panelden; agent'ın böyle bir aracı yok. Geri almalar `sf-report`'ta uyarı olarak görünür.
- **Yedek gerçekten açılıyor mu:** Ayarlar → Yedek'te her yedeğin yanında "Geri yüklenebilir mi?" Yedek geçici bir klasöre açılır, her müşteri kontrol edilir, klasör silinir.
- **Yedekten geri yükleme** (her zaman yeni bir klasöre; var olanın üzerine asla yazmaz):

```bash
cd ~/projects/site-factory
npm run restore-backup -- /mnt/c/Users/<kullanıcı>/OneDrive/SiteFactory-Yedek/site-factory-yedek-….tar.gz ~/geri-yuklenen
```

- **Kim yaptı:** Her iş ve yayın kaydında bilgisayardaki kullanıcı adı (`by`) tutulur; ileride ekip olursa kimin ne yaptığı görünür.

## Rapor: sf-report (1.17.3)

`npm run report -- <klasör>` bütün fabrikanın durumunu tek bir dosyaya yazar (`sf-report-<tarih>.md`). Hiçbir şeyi değiştirmez; token ve anahtarlar dosyaya yazılmaz.

- Kurulum: sürüm, claude/codex/wrangler, Cloudflare değerleri tanımlı mı (değerleri değil), portal, ayarlar.
- Her müşteri: aşama, son build ve kalite uyarıları, onaylar (kimin verdiği), yayın adresleri ve canlı kontrol, ödeme, portal, son 15 iş (süre, maliyet, özet, hatalar), agent'ın araç çağrıları.
- Otomatik kontroller: agent hiç yayın yapmadı ya da yasak araç kullanmadı mı, onaylar senin mi, müşteri klasörlerinde token veya portal anahtarı var mı, portalda alınmamış kayıt kaldı mı, ödemesi geciken, açılmayan site, başarısız iş.
- İnternetsiz: `--no-network` (canlı kontroller atlanır).

Kısayol (bir kez, WSL terminalinde):

```bash
echo 'sf-report() { (cd ~/projects/site-factory && npm run --silent report -- /mnt/c/Users/<kullanıcı>/Downloads); }' >> ~/.bashrc && source ~/.bashrc
```

Sonra `sf-report` yaz; dosya İndirilenler'e düşer.

## Uçtan uca testler (1.17.2)

`npm run test:e2e` (birkaç dakika; Linux Chromium gerekir, yoksa atlanır):

- **Site akışı (gerçek tarayıcıda):** yeni müşteri formu → agent işi siteyi gerçek MCP sunucusu üzerinden yazar ve build alır → onay kodu (önce yanlış kod reddedilir) → deneme yayını (wrangler `--dry-run`, hiçbir şey yüklenmez) → özel talep siteyi değiştirir, build yenilenir, onay sıfırlanır → her işte geri dönülecek sürüm kalır.
- **Müşteri portalı (Cloudflare'in kendi çalışma ortamında, workerd + yerel KV):** linkler → müşteri telefon ekranında formu ve fotoğrafı gönderir (sahte "resim" atılır) → panel toplar, foto gelen kutusuna düşer → cevaplar agent'a gider → önizlemeye yorum ve onay → yorumlar agent'a veri olarak gider (yayın yapılmaz) → link kapatılınca açılmaz, portalda veri kalmaz.
- Model yerine sabit senaryolu sahte bir agent çalışır (`tests/e2e/fake-agent.ts`). Ortamına Cloudflare değişkeni sızarsa ya da tehlikeli araçlar kapalı değilse işi başarısız sayar; bu kontrolün kendisi de test edilir.
- Güncelleme script'i bu testleri atlar (hızlı kalsın diye); diğer bütün testler yine çalışır.
- Düzeltme: iş başlayınca panel eski "akis" adresi yerine Düzenleme sekmesine gider (gereksiz yeniden çizim kalktı).

## Kod kalitesi (1.17.1)

Davranış değişmedi.

- **Yeni testler:** terminal onay komutu (terminal yoksa reddeder, hiçbir onay yazmaz), portalın panel adresleri, yayın kapısı (onaysız ya da değişmiş build yayınlanmaz), Claude Code ve Codex olay akışları (token tavanı, kullanım limiti, araç hataları).
- **Sadeleştirme:** en karmaşık fonksiyonlar bölündü (agent çıktısını okuyan iki fonksiyon, metin bulucu, portal API'si, panelin istek karşılayıcısı, SEO kontrolü, yayın). En yüksek karmaşıklık 56'dan 37'ye indi.
- **`src/tools.ts` bölündü:** `src/tools/` altında `clients`, `build`, `deploy`, `site-files`, `shared`; `tools.ts` tek giriş noktası olarak kaldı.
- **Biçimlendirme:** kod Biome ile tek tip biçimlendirildi (satır en fazla 160 karakter). Yeni kod için: `npm run format`.

## Tutarlı adlandırma (1.17.0)

Davranış değişmedi; adlar yaptıkları işi söylüyor. Eski kayıtlar, dosyalar ve adresler çalışmaya devam eder.

- **Paketler tek adla:** her yerde Temel / Standart / Premium ("mod", "Ekonomik", "Dengeli" kalktı). Kodda değerler aynı (`economy/balanced/premium`), kayıtlar değişmedi.
- **İş türleri:** `autopilot` → `create-site` ("Siteyi Oluştur"), `client-feedback` → `portal-comments`. Eski adlarla kaydedilmiş geçmiş, girdiler ve maliyetler yeni adla okunur.
- **Portal dosyaları** `portal-` ile başlar: `portal-intake.json`, `portal-comments.json`, `portal-approval.json` (gerçek onaylar yine `approvals.json`). 1.15.0 adlarıyla duranlar ilk okunuşta taşınır.
- **Adresler Türkçe:** `#/yeni`, `#/musteri/<kısa-ad>/<sekme>`. Eski `#/new` ve `#/c/…` linkleri açılır.
- **Panel kodu (panel/js):** `router.js` (sayfa yönlendirme, kenar çubuğu), `jobs.js` (işleri başlatma ve izleme), `client-actions.js` (önizleme, yayın, kaldırma, arşiv), `business.js` (iş takibi, kâr), `proposal.js` (teklif, iş raporu, aylık rapor), `new-client.js` (yeni müşteri formu); `info.js` yalnızca Müşteri Bilgileri sekmesi, `home.js` yalnızca ana sayfa.
- **Sunucu (src/panel/api):** `ops.ts` ikiye ayrıldı: `publish.ts` (build, onay, önizleme, yayın, kaldırma) ve `system.ts` (işler, ayarlar, kullanım, kâr, yedek).
- Portal sayfalarında "Site Factory" adı görünmez.

## Global pazarlar ve kurallar (1.16.0)

- **Yeni pazarlar:** Türkiye ve İngiltere'ye ek olarak İrlanda, ABD, Almanya, Hollanda. Ortak dil İngilizce: Türkiye dışında sitenin ana dili İngilizce, para birimi ve telefon kodu ülkeye göre. Diğer diller "Site dili"nden eklenir.
- **`rules/markets.md`:** ülkeye göre yazım (UK/US İngilizcesi, Türkçe), fiyat, tarih ve saat biçimi, yasal minimum: formu olan sitede gizlilik metni (Türkiye'de KVKK Aydınlatma Metni), Almanya'da Impressum. Hukuki tavsiye değildir; müşteriye kontrol ettirin.
- **`rules/local-seo.md`:** yerel arama (ad/adres/telefon her yerde aynı), sayfa başlıkları, JSON-LD, yapay zekâ araması, görsel boyutları.
- **Yeni build uyarıları:** "Gizlilik ve yasal sayfalar" (form var ama gizlilik linki yok; Almanya'da Impressum yok) ve "Görsel boyutları" (500 KB üstü görseller, boyutu yazılmamış `<img>`). Uyarıdır, yayını engellemez.
- Kurallar temizlendi: `AGENTS.md`'deki çelişki giderildi, eski şablon kuralları işaretlendi, `SPEC.md` tarihsel olarak işaretlendi, tasarım aramasından iOS/Android ve skill kurulum sayfaları çıkarıldı.

## Müşteri portalı, ödeme, aylık rapor, blog, SEO (1.15.0)

- **Müşteri portalı** (Ayarlar → Yayın → Müşteri Portalı): senin Cloudflare hesabında küçük bir Worker (`sf-portal`) ve depolama (Workers KV). Ücretsiz planda çalışır (günde 100.000 okuma, 1.000 gönderim).
  1. Token'a izin ekle: Cloudflare → Profil → API Tokens → mevcut token → Edit → **Account · Workers KV Storage · Edit** → Update. Token değişmez.
  2. Panelde "Portalı kur". Portal anahtarı yalnızca `~/.config/site-factory/portal.json` içinde durur (agent okuyamaz).
  - Müşteri Bilgileri → **Müşteri Linkleri**: "Bilgi formu linki" (sorular + logo/fotoğraf, en fazla 8 görsel × 5 MB) ve "Yorum ve onay linki" (önizleme + sayfa sayfa yorum + "Onaylıyorum"). Linkler 60 gün geçerli, istediğinde kapatılır.
  - Gelenler 5 dakikada bir (ya da "Gelenleri şimdi al") panele alınır, portaldan silinir: dosyalar müşterinin gelen kutusuna, cevaplar ve yorumlar müşteri klasörüne. "Agent'a işlet" / "agent'a ilet" ile işlenir; müşterinin yazdığı her şey agent'a veri olarak gider.
  - Müşteri onayı yalnızca bilgi amaçlıdır; yayın onayı yine terminal kodunla verilir.
- **Ödeme takibi:** İş Takibi'nde ödeme tarihi; geciken ödemeler ana sayfada ve müşteri sayfasında uyarı; ödeme alınmadan canlıya alırken sorulur.
- **Aylık rapor** (Teklif → Aylık Rapor): site açık mı, hız, ayın işleri, son kontrol sonuçları; yazdırılabilir.
- **Blog yazısı:** Düzenleme → Blog; agent mevcut tasarımda tek bir yazı sayfası ekler.
- **SEO ve yapay zekâ araması kontrolleri:** build'de işletme bilgisi (JSON-LD), robots.txt, sitemap, canonical, paylaşım etiketleri ve başlık uzunlukları uyarı olarak raporlanır.

## Düzenli PDF'ler (1.14.1)

"Yazdır / PDF" artık yalnızca belgenin kendisini A4'e basar: Teklif ve İş Raporu dikey, tek sayfada (uzunsa düzgün bölünür, tablo başlığı tekrar eder); Marka kartı yatay A4'te tek sayfa. Panel, menüler ve ipucu yazıları PDF'e girmez; ekranda düzelttiğin metinler korunur; PDF dosya adı müşteriye göre önerilir.

## Codex, kâr ve iş raporu (1.14.0)

- **Agent ve Sınırlar** (Ayarlar → Kaynak Kullanımı): her iş türü (tasarım, düzenleme, çeviri, ek sayfa) için Claude Code ya da **Codex**, model, en fazla adım ve token tavanı. Boş = paket.
  - Codex için: WSL'de `npm i -g @openai/codex`, sonra `codex login` (ChatGPT hesabı ya da API anahtarı).
  - Codex işleri salt okunur kum havuzunda, **shell, tarayıcı, bilgisayar kontrolü, eklentiler ve hook'lar kapalı**, sadece site-factory araçlarıyla, boş bir çalışma klasöründe çalışır; kullanıcı ayarları (`~/.codex/config.toml`) yok sayılır.
- **Kâr hesabı:** İş Takibi'ne müşteri giderleri (alan adı vb.) eklenir; fiyat − gider − agent maliyeti = kâr. Müşteriler sayfasında "Kazanç" özeti. Kurlar ve Codex birim fiyatı Ayarlar → Kâr Hesabı'nda.
- **İş Raporu** (Teklif sekmesi): ne istendi, ne yapıldı, tarihleriyle; yazdırılabilir, kaynak kullanımı isteğe bağlı gösterilir.
- **Diğer dilleri güncelle:** Metin formunda ve "⋯" menüsünde; varsayılan dildeki son hâle göre ucuz modelle çeviri.

## Panel düzenlemeleri (1.13.0)

- **Arşiv** (sol menü): arşivlenen müşterileri görme, **Geri getir**, **Kalıcı sil** (kısa adı yeniden yazarak; yalnızca arşivdekiler silinebilir).
- **Onay pencereleri** panelin kendi tasarımında (tarayıcının gri kutuları yerine); tehlikeli işlemlerde kısa ad yazılmadan buton açılmaz.
- **Açık tema**: sol menü de açık renk; panel renkleri tamamen tema değişkenlerinden. "⋯" menüsü artık kartların arkasında kalmıyor.
- **Yeni Müşteri** iki sütunlu: solda işletme, sağda müşteriden gelen bilgiler.
- **Metin** formu: sayfadaki bütün metinler kimlikleriyle (`h1-1`, `p-3`, `meta-description`, şablon sitelerde `seo.home.description`); yerinde düzenlenir, agent çalışmaz.
- **Ek sayfa** (Sayfalar formu, serbest tasarım): ad + içerik notu → sitenin tasarımıyla yeni sayfa ve menü bağlantısı.
- **Logo kontrolleri** (token harcamadan): başka bir müşterinin logosuyla aynı dosya seçilirse uyarı; tasarım işinden önce logo gösterilip onay istenir; logo değişince "Marka eski logoya göre" uyarısı ve tek tıkla yenileme.
- Doğrudan düzenlemelerde "Önce: …" sürümü artık gerçekten değişiklikten önce kaydediliyor.

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
