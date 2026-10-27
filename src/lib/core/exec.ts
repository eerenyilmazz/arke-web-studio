import { execFile } from "node:child_process";
import { FactoryError } from "./errors.js";

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
  /** Extra variables for the child. Values listed in `secrets` are masked in returned output. */
  readonly env?: Readonly<Record<string, string>>;
  readonly secrets?: readonly string[];
  /** Keep more output than the default (e.g. a JSON report that must be parsed whole). */
  readonly maxOutputChars?: number;
  /** Written to the child's stdin (e.g. a secret for `wrangler secret put`, never put in arguments). */
  readonly input?: string;
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Only these parent variables reach child processes, so stray secrets in the shell never leak into builds. */
const INHERITED_ENV = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "NODE_OPTIONS",
  // Network setup (corporate proxies, custom CAs) so npm/wrangler can reach the internet.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
];
const MAX_OUTPUT_CHARS = 12_000;
/** On Windows, .cmd shims need a shell; we only allow it when every argument is plain. */
const SAFE_SHELL_ARG = /^[\w@./:\\=-]+$/;
const WINDOWS_SHIMS = new Set(["npm", "npx", "pnpm", "yarn"]);

/**
 * Runs a program with an argument list. Never interpolates into a shell string,
 * so client data cannot inject commands.
 */
export function run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
  const isWindowsShim = process.platform === "win32" && WINDOWS_SHIMS.has(command);
  if (isWindowsShim && ![command, ...args].every((a) => SAFE_SHELL_ARG.test(a))) {
    return Promise.reject(new FactoryError("Refusing to run a command with unsafe characters in its arguments."));
  }

  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  Object.assign(env, options.env);

  return new Promise((resolve) => {
    const child = execFile(
      isWindowsShim ? `${command}.cmd` : command,
      [...args],
      {
        cwd: options.cwd,
        env,
        timeout: options.timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        shell: isWindowsShim,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        const mask = (text: string) => trimOutput(redact(text, options.secrets ?? []), options.maxOutputChars ?? MAX_OUTPUT_CHARS);
        const timedOut = error && "killed" in error && error.killed ? "\n[timed out]" : "";
        const spawnError = error && typeof error.code === "string" ? `\n[${error.code}: ${error.message}]` : "";
        resolve({ code, stdout: mask(String(stdout)), stderr: mask(String(stderr) + timedOut + spawnError) });
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.split(secret).join("***");
  }
  return out;
}

function trimOutput(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(-max)}`;
}
