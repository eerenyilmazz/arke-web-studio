/**
 * An error whose message is safe and useful to show the agent as-is.
 * Anything else is reported as a generic internal error (details go to stderr only).
 */
export class FactoryError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "FactoryError";
  }
}
