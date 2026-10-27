# Shiftly — Design System v1.0
**Theme:** daylight / light only · **Application language:** English · **Primary viewport:** 1440 × 900 · **Compact desktop:** 1024 × 768 · **Public confirmation:** 390 × 844

## 01. Principles (five lines)
1. **Crew first:** the schedule, people, and next action are more prominent than abstract analytics.
2. **Daylight precision:** white canvas, near-black typography, faint borders, no heavy dashboard boxes.
3. **One recognizable signal:** persimmon orange is reserved for brand, selection, and the primary next action.
4. **Trust at the money boundary:** every payout is itemized, confirmed, idempotent, and observable.
5. **The agent explains, the operator decides:** every suggestion has a one-sentence reason, actor, timestamp, and review path.

## 02. Visual direction
Editorial operations software. Atmosphere: *a premium scheduling workspace rather than an admin console*. Large readable headlines, tight data typography, expansive white surfaces, hairlines, a compact warm off-white left rail, quietly colored data. High-density views should retain rhythm: 24px section gaps, 12–16px internal gaps. No gradients on functional surfaces, glassmorphism, blurry backdrops, colored page backgrounds, or gratuitous shadows.

**Brand accent: persimmon `#C4452D`.** Warmer and more human than the usual SaaS blue; distinctive on off-white while retaining **4.96:1 white-on-accent** contrast (normal text AA). It should never stand in for “paid,” “error,” or “warning.” Role hues and semantic feedback colors are **data encodings**, not additional brand accents.

### Copy-paste CSS tokens
```css
:root {
  color-scheme: light;
  /* Surfaces */
  --canvas: #FAFAF8;          /* page outside panels */
  --surface: #FFFFFF;         /* main workspace and cards */
  --surface-alt: #F5F5F2;     /* rail, alternating context */
  --surface-hover: #F1F2EE;
  --surface-pressed: #E8EAE4;
  --line: #E5E8E2;
  --line-strong: #D1D6CD;
  --overlay: #15201866;       /* 40% dim, modal only */

  /* Type */
  --ink: #172019;             /* highest emphasis */
  --ink-secondary: #48534C;
  --ink-muted: #59665D;       /* >= AA on white */
  --ink-inverse: #FFFFFF;

  /* Single brand accent */
  --accent: #C4452D;
  --accent-hover: #A93823;
  --accent-pressed: #8A301E;
  --accent-soft: #FDF0EC;
  --accent-line: #F0C4B9;

  /* Shared semantic severity ladder: neutral, info, warning, error, success */
  --neutral-fg: #505D53; --neutral-bg: #F0F2EE; --neutral-line: #DDE3DA;
  --info-fg: #285F82;    --info-bg: #ECF4F8;    --info-line: #C8DCE8;
  --warning-fg: #8A5811; --warning-bg: #FFF5E4; --warning-line: #E8D1A8;
  --error-fg: #A52D2E;   --error-bg: #FFF0EE;   --error-line: #EBC4BD;
  --success-fg: #216747; --success-bg: #EAF5EE; --success-line: #BFDDCA;

  /* Scheduler role encoding — category, NOT payment/workflow state */
  --role-installer: #C4452D; --role-installer-bg: #FCEBE5;
  --role-electrician: #91620D; --role-electrician-bg: #FFF2D5;
  --role-rigger: #277569; --role-rigger-bg: #E4F3EE;
  --role-driver: #617080; --role-driver-bg: #E9EEF2;

  /* Geometry */
  --rail-w: 220px; --rail-w-compact: 76px;
  --radius-xs: 5px; --radius-sm: 8px; --radius-md: 12px;
  --radius-lg: 16px; --radius-xl: 22px; --radius-pill: 9999px;
  --shadow-popover: 0 6px 24px #17201914, 0 1px 3px #1720190F;
  --shadow-dialog: 0 28px 80px #17201924, 0 8px 22px #17201912;
  --focus-ring: #C4452D;

  /* Motion */
  --duration-fast: 120ms; --duration-normal: 180ms; --duration-slow: 260ms;
  --ease-ui: cubic-bezier(.2,.8,.2,1);
}
```

> Contrast policy: use `--ink-muted` for real text, **never** light gray placeholders as labels. Semantic foregrounds sit on matching pale surfaces; meaning is also spelled out. Test all token combinations in Storybook with a WCAG AA checker. Persimmon should not be used as small text on `--accent-soft` without a contrast check.

## 03. Typography
Google Fonts: **Manrope** (variable 400, 500, 600, 700, 800) for UI, **IBM Plex Mono** (400, 500, 600) for money, hours, IDs, timestamps and numeric columns. Use `font-display: swap`; preload critical local/self-hosted WOFF2 if font performance matters. Avoid mixing mono into descriptive copy.

| Token | Size | Weight | Line height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| `display` | 36px | 800 | 44px | -1.3px | Empty state / welcome hero only |
| `h1` | 30px | 800 | 38px | -0.9px | Page titles |
| `h2` | 21px | 800 | 29px | -0.5px | Section titles |
| `h3` | 16px | 750 | 24px | -0.25px | Card headings |
| `body` | 14px | 500 | 22px | 0 | Default text |
| `body-strong` | 14px | 700 | 22px | 0 | Table primary cell |
| `small` | 12px | 600 | 18px | 0 | Subtext, table captions |
| `eyebrow` | 11px | 800 | 16px | +1.1px | Uppercase section labels |
| `number-lg` | 26px | 600 mono | 34px | -0.8px | Financial totals |
| `number` | 13px | 500 mono | 20px | -0.15px | EUR, timestamps, hours, IDs |
| `number-xs` | 11px | 500 mono | 16px | 0 | Batch metadata |

At 1024px, `h1`→26px/34; all minimum readable body text remains 13–14px. **Numbers always use `font-variant-numeric: tabular-nums`;** never truncate currency amounts, show a horizontal scroll if needed. EUR locale: `Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'})`, explicitly include `€` after the figure: `1.234,50 €` (NBSP). Times: 24-hour Europe/Rome, e.g. `08:00–17:00`.

## 04. Layout / spacing / breakpoints
Spacing scale (px): `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80` (Tailwind equivalents `0,1,2,3,4,5,6,8,10,12,16,20`). Avoid arbitrary values outside documented UI geometry.

- 1440: rail **220px** fixed, workspace width **1220px**, main content padding **40px left/right** (=1140px available), top 32px; avoid max-width on Scheduler.
- 1024–1199: icon rail **76px**, workspace width at 1024 **948px**, padding **24px** (=900px), agent right column **300px** where room permits; Scheduler timeline scrolls independently.
- 1200–1439: full rail 220px, workspace padding 32px.
- Main header height 72px if persistent global toolbar used; page title block sits beneath. Tables: heading 44px, row **58px** (`60px` if description present), dense optional **48px**. Inputs/buttons **44px**, compact toolbar icon buttons **40px**. Sidebar targets **44px**.
- Confirmation page is an independent public mobile layout (no rail): `max-width: 440px`, viewport horizontal padding **20px**, vertical 24px, card radius 22px.
- At widths <768 (optional operator mobile): replace rail with top brand+menu and a bottom 4-item navigation bar; no attempt to squeeze a timeline: allow horizontal scrolling and show a list-mode fallback. User requested 1024 minimum operator desktop.

## 05. Components
### Button system
All actionable targets >=**40×40px**, primary height 44px / large 48px, inline padding 18px, icon 18px, corner radius 10px, label 13px/700. **Primary** `accent` fill, white text, hover `accent-hover`, active `accent-pressed`; one main CTA per region. **Secondary** white fill, 1px `line-strong`, `ink` label; hover `surface-hover`. **Quiet** no frame, `ink-secondary`; hover `surface-hover`. **Danger** only for destructive actions: `error-fg` text + `error-bg`, and explicit confirmation. **Money CTA** uses primary treatment with *lock/check* icon and explicit verb `Confirm and pay 3.015,75 €`; an orange button **alone** must never initiate payment from the page. Disabled: `neutral-bg`/`neutral-fg`, no pointer and `aria-disabled`. Busy: spinner + immutable verb `Sending payouts…`; prevent double submission.

### Fields and forms
Input, select, date: 44px min height; textarea on New job: minimum **190px**, 14/22 text, internal 16px padding. Border 1px `line-strong`, background white, radius 10px; focus 2px solid `focus-ring` with 2px offset. Label 12px/700 above field, helper 12px secondary below. Errors: `error-line` border + icon and human-readable error text (never only color). Autosuggest structure editable in an explicit review step; no silent overwrite.

### Status pills (single semantic ladder)
Pill: height 26px, horizontal padding 9px, radius 9999px, 11px/800, dot 6px. Every pill contains text; dot optional.

| Entity | State / exact UI label | Severity token |
|---|---|---|
| Job | Planning | neutral |
| Job | Crew confirmed | info |
| Job | In progress | warning |
| Job | Done · to pay | warning |
| Job | Paid | success |
| Invitation | Not sent / Awaiting response | neutral / info |
| Invitation | Accepted | success |
| Invitation | Declined | error |
| Schedule | Conflict / Rest violation | error |
| Timesheet | Needs review (>15m) | warning |
| Payout item | Pending | info |
| Payout item | Paid (PayPal `SUCCESS`) | success |
| Payout item | Failed (PayPal `FAILED`) | error |
| Payout item | Unclaimed (`UNCLAIMED`) | warning |
| Payout item | On hold (`ONHOLD`) | warning |
| Payout item | Returned / Refunded / Blocked | error |
| Payout batch | Partially paid | warning |
| Payout batch | Completed | success |
| Data origin | Demo data | neutral |

Never encode `Failed` with persimmon; it is error red. A *job completed* is not equivalent to a *payout completed*. PayPal raw statuses should remain available in a detail tooltip/log; the UI names above are mapped explicitly.

### Cards / table / dividers
Cards: white on canvas, 1px `line` border, radius 16px, padding 20–24px; **no permanent shadow**. Selected card: accent 1px left inset/edge, `accent-soft` very faint highlight. Tables: header background `surface-alt`, 11px uppercase labels `ink-secondary`, vertical padding 12px; rows 58px with 1px bottom divider. Right align money and times; use tabular mono. Whole-row click only when semantics are obvious; keep visible overflow actions. Sort buttons must expose order (`aria-sort`). No zebra overload.

### Dialog / confirmation / payout safety
Backdrop `overlay`; dialog 560px for standard forms, **640px for Pay crew**, max-height `min(760px, calc(100dvh - 64px))` with internal scroll; header sticky, action footer sticky. Display job ID, included people, paid hours, rate & total, PayPal account mode, fee/currency disclaimer where applicable. **No automatic payment**; click primary only after an explicit review inside modal. Server uses stable `sender_batch_id` and per-item deduplication keys; retries target **only failed and confirmed-safe** items (not `PENDING`, `UNCLAIMED`, unknown). Double-click is prevented. On timeout: show **“Payment status unknown — check before retrying”** and poll status, never assume failure. API server holds credentials; never expose PayPal secrets to client.

### Toasts
Top-right desktop, bottom safe-area mobile; width 320–420px, min-height 52px; 1px semantic border + icon + verb-first text; `role=status`, error `role=alert`. Success 4s, informational 6s; payment-related failures **persistent until dismissed** and additionally written to Agent timeline.

### Navigation rail
220px warm off-white background, 1px right border, sticky `top:0`, height 100dvh. Top: mark 30px + `Shiftly` wordmark, y=28px. Vertical nav starts y=124px; items order **Jobs / Crew / Payroll / Settings**, each height 44px, gap 6px, icon 18px. Selected: white rectangular-pillow 10px radius, accent 3px vertical strip and black bold text (do **not** fill whole tab persimmon). Bottom: circle `FA`, company `Fieramente Allestimenti`, `Milano · Sandbox`; collapse to 76px icons+tooltips at <=1199px. Active page `aria-current=page`, keyboard navigation.

### Agent panel
320px wide on desktop in job detail, 300px at 1024; sticky `top:24px` inside its column (allow panel list to scroll if tall). White card with subtle left border, header `Agent` + small orange 6px activity dot, secondary line `Every action has a reason`. Chronological entries with slim vertical line, icon, timestamp, concise title and **one-sentence why** (max 140 chars before expansion), status, optional buttons `Review plan`, `Send requests`, `Review change`, `Review hours`, `Review payouts`. Shows agent proposals as drafts requiring operator approval for irreversible, externally sent, or financial operations. Never simulate agency by fabricating success. Append-only activity with event IDs.

## 06. Scheduler integration contract (Bryntum Scheduler 7.x)
**This is a CSS theme and component configuration, not a bespoke rewritten calendar.** Use Bryntum’s React wrapper with a light base theme (e.g. Svalbard light), default scheduling/drag features, and independent custom chrome surrounding it. Bryntum's 7.x themes use CSS custom properties and have changed selectors from older releases; inspect the installed version and target **that exact version**. Official docs: https://www.bryntum.com/products/scheduler/docs/ , https://bryntum.com/products/scheduler/docs-llm/guide/Scheduler/customization/styling.md .

Required functional configuration:
- Resource axis **people as rows**; left frozen name/role column **248px** at 1440 / **212px** at 1024. Resource row height **58px**; column/time headers together **64px**; calendar viewport **406px** minimum for 6 resources, or **464px** when 7+ resources.
- Timeline horizontally scrollable: hour tick **76px**, visible ~08:00–20:00 on 1440 via pan; zoom options `Hour / Day` with hour as default for 1–2-day jobs. Weekend/nonworking hours tinted `surface-alt`; no hard-coded “everyone off after 18:00” if a shift explicitly occurs then.
- Event height **34px**, radius **8px**, 2px role-colored left border, tinted role background, role foreground; label `08:00–17:00 · Installer` and status icon in bar. Suggested/planned shifts are outlined; accepted assigned shifts solid tonal. Declined invitations: dashed border + 60% opacity + strike-free readable label `Declined`, kept in the agent audit, **not** treated as live assignment. Conflicts: 2px solid `error-fg` border, exclamation icon and `Conflict` accessible label/tooltip; one cannot ship plan while hard conflicts exist. Selected event: neutral dark outline and keyboard focus ring, not an unrelated vibrant color.
- Drag/drop and resize show a ghost, candidate timing and constraints. Hard constraints (availability, qualifications, 11h rest): reject move and explain *why*; soft budget or overtime issue: warn + require review. Use Bryntum's validated change hooks / scheduling features for interaction logic, not CSS hacks. Read-only view on reconciled/paid jobs.
- Nonworking areas use Bryntum configuration/features for calendars/highlights; CSS only controls surface. Do not represent nonworking hours by inserting fake blocked events.

Scoped CSS (illustrative; confirm DOM/classes against pinned Bryntum release):
```css
.shiftly-scheduler {
  --b-sch-event-padding-inline: 8px;
  font-family: 'Manrope', sans-serif;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.shiftly-scheduler .b-sch-event {
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
}
.shiftly-scheduler .b-sch-event.role-installer {
  background: var(--role-installer-bg);
  border-inline-start: 2px solid var(--role-installer);
  color: var(--ink);
}
.shiftly-scheduler .b-sch-event.role-electrician {
  background: var(--role-electrician-bg);
  border-inline-start: 2px solid var(--role-electrician);
  color: var(--ink);
}
.shiftly-scheduler .b-sch-event.role-rigger {
  background: var(--role-rigger-bg);
  border-inline-start: 2px solid var(--role-rigger);
  color: var(--ink);
}
.shiftly-scheduler .b-sch-event.role-driver {
  background: var(--role-driver-bg);
  border-inline-start: 2px solid var(--role-driver);
  color: var(--ink);
}
.shiftly-scheduler .b-sch-event.declined {
  border: 1px dashed var(--error-fg);
  background: var(--error-bg);
  color: var(--error-fg);
}
.shiftly-scheduler .b-sch-event.conflict {
  border: 2px solid var(--error-fg);
}
.shiftly-scheduler .b-sch-event-wrap.b-selected .b-sch-event {
  outline: 2px solid var(--ink); outline-offset: 1px;
}
```
**Implementation detail:** renderData event classes attach to `.b-sch-event`; wrapper classes to `.b-sch-event-wrap` according to Bryntum's documented renderer contract. Define `role-*`, `conflict`, `declined` as explicit computed classes; never rely on user names or role strings for class names. Avoid overriding the entire Bryntum event DOM. For data-dense screens, browser font metrics and Bryntum's virtual grid should be visually smoke-tested.

## 07. Motion & accessible interaction
- Hover/pressed: `120ms` ease; drawer/dialog enter 180ms translateY(8px) + opacity, exit 120ms; reordering ghost 120ms; toast 260ms. Never animate money amount change as a slot machine. `prefers-reduced-motion: reduce` → 0ms transitions and no motion.
- Focus: **2px** persimmon border/ring with **2px offset** on all interactive elements; not only `:focus` on mouse, use `:focus-visible`. Keyboard: rail, tabs, event selection, dialog trap, Escape close when safe, focus returns to opener. Dialog payment in flight cannot be dismissed if it hides unresolved state; can navigate to a dedicated batch status page instead.
- Minimum click/touch target 40px (mobile primary controls 48px); text AA 4.5:1 normal, UI-boundary contrast 3:1; never convey state solely by hue. Scheduler drag alternatives: click event → accessible edit dialog with date/time fields; tooltip copy available to screen readers.

## 08. Microcopy tone
Calm, concrete, accountable. Short clauses; human-readable why; actionable next steps. Sentence case, no anthropomorphic puffery. Say **“6 people assigned. 1 availability check pending.”**, not “Magic! Your dream crew is ready!”. Say **“Giulia worked 30 min longer than planned. Review before paying.”** Say **“This action sends real PayPal payouts.”** Never promise “paid” until PayPal item status is `SUCCESS`. Error messages identify the obstacle and the safe recovery action.

## 09. Logo & favicon geometry
Use the included `assets/shiftly-mark.svg`, `assets/shiftly-wordmark.svg`, `assets/favicon.svg`. Mark: a 32×32 square coordinate system holding **three offset horizontal pill-bars** that move from upper-left to lower-right, evoking shifting crew assignments and handoffs. Bars are 16×5px at `(5,6)`, 22×5px at `(5,13.5)`, and 16×5px at `(11,21)` with `rx=2.5`; color `--accent` on white/transparent. In the wordmark, 32px mark + 8px gap + Manrope ExtraBold `Shiftly`, ink. Favicon: mark on 48×48 warm-white rounded 12px square. Never represent PayPal with an approximated logo; only use official permitted assets or a text label.

## 10. Tailwind/Next.js acceptance checklist
- Use CSS variables as the **source of truth**, with Tailwind arbitrary variable utilities e.g. `bg-[var(--surface)]`, `text-[var(--ink)]`, `border-[var(--line)]`; alternatively extend theme aliases once. No duplicate hard-coded hex values in React components.
- App Router: operator routes `/jobs`, `/jobs/new`, `/jobs/[id]`, `/jobs/[id]/hours`, `/crew`, `/payroll`, `/settings`; public tokenized `/confirm/[token]`; dialogs are route-owned overlays, not duplicate pages.
- `Pay crew` only enabled once timesheets reviewed, recipients valid, amount > 0, no active batch already exists for same scope, server permission verified. Server-only PayPal sandbox config clearly badged.
- Use an immutable payout preview snapshot for the confirmation. If amounts change before submit, invalidate preview and require re-review; no payment until operator presses final CTA.
- Run contrast automated checks; test at 1440×900 and 1024×768, zoom 200%, keyboard-only, network latency, lost webhook, failed partial payout, touch/mobile public confirmation.

### References and implementation boundaries
Bryntum Scheduler documentation: https://www.bryntum.com/products/scheduler/docs/ and current styling https://bryntum.com/products/scheduler/docs-llm/guide/Scheduler/customization/styling.md . PayPal Payouts item status definitions: https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/transaction_enum/ . PayPal Payouts webhooks: https://developer.paypal.com/payouts/webhooks/ . **PayPal batch webhooks do not contain individual payout-item details**; follow up via PayPal's item/batch-detail API links. These are implementation notes; no sandbox-only view should masquerade as real money paid.
