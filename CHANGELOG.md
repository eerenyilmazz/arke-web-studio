# Release notes

Newest release first. For installation and usage, see `README.md`.

## 2.4.4: Code layout (behaviour unchanged)

Files were reorganised to make the code easier to manage; what the panel and the agent do is unchanged.

- **`src/lib/` split into four areas:** `core/` (paths, files, commands, errors, calculations), `client/` (client status,
  approvals, releases, design plan, privacy profile), `site/` (site files, texts, images, fonts, form),
  `checks/` (SEO, contrast, languages, currency, signature, screenshot). Files were moved with `git mv`, so their history is preserved.
- **Panel screens in separate files:** `proposal.js` → quote, `reports.js` (job and monthly report), `concepts.js`
  (design proposals); `settings.js` → page layout, `settings-usage.js` (plan, agent, profit, research),
  `settings-general.js` (quote details, language, backup); `client.js` → client page, `client-work.js`
  (Edit tab), `approval.js` (approval window).
- **Panel tests by topic:** instead of the 1,437-line `tests/panel.test.ts`, there are five files under `tests/panel/`
  plus a shared `harness.ts`; all 40 tests are unchanged.
- The architecture diagram in the README was updated for the new layout.

## 2.4.3: Showcase site rules in their own file

Rules were reorganised to make them easier to manage; what the agent does is the same.

- **`rules/products/showcase.md`:** the showcase site's pages and what each page contains (home, about,
  services, gallery, contact, privacy, 404) in one file. Previously these were spread across `build.md` and `local-seo.md`.
  E-commerce, booking and restaurant will get their own files later (`rules/products/<kind>.md`).
- For free-design sites, the agent is told which kind's rule file to read.
- **Single source:** the design plan steps (`Plan states`) and the rule for saving the client's logo were moved from the
  agent prompts into the rule files; prompts now only say which file to read.
- A `tests/products/` folder for kind-specific tests.

## 2.4.2: Findings from the real-environment test

Problems found in the real-environment test with Thrace IT (real Cloudflare, real agent).

**Release history (the most important part)**
- **Records are no longer lost silently:** if saving a release fails with a git error, it is retried once; if it still fails, the reason is written to the terminal. Two jobs finishing at the same time are saved one after the other.
- **Interrupted jobs:** when the panel shuts down (Ctrl+C, WSL restart), the changes of a running job are saved as an "Unsaved changes" release when the panel starts again.
- **Edit cards:** a "Before: …" release is taken before the form writes anything (including edits made without the agent).

**Published site**
- **Previews are closed to search engines:** `X-Robots-Tag: noindex` and a robots.txt that blocks everything.
- **Internal files are not published:** `brand/brand.json`, `brand/signature.html` and the design proposals are not uploaded to Cloudflare; the logo is still uploaded. `dist/` stays as it was approved; the filtering is done on a copy at publish time.
- **Security headers:** HSTS, nosniff and Referrer-Policy on the live site; on showcase sites, a Content-Security-Policy that matches the site's checks.
- **Fonts from the site itself:** Google Fonts files are downloaded at build time and placed in the site, so the visitor's browser does not connect to Google (UK GDPR, GDPR, KVKK). If the download fails, the link is left as it is and the check raises a warning. To turn this off, set `ARKE_SELF_HOST_FONTS=off`.
- **Publishing is retried once:** if the upload to Cloudflare is interrupted by a network or server error, it is retried once after 5 seconds. Permanent errors such as a bad token are not retried.
- The SEO check no longer counts the demo page under `brand/` as a page of the site.

**Documents sent to the client**
- **In the client's language:** the quote, job report and monthly report open in Turkish for Turkish clients and in English for others; the button at the top switches between them. Dates follow the same language.
- **Clean summary:** the report shows only the first paragraph of the agent's summary, without markers such as `**`.
- **Leaving out lines:** in the job report, each line has an "In report" checkbox; an unticked line is left out of the printed copy (e.g. internal tests).
- Colour names written in English now get the correct capitalisation in the Turkish panel too (DRAWING instead of DRAWİNG).

**Client portal** (installed via Settings → Publishing → "Update portal")
- **Consecutive comments:** after a comment is sent, the page reopens with "Your comment was sent" at the top, and the form and the selected page are ready.
- **Shortcut to approval:** an "If everything is fine, go to approval" link at the top of the page.
- The message for an expired or unknown link is shown in English and Turkish together.
- In the panel, a comment's page shows "General" instead of "other".

**Agent**
- Change requests the operator wrote in earlier jobs are no longer given as "information from the client"; they go in a separate section with the note "already done, do not repeat".
- The agent is asked to state in its summary everything it did not do (such as the form or privacy page in the plan) and its reason, and not to say "done" about a page that does not exist.
- On a blocked job it does not suggest loosening permissions or the sandbox; it does not read the factory's code.
- The field lengths of the design plan are written in the rules; plan descriptions are in the panel's language (names are in the site's language).
- The map / "Get directions" link is added only if a map address was given; it is not made up from the address.

**Panel**
- If internet research is turned off in Settings, the "Build the site" card says so.
- Status labels: "Information missing", "Waiting for content approval", "Waiting for visual approval", "Waiting for publish approval" (previously all of them said "Waiting for approval", or wrongly "Waiting for client approval").
- The "Add permission to the token" step is not shown once the portal is set up.
- If no exchange rate is entered in the profit calculation, there is a link to Settings.
- The backup file's name uses the computer's time (not UTC).
- In the English panel, the "Paid · Delivered …" line on the client card is translated.

## 2.4.1: Admin screen on the phone and currency; README images

- **Admin screen on the phone:** on a narrow screen the top bar drops to two lines; the language button and Sign out no longer run off the screen.
- **Currency:** a new catalogue entry starts with the client's currency (GBP in the UK, TRY in Türkiye); previously it was always TRY.
- **README:** a theme-aware (light / dark) hero image, drawings of the client journey and the architecture, new screenshots with an imaginary bakery, a table of quality checks, and what the agent can and cannot do.

## 2.4.0: The client's admin screen in Turkish and English

- **Two languages:** on app sites the client's admin screen (`/admin`) opens in Turkish for clients in Türkiye and in English elsewhere. The button at the top right switches to the other language; the choice is remembered in that browser. The sign-in screen has the button too.
- **Server messages are translated too:** messages such as "Wrong password" and "Session expired" arrive in the screen's language.
- **Date and money format by the client's country:** 24/10/2026 and £1,249.90 in the UK; 24.10.2026 and ₺1.249,90 in Türkiye. The price box accepts both notations.
- In the panel, the Admin Screen card shows which language the screen will open in.
- Browser test for the admin screen: both languages, switching, remembering, server messages, date format.

## 2.3.1: Click test and the bugs it found

**Bugs fixed**
- **The profile was not saved (including changing the language):** when the "Studio name" field was removed from the form in 2.0.1, the server rejected a profile that arrived with only a name. The welcome card and Settings → My Account → Profile gave an error, and the language could not be changed from these cards either. The name is now saved on its own.
- **Settings are saved partially:** a form that sends a single field of a group (e.g. the profile name) no longer deletes the group's other fields.
- **Language in one place:** the panel language is in Settings → General and is applied immediately. My Account → Profile now has only the name (the welcome card on first launch still asks for the language).
- **The short-name and model field checks did not work:** two patterns that the browser's new rules treat as invalid were fixed.
- **Team repository:** "Connect" with an empty address no longer goes to the server; the address format is checked in the field.
- **Backup:** "Back up now" is disabled until a folder is saved, and says why.

**Test**
- A new click test (`npm run test:click`): it clicks every button, tab, option and dropdown on every screen one by one, and reports script errors, console errors, failed requests, error notifications and buttons that do nothing. It tries the approval windows both ways.
- A browser test for first launch, changing the language and saving the profile.

## 2.3.0: Personal-data profile (KVKK / UK GDPR / GDPR)

**App sites**
- **Automatic deletion:** form messages are deleted every night after 12 months (periods for order and booking records are ready). The periods are sent to the Worker as settings according to the market; the daily trigger is set up automatically on publishing.
- **Personal data section (admin screen):** find a person by email, phone (regardless of spaces and punctuation) or name, download their records as JSON, and delete the selected ones. The response deadline is shown on the screen.
- **Processing log:** automatic deletion, export and deletion are logged without the person's identity (operation, date, count). New table `0004_privacy.sql`.
- **IP addresses are not kept:** rate limits keep a site-specific keyed digest of the IP and delete it within a day.
- **EU region:** for UK and EU clients, the database and image store are created in the EU region. If an existing database is not in the EU, publishing prints a warning (the region cannot be changed afterwards).
- Deleting a single message in the inbox.

**Panel and agent**
- The personal-data profile in Client Details → Admin Screen card: rule, retention period, response deadline, data region.
- `get_client_status` now returns `privacy` information; the agent writes the privacy text with this information and the `rules/privacy.md` templates (KVKK Disclosure Text, UK/EU and US privacy notice).
- Sources and decisions: `docs/privacy.md`. The templates should be reviewed by a lawyer before sale.

## 2.2.2: "!doctype html>" line in the text list

- In Quick Edit → Text list, the page's `<!doctype html>` line appeared as if it were text. Doctype, XML declaration and similar lines are now skipped. The IDs of the other texts did not change.

## 2.2.1: One menu in Settings

- On wide screens, the Settings sections (My Account, General, Team…) now open under "Settings" in the main left menu. There are no longer two menus side by side. On the phone, the sections stay at the top of the page.
- The page no longer shifts right and gets cut off; the content is a single, centred column.
- A card with the same name as its section (e.g. "Backup" under Backup) no longer repeats its title.
- A 1024-pixel width was added to the screen audit.

## 2.2.0: Quick Edit, New Client and Settings redesigned

**Quick Edit**
- Instead of a pile of buttons, a list showing the site's current state: colour swatches, open pages, number of services, phone and email, form status, logo.
- Clicking a row opens the editor in the same card (return with "← Quick Edit"). The same bar sits under every editor: how many changes there are, "Cancel", apply. Apply is disabled when there are no changes or there is an error.
- **Colour Palette:** colour cards, typing the code by hand, reverting each colour, a live preview (heading, paragraph, button) and a legibility measurement (contrast ratio).
- **Pages:** an on/off switch and a short description for each page; "to be added" / "to be removed" labels. Extra site-specific pages are now in the list and no longer disappear when applied. Extra pages and blog posts are in collapsible sections.
- **Services and Prices:** reordering by dragging or with arrows, order numbers, a warning for rows with an empty name and for the limit of 12.
- **Text:** page selection, search, a "changed only" filter, length counters for the tab title (60) and search description (160), undo per text.
- **Contact Details:** grouped fields, email and phone checks, a marker on changed fields.
- **Contact Form:** a three-step status (turn on the service, save the address, add to the site); the service is recognised as the address is typed (Formspree, Getform, FormSubmit, Web3Forms); the access key is requested only for Web3Forms; the address can be removed.
- **Logo and Images:** a logo field, a grid showing each image's status (On site / Pending), drag-and-drop upload. The images in Client Details look the same.

**New Client**
- Steps on the left with a summary of what was entered in each (name and sector, plan and total, number of logos and photos, text length); below it, what is missing to start the site.
- Steps were divided into titled sections. Example buttons for the sector; hosting and plan are chosen with described cards; currency in the price box; a live quote total under the extra options.
- Logo and photos by drag and drop; photos appear as thumbnails and can be added later.
- The Information step shows whether the text contains a phone, email, address, hours, prices and services.
- The Summary step is grouped; each group's "Edit" button goes back to the relevant step. The "Next" button names the next step.

**Settings**
- A grouped menu on the left (Personal, Work, System) with icons; the section title and description on the right.
- Each card is organised as a title, content and button bar; fields have a readable width.

**Technical**
- The new look is in a separate stylesheet (`panel/studio.css`); if it is removed, the old look returns. The server side and the API did not change.
- The English panel test now also checks every editor, every settings section and every step of the wizard; the screen audit also takes screenshots of these screens.

## 2.1.0: Fixes from the first real trial

**Panel**
- **Site kind:** a one-line selector instead of four large cards; the description of the selected kind appears below it, and kinds that are not ready say "coming soon".
- **New client form:** descriptions moved under the boxes; the Business name and Short name boxes are now aligned.
- **Settings with tabs:** one section is visible at a time (My Account, General, Team…), and the last opened section is remembered. Section links inside the page open the relevant tab.
- **Client Details with tabs:** Job Tracking, Client Links, Texts, Logo and Images, Approval and Publishing, and Question Form are separate tabs. If the site is waiting for approval or is live, the Approval and Publishing tab opens first.
- **Simpler Analysis filters:** search, All / Overdue / Check failed views, and an "Add filter" button. Selected filters appear as small tags that can be removed with one click.
- **Correct step bar:** while the site is not yet built, it shows "Building the site" instead of "Waiting for approval".
- **Menu and top bar:** an open menu no longer overlaps the top bar.
- **While a job runs:** the text box and buttons are hidden on the "Building the site" card.
- **3 design proposals:** it now asks for approval first; if there is an approved plan, it also states this.
- **Profile:** the "Studio name" field was removed (2.0.1).

**Agent**
- **Requests go to the right job:** while the site is not yet built, what is written in Custom Request goes as a continuation of "Prepare the site", not as a change job. This way all the earlier information is included in the job.
- **Information is saved to its own fields:** contact, working hours, social media, WhatsApp and company name are saved immediately. Services, prices, FAQ and reviews are moved to their own fields while the texts are written; information that has a field does not stay in "unmapped notes".
- **At most 5 questions:** only information that is really needed for the site is asked. Topics you set in the panel (form service, hosting, languages, extras) and optional things (map link, sites you like) are not asked.
- **Business name is preserved:** the agent cannot change the business name. It writes the company name to a separate field; if it sees a different name, it asks you.
- **The client's short name is given in every job;** tools are no longer called without a short name.
- **Plain language:** summaries do not mention file, field and tool names.
- **Design plan:**
  - The heading typeface cannot be a system font; a Google Font with character is required.
  - The plan is not saved until the signature motion's live preview has been written.
- **Single theme:** in the light theme the whole page is light, in the dark theme the whole page is dark. There are no more half-light, half-dark bands.

## 2.0.1: Wide-screen layout, simpler profile

- **Pages are centred on wide screens:** New Client, Archive and the empty home screen no longer hug the left edge.
- **Settings in two columns:** cards are arranged in two columns at 1200px and above; single-card sections, the agent table, Team and Update take the full width.
- **The "Studio name" field was removed from the profile:** only your name and panel language are asked. If the sender is empty on the quote, your name is written.

## 2.0.0: New name, Arke Web Studio (clean start)

Replaces the 1.30.0 zip; that version should not be used (it kept compatibility with the old names).

- **The product's name is Arke Web Studio everywhere:** panel, documents, agent rules and prompts.
- **Technical names changed completely too; no compatibility with old names was kept:**

  | What | New name |
  | --- | --- |
  | package, folder, zip | `arke-web-studio` |
  | MCP server | `arke-web` (`mcp__arke-web__*`) |
  | commands | `arke-panel`, `arke-update` |
  | folders | `../arke-clients`, `../arke-inbox` |
  | settings | `~/.config/arke-web-studio` |
  | environment variables | with the `ARKE_` prefix |
  | Workers | `arke-<short-name>`, `arke-portal` |
  | names inside the site | `data-arke-*`, `js/arke-parts.js`, `ArkeMotion`, admin screen cookie `__Host-arke_admin` |

- **Old installations break:**
  - Old client folders, accounts and environment variables are no longer read; you need to migrate them yourself (below).
  - `sf-…` Workers published earlier are not replaced by the new ones; they remain separately in Cloudflare.
  - The pages of old sites must be regenerated with the new motion and part names.
  - The panel cookie and browser preferences are reset.
- **Security:** the Cloudflare variables (`ARKE_CF_*`) and wrangler's own variables (`CLOUDFLARE_*`) are removed from the agent's environment.
- **To migrate the old data by hand** (with the panel closed):

  ```bash
  mv ~/projects/sf-clients ~/projects/arke-clients
  mv ~/projects/sf-inbox ~/projects/arke-inbox
  mv ~/.config/site-factory ~/.config/arke-web-studio
  ```

## 1.29.1: Documents and project layout

- **`AGENTS.md` rewritten:** today's flow comes first (free design, research, design plan, approval from the panel). A table showing which rule is in which file was added. The template flow moved to the "old clients" section.
- **Free-design rules split:** `rules/custom-site.md` is now the entry file; the details are under `rules/custom/` (`plan.md`, `brand.md`, `build.md`, `changes.md`). Each job reads only the file it needs; for example the plan stage does not read the writing rules, and the brand-card job does not read the page rules. This means fewer tokens.
- **Rules in a single source:** agent prompts do not repeat the rules, they only say which file to read. Checked: no sentence in the prompts is copied from the rules.
- **`ROADMAP.md` added:** steps, open questions and decisions taken.
- **CI:** lint, type checking, build and tests run with GitHub Actions on every push.
- **`SPEC.md` moved:** the original build plan is now in `docs/history/SPEC.md`.
- The application's behaviour did not change.

## 1.29.0: Easy setup, update from the panel, team sharing

- **One-command install** (`scripts/install.sh`): on Linux, WSL2 and macOS it checks git and Node, downloads the repository, runs the setup script and adds the `sf-panel` and `sf-update` commands to the shell. It installs no system packages and deletes nothing.
- **Update from the panel** (Settings → Update): if installed with git, it checks for a new version and installs it with one click (git pull, npm ci, build). It stops if there are uncommitted changes in the install folder. It does not update while an agent job is running. If installed from a zip, the `sf-update <zip>` command is shown.
- **`sf-update` works two ways:** run without arguments it updates from the repository; given a zip, it installs from the zip as before.
- **Team sharing** (Settings → Team): the same clients are shared through a single private Git repository (it can also be the ArkeLab team's repository).
  - Each client sits on a `clients/<short-name>` branch in the repository.
  - Changes are saved under the name in the profile.
  - Approvals, publishing records, Cloudflare resources and secret keys are not shared.
  - If two people changed the same client, that client is not synced and a warning is shown; changes are never merged by guesswork. A client with an agent job running is skipped.
- **macOS support:** the setup check does not require bubblewrap and socat.
- **Documents renewed:** the README was rewritten, release notes moved to `CHANGELOG.md`, `AGENTS.md` updated.

## One panel for everyone: personal traces removed (1.28.0)

Site Factory is no longer written for a single person; every user runs their own panel under their own name.
- **Profile on first launch:** a "Welcome" card appears on the home screen and asks for a name, studio name (optional) and panel language. The card does not block anything; you can change these at any time under Settings → My Account → Profile.
- **The agent addresses you by your name.** The personal name that appeared in the rules, tool messages and agent prompts was removed; they all say "the operator" (the person using the panel). One line from the profile is added to every job: "the operator is <name> of <studio>".
- **If the quote's sender field is empty,** the studio name is used (or the name if there is none).
- **Examples were made generic:** personal details were removed from the backup folder path and label examples.
- **A new test** warns if any single person's name appears in the code, rules, panel or portal.
- The approval rules did not change: approvals still belong only to the person using the panel; the agent cannot approve.

## Panel in the ArkeLab look (1.27.1)

The panel's colour theme and typeface were adapted to ArkeLab's design system (`DESIGN.md`); inside ArkeLab the panel will look like the same product. The structure and behaviour of the screens did not change.
- **Dark theme is the default:** charcoal background (`#191918`), light stone text. If you chose a theme earlier, that choice is kept. The light theme stays with the same colour roles.
- **The accent colour is copper** (`#d6a584`): used for brand, selection and focus. Mustard was removed.
- **Primary buttons are a light stone background with dark text;** this applies in the dark theme, and the reverse in the light theme.
- **The typeface is Manrope Variable:** loaded from the panel's own file, OFL-licensed, covers Turkish characters. Public Sans was removed.
- **Corners:** 6px on controls, 9px on panels.
- **Focus outline:** 2px copper.
- **Status colours in ArkeLab tones:**
  - lilac while the agent works
  - blue-grey while waiting for the client
  - sage green when live
  - coral on error
- Contrast passed the automatic screen audit in both themes.
- The clients' admin screen (`/admin`) is outside this change; the client uses that screen.

## Shared ready-made parts: catalogue, admin screen, notifications (1.27.0)

The first ready-made parts for app sites (E-commerce, Booking, Restaurant-Café) arrived. The code is in the factory's `parts/` folder and is tested; the agent does not write it, it only places it on the page and designs it (`rules/parts.md`). Showcase sites are not affected.
- **Catalogue:** product, service or menu items; categories, price (in minor units), duration (for services), image (R2, at most 5 MB, JPG/PNG/WebP/AVIF only). It is shown on the site with the template the agent designed; items are changed from the admin screen and show up on the site within a minute.
- **Inbox (notifications):** messages from the forms on the site are saved to the database. If wanted, they are also forwarded to a webhook address (Slack, Discord, Telegram relay). There is a hidden honeypot field and an hourly limit per address. In later steps, orders and bookings will land here too.
- **The client's admin screen (site-address/admin):** you set the password from the panel (Client Details → Client Admin Screen). The panel stores only the hashed digest, not the password itself.
  - A session lasts 12 hours.
  - After 5 failed attempts in 15 minutes, sign-in is locked.
  - Changes are accepted only from the site itself.
  - The screen has strict security headers and is closed to search engines.
- **Setup is automatic:** if the site kind is an app kind, the panel copies the parts into the client folder: `app/worker.js` (built only with that kind's parts), `app/parts/`, `app/migrations/0001–0003` and `site/js/sf-parts.js`. The session key is also generated automatically. A new factory version refreshes the part code; it never touches database changes that have been applied.
- **Pages cannot shadow the API:** the Worker always handles `/api/*`, `/admin` and `/media/*` itself.
- App kinds are still "coming soon": payment and legal pages will arrive in step 4 (E-commerce).

## Publishing module for app sites (1.26.0)

E-commerce, Booking and Restaurant-Café will be "app" sites: a Worker running next to the pages, its own database (D1), image store (R2) and secret keys. This release adds the shared infrastructure to publish them; showcase sites are published as before (no change).
- **Order:** are secret keys missing (if so, nothing is touched) → database and store (created once, their IDs in `.factory/resources.json`) → database backup (`.factory/db-backups/`) → database changes → secret keys (via stdin, not on the command line) → Worker publish.
- **Preview and live are separate:** each has its own database and store; a preview trial does not touch live data.
- **Changes that lose data** (dropping a table/column, unconditional delete or update) run, even with a backup taken, only if the client's short name is typed to approve. If a migration file that has already been applied is edited, publishing stops (a new file must be added).
- **The client's secret keys** (e.g. the payment provider): in the panel per client, in an encrypted file only you can read; only their names are shown; they do not go to the agent.
- **Approvals also cover the app code:** `app/` (Worker and database changes) is part of the content digest; if it changes after approval, the approval is renewed. Showcase sites have no `app/`, so their digests do not change.
- The site's kind is written by the panel to `.factory/product.json`; the publishing tool reads the kind from there (the agent cannot change it).

## Web Studio foundation and individual accounts (1.25.0)

**Individual Cloudflare account:** so that anyone can use the panel, the publishing account belongs to the person.
- **Settings → My Account → My Cloudflare Account:** enter the Account ID and API token, then **Save and Test**. If Cloudflare does not accept them, they are not saved. Only a summary appears on screen (account `0123…cdef`, token `…x7Kq`, last test); the token is never shown again.
- If **Create Preview / Publish / Unpublish / Roll Back** is pressed while there is no account, the same form opens in a window; once saved, the operation continues where it left off.
- Storage: `~/.config/site-factory/accounts.json` (a file only you can read), the token encrypted with AES-256-GCM; the key is in `accounts.key` next to it. Because WSL has no operating-system key store, this protects against the file being shared by accident (backup, report, screenshot); it does not protect against someone who has logged into the computer as the same user. When moving to ArkeLab, ArkeLab's encrypted store will replace it.
- It never goes to the agent: agent processes and the MCP server they start do not read the account file (`SF_NO_ACCOUNTS=1`), and the agent cannot read `~/.config`. It does not go into backups or `sf-report` output; it is masked in the report. The client portal uses this account too.
- Backward compatibility: the `SF_CF_MANAGED_*` environment variables keep working; if there is a saved account in the panel, it is used first.
- Tests never see your saved account (they use a separate temporary folder).

**Web Studio structure (site kinds):** in the first step of New Client there is **Site kind**: Showcase site (active), E-commerce, Booking, Restaurant and café ("Coming soon"). The Analysis screen has a **Kind** column and filter.
- Shared core: client and job tracking, agent engine, approvals, releases, brand system (design plan, signature motion, motion kit), checks, publishing, accounts, portal, analysis.
- Each kind defines only what is its own (`src/products/registry.ts`): publish type (static / app), extras, the ready-made factory parts it uses (catalogue, cart, payment integrations, calendar, QR menu, admin screen, notifications, legal pages) and its rules.
- Principle: the factory does the function, the agent designs. Parts such as payment are ready-made, tested packages that the panel installs with a script; the agent does not write them (fewer tokens, fewer errors). The payment provider and content management (us / client) are asked of the client.
- Existing clients count as showcase sites; their behaviour does not change.

## Design plan approval and strong signature motions (1.24.0)

**Design plan (new designs):** before building the site, the agent explains how it will design it and stops. A **Design Plan** card appears on the client screen:
- The concept and its source (logo, the craft's material, place), tone, colour palette, typefaces, opening area, pages and their sections.
- **Signature motion:** its official name, the idea, a step-by-step timeline (start, duration, movement, curve) and a time chart; a live preview if the agent has written it.
- **Approve Plan and Build Site:** the site is built to this plan. **Ask for a New Idea:** with optional notes, the agent prepares a genuinely different new plan from the previous ones (old plans are kept).
- Approval is yours: the panel writes it into `.factory/`, and the agent cannot approve. If the plan changes after approval, the approval lapses. No page can be written without approval (only the signature preview) and the site is not built; resources are not wasted.
- Old sites are not affected. A redesign needs a new plan; choosing one of the 3 design proposals counts as approval of that direction.

**Signature motions:**
- Names are official and in the site's language ("Layered Reveal", "Jar Fill"); no jokes or metaphors.
- The ready-made idea list by sector was removed (every bakery got "flour dust", every developer got "self-writing code"). Replaced by a method: a 3–8 step choreography from the source (logo, material, process), overlapping steps, spring settling; clichés are forbidden unless they come from the logo.
- The animate skill is used only for interface motion; the restrictive "should it move?" approach is not applied to the signature motion.
- **Motion kit** (`js/motion.js`, the factory's own): `SFMotion.sequence` plays the plan's steps one to one; there are also staggered reveal, SVG line drawing, word-by-word text reveal, scroll-linked scenes and number counting. The agent does not write these from scratch: richer and fewer tokens.
- **The agent sees the motion:** the build plays the signature page in a browser and captures 4 frames (start → end); the agent looks at them and corrects.
- **Real check (mandatory for new designs):** the build fails if there is no signature page, if there are fewer animated steps than the plan's step count (at least 3), or if there is no reduced-motion state. A warning on old sites.

## Fixes from the rreinware trial (1.23.2)

- **Translation does not run in vain:** after a design job, automatic translation starts only if that job built the site successfully. If the agent stopped to ask a question, translation does not start (before, it started because of library files and wasted resources). "Update other languages" is also refused with an explanation when there is no passing build.
- **Fewer wrong field-name guesses:** when the agent tries to write to a field that does not exist, the error also says which fields are there (e.g. `whatsapp.enabled (fields there: number, floatingButton)`); it does not burn tokens retrying the same error.
- **A library design does not carry another business's details:** the booking link, social accounts and company name/number also count as "belonging to the source"; the site is not built while they remain. The agent is told that prices, hours, reviews and case studies also belong to the source business and will not be carried over. This also applies to designs saved earlier (the source client's current details are read).
- **Hiccups do not look like failures:** in a finished job, errors the agent got past (a wrong field, a site that would not open) sit in a folded "N errors on the way, the agent continued" line; in a failed job they are shown openly.
- **A request stuck at the token ceiling continues with one click:** under a change request that stopped at the ceiling there is a "Continue where it left off" button; the agent does not repeat what was done and completes the remaining steps.

## Screen audit fixes (1.23.1)

Every screen (home, Analysis, Library, Archive, Settings, the steps of New Client, client tabs, menu and approval window) was audited in two themes, on desktop and phone; from now on every update is audited automatically (tests/ui-audit.test.ts: text contrast WCAG AA, no running animations, no sideways shift, no text overflowing its box, no script errors).
- On the phone the sidebar became one row: New Client + a sideways-scrolling menu; the client list is hidden on the phone (the table on the home screen already shows it). Pages no longer begin with a screenful of menu.
- In New Client, the Back/Next bar on the phone no longer overlaps the text; the box-in-a-box in the logo/photo step is gone.
- In the dark theme the selected client's subtitle is more legible. Keyboard focus is clear in every theme (ink-coloured frame + mustard halo).
- The options in the client menu are on a single line; in the quote there is space above the "Extra options" heading.

## New panel look and the Analysis screen (1.23.0)

Look (CSS and small drawing changes only; functions, addresses and the API are the same):
- Theme "Graphite and mustard": almost black and white; a single colour, mustard, used only for things to do now (New Client, Approve, selected tab, clients waiting for your approval). Other states are calm: purple while the agent works, grey-blue while waiting for information from the client, green when live, red on error.
- The home screen is a control desk: clients row by row in a single table (status, sector, progress, next step, fee); a one-line counter instead of four large boxes. A single "New Client" button (in the sidebar); on the home screen the client list in the sidebar is hidden.
- On the client screen the tabs are underlined and names are not truncated. Avatars are neutral grey.
- Animations were removed (page-opening slide, card lift, logo bounce, blinking dots, click shrink). What remains: short colour transitions, and the gentle fade-in of notifications and the approval window.
- The typeface is Public Sans, inside the panel (panel/fonts, OFL licence). There is no Google Fonts link; it looks the same without internet.

Analysis screen (**Analysis** in the menu, read-only, changes nothing):
- Each client is one row: status, sector, country, languages, plan, extras, price, payment, delivery, expense, agent cost, profit, number of jobs (failures), agent time, last job, days to publish, check results, number of pages, page weight, images, largest image, publishing.
- Clicking a column header sorts; search, status, country, plan, payment, sector and tag filters; "Overdue" and "Check failed". Filters are remembered in the browser.
- Summary at the top: clients, live, revenue and profit by currency (those whose profit cannot be calculated are not counted, and it says "1/2 clients"), agent cost, failed job rate, average days to publish, late deliveries and payments. Totals by currency below; currencies are never mixed.
- "Download CSV": the visible rows, opens in Excel with Turkish characters intact.
- Performance is measured honestly: page weight (average page + shared CSS/JS, excluding images), number and size of images, largest image; heavy ones are red. The Lighthouse score is not shown because it is not measured.

## New client: logo and photos in the first step (1.19.0)

- The New Client form has three steps: **1. Business**, **2. Logo and photos**, **3. Information from the client**. The "On create: …" line at the bottom says what will happen when you press the button.
- If a logo is chosen, it is saved as the logo as soon as the client is created and the brand is derived from it; the photos go to the agent.
- If information is pasted but no logo is chosen, you are asked before the job starts: "Start with a text logo" or "I'll add a logo first". This avoids work (and wasted resources) done without a logo and then redesigned.
- If the logo is the same as another client's logo, confirmation is requested first; if not confirmed, the design job does not start.

## Panel look polished (1.22.1)

With Impeccable's "polish" step, and with the "Operate" rules because the panel is a work tool (taste-skill is for showcase pages and does not apply to panel screens):
- All fields are uniform: number, date and price boxes and dropdowns no longer fall back to the browser's default look; dropdowns have a uniform arrow, a soft ring on focus, and grey when disabled.
- Buttons: a small reaction on press; disabled buttons (e.g. "Archive" before the word is typed) are neutral grey instead of pale red.
- Approval windows open with a short transition; the word that must be typed appears as a small label.
- The upper-case mono labels in Settings and the sidebar became normal headings; the selection colour and scrollbar are in the panel colours.

## New client step by step (1.22.0)

- New Client now has 5 steps: **1. Business**, **2. Plan and price** (plan, site price, delivery date, extra options and their prices), **3. Logo and photos**, **4. Information**, **5. Summary and start**.
- Nothing is saved and no resources are spent until the last step. The summary shows everything (total price, whether there is a logo, what is missing) and offers two options: "Save, start the site later" (free) or "Save and start building the site".
- If no information was entered, the site cannot be started, only saved. If a price was entered, the payment status is saved as "Quoted".
- What arrived in 1.21.2 is also in this release: the currency check, the hint when the plan changes, the first-screen rule.

## Currency check, plan hint (1.21.2)

- New build check: an amount written on the pages with a symbol other than the client's currency (e.g. "£100,000" for a Turkish client) stops the build; in every language, prices stay in the content's currency.
- When the plan is changed in Job Tracking, the panel says: the plan applies to later jobs, the existing site does not change by itself; to redesign with the new plan, use "Redesign with Brand Identity".
- Rule: the first screen carries the brand at full strength in both themes (simple ≠ empty); simplicity rules are for decoration, not for the hero.

## Where design warnings are, language links (1.21.1)

- Impeccable design warnings now also say where they are (page or file, line and measured value, e.g. "gray-on-color: text #b9c0d0 on bg #172544 · about/, blog/"). The agent no longer has to guess where the warnings are.
- The language button can use a full address (https://domain/en/about/); if it is the site's own domain, it counts as the same page.
- The translation job does not translate the 404 page or the signature motion demo.

## Design and language rules reviewed (1.21.0)

- "No. 01 · …" labels above headings are no longer optional, they are forbidden: a label is allowed only if it carries real information (price, duration, order, product code).
- The "at least 5 sections" requirement on the home page was dropped (it produced filler sections); each section must fill the screen with content, and no half-empty sections.
- Decoration only if it serves a purpose: no meaningless dots, shapes or half-circles. On the home page, at least one meaningful drawing besides the logo is enough.
- The spacing between sections was roughly halved (the factory's base.css; existing sites get it on the next agent job).
- The agent looks at screenshots with a checklist: is the menu collapsed on the phone, is text overflowing, does a fixed button cover something, does decoration overflow.
- A design job does not write pages in another language; a half translation stops the build and the message points to the translation job.
- `rules/markets.md` → "Standard words": a standard Turkish/English list of menu, button and form words.
- Old template rules moved to `rules/legacy-templates.md`; they do not get mixed into design searches.
- **Logo and Images:** "Remove logo" (the file stays, a text logo is drawn in the next design) and deletion with ✕ on each image. The logo and any image used in the content or pages are not deleted (the reason is given); a deleted saved image comes back from Release History.

## Ready-made site parts and language checks (1.20.0)

- **Factory parts:** the theme button (with sun/moon icons, says which theme it will switch to, remembers the choice) and the phone menu (collapses below 48rem) are copied to every site as `js/kit.js` + `css/base.css`; the agent does not write them itself. When the factory is updated, these two files arrive in the site as new on the next agent job (a hand-written base.css is not touched).
- **New build checks:**
  - Language: a half translation, a language button that goes to a different page (About → should be /en/about/ instead of /en/), and a link inside a translation that escapes to the default language stop the build. If no translation was written at all, only a warning (the translation job runs after the design).
  - Parts: a page with a theme button or menu button that does not load `kit.js` stops the build; a page with more than 4 menu links but no phone menu gets a warning.
- **Rules:** fixed buttons (`float-btn`) do not cover content; decoration does not overflow its section; space between a grid and the button below it; no half-empty screens.
- To fix an existing site: Edit → "Update other languages", then "Rebuild the site", and if the check fails, "Let the agent fix the errors".

## Plan choice at the start, request box fix (1.19.1)

- In step 1 of New Client, the **Plan** (Default / Basic / Standard / Premium) is chosen; the first design job runs with this plan. It can be changed later from Job Tracking.
- The Custom Request box now empties when a request is sent (if the job does not start, what was typed comes back).

## New client steps and extra options (1.19.0)

- **New Client** has three steps: 1. Business (including extra options), 2. Logo and photos, 3. Information from the client. "On create: …" at the bottom says what will happen.
  - If a logo is chosen, it is saved as the logo as soon as the client is created and the brand is derived from it; the photos go to the agent.
  - If there is information but no logo, you are asked before the job starts: "Start with a text logo" or "I'll add a logo first".
- **Extra options**: second language, dark/light theme, blog, WhatsApp button, online booking.
  - They are ticked for a new client; a price is entered for each in Job Tracking. Total = site price + extra options; profit uses this too.
  - The quote PDF shows the "Extra options" list and a price breakdown (Site, each extra, Total).
  - The agent does only the selected ones (e.g. if the theme was not selected, a single theme and no button). For old clients with no extra-option record, the agent works as before; opening and saving Job Tracking does not change that, a record is created only when you touch the extra options.
  - When a second language is chosen, it is added to the site's languages; unticking it does not delete the language.
- Quality: the company-number warning applies only in the UK and Ireland; the business name is not searched for on the 404 page and the signature demo. The empty "agent:" line in the report was fixed.

## Permission rules and browser tests (1.18.3)

- `.claude/settings.json`: the ineffective `Write(...)` denies were removed; according to Claude Code, file denies work only through `Edit(...)`, and `Edit` also covers Write. The protection is the same (client folders, `.factory`). You can also delete the `Write(...)` line from your own `.claude/settings.local.json`; the `Edit(...)` line should stay.
- So that browser-based tests (UI, end to end) run in WSL, run this once:

```bash
cd ~/projects/site-factory
npx playwright-core install chromium
sudo npx playwright-core install-deps chromium
```

## Code map: graphify (1.18.2, only for your own Claude Code)

[graphify](https://github.com/Graphify-Labs/graphify) extracts the project's functions, modules and dependencies into a graph; Claude Code looks at the graph first instead of reading file by file. It is not for the site agent, it is for your development sessions.

Setup (once, in WSL):

```bash
pipx install graphifyy        # the package name has two y's; if you don't have pipx: sudo apt install pipx && pipx ensurepath
graphify install              # copies the skill to ~/.claude/skills/graphify
```

Then open Claude Code in `~/projects/site-factory` and type `/graphify .`. The output goes to the `graphify-out/` folder (it is not committed to git and is not deleted on update).

**Do not:** run `graphify claude install` inside the project or install with `--project`. That adds a hook to the project's `.claude/settings.json` (the agent's sandbox and deny settings).
Agent jobs now run only with the factory's own settings (`--setting-sources project,local`); hooks and plugins in your user settings do not pass to the agent.

## Motion skill: animate (1.18.1)

Emil Kowalski's **animate** skill (MIT) is in `.claude/skills/animate`, unmodified (source and version: `UPSTREAM`).
- Premium: the agent loads it only when it comes to animations and the signature motion; for each animation it follows the sequence "should it move, which property, which curve and duration, reduced motion".
- Standard: it is not loaded in full; it is searched with `search_design_knowledge`. Basic: not used.
- On sites only the CSS and WAAPI route is valid; there is no Motion library or npm package (`rules/custom-site.md` wins).

## Second language, rollback, backup check (1.18.0)

- **The panel can be in English too:** Settings → General → Panel language. The choice is stored on the server, and the page reopens in the new language. Client data (what the agent writes, portal answers and comments, texts on the site) is not translated. When the panel is in English, the agent also writes its summaries and questions to you in English; the sites' languages do not change.
- **Client questions in the client's language:** the question form and the portal information form go in Turkish to clients with a Turkish site and in English to others.
- **Roll back the live site:** Client Details → Publishing → "Return to the previous release". The previous publication on Cloudflare comes back within seconds; files on the computer do not change. For the live site you confirm by typing the client's short name. Panel only; the agent has no such tool. Rollbacks appear as warnings in `sf-report`.
- **Does the backup really open:** in Settings → Backup, next to each backup there is "Can it be restored?". The backup is unpacked to a temporary folder, every client is checked, and the folder is deleted.
- **Restoring from a backup** (always to a new folder; it never overwrites an existing one):

```bash
cd ~/projects/site-factory
npm run restore-backup -- /mnt/c/Users/<user>/OneDrive/SiteFactory-Yedek/site-factory-yedek-….tar.gz ~/geri-yuklenen
```

- **Who did it:** the user name on the computer (`by`) is kept in every job and publishing record; if a team comes later, who did what will be visible.

## Report: sf-report (1.17.3)

`npm run report -- <folder>` writes the state of the whole factory into a single file (`sf-report-<date>.md`). It changes nothing; tokens and keys are not written to the file.

- Setup: version, claude/codex/wrangler, whether the Cloudflare values are defined (not the values), portal, settings.
- Each client: stage, last build and quality warnings, approvals (who gave them), publishing addresses and live check, payment, portal, last 15 jobs (duration, cost, summary, errors), the agent's tool calls.
- Automatic checks: did the agent never publish or use a forbidden tool, are the approvals yours, is there a token or portal key in the client folders, are there unfetched records left in the portal, overdue payments, a site that does not open, failed jobs.
- Offline: `--no-network` (live checks are skipped).

Shortcut (once, in the WSL terminal):

```bash
echo 'sf-report() { (cd ~/projects/site-factory && npm run --silent report -- /mnt/c/Users/<user>/Downloads); }' >> ~/.bashrc && source ~/.bashrc
```

Then type `sf-report`; the file lands in Downloads.

## End-to-end tests (1.17.2)

`npm run test:e2e` (a few minutes; needs Linux Chromium, skipped if absent):

- **Site flow (in a real browser):** new client form → the agent job writes the site and builds it over the real MCP server → approval code (a wrong code is rejected first) → trial publish (wrangler `--dry-run`, nothing is uploaded) → a custom request changes the site, the build is renewed, the approval is reset → every job leaves a release to go back to.
- **Client portal (in Cloudflare's own runtime, workerd + local KV):** links → the client sends the form and a photo on a phone screen (a fake "image" is uploaded) → the panel collects it, the photo lands in the inbox → the answers go to the agent → comment and approval on the preview → the comments go to the agent as data (nothing is published) → when the link is closed it does not open, and no data is left in the portal.
- A fake agent with a fixed scenario runs instead of the model (`tests/e2e/fake-agent.ts`). If a Cloudflare variable leaks into its environment or dangerous tools are not disabled, the job counts as failed; this check is itself tested.
- The update script skips these tests (to stay fast); all the other tests still run.
- Fix: when a job starts, the panel goes to the Edit tab instead of the old "akis" address (an unnecessary redraw is gone).

## Code quality (1.17.1)

Behaviour did not change.

- **New tests:** the terminal approval command (it refuses when there is no terminal and writes no approval), the portal's panel addresses, the publishing gate (a build without approval or one that has changed is not published), the Claude Code and Codex event streams (token ceiling, usage limit, tool errors).
- **Simplification:** the most complex functions were split (the two functions that read agent output, the text finder, the portal API, the panel's request handler, the SEO check, publishing). The highest complexity dropped from 56 to 37.
- **`src/tools.ts` split:** `clients`, `build`, `deploy`, `site-files`, `shared` under `src/tools/`; `tools.ts` remains as the single entry point.
- **Formatting:** the code was uniformly formatted with Biome (lines at most 160 characters). For new code: `npm run format`.

## Consistent naming (1.17.0)

Behaviour did not change; names say what they do. Old records, files and addresses keep working.

- **Plans under a single name:** Basic / Standard / Premium everywhere ("mode", "Economy", "Balanced" are gone). In code the values are the same (`economy/balanced/premium`), records did not change.
- **Job kinds:** `autopilot` → `create-site` ("Build the Site"), `client-feedback` → `portal-comments`. History, inputs and costs saved under the old names are read under the new name.
- **Portal files** start with `portal-`: `portal-intake.json`, `portal-comments.json`, `portal-approval.json` (real approvals are still `approvals.json`). Those with the 1.15.0 names are moved on first read.
- **Addresses are in Turkish:** `#/yeni`, `#/musteri/<short-name>/<tab>`. Old `#/new` and `#/c/…` links open.
- **Panel code (panel/js):** `router.js` (page routing, sidebar), `jobs.js` (starting and following jobs), `client-actions.js` (preview, publishing, removal, archive), `business.js` (job tracking, profit), `proposal.js` (quote, job report, monthly report), `new-client.js` (new client form); `info.js` only the Client Details tab, `home.js` only the home page.
- **Server (src/panel/api):** `ops.ts` was split in two: `publish.ts` (build, approval, preview, publishing, removal) and `system.ts` (jobs, settings, usage, profit, backup).
- The name "Site Factory" does not appear on the portal pages.

## Global markets and rules (1.16.0)

- **New markets:** Ireland, the USA, Germany and the Netherlands, in addition to Türkiye and the UK. The shared language is English: outside Türkiye the site's main language is English, with the currency and phone code according to the country. Other languages are added from "Site language".
- **`rules/markets.md`:** spelling by country (UK/US English, Turkish), price, date and time format, the legal minimum: a privacy text on a site with a form (the KVKK Disclosure Text in Türkiye), an Impressum in Germany. It is not legal advice; have the client check it.
- **`rules/local-seo.md`:** local search (name/address/phone the same everywhere), page titles, JSON-LD, AI search, image sizes.
- **New build warnings:** "Privacy and legal pages" (there is a form but no privacy link; no Impressum in Germany) and "Image sizes" (images over 500 KB, `<img>` without dimensions). They are warnings and do not block publishing.
- Rules were cleaned up: the contradiction in `AGENTS.md` was resolved, old template rules were marked, `SPEC.md` was marked as historical, and iOS/Android and skill installation pages were removed from design search.

## Client portal, payment, monthly report, blog, SEO (1.15.0)

- **Client portal** (Settings → Publishing → Client Portal): a small Worker (`sf-portal`) and storage (Workers KV) in your Cloudflare account. It runs on the free plan (100,000 reads and 1,000 writes a day).
  1. Add the permission to the token: Cloudflare → Profile → API Tokens → existing token → Edit → **Account · Workers KV Storage · Edit** → Update. The token does not change.
  2. In the panel, "Set up the portal". The portal key stays only in `~/.config/site-factory/portal.json` (the agent cannot read it).
  - Client Details → **Client Links**: "Information form link" (questions + logo/photos, at most 8 images × 5 MB) and "Comment and approval link" (preview + page-by-page comments + "I approve"). Links are valid for 60 days and can be closed whenever you want.
  - What arrives is pulled into the panel every 5 minutes (or with "Fetch now") and deleted from the portal: files go to the client's inbox, answers and comments to the client folder. They are processed with "Run with the agent" / "pass to the agent"; everything the client wrote goes to the agent as data.
  - The client's approval is for information only; the publishing approval is still given with your terminal code.
- **Payment tracking:** a payment date in Job Tracking; overdue payments are warned about on the home page and the client page; you are asked when going live without payment received.
- **Monthly report** (Quote → Monthly Report): is the site up, speed, the month's jobs, the latest check results; printable.
- **Blog post:** Edit → Blog; the agent adds a single post page in the existing design.
- **SEO and AI search checks:** at build, business information (JSON-LD), robots.txt, sitemap, canonical, sharing tags and title lengths are reported as warnings.

## Tidy PDFs (1.14.1)

"Print / PDF" now prints only the document itself to A4: the Quote and Job Report are portrait, on a single page (split properly if long, the table header repeats); the Brand card is a single landscape A4 page. The panel, menus and hint texts do not go into the PDF; text you corrected on screen is preserved; the PDF file name is suggested according to the client.

## Codex, profit and job report (1.14.0)

- **Agent and Limits** (Settings → Resource Usage): for each job kind (design, edit, translation, extra page), Claude Code or **Codex**, the model, the maximum steps and the token ceiling. Empty = the plan's.
  - For Codex: in WSL `npm i -g @openai/codex`, then `codex login` (ChatGPT account or API key).
  - Codex jobs run in a read-only sandbox with **shell, browser, computer control, plugins and hooks turned off**, only with the site-factory tools, in an empty working folder; user settings (`~/.codex/config.toml`) are ignored.
- **Profit calculation:** client expenses (domain etc.) are added in Job Tracking; price − expense − agent cost = profit. An "Earnings" summary on the Clients page. Exchange rates and the Codex unit price are in Settings → Profit Calculation.
- **Job Report** (Quote tab): what was asked, what was done, with dates; printable, resource usage is shown optionally.
- **Update other languages:** in the Text form and the "⋯" menu; translation with the cheap model based on the latest state in the default language.

## Panel edits (1.13.0)

- **Archive** (left menu): see archived clients, **Restore**, **Delete permanently** (by retyping the short name; only archived ones can be deleted).
- **Confirmation windows** in the panel's own design (instead of the browser's grey boxes); for dangerous operations the button stays disabled until the short name is typed.
- **Light theme**: the left menu is light too; panel colours come entirely from theme variables. The "⋯" menu no longer stays behind the cards.
- **New Client** in two columns: the business on the left, information from the client on the right.
- **Text** form: all the texts on the page with their IDs (`h1-1`, `p-3`, `meta-description`, `seo.home.description` on template sites); edited in place, no agent runs.
- **Extra page** (Pages form, free design): name + content note → a new page in the site's design with a menu link.
- **Logo checks** (without spending tokens): a warning if the same file as another client's logo is chosen; before a design job the logo is shown and confirmation is requested; when the logo changes, a "Brand is based on the old logo" warning and a one-click refresh.
- In direct edits, the "Before: …" release is now really saved before the change.

## Unpublishing (1.12.0)

Client Details → Publishing → **Unpublish**: "Remove preview" or "Remove live site" (for the live site, the short name must be retyped). The Worker on Cloudflare is deleted; the client's files, releases and approvals stay and it can be published again. The agent cannot do this (it is not an MCP tool, only in the panel).

## Security fixes (1.11.1)

- The agent can read only the factory, client and inbox folders (before, it could read any file). `/proc`, `~/.ssh`, `~/.claude`, `~/.config`, shell profiles (`~/.bashrc` etc.) and `.env` files are also explicitly forbidden: an instruction hidden in client text or a web page cannot make it read the Cloudflare token or keys.
- The screenshot server serves files only from inside `dist/` (a neighbouring folder whose name starts with "dist" can no longer be opened).
- In the signature preview on the brand card, the content security policy (CSP) is at the very start of the document.

## Code quality (1.11.0)

- `npm run lint`: Biome, warnings only (empty block, unused import, function over 80 lines). It does not stop the build or the tests.
- The panel API was split into areas (`src/panel/api/`); job kinds and edit forms are in a registry table each: a new job kind = a single entry.
- The panel UI was split into ES modules (`panel/js/`, no build step). A name that a module does not import is caught in the test.
- UI smoke tests (`tests/ui.test.ts`) open the main screens in a real browser. If there is no Chromium/Chrome on Linux (e.g. only a Windows browser in WSL), they are skipped; they can be turned off with `SF_UI_TESTS=off`.
- No behaviour change.

## Library: fixed fields and starting design (1.10.0)

- **Fixed fields:** Design Library → "Manage fixed fields". Bind client-specific text that appears in a design (name, phone, email, address, hours, domain, map, Instagram, Facebook) to a field. When saving, the source client's details are added automatically; next to each row you can see in how many places it appears in the design.
- **When using:** the panel replaces these texts with the new client's information by itself (no agent). If the client does not have that information, the text stays, is left to the agent, and the build fails until that text is changed.
- **New Client form:** a "Starting design" can be chosen (those matching the sector come first, marked ★). It is applied once on the first "Build the Site" run; later runs do not change the site again.

## Resource saving (1.9.0)

- **Direct edit:** colour code, text that appears exactly on the page, and email / address / working hours changes are made without the agent, and the site is rebuilt ("No resources used"). If the value is not found, the job goes to the agent; nothing is changed by guesswork.
- **Short history:** small jobs are given only the most recent of the earlier inputs (~4,000 characters); design jobs get all of it.
- **Rule search:** fix and build-repair jobs do not read the rules from start to finish; they get what they need with `search_design_knowledge`, `site_map`, `read_site_file_part`, `edit_site_file`.
- **Check while writing:** `write_site_file` / `edit_site_file` report safety issues immediately; there is no repeat round at the end of the build.
- **Base CSS:** `css/base.css` (reset, layout, button, form, reduced motion) is copied once into free-design sites; the agent does not write these again. An existing file is not touched.
- **Research notes:** verified information is saved to `<client>/research.md`; later jobs do not scan the web again.
- **Second language as a separate job:** the design is done only in the default language; when it finishes successfully, the "Other languages" job starts automatically with a cheaper model.
