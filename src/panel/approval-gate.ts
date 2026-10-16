import { randomInt, timingSafeEqual } from "node:crypto";

/**
 * Approvals from the panel. The code is created when the panel starts and printed only in the terminal
 * where Eren started it: it never goes to the browser, to the agent, or into a file. A wrong code counts;
 * after a few wrong tries the panel refuses approvals until it is restarted (new code).
 */
const CODE_DIGITS = 6;
const MAX_FAILURES = 5;

export class ApprovalGate {
  private failures = 0;

  constructor(readonly code: string = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0")) {}

  get locked(): boolean {
    return this.failures >= MAX_FAILURES;
  }

  get triesLeft(): number {
    return Math.max(0, MAX_FAILURES - this.failures);
  }

  check(input: string): boolean {
    if (this.locked) return false;
    const a = Buffer.from(input.trim());
    const b = Buffer.from(this.code);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) this.failures++;
    return ok;
  }
}
