# Yol haritası

Web Stüdyosu'nun planı, açık konuları ve alınmış kararlar. Yapılanlar sürüm sürüm [`CHANGELOG.md`](CHANGELOG.md)
dosyasında. Bir adım bittiğinde buradan "Tamamlananlar"a taşınır.

## Şimdi

| # | Adım | Durum |
| --- | --- | --- |
| 1 | Çekirdek ve bireysel hesaplar (Cloudflare panelden, şifreli) | ✅ 1.25.0 |
| 2 | Uygulama siteleri için yayın modülü (Worker, D1, R2, migrations, secrets) | ✅ 1.26.0 |
| 3 | Ortak hazır parçalar: katalog, gelen kutusu, müşterinin yönetim ekranı | ✅ 1.27.0 |
| — | Globalleşme: profil, kişisel izlerin kaldırılması, kolay kurulum, panelden güncelleme, ekip eşitleme, ArkeLab görünümü | ✅ 1.27.1–1.29.0 |
| — | Yeni ad: Arke Web Studio, teknik adlar dahil (temiz başlangıç) | ✅ 2.0.0 |
| 3b | **Pazara göre kişisel veri profili** (KVKK, GDPR): saklama süresi, otomatik silme, kişinin verisini bulma, dışa aktarma ve silme, AB müşterileri için AB veri bölgesi, bildirim metinleri | sıradaki |
| 4 | **E-ticaret:** sepet, sipariş, ödeme paketleri, yasal sayfalar (mesafeli satış, iade, KVKK/GDPR), ödeme testi onayı, panelde müşteri anahtarları | planlandı |
| 5 | **Randevu:** hizmetler, personel, takvim, hatırlatma | planlandı |
| 6 | **Restoran ve kafe:** menü, masada QR menü, rezervasyon, isteğe bağlı paket sipariş | planlandı |
| 7 | **ArkeLab entegrasyonu:** Web Stüdyosu paketi, agent kılavuzu, Cloudflare hesabı ArkeLab'ın şifreli deposunda, Arke Web Studio MCP'nin proje terminallerinde çalışması | planlandı |

## Açık konular

- **Gerçek ortam testi:** tasarım planı gerçek agent ile, yayın gerçek bir Cloudflare hesabıyla (statik ve uygulama sitesi) henüz denenmedi. Testlerin hepsi sahte agent ve sahte wrangler ile çalışıyor.
- **Panele uzaktan erişim:** önerilen yol Tailscale ile parolalı giriş; henüz karar verilmedi.
- **Ödeme sağlayıcısı sırası:** ilk paket iyzico, PayTR ya da Stripe olacak; seçilmedi.
- **Ekip eşitlemede müşteri seçimi:** şu an tüm yerel müşteriler gönderiliyor; müşteri bazında seçim gerekebilir.
- **Kural metinlerinin hukuki kontrolü:** KVKK ve GDPR metin şablonları satıştan önce bir avukata kontrol ettirilmeli.

## Kararlar

| Karar | Neden |
| --- | --- |
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

Ayrıntılar için [`CHANGELOG.md`](CHANGELOG.md).
