# Yol haritası

Arke Web Studio'nun planı, açık konuları ve alınmış kararlar. Yapılanlar sürüm sürüm [`CHANGELOG.md`](CHANGELOG.md)
dosyasında. Bir görev bittiğinde burada işaretlenir; bir plan bittiğinde "Tamamlananlar"a taşınır.

İş, ArkeLab'de bu projenin altında **beş çalışma planına** bölünür. Kod tek depoda kalır: hepsi aynı çekirdeği (müşteri,
tasarım agent'ı, onaylar, sürümler, yayın, yedek) kullanır; her plan büyük ölçüde kendi klasöründe çalışır
(bkz. [Klasör düzeni](#klasör-düzeni)).

## Şimdi

| Plan | Amaç | Durum |
| --- | --- | --- |
| 1 · Tanıtım ve temel | Tanıtım siteleri ve ortak çekirdek; gerçek ortamda kullanılabilir | ✅ 2.4.2, kalan küçük işler |
| 2 · E-ticaret | Ürün, sepet, sipariş, ödeme, yasal sayfalar | **sıradaki** |
| 3 · Randevu | Hizmet, personel, takvim, hatırlatma | planlandı |
| 4 · Restoran ve kafe | Menü, masada QR, masa siparişi, rezervasyon | planlandı (3 karar bekliyor) |
| 5 · ArkeLab entegrasyonu | MCP'nin ArkeLab terminallerinde çalışması, ortak hesap deposu | planlandı |

Planlar sırayla yürür: biri bitmeden diğerine başlanmaz (tek kişide paralel plan, yarım kalmış iki iş demektir).
Plan 5'in ilk görevi (kuralların netleşmesi) beklemeden yapılabilir; diğer işlerin nasıl gönderileceğini belirler.

Her görevin yanında dokunduğu yer yazar: **çekirdek** (bütün türleri etkiler, daha dikkatli incelenir) ya da **tür**
(sadece o türün klasörleri).

### Plan 1 · Tanıtım ve temel

Tanıtım siteleri gerçek bir müşteriyle (Thrace IT) baştan sona denendi: plan, tasarım, önizleme, müşteri yorumu, yayın,
geri alma, kaldırma, yedek ve geri yükleme. Bulunan hatalar 2.4.2'de düzeltildi.

| # | Görev | Yer | Durum |
| --- | --- | --- | --- |
| 1.1 | 2.4.2'yi gerçek bir işle doğrula: Özel Talep, önizleme, `/brand/` dosyalarının yayında olmaması, fontların siteden gelmesi, agent özetinin dürüstlüğü | — | açık |
| 1.2 | Tanıtıma özel tasarım kurallarını ortak dosyalardan `rules/products/showcase.md`'ye ayır (içerik aynı kalır, sadece yer değişir) | tür | ✅ 2.4.3 |
| 1.3 | `npm audit` uyarılarını sınıfla (5 uyarı); güvenli olanları güncelle, `--force` kullanma | çekirdek | açık |
| 1.4 | Gizlilik metin şablonlarının (`rules/privacy.md`) ve yurt dışı aktarımın avukat kontrolü | — | satıştan önce |
| 1.5 | Panele uzaktan erişim kararı (öneri: Tailscale ile parolalı giriş) | çekirdek | karar bekliyor |
| 1.6 | Ekip eşitlemesinde müşteri bazında seçim | çekirdek | açık |
| 1.7 | Alan adı olmayan sitede sitemap: yayın adresi belli olunca üret ya da bilerek atla | çekirdek | açık |
| 1.8 | Kullanılan panel ile geliştirme kopyasını ayır (aşağıda "Geliştirme düzeni") | — | açık |
| 1.9 | Kod düzeni: `src/lib/` dört alana (`core`, `client`, `site`, `checks`), büyük panel ekranları ve panel testleri konularına göre | çekirdek | ✅ 2.4.4 |
| 1.10 | Kalan büyük panel dosyalarını ekran başına böl: `info.js` (Müşteri Bilgileri), `edit.js` (Düzenle kartları); o ekranda çalışırken | çekirdek | açık |
| 1.11 | `src/panel/jobs.ts`'i böl: işi çalıştırma, agent izinleri, ilerleme olayları ayrı dosyalara | çekirdek | açık |
| 1.12 | `src/panel/prompts.ts`'teki kalan kural metinlerini md'ye taşı; komutlarda sadece hangi dosyanın okunacağı kalsın | çekirdek | açık |

### Plan 2 · E-ticaret

Ürünler, sepet ve müşterinin kendi ödeme hesabıyla online satış. Agent ödeme kodunu yazmaz; fabrikanın testli hazır
parçalarını yerleştirir ve tasarlar. Tür, plan bitene kadar panelde kapalı kalır ("yakında").

| # | Görev | Yer |
| --- | --- | --- |
| 2.1 | Ödeme sağlayıcısı kararı ve sırası: iyzico, PayTR, Stripe (pazara göre: Türkiye, Birleşik Krallık) | — |
| 2.0 | `parts/` klasörünü böl: ortak parçalar `parts/shared/`, e-ticarete özel olanlar `parts/ecommerce/`; yayınlanmış sitelerdeki dosya yolları değişmeden (testle) | çekirdek |
| 2.2 | E-ticaret tasarım kuralları: ürün listesi, ürün sayfası, sepet, ödeme ekranı, sipariş sonucu (`rules/products/ecommerce.md`) | tür |
| 2.3 | Katalog genişletme: varyant (beden, renk), stok, ürün görselleri; D1 migration | tür (katalog ortak: çekirdek) |
| 2.4 | Sepet parçası: tarayıcıda tutulur, fiyat ve stok sunucuda yeniden hesaplanır | tür |
| 2.5 | Sipariş modeli ve durumları (alındı, ödendi, kargoda, teslim, iade); yönetim ekranında siparişler | tür |
| 2.6 | Ödeme paketi: ödeme oturumu, webhook imza doğrulaması, aynı bildirimin iki kez işlenmemesi, iade | tür |
| 2.7 | Sipariş bildirimleri: alıcıya e-posta, işletmeye bildirim | tür |
| 2.8 | Yasal sayfalar: TR'de mesafeli satış sözleşmesi, ön bilgilendirme formu, cayma ve iade; UK'de Consumer Contracts; KVKK ve GDPR metinleri sipariş verisine göre | tür + `rules/privacy.md` |
| 2.9 | Ödeme testi onayı: canlıya almadan önce test modunda bir ödeme yapılır ve insan onaylar | çekirdek (onaylar) |
| 2.10 | Panelde müşterinin ödeme anahtarları: şifreli saklanır, agent göremez, yayında Worker'a gizli değer olarak gider | çekirdek |
| 2.11 | Türü aç; uçtan uca testler (sepet → ödeme → sipariş → yönetim ekranı), CHANGELOG ve README | tür |

### Plan 3 · Randevu

Kuaför, klinik, salon gibi işletmeler için hizmet, personel ve takvimle online randevu.

| # | Görev | Yer |
| --- | --- | --- |
| 3.1 | Randevu tasarım kuralları: hizmet seçimi, personel, uygun saatler, onay ekranı (`rules/products/booking.md`) | tür |
| 3.2 | Hizmetler ve süreleri (katalog parçasını kullanarak) | tür |
| 3.3 | Personel ve çalışma saatleri, izin günleri | tür |
| 3.4 | Uygunluk hesabı; aynı saate iki randevu verilmemesi | tür |
| 3.5 | Randevu formu, onay e-postası, iptal ve değiştirme bağlantısı | tür |
| 3.6 | Hatırlatma; kanal kararı (e-posta ya da SMS) | tür |
| 3.7 | Yönetim ekranında takvim görünümü | tür |
| 3.8 | Kişisel veri: saklama süresi ve otomatik silme (2.3.0'daki pazar profiline göre) | çekirdek |
| 3.9 | Türü aç; testler, CHANGELOG ve README | tür |

### Plan 4 · Restoran ve kafe

Menü, masada QR ile menü ve sipariş; ödeme online değil, işletmede alınır.

Başlamadan önce verilecek kararlar:
- Paket servis ya da gel-al olacak mı?
- Masadan gelen sipariş garson onaylayınca mı mutfağa düşsün?
- Yeni sipariş bildirimi nasıl gelsin: ekranda ses mi, telefona mı?

| # | Görev | Yer |
| --- | --- | --- |
| 4.1 | Restoran tasarım kuralları: menü sayfası, QR sayfası, masa siparişi (`rules/products/restaurant.md`) | tür |
| 4.2 | Menü parçası: kategoriler, fiyat, alerjenler (UK'de 14 alerjen bilgisi), tükendi işareti | tür |
| 4.3 | Masaya göre QR kodları; yazdırılabilir masa kartları | tür |
| 4.4 | Masadan sipariş (online ödeme yok) | tür |
| 4.5 | Garson onayı akışı (karara göre) | tür |
| 4.6 | Yeni sipariş bildirimi (karara göre) | tür |
| 4.7 | Rezervasyon (Plan 3'ün takvim parçasıyla) | tür |
| 4.8 | İsteğe bağlı paket sipariş (karara göre) | tür |
| 4.9 | Türü aç; testler, CHANGELOG ve README | tür |

### Plan 5 · ArkeLab entegrasyonu

| # | Görev | Yer |
| --- | --- | --- |
| 5.1 | ArkeLab kurallarını bu depo için netleştir: main'e kim alır, ArkeLab hangi dala yayınlar, görev kaynağı (Jira projesi ve anahtar öneki) | — |
| 5.2 | ArkeLab'in projeye eklediği dosyalar (`.mcp.json`, `AGENTS.md`/`CLAUDE.md` eklemeleri, `.codex/`, `.gemini/`): depoya mı girecek, yerel mi kalacak (`.gitignore`) | — |
| 5.3 | Panel güncelleyicisi (`git pull --ff-only`) bu dosyalara takılmasın | çekirdek |
| 5.4 | Arke Web Studio MCP'nin ArkeLab proje terminallerinde çalışması; gizli bilgi içermeyen örnek `.mcp.json` | çekirdek |
| 5.5 | Cloudflare hesabını ArkeLab'in şifreli deposundan okuma (panelin kendi şifreli hesabı yedek olarak kalır) | çekirdek |
| 5.6 | Web Stüdyosu paketi ve agent kılavuzu | — |

## Klasör düzeni

Ortak olan tek yerde; her türün kendine ait dosyaları kendi klasöründe. Agent her işte ortak kuralları ve sadece o
müşterinin türünün kural dosyasını okur (`src/products/registry.ts` içindeki `rules`).

```
src/, panel/                 ortak çekirdek: müşteri, onay, sürüm, yayın, yedek, agent işleri
src/products/registry.ts     hangi tür hangi parçaları ve kuralları kullanır
src/products/<tür>/          türe özel panel işleri ve kontroller
rules/                       ortak kurallar: marka, tasarım planı, pazar, gizlilik, SEO
rules/products/<tür>.md      türe özel sayfa düzeni ve iş kuralları
parts/app/, parts/site/      bugünkü ortak hazır parçalar (katalog, gelen kutusu, yönetim ekranı)
parts/<tür>/                 türe özel hazır parçalar ve migration'ları
tests/products/<tür>/        türe özel testler
```

- Mevcut dosyalar şimdilik yerinde kalır; taşımak yayınlanmış sitelerdeki yolları bozabilir. Gerekirse testle ve tek
  tek taşınır.
- Yeni türlerin dosyaları baştan kendi klasörlerine yazılır.
- Ortak tasarım sistemi (marka, renk, font, imza animasyonu, tasarım planı ve onayı) her türde aynıdır; türler sadece
  sayfa düzenini kendi kurallarında tanımlar. Mevcut sitelerin tasarımı bu düzenden etkilenmez.

## Çalışma kuralları

**Dallar:** uzun ömürlü plan dalı yok. Her görev kısa ömürlü bir dalda yapılır ve PR ile `main`'e alınır:
`feat/<görev-anahtarı>-<kısa-ad>`, `fix/…`, `docs/…` (ör. `feat/WEB-12-sepet`). Bitmemiş tür main'e girer ama panelde
kapalı kalır. ArkeLab kişisel bir dala yayınlıyorsa o dal PR ile main'e alınır ve her birleştirmeden sonra main'e eşitlenir.
`main` her zaman yayınlanabilir olmalı: panel güncellemesi oradan gelir.

**Commit ve sürüm:** commit mesajları İngilizce (`feat(WEB-12): cart totals`, `fix: …`, `docs: …`); sürüm commit'i
`2.5.0: short summary`. Sürüm etiketi `vX.Y.Z`, main'e alındıktan sonra atılır. Bir planın büyük adımı minor
(2.5.0, 2.6.0…), düzeltmeler patch sürümdür. Kod, yorumlar, `AGENTS.md` ve `rules/` İngilizce; arayüz, README,
CHANGELOG, ROADMAP ve `docs/` Türkçe.

**main için önerilen koruma (GitHub ayarı):** PR zorunlu, CI'daki `test` işi geçmeli, dal güncel olmalı, doğrusal geçmiş,
force push ve silme kapalı, `v*` etiketleri korumalı.

**Geliştirme düzeni:** kullanılan panel (`~/projects/arke-web-studio`, sadece `main`) ile ArkeLab'e bağlanan geliştirme
kopyası (ör. `~/projects/arke-web-studio-dev`) ayrı klasörlerde durur. Böylece geliştirmede dal değiştirmek çalışan
paneli ve müşteri işlerini etkilemez.

## Açık konular

- **Ödeme sağlayıcısı sırası:** iyzico, PayTR ya da Stripe; seçilmedi (Plan 2.1).
- **Restoran kararları:** paket servis, garson onayı, bildirim kanalı (Plan 4).
- **ArkeLab kuralları:** main'e alma yetkisi, yayın dalı, görev kaynağı (Plan 5.1).
- **Panele uzaktan erişim:** önerilen yol Tailscale ile parolalı giriş; karar verilmedi (Plan 1.5).
- **Ekip eşitlemede müşteri seçimi:** şu an tüm yerel müşteriler gönderiliyor (Plan 1.6).
- **Kural metinlerinin hukuki kontrolü:** KVKK ve GDPR şablonları (`rules/privacy.md`) ve yurt dışı aktarım satıştan önce
  bir avukata kontrol ettirilmeli (`docs/privacy.md`).

## Kararlar

| Karar | Neden |
| --- | --- |
| Tek ürün, tek depo; iş ArkeLab'de beş çalışma planına bölünür | Ortak çekirdek tek yerde; düzeltme bir kere yapılır |
| Ortak çekirdek + türe özel klasörler (`rules/products/`, `parts/<tür>/`, `src/products/<tür>/`) | Planlar birbirine dokunmadan ilerler; agent sadece ilgili kuralları okur |
| Plan dalı yok; kısa ömürlü görev dalları ve PR ile main | main hep yayınlanabilir; büyük birleştirme çakışması olmaz |
| Bitmemiş tür panelde kapalı kalır | Yarım iş müşteriye görünmez |
| Agent çalışan parçaların kodunu yazmaz; fabrikanın testli hazır parçalarını yerleştirir (ödeme dahil) | Kısa ve ucuz işler, güvenilir parçalar, ödeme güvenliği |
| Onaylar sadece insanda; panelde tek kullanımlık terminal koduyla | Agent ya da bir web sayfası onay veremez |
| Herkes kendi panelini ve kendi Cloudflare hesabını kullanır | Bireysel sorumluluk, paylaşılan gizli bilgi yok |
| Ekip eşitleme Git ile, müşteri başına bir dal; çakışmada durur | Tahmini birleştirme yok, ArkeLab'ın Git modeliyle uyumlu |
| Kişisel veri kuralları sayfanın diline göre değil, müşterinin pazarına göre | KVKK ve GDPR pazara bağlı |
| Panel görünümü ArkeLab tasarım sistemine uyar | Tek ürün hissi; renkler tek dosyada |
| Kurallar md dosyalarında tek kaynaktır; agent komutları sadece hangi dosyanın okunacağını söyler | Çelişki olmasın, token tasarrufu |
| Değişiklikler küçük, geri alınabilir ve testli; mevcut API ve veriler korunur | Canlı sistem güvenliği |
| Ad her yerde Arke Web Studio; eski adlara uyumluluk tutulmadı | Henüz canlı müşteri yok; temiz başlangıç |

## Tamamlananlar

| Adım | Sürüm |
| --- | --- |
| Çekirdek ve bireysel hesaplar (Cloudflare panelden, şifreli) | 1.25.0 |
| Uygulama siteleri için yayın modülü (Worker, D1, R2, migrations, secrets) | 1.26.0 |
| Ortak hazır parçalar: katalog, gelen kutusu, müşterinin yönetim ekranı | 1.27.0 |
| Globalleşme: profil, kişisel izlerin kaldırılması, kolay kurulum, panelden güncelleme, ekip eşitleme, ArkeLab görünümü | 1.27.1–1.29.0 |
| Yeni ad: Arke Web Studio, teknik adlar dahil (temiz başlangıç) | 2.0.0 |
| Yeni panel ekranları: Hızlı Düzenleme, Yeni Müşteri, Ayarlar | 2.2.0–2.2.2 |
| Pazara göre kişisel veri profili (KVKK, GDPR): saklama süresi, otomatik silme, kişinin verisini bulma, dışa aktarma ve silme, AB veri bölgesi, bildirim metinleri | 2.3.0 |
| Müşterinin yönetim ekranı Türkçe ve İngilizce | 2.4.0 |
| Gerçek ortam testi (gerçek agent, gerçek Cloudflare) ve bulguların düzeltilmesi | 2.4.1–2.4.2 |

Ayrıntılar için [`CHANGELOG.md`](CHANGELOG.md).
