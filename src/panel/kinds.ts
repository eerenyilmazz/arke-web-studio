/**
 * Job kinds whose name changed. Old names stay readable in saved history, inputs and the usage ledger, so a
 * client's past work keeps its labels and costs after an update. New records are always written with the new name.
 */
const RENAMED: Readonly<Record<string, string>> = {
  autopilot: "create-site", // 1.17.0: the job behind "Siteyi Oluştur"
  "client-feedback": "portal-comments", // 1.17.0: comments that came in through the client portal
};

export function currentKind(kind: string): string {
  return RENAMED[kind] ?? kind;
}

/** A saved record with its kind brought up to date (no copy when nothing changed). */
export function withCurrentKind<T extends { kind: string }>(record: T): T {
  const kind = currentKind(record.kind);
  return kind === record.kind ? record : { ...record, kind };
}
