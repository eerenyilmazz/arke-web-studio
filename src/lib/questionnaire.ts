import { INDUSTRY_EXTRAS, QUESTIONS, type Question } from "../schema/questions.js";
import { localizedQuestion } from "../schema/questions-tr.js";

export interface QuestionnaireInput {
  readonly businessName: string;
  readonly industry: string;
  readonly round: 1 | 2;
  /** For round 2: ids still open. Undefined = every round-2 question. */
  readonly openIds?: ReadonlySet<string>;
  readonly replyBy?: string;
  readonly sharedFolderNote?: string;
  /** The client's language: "tr" gives the Turkish wording, anything else English. */
  readonly lang?: string;
}

/** The questionnaire's own words, per language (the questions come from questions.ts / questions-tr.ts). */
const WORDS = {
  en: {
    title1: "Your new website: a few quick questions",
    title2: "Your new website: last details",
    intro1: 'This takes about 10 minutes. Short answers are fine; if you are unsure, write "please suggest" and we will propose something.',
    intro2: 'Thank you for your first answers. These are the remaining details we need. Write "please suggest" wherever you are unsure.',
    replyBy: (d: string) => `Please reply by ${d}.`,
    replyByMd: (d: string) => `Please reply by **${d}**.`,
    essential: "Essential",
    optional: "Optional",
    example: "Example",
    answer: "Your answer:",
    answerTxt: "Answer:",
    sector: "For your sector",
    later: "Might interest you later? (tick any; this does not change the current price)",
    files: "Please send logos and photos as a shared folder link (Google Drive or WeTransfer) rather than attachments.",
  },
  tr: {
    title1: "Yeni web siteniz: birkaç kısa soru",
    title2: "Yeni web siteniz: son ayrıntılar",
    intro1: 'Yaklaşık 10 dakika sürer. Kısa cevaplar yeterli; emin olmadığınız yere "siz önerin" yazın, biz öneririz.',
    intro2: 'İlk cevaplarınız için teşekkürler. Gereken son bilgiler bunlar. Emin olmadığınız yere "siz önerin" yazın.',
    replyBy: (d: string) => `Lütfen ${d} tarihine kadar cevaplayın.`,
    replyByMd: (d: string) => `Lütfen **${d}** tarihine kadar cevaplayın.`,
    essential: "Gerekli",
    optional: "İsteğe bağlı",
    example: "Örnek",
    answer: "Cevabınız:",
    answerTxt: "Cevap:",
    sector: "Sektörünüze özel",
    later: "İleride ilginizi çekebilir mi? (istediklerinizi işaretleyin; şimdiki fiyatı değiştirmez)",
    files: "Logo ve fotoğrafları e-posta eki yerine paylaşılan bir klasör bağlantısıyla (Google Drive ya da WeTransfer) gönderin.",
  },
} as const;

export interface Questionnaire {
  readonly markdown: string;
  readonly plainText: string;
  readonly questionIds: string[];
}

/** Builds the client-facing form in the client's language (Turkish or English). Internal questions are never included. */
export function buildQuestionnaire(input: QuestionnaireInput): Questionnaire {
  const lang = input.lang === "tr" ? "tr" : "en";
  const w = WORDS[lang];
  const clientQs = QUESTIONS.filter((q) => q.audience === "client");
  const selected =
    input.round === 1
      ? clientQs.filter((q) => q.round === 1)
      : clientQs.filter((q) => q.round !== "later" && (input.openIds ? input.openIds.has(q.id) : q.round === 2));

  const required = selected.filter((q) => q.required);
  const optional = selected.filter((q) => !q.required);
  const extras = input.round === 2 ? industryExtras(input.industry) : [];
  const later = input.round === 2 ? clientQs.filter((q) => q.round === "later") : [];

  const md: string[] = [];
  const txt: string[] = [];
  const title = input.round === 1 ? w.title1 : w.title2;
  md.push(`# ${title}`, "", `**${input.businessName}**`, "");
  txt.push(title.toLocaleUpperCase(lang), input.businessName, "");
  const intro = input.round === 1 ? w.intro1 : w.intro2;
  md.push(intro, "");
  txt.push(intro, "");
  if (input.replyBy) {
    md.push(w.replyByMd(input.replyBy), "");
    txt.push(w.replyBy(input.replyBy), "");
  }

  let n = 0;
  const section = (heading: string, qs: readonly Question[]) => {
    if (qs.length === 0) return;
    md.push(`## ${heading}`, "");
    txt.push(heading.toLocaleUpperCase(lang), "");
    for (const q of qs) {
      const l = localizedQuestion(q, lang);
      n += 1;
      md.push(`**${n}. ${l.text}**`);
      txt.push(`${n}. ${l.text}`);
      if (l.choices) {
        md.push(...l.choices.map((c) => `- [ ] ${c}`));
        txt.push(...l.choices.map((c) => `   [ ] ${c}`));
      }
      // Examples are written for UK clients: shown only on English forms.
      if (q.example && lang === "en") {
        md.push(`<br>_${w.example}: ${q.example}_`);
        txt.push(`   ${w.example}: ${q.example}`);
      }
      if (l.hint) {
        md.push(`<br>_${l.hint}_`);
        txt.push(`   (${l.hint})`);
      }
      md.push("", `> ${w.answer}`, "");
      txt.push(`   ${w.answerTxt}`, "");
    }
  };

  section(w.essential, required);
  section(w.optional, optional);
  if (extras.length > 0) {
    md.push(`## ${w.sector}`, "");
    txt.push(w.sector.toLocaleUpperCase(lang), "");
    for (const e of extras) {
      n += 1;
      md.push(`**${n}. ${e}**`, "", `> ${w.answer}`, "");
      txt.push(`${n}. ${e}`, `   ${w.answerTxt}`, "");
    }
  }
  if (later.length > 0) {
    md.push(`## ${w.later}`, "", ...later.map((q) => `- [ ] ${localizedQuestion(q, lang).text}`), "");
    txt.push(w.later.toLocaleUpperCase(lang), ...later.map((q) => `   [ ] ${localizedQuestion(q, lang).text}`), "");
  }

  const files = input.sharedFolderNote ?? w.files;
  md.push("---", "", files, "");
  txt.push(files, "");

  return {
    markdown: md.join("\n"),
    plainText: txt.join("\n"),
    questionIds: [...selected.map((q) => q.id)],
  };
}

export function industryExtras(industry: string): string[] {
  const key = industry.toLowerCase();
  return Object.entries(INDUSTRY_EXTRAS)
    .filter(([match]) => key.includes(match))
    .flatMap(([, qs]) => qs);
}
