# Kişisel veri profili: kaynaklar ve kararlar

`src/lib/client/privacy.ts` her müşterinin pazarına göre bir profil seçer. Bu dosya o değerlerin nereden geldiğini ve neden
öyle seçildiğini yazar. Bir değer değişirse önce burası, sonra kod ve testler güncellenir.

| Veri | Süre | Dayanak |
| --- | --- | --- |
| İletişim formu mesajları | 12 ay, sonra otomatik silme | Kanunlarda sabit süre yok; amaçla sınırlı saklama (KVKK m.4, GDPR m.5/1-e). 12 ay, cevaplanmış bir talebin takibi için makul üst sınır. |
| Randevu kayıtları | 12 ay | Aynı ilke |
| Sipariş kayıtları (TR) | 3 yıl | Mesafeli Sözleşmeler Yönetmeliği m.20. Ticari defter ve belgeler (TTK m.82: 10 yıl) muhasebe sisteminde tutulur, sitede değil. |
| Sipariş kayıtları (UK) | 6 yıl | HMRC: limited şirket 6 yıl, şahıs işletmesi 5 yıl; üst değer seçildi |
| Sipariş kayıtları (IE / NL / DE) | 6 / 7 / 8 yıl | Ulusal muhasebe saklama süreleri; Almanya 2025'ten beri 8 yıl |
| Hız sınırı kayıtları | 1 gün | Sadece kötüye kullanımı engellemek için; IP adresi açık tutulmaz (siteye özel anahtarlı özet) |

| Kural | Değer | Dayanak |
| --- | --- | --- |
| Periyodik silme | Her gece | KVKK Silme Yönetmeliği m.11: en fazla 6 ayda bir |
| Kişinin talebine yanıt | 30 gün | KVKK m.13 ve Yönetmelik m.12; GDPR m.12/3 (bir ay) |
| Veri bölgesi | UK ve AB müşterileri: AB | GDPR bölüm V; AB, Birleşik Krallık için yeterlilik kararlı. Cloudflare D1 ve R2'de bölge yalnızca oluştururken seçilir. |
| VERBİS | Küçük işletmelerin çoğu muaf | Kurul kararı (Resmî Gazete 1 Ekim 2025): yılda 50'den az çalışan ve 100 milyon TL altı bilanço. Yükümlülük işletmenin. |

## Açık konular (avukata sorulacak)

- **KVKK yurt dışı aktarım (m.9):** Cloudflare ve form servisleri verileri Türkiye dışında saklar. Aydınlatma metni bunu
  söylüyor; aktarım için gereken güvence (standart sözleşme vb.) işletme ve barındırma sağlayıcısı arasındadır.
- Şablon metinler (`rules/privacy.md`) satıştan önce bir kez kontrol edilmeli.

## Kaynaklar

- Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik (m.11, m.12)
- Mesafeli Sözleşmeler Yönetmeliği (m.20); Türk Ticaret Kanunu m.82
- KVKK Kurul kararı, VERBİS istisnası (Resmî Gazete 1 Ekim 2025, sayı 33034)
- HMRC kayıt saklama süreleri; Almanya 4. Bürokrasi Azaltma Kanunu (muhasebe belgeleri 8 yıl)
- Cloudflare D1 veri konumu: https://developers.cloudflare.com/d1/configuration/data-location/
- Cloudflare R2 veri konumu: https://developers.cloudflare.com/r2/reference/data-location/
