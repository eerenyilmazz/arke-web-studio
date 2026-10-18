import type { Question } from "./questions.js";

/**
 * Turkish wording of the client questions (questionnaire, portal form). Same ids and meaning as questions.ts;
 * the English text stays the source the agent reads. A question without an entry falls back to English.
 */
export const QUESTIONS_TR: Readonly<Record<string, { text: string; hint?: string; choices?: readonly string[] }>> = {
  "business-name": { text: "İşletmenizin adı, sitede tam olarak nasıl görünmeli?" },
  services: { text: "Ne iş yapıyorsunuz? Ana hizmetlerinizi (3–8 tane) her biri bir satırda yazın." },
  audience: { text: "İdeal müşterileriniz kimler ve nerede bulunuyorlar?" },
  logo: { text: "Logonuz var mı? Varsa gönderin (SVG ya da büyük bir PNG). Yoksa adınızı sade bir yazı logosuyla kullanırız." },
  "brand-colours": {
    text: "Kurumsal renkleriniz var mı? Yoksa sektörünüze uygun bir renk paleti öneririz.",
    choices: ["Evet (renk kodlarını ya da bir örnek gönderin)", "Hayır, siz önerin"],
  },
  tone: { text: "Site nasıl bir his vermeli?", choices: ["Resmî", "Samimi", "Premium", "Enerjik", "Sakin"] },
  pages: {
    text: "Hangi sayfalara ihtiyacınız var?",
    hint: "Tek sayfalık bir site (yalnızca Ana sayfa) da olur.",
    choices: ["Ana sayfa", "Hakkımızda", "Hizmetler", "Galeri", "İletişim"],
  },
  "contact-details": { text: "Sitede gösterilecek iletişim bilgileri: e-posta, telefon, adres ve çalışma saatleri." },
  whatsapp: { text: "WhatsApp düğmesi ister misiniz? İsterseniz hangi numara ve hazır mesaj ne yazsın?" },
  languages: {
    text: "Site Türkçe hazırlanır. Başka bir dil de gerekiyor mu? Hangisi?",
    choices: ["Yalnızca Türkçe", "Türkçe + bir dil daha (hangisi olduğunu yazın)"],
  },
  about: { text: "Hikâyenizi birkaç cümleyle anlatın: nasıl başladınız, sizi farklı kılan ne?" },
  photos: {
    text: "Fotoğraflarınızı (işyeri, yaptığınız işler, ekip) paylaşın. Fotoğrafı olmayan yerlerde hazır görseller kullanabilir miyiz?",
    hint: "Bu formdan yükleyebilir ya da bir Google Drive bağlantısı gönderebilirsiniz.",
  },
  "testimonials-faq": { text: "Sitede alıntılayabileceğimiz müşteri yorumları (adıyla) ve müşterilerin sık sorduğu sorular var mı?" },
  "form-recipient": { text: "İletişim formundan gelen mesajlar hangi e-postaya gitsin? (Sitedeki adresten farklıysa.)" },
  "maps-booking": { text: "Google Haritalar / İşletme Profili bağlantınız ya da online randevu bağlantınız var mı?" },
  social: { text: "Sitede gösterilecek sosyal medya hesapları." },
  domain: {
    text: "Alan adınız var mı? Varsa hangisi ve DNS ayarlarını kim değiştirebilir? Yoksa sizin için alalım mı, bütçeniz nedir?",
    choices: ["Evet, var", "Lütfen benim için alın", "Kendim alacağım", "Henüz emin değilim"],
  },
  legal: {
    text: "Alt bilgi ve gizlilik metni için: şirket unvanı, adres, vergi dairesi ve numarası (varsa MERSİS numarası).",
    hint: "Formdan bilgi topluyorsanız KVKK aydınlatma metni için gereklidir.",
  },
  "style-references": { text: "Beğendiğiniz iki web sitesi ve kesinlikle istemediğiniz iki tarz." },
  "ai-crawlers": { text: "Yapay zekâ arama araçları (ör. ChatGPT, Perplexity) sitenizi okuyabilsin mi? Varsayılan: evet.", choices: ["Evet", "Hayır"] },
  rights: { text: "Gönderdiğiniz her logo, fotoğraf ve metnin size ait olduğunu ya da kullanım izniniz olduğunu onaylayın.", choices: ["Onaylıyorum"] },
  approver: { text: "Site yayına çıkmadan önce kim onaylayacak (ad ve e-posta)? Hedeflediğiniz bir yayın tarihi var mı?" },
  "later-multi-location": { text: "Sitede birden fazla şube / konum" },
  "later-migration": { text: "Mevcut bir siteden geçiş (Google sıralamasını koruyarak)" },
  "later-search-console": { text: "Google Search Console kurulumu ve raporlama" },
  "later-special-hours": { text: "Bayram / özel gün çalışma saatleri" },
  "later-team": { text: "Ekip sayfası" },
  "later-video": { text: "Tanıtım videosu" },
  "later-payments": { text: "Online ödeme ya da kapora bağlantısı" },
  "later-newsletter": { text: "E-bülten kaydı" },
  "later-branded-email": { text: "Kurumsal e-posta (info@alanadiniz)" },
  "later-qr-code": { text: "Vitrin / kartvizit için QR kod" },
  "later-maintenance": { text: "Aylık bakım ve güncellemeler" },
};

/** A client question in the client's language: Turkish when the site's main language is Turkish, else English. */
export function localizedQuestion(q: Question, lang: string): { text: string; hint?: string; choices?: readonly string[] } {
  const tr = lang === "tr" ? QUESTIONS_TR[q.id] : undefined;
  return {
    text: tr?.text ?? q.text,
    ...((tr?.hint ?? q.hint) ? { hint: tr?.hint ?? q.hint } : {}),
    ...((tr?.choices ?? q.choices) ? { choices: tr?.choices ?? q.choices } : {}),
  };
}
