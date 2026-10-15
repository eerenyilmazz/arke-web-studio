import { INDUSTRY_EXTRAS, QUESTIONS, type Question } from "../schema/questions.js";

export interface QuestionnaireInput {
  readonly businessName: string;
  readonly industry: string;
  readonly round: 1 | 2;
  /** For round 2: ids still open. Undefined = every round-2 question. */
  readonly openIds?: ReadonlySet<string>;
  readonly replyBy?: string;
  readonly sharedFolderNote?: string;
}

export interface Questionnaire {
  readonly markdown: string;
  readonly plainText: string;
  readonly questionIds: string[];
}

/** Builds the client-facing form (English, UK clients). Internal questions are never included. */
export function buildQuestionnaire(input: QuestionnaireInput): Questionnaire {
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
  const title = input.round === 1 ? `Your new website: a few quick questions` : `Your new website: last details`;
  md.push(`# ${title}`, "", `**${input.businessName}**`, "");
  txt.push(title.toUpperCase(), input.businessName, "");

  const intro =
    input.round === 1
      ? "This takes about 10 minutes. Short answers are fine; if you are unsure, write \"please suggest\" and we will propose something."
      : "Thank you for your first answers. These are the remaining details we need. Write \"please suggest\" wherever you are unsure.";
  md.push(intro, "");
  txt.push(intro, "");
  if (input.replyBy) {
    md.push(`Please reply by **${input.replyBy}**.`, "");
    txt.push(`Please reply by ${input.replyBy}.`, "");
  }

  let n = 0;
  const section = (heading: string, qs: readonly Question[]) => {
    if (qs.length === 0) return;
    md.push(`## ${heading}`, "");
    txt.push(heading.toUpperCase(), "");
    for (const q of qs) {
      n += 1;
      md.push(`**${n}. ${q.text}**`);
      txt.push(`${n}. ${q.text}`);
      if (q.choices) {
        md.push(...q.choices.map((c) => `- [ ] ${c}`));
        txt.push(...q.choices.map((c) => `   [ ] ${c}`));
      }
      if (q.example) {
        md.push(`<br>_Example: ${q.example}_`);
        txt.push(`   Example: ${q.example}`);
      }
      if (q.hint) {
        md.push(`<br>_${q.hint}_`);
        txt.push(`   (${q.hint})`);
      }
      md.push("", "> Your answer:", "");
      txt.push("   Answer:", "");
    }
  };

  section("Essential", required);
  section("Optional", optional);
  if (extras.length > 0) {
    md.push("## For your sector", "");
    txt.push("FOR YOUR SECTOR", "");
    for (const e of extras) {
      n += 1;
      md.push(`**${n}. ${e}**`, "", "> Your answer:", "");
      txt.push(`${n}. ${e}`, "   Answer:", "");
    }
  }
  if (later.length > 0) {
    const h = "Might interest you later? (tick any; this does not change the current price)";
    md.push(`## ${h}`, "", ...later.map((q) => `- [ ] ${q.text}`), "");
    txt.push(h.toUpperCase(), ...later.map((q) => `   [ ] ${q.text}`), "");
  }

  const files = input.sharedFolderNote ?? "Please send logos and photos as a shared folder link (Google Drive or WeTransfer) rather than attachments.";
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
