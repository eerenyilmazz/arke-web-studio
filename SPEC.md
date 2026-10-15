# Site Factory: build specification

What to build so that the flow in `AGENTS.md` works. Build in this order, run the tests after each step,
and stop for Eren's review at the end of each step.

1. Schema and questions
2. MCP server and tools
3. Approve CLI
4. Templates `corporate-v1` (original) and `corporate-v2` (default: personalities, animated sector motifs)
5. One demo client end to end (build + `deploy` with `dryRun`)

## Stack

- Node 20+, TypeScript `strict` (+ `noUncheckedIndexedAccess`), ESM.
- `@modelcontextprotocol/sdk` (stdio server, `registerTool`), `zod` v4, `wrangler` v4 as a local dependency, `vitest`.
- Template: Astro + Tailwind, static output.

## Layout

```
site-factory/
├── AGENTS.md  CLAUDE.md (= "@AGENTS.md")  SPEC.md  README.md
├── rules/design-rules.md
├── factory.config.json        # clientsRoot "../sf-clients", inboxDir "../sf-inbox", templatesDir "templates",
│                              # defaultTemplate "corporate-v2", uupmScript, limits (see Limits)
├── .mcp.json                  # { "mcpServers": { "site-factory": { "command": "node", "args": ["dist/server.js"] } } }
├── .claude/settings.json      # deny rules, see Security
├── src/
│   ├── schema/site-config.ts  content.ts  questions.ts
│   ├── lib/                   # paths, exec, files, audit, approvals, assets, validation, quality, questionnaire, client status
│   ├── tools.ts               # tool logic, no MCP types (unit-testable)
│   ├── server.ts              # registers tools, resources, prompt
│   └── cli/approve.ts  export-schema.ts
├── schema/*.schema.json       # generated from Zod by `npm run schema`, never hand-edited
├── templates/corporate-v1/, templates/corporate-v2/
└── tests/
```

Paths in `factory.config.json` resolve against the factory folder. Env overrides: `SF_CLIENTS_ROOT`, `SF_INBOX_DIR`, `SF_TEMPLATES_DIR`.

Each client lives outside the factory in its own git repo:

```
sf-clients/<slug>/
├── site.config.json   content/<locale>.json   assets/   questionnaires/   dist/
├── quality-report.md  wrangler.jsonc (generated)  .gitignore
└── .factory/          approvals.json  last-build.json  last-deploy.json  audit.log
```

## 1. Schema (Zod is the single source of truth)

### site.config.json

| Field | Rule |
| --- | --- |
| `schemaVersion` | literal `1`; cannot be changed by tools |
| `slug`, `template` | `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`; slug cannot be changed |
| `i18n` | `defaultLocale` (default `en`), `locales` 1–3, must include default. Allowed: en tr de fr es it pl ar |
| `business` | `name` ≤80, `industry` (short English sector name), `country` "GB", `timezone` "Europe/London", `currency` "GBP" |
| `brief` | `audience` ≤400, `tone` formal/friendly/premium/energetic/calm, `references[]` ≤5, `avoid[]` ≤10 |
| `brand` | `logo`: `assets/<file>` or null; `colors`: {primary, secondary?, accent?} hex or null |
| `design` | `style`, `palette` {primary, secondary, accent, background, text} (#RRGGBB), `fonts` {heading, body}, `variants` {hero, services, testimonials, cta} each a/b/c |
| `pages` | subset of home, about, services, gallery, contact; must include home |
| `sections` | page → list of hero, intro, services, gallery, testimonials, faq, team, contact-cta, contact-form, map; only for listed pages |
| `contact` | `email` required; `formRecipient`, `phone` (`^\+[1-9]\d{7,14}$`), `address`, `hours`, `mapsUrl` (https) nullable; `showCallButton`, `showEmailButton` |
| `whatsapp` | `number` nullable, `floatingButton` (needs number) |
| `social` | optional https URLs: instagram, facebook, linkedin, x, tiktok, youtube |
| `integrations.bookingUrl`, `analytics.enabled`, `bots.aiCrawlers` (allow/block) | with defaults |
| `legal` | companyName, companyNumber, registeredAddress, vatNumber, all nullable |
| `hosting` | `model` managed/client, `workerName` nullable |
| `site` | `domain` (lowercase) nullable, `domainStatus` own/we-buy/client-buys/undecided (`own` needs domain) |
| `meta` | `unmapped[]` {question, answer, note?}, `laterInterests[]`; never rendered |

### content/<locale>.json

All visitor-facing client text. `tagline` ≤90; `hero` {title ≤80, subtitle ≤200, ctaLabel ≤30}; `about` {title, body ≤2000};
`services[]` 1–12 {title ≤60, description ≤300, price? ≤40}; `gallery[]` {src `assets/…`, alt ≤150};
`testimonials[]` {quote, author}; `faq[]`; `contact` {title, intro}; `whatsappMessage?`;
`seo.home` {title ≤60, description ≤160} required, other pages optional.

### Validation model

Validate drafts against the **full** schema and split issues into:
- **missing**: value is undefined → allowed while answers come in;
- **invalid**: value present but wrong → the whole write is rejected, nothing saved.

### questions.ts

Questions are data: `{ id, round: 1 | 2 | "later", audience: client | internal, required, why?, text, hint?, example?, choices?, targets[] }`.
Targets: `config:<path>`, `content:<path>`, `asset`, `record`. Round 1 = exactly the 10 essentials
(name, services, audience, logo, colours, tone, pages, contact details, WhatsApp, languages). Round 2 = the rest
(about, photos, reviews/FAQ, form recipient, maps/booking, social, domain, legal, style references, AI crawlers,
rights confirmation, approver). Internal: hosting model. "Later" checklist: multi-location, migration,
Search Console, special hours, team, video, payments, newsletter, branded email, QR code, maintenance.
Sector extras by industry substring (restaurant/cafe menu, salon/barber price list, solicitor SRA number, dental NHS, builder accreditations).

A test must prove every `config:` target exists in the schema.

## 2. MCP tools

Every tool: validates the slug, builds paths only through `safeJoin`, writes one audit line, and returns JSON text.
Known errors return `isError` with a message and a hint; unexpected errors return a generic message (details to stderr).

| Tool | Does |
| --- | --- |
| `list_clients` | Client folders and their stage |
| `create_client` | {slug, businessName, industry, hostingModel, extraLocale?, template?} → folder, draft config (English always included), `.gitignore`, `git init` (not fatal if git missing). Fails if folder exists |
| `get_client_status` | Stage, `nextStep`, missing/invalid fields per config and per locale, open questions, valid approvals, last build/deploy, content hash |
| `generate_questionnaire` | {slug, round 1/2, replyBy?} → writes `questionnaires/round-N.md` + `.txt`, returns plain text for Eren. Round 2 contains only open questions + sector extras + "later" checklist. Never includes internal questions |
| `update_client_config` | {slug, patch, unmapped?, laterInterests?} → JSON-merge-patch (objects merge, arrays replace, null kept, `__proto__`/`constructor`/`prototype` rejected), validate, reject all if any invalid or if the patch has a key the schema does not define. `slug`, `schemaVersion`, `meta` are locked (meta only via `unmapped`/`laterInterests`). Returns stillMissing |
| `save_content` | {slug, locale, content, replace?} → same rules (unknown keys rejected); locale must be in `i18n.locales` |
| `save_asset` | {slug, inboxFile, kind logo/gallery/hero/team/og, name?} → source confined to inbox; regular file only (no symlink); size limit; type from magic bytes (PNG, JPG, WebP, AVIF, SVG); unsafe SVG rejected; saved as `assets/<kind>-<sanitised-name>.<real-ext>` |
| `generate_design_system` | Runs UI UX Pro Max (`python3 -I <script> "<industry> <tone>" --design-system -p <name> -f markdown`) if installed; otherwise returns instructions to choose by `design-rules.md` |
| `build_site` | Full validation → input checks → `npm run build` in `templates/<template>` with env `SF_CLIENT_DIR`, `SF_OUT_DIR` (+ `SF_FORM_ACTION` if set) → output checks → optional Impeccable → writes `quality-report.md` and `last-build.json` {hash, at, passed, failures, distHash}. The content hash is taken before the build; if inputs change during the build, it fails. Build log returned only on failure |
| `deploy` | {slug, target preview/production, dryRun?} → requires passing build for current hash + content and visual approvals (+ production approval for production). Generates `wrangler.jsonc` (name `workerName ?? sf-<slug>`, assets `./dist`, `not_found_handling: 404-page`, custom domain route only for production with a domain). Runs local wrangler through `node` (`deploy`; preview goes to its own Worker `<name>-preview` on workers.dev, production to `<name>` with the custom domain). Records `last-deploy.json` |

Also register: resources `factory://rules/agents` and `factory://rules/design-rules`; prompt `new-site` {businessName, industry}.

### Stages (from `get_client_status`)

collecting-answers → design → content → awaiting-content-approval → build → awaiting-visual-approval
→ awaiting-production-approval → ready-to-deploy → live. Each comes with a one-line `nextStep`.

### Quality checks

Before template build: contrast text/background ≥ 4.5, best of white/text on primary ≥ 4.5, accent/background ≥ 3 (warn),
referenced images exist, locales have matching item counts, warn if no company number.
After build: `dist/index.html` exists; every HTML page has `<html lang>`, `<title>`, no `<img>` without alt,
no lorem ipsum / undefined / [object Object] / NaN / TODO / localhost URLs; warn on missing meta description.
Impeccable (`detect --json`, telemetry off) only if installed: exit 0 pass, 2 fail, 1 warn.
Lighthouse is manual for now.

### Cloudflare credentials

Only from the server's environment, never files: managed → `SF_CF_MANAGED_API_TOKEN`, `SF_CF_MANAGED_ACCOUNT_ID`;
client → `SF_CF_CLIENT_<SLUG_UPPER_UNDERSCORE>_API_TOKEN` / `_ACCOUNT_ID`. Passed to wrangler as
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, masked as `***` in all output. `dryRun` works without them.

## 3. Approvals

- `npm run approve -- <slug> <content|visual|production> [note]`.
- Refuses unless stdin and stdout are a TTY; shows stage and last build; asks the user to type the slug back.
- Appends `{kind, by, at, hash, distHash?, note?}` to `.factory/approvals.json`.
- `visual` and `production` need a passing build of the current content whose `dist/` is unchanged, and pin its `distHash`. They count only while it equals the last build's `distHash`, so a template change that alters output, or an edited `dist/`, invalidates them. `deploy` also refuses a `dist/` whose hash differs from the last build.
- The hash shown is re-checked after the slug is typed; if anything changed meanwhile, nothing is approved.
- **Content hash** = SHA-256 over `site.config.json`, `content/**`, `assets/**` (path + bytes). An approval or build counts only if its hash equals the current one, so any edit invalidates them.
- The MCP server never writes approvals.

## Security (enforced in code, proven by tests)

- Slug regex everywhere; `safeJoin(base, …parts)` rejects absolute paths, NUL, `..` escapes and symlinks that resolve outside.
- Processes via `execFile` with an argument list, no shell. On Windows only npm/npx/pnpm/yarn shims may use a shell, and only if every argument matches `^[\w@./:\\=-]+$`.
- Child env whitelist: PATH, HOME, USERPROFILE, SystemRoot, TEMP, TMP, APPDATA, LOCALAPPDATA, LANG, NODE_OPTIONS, proxy vars, NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, plus explicit extras. Output capped and secrets masked.
- SVG rejected if it contains: `<script`, `on*=` attributes, `javascript:`, `<foreignObject`, `<!ENTITY`, `<!DOCTYPE`, href to anything but `#id` or inline png/jpeg/webp data, CSS `@import` or external `url(…)`, iframes/embeds with external sources.
- Atomic JSON writes (temp file + rename).
- Audit line per call: ts, runId, tool, ok, ms, summarised args (strings ≤60 chars, objects as key lists, keys like token/secret/password/key masked), error.
- `.claude/settings.json` deny rules (approve CLI spellings, pty tools `script`/`expect`/`unbuffer`, `wrangler`, `Edit`/`Write` on client folders and `.factory/`, `Read` of `.env*`) guide the agent but are **not** a boundary: Bash patterns can be bypassed and the TTY check can be faked with a pseudo-terminal.
- **The boundary is the Claude Code sandbox** (OS-enforced on macOS/Linux/WSL2): Bash writes only to the factory folder, temp and `~/.npm`, so it cannot touch `sf-clients/` (approvals, dist, client files); network only to the allowed domains; `SF_CF_*` variables removed from Bash; `allowUnsandboxedCommands: false`, `failIfUnavailable: true`. The MCP server runs outside the sandbox. The agent's Edit/Write tools are outside it too, so `.claude/settings.local.json` adds absolute (`//`) deny rules for the real `sf-clients` path, plus per-client token variables.
- Client `.gitignore`: dist/, node_modules/, .wrangler/, .env*, .factory/audit.log, *.tmp.

## Limits

maxLogoBytes 1 MB, maxImageBytes 5 MB, buildTimeoutMs 300000, deployTimeoutMs 300000.

## 4. Template contract (`templates/corporate-v1`, `templates/corporate-v2`)

- `npm run build` reads `SF_CLIENT_DIR` and writes a static site to `SF_OUT_DIR`. Needs `npm install` once.
- Reads only `site.config.json`, `content/<locale>.json`, `assets/`; validates them against `schema/*.schema.json`.
- Default locale at `/`, others at `/<locale>/`, with `hreflang`.
- Per page: `<html lang>`, `<title>`, meta description, OG tags, alt on every image.
- Site-wide: `sitemap.xml`, `robots.txt` (blocks AI crawlers when `bots.aiCrawlers` = block), `LocalBusiness` JSON-LD, `404.html`, favicon from logo or a wordmark when there is no logo.
- Contact form posts to env `SF_FORM_ACTION` with a honeypot; without it, show email/phone/WhatsApp buttons.
- No cookies by default, so no banner.
- Code rules from `AGENTS.md` → "Working on templates": typed loader → props → registry of sections → variants a/b/c; colours and fonts only as CSS variables from `design`; interface strings from the template's own locale files; no client data hard-coded.

## Tests (minimum)

- Slug and path traversal, symlink escape, locale path.
- Image sniffing, every SVG rejection case, a safe SVG accepted, fake/oversized/symlinked files rejected, safe file names.
- Exec: arguments stay literal, parent env does not leak, secrets masked.
- Merge: arrays replace, null kept, prototype pollution blocked.
- Every question target exists in the schema; round 1 ≤ 10 and has no internal questions; round 2 has sector extras.
- Generated JSON Schema equals the committed file.
- WCAG contrast known values.
- End to end with a stub template: create → invalid patch rejected → complete config → content → asset (inbox escape rejected) → deploy blocked without approvals → approval → build passes → content change resets approvals and stage.
- Low contrast fails the build with a clear report.
- Unknown config/content keys rejected; `meta` locked; `SF_FORM_ACTION` reaches the template; inputs changed during build → build fails.
- Visual approval pinned to `dist/`: template output change or edited `dist/` invalidates it; output approvals refused without a passing, untouched build; approvals without `distHash` do not count.
- The compiled server over stdio with the SDK client: lists the 10 tools, resources and prompt; audit log has one line per call; bad slug is an error.

## 5. Operator panel (`npm run panel`)

Local web UI so Eren works without the terminal, except approvals.

- `src/panel/`: `server.ts` (node:http, no framework), `api.ts` (routes call `tools.ts`, never files directly), `jobs.ts`, `prompts.ts`, `preview.ts`, `static.ts`; UI in `panel/` (plain HTML/CSS/JS, all server text inserted with `textContent`).
- Access: listens on 127.0.0.1 only; random session key printed once (`/login?key=`) → HttpOnly, SameSite=Strict cookie; Host must be the panel's own address; non-GET requests must carry the panel's Origin.
- Agent jobs: `claude -p --output-format stream-json --strict-mcp-config --mcp-config .mcp.json`, prompt on stdin, `--allowedTools` = site-factory tools except `deploy`/`create_client` (+ Read/Grep/Glob), `--disallowedTools` Bash, Edit, Write, Web*, Task, deploy, create_client. `SF_CF_*` removed from its environment. Client answers fenced in `<client_data>` as data. Kinds: answers, design-content, fix-build, revise (Eren's own instruction).
- Tasks (no LLM): build, deploy (preview/production, dry run). One job at a time (409 otherwise); log polled by the UI.
- Uploads go to `<inbox>/<slug>/` (sanitised name, 15 MB); `save_asset` still does the real checks.
- Preview: second port (`PANEL_PORT + 1`) serving the chosen client's `dist/` at `/`, path-confined.
- Approvals are not in the panel; it shows the command to copy.

## Out of scope for now

Lighthouse automation, visual regression, rollback/domain tools, config migrator, monitoring scripts, domain purchase.
