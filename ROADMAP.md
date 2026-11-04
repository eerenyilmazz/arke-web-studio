# Roadmap

Arke Web Studio's plan, open questions and decisions taken. What has been done is listed release by release in
[`CHANGELOG.md`](CHANGELOG.md). When a task is finished it is ticked off here; when a plan is finished it moves to
"Completed".

The work is split into **five work plans** under this project in ArkeLab. The code stays in a single repository: all
plans use the same core (clients, design agent, approvals, releases, publishing, backup), and each plan works mostly in
its own folders (see [Folder layout](#folder-layout)).

## Now

| Plan | Goal | Status |
| --- | --- | --- |
| 1 · Showcase and foundation | Showcase sites and the shared core; usable in a real environment | ✅ 2.4.2, small items remaining |
| 2 · E-commerce | Products, cart, orders, payment, legal pages | **next** |
| 3 · Booking | Services, staff, calendar, reminders | planned |
| 4 · Restaurant and café | Menu, QR at the table, table orders, reservations | planned (3 decisions pending) |
| 5 · ArkeLab integration | Running the MCP in ArkeLab terminals, shared account store | planned |

Plans run in sequence: the next one is not started before the current one is finished (parallel plans with one person
mean two half-finished jobs). The first task of Plan 5 (settling the rules) can be done without waiting; it determines
how the other work is delivered.

Each task states what it touches: **core** (affects every kind of site and gets a more careful review) or **kind**
(only that kind's folders).

### Plan 1 · Showcase and foundation

Showcase sites were tried end to end with a real client (Thrace IT): plan, design, preview, client feedback, publishing,
rollback, removal, backup and restore. The bugs found were fixed in 2.4.2.

| # | Task | Area | Status |
| --- | --- | --- | --- |
| 1.1 | Verify 2.4.2 with a real job: Custom Request, preview, `/brand/` files not being published, fonts served from the site itself, honesty of the agent summary | — | open |
| 1.2 | Move the showcase-specific design rules out of the shared files into `rules/products/showcase.md` (content unchanged, only its location) | kind | ✅ 2.4.3 |
| 1.3 | Triage the `npm audit` warnings (5 of them); update the safe ones, do not use `--force` | core | open |
| 1.4 | Lawyer review of the privacy text templates (`rules/privacy.md`) and of cross-border transfer | — | before sale |
| 1.5 | Decision on remote access to the panel (suggestion: Tailscale with password sign-in) | core | decision pending |
| 1.6 | Per-client selection in team sync | core | open |
| 1.7 | Sitemap for a site without a domain: generate it once the publishing address is known, or skip it deliberately | core | open |
| 1.8 | Separate the panel in use from the development copy (see "Development layout" below) | — | open |
| 1.9 | Code layout: `src/lib/` into four areas (`core`, `client`, `site`, `checks`), large panel screens and panel tests split by topic | core | ✅ 2.4.4 |
| 1.10 | Split the remaining large panel files per screen: `info.js` (Client Details), `edit.js` (Edit cards); while working on that screen | core | open |
| 1.11 | Split `src/panel/jobs.ts`: running the job, agent permissions and progress events into separate files | core | open |
| 1.12 | Move the remaining rule text in `src/panel/prompts.ts` into md files; the prompts should only say which file to read | core | open |

### Plan 2 · E-commerce

Online selling with products, a cart and the client's own payment account. The agent does not write payment code; it
places and styles the factory's tested ready-made parts. The kind stays closed in the panel ("coming soon") until the
plan is finished.

| # | Task | Area |
| --- | --- | --- |
| 2.1 | Payment provider decision and order: iyzico, PayTR, Stripe (by market: Türkiye, United Kingdom) | — |
| 2.0 | Split the `parts/` folder: shared parts in `parts/shared/`, e-commerce-specific ones in `parts/ecommerce/`; file paths on published sites unchanged (covered by a test) | core |
| 2.2 | E-commerce design rules: product list, product page, cart, checkout screen, order result (`rules/products/ecommerce.md`) | kind |
| 2.3 | Catalogue extension: variants (size, colour), stock, product images; D1 migration | kind (catalogue is shared: core) |
| 2.4 | Cart part: kept in the browser; price and stock are recalculated on the server | kind |
| 2.5 | Order model and statuses (received, paid, shipped, delivered, refunded); orders in the admin screen | kind |
| 2.6 | Payment package: payment session, webhook signature verification, never processing the same notification twice, refunds | kind |
| 2.7 | Order notifications: email to the buyer, notification to the business | kind |
| 2.8 | Legal pages: distance sales contract, pre-information form, withdrawal and returns in TR; Consumer Contracts in the UK; KVKK and GDPR texts according to order data | kind + `rules/privacy.md` |
| 2.9 | Payment test approval: before going live, a test-mode payment is made and a human approves | core (approvals) |
| 2.10 | The client's payment keys in the panel: stored encrypted, invisible to the agent, sent to the Worker as a secret on publishing | core |
| 2.11 | Open the kind; end-to-end tests (cart → payment → order → admin screen), CHANGELOG and README | kind |

### Plan 3 · Booking

Online booking with services, staff and a calendar, for hairdressers, clinics, salons and similar businesses.

| # | Task | Area |
| --- | --- | --- |
| 3.1 | Booking design rules: service selection, staff, available times, confirmation screen (`rules/products/booking.md`) | kind |
| 3.2 | Services and their durations (using the catalogue part) | kind |
| 3.3 | Staff and working hours, days off | kind |
| 3.4 | Availability calculation; never giving two appointments for the same time | kind |
| 3.5 | Booking form, confirmation email, cancel and change link | kind |
| 3.6 | Reminders; channel decision (email or SMS) | kind |
| 3.7 | Calendar view in the admin screen | kind |
| 3.8 | Personal data: retention period and automatic deletion (according to the market profile from 2.3.0) | core |
| 3.9 | Open the kind; tests, CHANGELOG and README | kind |

### Plan 4 · Restaurant and café

Menu, plus a menu and ordering by QR code at the table; payment is taken at the venue, not online.

Decisions needed before starting:
- Will there be delivery or collection?
- Should an order from a table reach the kitchen only after a waiter approves it?
- How should a new order notification arrive: a sound on the screen, or on the phone?

| # | Task | Area |
| --- | --- | --- |
| 4.1 | Restaurant design rules: menu page, QR page, table order (`rules/products/restaurant.md`) | kind |
| 4.2 | Menu part: categories, price, allergens (14-allergen information in the UK), sold-out marker | kind |
| 4.3 | Per-table QR codes; printable table cards | kind |
| 4.4 | Ordering from the table (no online payment) | kind |
| 4.5 | Waiter approval flow (depending on the decision) | kind |
| 4.6 | New order notification (depending on the decision) | kind |
| 4.7 | Reservations (with Plan 3's calendar part) | kind |
| 4.8 | Optional takeaway orders (depending on the decision) | kind |
| 4.9 | Open the kind; tests, CHANGELOG and README | kind |

### Plan 5 · ArkeLab integration

| # | Task | Area |
| --- | --- | --- |
| 5.1 | Settle the ArkeLab rules for this repository: who merges into main, which branch ArkeLab publishes to, the task source (Jira project and key prefix) | — |
| 5.2 | Files ArkeLab adds to the project (`.mcp.json`, `AGENTS.md`/`CLAUDE.md` additions, `.codex/`, `.gemini/`): committed to the repository or kept local (`.gitignore`) | — |
| 5.3 | Make sure the panel updater (`git pull --ff-only`) does not trip over these files | core |
| 5.4 | Run the Arke Web Studio MCP in ArkeLab project terminals; an example `.mcp.json` with no secrets | core |
| 5.5 | Read the Cloudflare account from ArkeLab's encrypted store (the panel's own encrypted account remains as a fallback) | core |
| 5.6 | Web Studio package and agent guide | — |

## Folder layout

Shared things live in one place; each kind's own files live in its own folder. On every job the agent reads the shared
rules and only the rule file of that client's kind (`rules` in `src/products/registry.ts`).

```
src/, panel/                 shared core: clients, approvals, releases, publishing, backup, agent jobs
src/products/registry.ts     which kind uses which parts and rules
src/products/<kind>/         kind-specific panel jobs and checks
rules/                       shared rules: brand, design plan, market, privacy, SEO
rules/products/<kind>.md     kind-specific page layout and business rules
parts/app/, parts/site/      today's shared ready-made parts (catalogue, inbox, admin screen)
parts/<kind>/                kind-specific ready-made parts and their migrations
tests/products/<kind>/       kind-specific tests
```

- Existing files stay where they are for now; moving them could break paths on published sites. If needed, they are
  moved one at a time, with a test.
- Files for new kinds are written in their own folders from the start.
- The shared design system (brand, colour, font, signature animation, design plan and its approval) is the same for every
  kind; kinds define only the page layout in their own rules. The design of existing sites is not affected by this layout.

## Working rules

**Branches:** there are no long-lived plan branches. Each task is done on a short-lived branch and merged into `main`
through a PR: `feat/<task-key>-<short-name>`, `fix/…`, `docs/…` (e.g. `feat/WEB-12-cart`). An unfinished kind is merged
into main but stays closed in the panel. If ArkeLab publishes to a personal branch, that branch is merged into main
through a PR and synced with main after every merge. `main` must always be releasable: the panel update comes from it.

**Commits and versions:** commit messages are in English (`feat(WEB-12): cart totals`, `fix: …`, `docs: …`); a release
commit looks like `2.5.0: short summary`. The version tag is `vX.Y.Z`, created after the merge into main. A big step of a
plan is a minor version (2.5.0, 2.6.0…); fixes are patch versions. Code, comments, `AGENTS.md`, `rules/`, the README,
CHANGELOG, ROADMAP and `docs/` are in English; UI strings are Turkish with English translations.

**Recommended protection for main (GitHub setting):** PR required, the `test` job in CI must pass, the branch must be up
to date, linear history, force push and deletion disabled, `v*` tags protected.

**Development layout:** the panel in use (`~/projects/arke-web-studio`, `main` only) and the development copy connected
to ArkeLab (e.g. `~/projects/arke-web-studio-dev`) live in separate folders. That way switching branches during
development does not affect the running panel or client jobs.

## Open questions

- **Payment provider order:** iyzico, PayTR or Stripe; not chosen (Plan 2.1).
- **Restaurant decisions:** delivery, waiter approval, notification channel (Plan 4).
- **ArkeLab rules:** authority to merge into main, publishing branch, task source (Plan 5.1).
- **Remote access to the panel:** the suggested route is Tailscale with password sign-in; not decided (Plan 1.5).
- **Client selection in team sync:** currently all local clients are sent (Plan 1.6).
- **Legal review of the rule texts:** the KVKK and GDPR templates (`rules/privacy.md`) and cross-border transfer should
  be checked by a lawyer before sale (`docs/privacy.md`).

## Decisions

| Decision | Why |
| --- | --- |
| One product, one repository; the work is split into five work plans in ArkeLab | The shared core is in one place; a fix is made once |
| Shared core + kind-specific folders (`rules/products/`, `parts/<kind>/`, `src/products/<kind>/`) | Plans proceed without touching each other; the agent reads only the relevant rules |
| No plan branches; short-lived task branches and PRs into main | main is always releasable; no large merge conflicts |
| An unfinished kind stays closed in the panel | Half-done work is invisible to clients |
| The agent does not write the code of working parts; it places the factory's tested ready-made parts (payment included) | Short and cheap jobs, reliable parts, payment security |
| Approvals belong to humans only; in the panel, with a single-use terminal code | An agent or a web page cannot approve |
| Everyone uses their own panel and their own Cloudflare account | Individual responsibility, no shared secrets |
| Team sync through Git, one branch per client; it stops on a conflict | No guessed merges; fits ArkeLab's Git model |
| Personal-data rules follow the client's market, not the page language | KVKK and GDPR depend on the market |
| The panel look follows the ArkeLab design system | One-product feel; colours in a single file |
| Rules are single-sourced in md files; agent prompts only say which file to read | No contradictions, saves tokens |
| Changes are small, reversible and tested; existing APIs and data are preserved | Live-system safety |
| The name is Arke Web Studio everywhere; no compatibility with old names | No live clients yet; clean start |

## Completed

| Step | Version |
| --- | --- |
| Core and individual accounts (Cloudflare from the panel, encrypted) | 1.25.0 |
| Publishing module for app sites (Worker, D1, R2, migrations, secrets) | 1.26.0 |
| Shared ready-made parts: catalogue, inbox, the client's admin screen | 1.27.0 |
| Going global: profile, removal of personal traces, easy setup, update from the panel, team sync, ArkeLab look | 1.27.1–1.29.0 |
| New name: Arke Web Studio, including technical names (clean start) | 2.0.0 |
| New panel screens: Quick Edit, New Client, Settings | 2.2.0–2.2.2 |
| Market-based personal-data profile (KVKK, GDPR): retention period, automatic deletion, finding, exporting and deleting a person's data, EU data region, notice texts | 2.3.0 |
| The client's admin screen in Turkish and English | 2.4.0 |
| Real-environment test (real agent, real Cloudflare) and fixing the findings | 2.4.1–2.4.2 |

See [`CHANGELOG.md`](CHANGELOG.md) for details.
