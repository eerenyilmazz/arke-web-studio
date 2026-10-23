# Site Factory

Küçük işletmelere (her ülkede; çoğunlukla Türkiye ve İngilizce konuşulan ülkeler) tanıtım sitesi üreten MCP server + kurallar.
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
npm run restore-backup -- /mnt/c/Users/eeren/OneDrive/SiteFactory-Yedek/site-factory-yedek-….tar.gz ~/geri-yuklenen
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
echo 'sf-report() { (cd ~/projects/site-factory && npm run --silent report -- /mnt/c/Users/eeren/Downloads); }' >> ~/.bashrc && source ~/.bashrc
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
