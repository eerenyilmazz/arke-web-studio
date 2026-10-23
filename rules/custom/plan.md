# Custom sites: the design plan

Part of the custom-site rules (`rules/custom-site.md` is the start). New designs only: the plan the operator approves before anything is built.

## Design plan (new designs: approved by the operator before anything is built)

When `get_client_status` shows `designPlan.state` other than `not-required`, the site is not designed straight away.
First write the live demo of the signature motion (`brand/signature.html`: its beats as a small self-contained
page), then the plan with `save_design_plan` (it refuses a plan without the demo), then **stop**: The operator reads it in the panel and approves it, or asks for
a new idea with notes. Until they approve, the write tools refuse every site file except `brand/signature.html`
(the motion's live demo shown in the plan card). After approval, build exactly to the plan; any departure goes
in the summary with its reason. The build fails without an approved plan, or when the plan changed after approval.

The plan (all names formal and in the site's main language; no jokes, puns or cute phrasing):

- `concept`: the one idea the design grows from; `source`: where it comes from (the logo's shapes, the craft's
  material, the place), never "modern and clean".
- `tone` (2–4 words), `palette` (3–6 named colours with hex and role), `fonts` (heading, body, optional mono). The
  heading font is a typeface with character that fits the concept (a Google Font), never a system font
  (system-ui, Arial, Segoe UI…): `save_design_plan` refuses one. Plan one theme per page (light and dark each
  complete), never inverted bands.
- `hero`: what fills the first screen, where the signature plays, how the headline sits.
- `pages`: every page with its sections and the purpose of each (only what earns its place).
- `signature`: the signature motion (see "Signature motion"): formal `name`, `idea`, `trigger`, `beats`
  (3–8: start `atMs`, `durationMs`, `what` moves, `easing`), `totalMs` (800–6000) and the `reducedMotion` still state.
- `animations`: 0–4 supporting animations with formal names, trigger and what moves.
- `differs` (only after a new-idea request): how this plan differs from the earlier ones.

In the summary, write the plan out for the operator in formal Turkish: concept and source, palette, fonts, hero, pages, the
signature's name and its beats in order with timings. On a new-idea request, read the earlier plans
(`design-plans/`): the new one has a different concept or source, hero composition and signature motion (not a
variation), unless the operator's notes keep a part.
