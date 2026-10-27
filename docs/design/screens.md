# Shiftly — Screen Specifications v1.0
**Companion:** [design-system.md](./design-system.md) · **Theme:** light-only · **All product copy:** English · **Currency:** Italian locale EUR · **Operator timezone:** Europe/Rome

## 00. Shared architecture and deterministic demo data
### Global frame (1440×900)
- `220px` left rail, `1220px` workspace. Workspace top area `padding: 32px 40px 0`, main content width `1140px`; horizontal breathing room always consistent.
- Eyebrow (optional) at y≈40, `h1` at y≈62; 16–24px to contextual controls; 24–32px between major sections.
- Minimal top-right utility zone: small `Sandbox` label (neutral, not brand orange), help (?) icon 40px, profile avatar 36px. Never clutter with unused search, inbox, notifications or generic analytics.
- A common `Breadcrumb` for nested pages `Jobs / J-1042` using `ink-muted` + current `ink`, 12px/600. Primary actions top-right aligned to title.
- `1024px`: rail shrinks to **76px**, content becomes **900px** inside 24px margins. Turn 4-card grids into 2/2; preserve number legibility; allow horizontal scroll on structured tables and scheduler instead of squeezing.

### Fixed reference data set (do not randomly regenerate between screens)
Operator company: **Fieramente Allestimenti** · Milan, Italy · PayPal **Sandbox connected**.

Main job `J-1042`: **Rho Expo · Stand build** · Client **Orbis Expo** · **22–23 Oct 2026**, `08:00–17:00` (each day, 1h unpaid break) · **Fiera Milano Rho, Gate 7**. Status **Done · to pay** (after reconciliation). Budget **3.600,00 €** · planned labor cost **2.992,00 €** · approved actual payout **3.015,75 €** · difference vs plan **+23,75 €**, under budget **584,25 €**. Team six people; one earlier declined invitation is historical (not part of six). For demo, expected/payable hours are per the fixed two-day assignment; 30 extra minutes by Giulia on 22 Oct are overtime at 1.25× after 8 paid hours.

| Person | Role | Hourly | Planned paid hours | Approved actual | Payout |
|---|---|---:|---:|---:|---:|
| Marco Riva | Installer (`Montatore`) | 28,00 € | 16h | 16h | 448,00 € |
| Giulia Moretti | Electrician (`Elettricista`) | 38,00 € | 16h | 16h 30m | 631,75 € |
| Davide Conti | Rigger | 35,00 € | 16h | 16h | 560,00 € |
| Luca Ferri | Installer (`Montatore`) | 28,00 € | 16h | 16h | 448,00 € |
| Elisa Romano | Installer (`Montatore`) | 28,00 € | 16h | 16h | 448,00 € |
| Stefano Greco | Driver (`Autista`) | 30,00 € | 16h | 16h | 480,00 € |
| **Total** | | | **96h** | **96h 30m** | **3.015,75 €** |

For Giulia: planned `16 × 38 = 608,00 €`; 0.5h extra at overtime rate `38 × 1.25 = 47,50 €/h` adds **23,75 €**, therefore payable **631,75 €**. This avoids accidentally charging overtime for both days' ordinary 8-hour shifts. Hour editing should preserve each day's unpaid break; the operator can explain exceptions.

Additional jobs for list/screens:
| ID | Job | Date | Status | Crew | Budget | Forecast / final |
|---|---|---|---|---:|---:|---:|
| J-1045 | Milano Food Week · Service crew | 14–15 Nov 2026 | Planning | 4 / 8 requested | 4.800,00 € | 3.320,00 € |
| J-1044 | Triennale · Stage rigging | 06–07 Nov 2026 | Crew confirmed | 7 / 7 | 5.000,00 € | 4.240,00 € |
| J-1043 | Brera Gallery · Exhibition setup | 27–28 Oct 2026 | In progress | 5 / 5 | 3.100,00 € | 2.860,00 € |
| J-1042 | Rho Expo · Stand build | 22–23 Oct 2026 | Done · to pay | 6 / 6 | 3.600,00 € | 2.992,00 € planned |
| J-1041 | Palazzo Serbelloni · Event load-out | 12 Oct 2026 | Paid | 5 / 5 | 2.800,00 € | 2.410,00 € final |

*All records are seeded demo fixtures. They must remain deterministic during the hackathon video; do not represent sandbox state as real customer activity.*

Navigation: `Jobs`, `Crew`, `Payroll`, `Settings` (job creation is a Jobs child, hours is a job child, external confirmation has no authenticated shell). Route-sensible optimistic updates only for internal draft actions; invites and payouts reflect persisted server state.

---

## 01. Jobs — `/jobs` — mockup `mockups/01-jobs.png`
### Desktop 1440
- Header row: left `WORKSPACE` eyebrow (11px), title **Jobs** (30px), subtitle `Plan the work. Keep the crew moving.`; right **+ New job** primary 44px.
- Beneath at 24px: slim **overview strip**, 4 horizontally distributed metrics with NO heavy boxes: `5 Active & recent`, `2 Need attention`, `27 Crew assignments`, `3.015,75 € Ready to pay`. Distinguish with vertical hairlines, `number-lg` values. All counts derived from display demo, not presented as authoritative production analytics.
- Filter bar: 44px search input 320px `Search jobs, clients, locations…`, segmented `All | Upcoming | Awaiting payment | Paid`, optional `Status` dropdown, right `Sort: Most recent` menu. 20px gap to table.
- **Jobs table** white outlined card (1140px), columns: Job / Dates / Location / Crew / Status / Budget vs forecast / open-arrow. Header 44px, each row **76px** (job name + client secondary line). First row highlighted faintly by hover only, do not stack cards per row. Budget cell uses mono `3.600,00 € / 2.992,00 €`, tiny horizontal progress track 68px with orange fill showing forecast as proportion of budget; warning red if exceeds budget. Row click opens detail.
- Bottom-left `Showing 5 of 5 jobs`; bottom-right `Load more` if server has next page. Do not add fake pagination.
### 1024
- Rail 76px, workspace content width 900px. Overview metrics 2×2 with dividers. Hide client subline only when genuinely tight; prioritize name, status, dates, budget. Table minimum width 980px inside horizontal scroll container with sticky job-name column; `aria-label="Jobs table"`.
### States / interactions
- Empty zero jobs: icon mark on white, title `Your first job starts here`, copy `Describe the work and Shiftly will propose a crew plan.`, CTA `Create a job`.
- Empty search: `No jobs match these filters.` + `Clear filters`.
- Loading: **5 skeleton rows** with consistent column widths, shimmer optional 1.2s but reduced motion off.
- Error: inline table panel `Jobs couldn't load.` + **Retry**; old data may remain visible marked stale, not silently replaced.
- Success: after creation toast `Job created. Your plan is ready to review.` and new item at top.
- Interactions: change filters and sort without redirect; keyboard row activation; status pill is informative, not a button; `Done · to pay` row can show contextual `Review payouts` as secondary action.

## 02. New job — `/jobs/new`
### Desktop 1440
- Breadcrumb `Jobs / New job`. Header **Tell Shiftly about the job**, supportive copy `Write it like you would send it to your crew.`
- Two-column grid `minmax(0, 1fr) 420px`, gap **24px** (available 1140px → left **696px**, right **420px**).
- Left white card: eyebrow `01 / BRIEF`, label `Job description`, textarea minimum height **230px** with demo example:
  > Build a trade-show stand at Fiera Milano Rho, 14–15 November. We need 3 installers, 1 electrician and 1 rigger for 08:00–17:00, with a one-hour break. Client: Horizon Events. Budget 3.500 €.
  Bottom: helper `Shiftly never sends invitations before you approve the plan.` + primary `Generate plan` and quiet `Try an example`.
- Right card `02 / EXTRACTED DETAILS`: before parsing an empty state `Your structured job appears here.` After parsing, editable summary fields (Title `Horizon Events · Stand build`, Client `Horizon Events`, Venue `Fiera Milano Rho`, Dates `14–15 Nov 2026`, Shift `08:00–17:00, 1h break`, Team `3 installers · 1 electrician · 1 rigger`) with inline edit buttons 40px; chips for missing info `Needs confirmation`.
- After parsing, full-width under grid thin stepper `Brief → Review details → Review schedule`; primary `Confirm details & open planner` **only** after operator verifies.
### 1024
- Two columns 540/336px if brief short, otherwise stack right card below; no textarea under 350px wide. Buttons at form bottom, visible without scrolling when possible.
### States / interactions
- Initial: no generated content, example visible as placeholder with explicit `Try an example`; no AI hallucinated preview.
- Processing: skeleton key-value fields, spinner copy `Reading dates, roles and shift requirements…`, disable duplicate generation.
- Validation error: inline `We couldn't confirm the dates. Add a year or edit the extracted details.` Focus associated field.
- Service error: `Couldn't generate the plan.` + Retry; original brief preserved.
- Success: `Details captured. Review the plan before contacting crew.`; route to job detail in `Planning` with agent plan proposal.
- AI assumptions displayed as `Assumed: 1-hour unpaid break` or `Missing: electrician qualification`; never silently harden guess into constraint.

## 03. Job detail — `/jobs/J-1042` — HERO mockup `mockups/03-job-detail.png`
### Desktop 1440
1. **Top context y≈32–170**: breadcrumb `Jobs / J-1042`; title `Rho Expo · Stand build` (30px), right actions `Edit job` secondary and `Review payouts` primary only if status eligible. Below title, single-line details `22–23 Oct 2026 · Fiera Milano Rho, Gate 7 · Orbis Expo` and `Done · to pay` pill. Right-aligned compact money comparison `Budget 3.600,00 €` · `Planned 2.992,00 €` · `Approved 3.015,75 €`, with safe under-budget cue. Avoid huge KPI cards here; keep the schedule above the fold.
2. **Scheduler section y≈192–668**, full **1140px width**. Outside scheduler border, section title `Crew schedule` left, small `6 people · 12 assignments` right, toolbar `22 Oct | 23 Oct`, `Today`, `Hour / Day`, `• Roles` legend and 40px settings icon. Scheduler occupies `width:1140px;height:410–440px` and has internal horizontal timeline scroll. Left frozen resource width **248px**. Time header 64px; six rows **58px** each. Draw two calendar days if scrolled (date label above hour ticks). White grid, very light alternate nonworking bands, one vertical red `Now` marker only if actual today falls inside visible period. Each row shows initials avatar, full name, lowercase role, maybe mini availability icon. Role-color event bars show `08:00–17:00` (break deduced from details, don't mislabel as 9 paid hours); 34px height, radius 8px. One earlier declined *invitation* is shown as faint dashed historical ghost or in agent activity, never counted toward assigned crew.
3. **Below Scheduler y≈698**: two columns `minmax(0,1fr) 320px`, gap **24px** (available 1140px → left **796px**, right **320px**). Left `Shifts & hours` card with title, helper `Approved time is what payroll uses`, `Open full hours sheet` text action. Preview table: Name, Planned, Actual, Difference, Pay; six rows 52px; Giulia difference `+30m` warning. On cards below or a detail side row: `Aged requests` only if relevant, do not clutter.
4. Right **Agent** sticky log described in A, min 480px tall; title `Agent` + subline `Decisions you can trace`. Cards (reverse chronological for most recent on top): `23 Oct · 18:42 — Hours reconciled` / `Giulia worked 30 minutes beyond plan; her overtime adds 23,75 €.` / `Review hours`; `21 Oct · 14:18 — Crew rebalanced` / `Elisa replaced an unavailable installer, keeping all roles covered.` / `View change`; `20 Oct · 09:12 — Invitations confirmed` / `All 6 active crew members accepted their shifts.` / `View responses`; `20 Oct · 09:05 — Draft plan created` / `Matched qualifications and preserved at least 11 hours' rest.` / `View plan`. Next recommended action at top/bottom `Review payouts` or `Send invitations` when relevant.
### 1024
- Header wraps amount trio beneath title. Scheduler still full content width **900px**, frozen people column **212px**; time viewport shorter but **horizontally scrollable** with visible chevrons. Below: `minmax(0,1fr) 300px`, gap 16px (=584px table, 300px agent); preview table can hide Rate, retains Name/Actual/Pay and warning tooltip; full hours page remains accessible. Agent sticky only within viewport, with internal overflow.
### States / interactions
- No crew: scheduler empty-grid with `No shifts yet` and `Ask agent to build a plan`; agent card action `Generate plan`.
- Conflict: blocked resource bar, bright error edge + `!`, summary banner `2 conflicts need a decision.`; `Send requests` disabled until hard conflicts fixed. Clicking conflict opens details showing reason and compliant alternatives.
- Loading: preserve timeline geometry, pale skeleton bars/resources; no hopping row heights.
- Error: if scheduler fails, card `Couldn't load schedule.` + Retry; do not conceal hours or agent audit below. If agent unavailable, show `Agent is offline. You can still review the schedule.` and no fabricated entries.
- Success: accepted shift updates resource/event status and agent log. Rebalance proposal has diff preview `Removed Davide → Added Elisa`, approve/cancel; action records actor/timestamp/reason.
- Drag: ghost bar; on release validate credentials, availability, rest, overlaps; invalid changes revert with precise toast `Giulia needs 11 hours before the next shift.`; API persists before “Saved”. Paid/reconciled job locks drag and shows `Schedule locked after reconciliation.`

## 04. Public confirm — `/confirm/[signed-token]` — mobile mockup `mockups/04-confirm-mobile.png`
### Public, mobile 390×844
No sidebar, no access to other jobs, no crew list, no amount owed beyond this recipient's optional compensation summary. Warm canvas; top center wordmark at y≈32 and trust line `Shift invitation from Fieramente Allestimenti` (12px). Main card centered width **350px** (=viewport −40px), padding **24px**, radius **22px**, y≈132:
- Eyebrow `SHIFT INVITATION`, title **Milano Food Week · Service crew** (22px), status small `Awaiting your response` info.
- Event date block **Sat 14 – Sun 15 Nov 2026**, location `Porta Nuova, Milano`, shift `10:00–19:00` / `1h unpaid break`, role `Event crew`, contact `Fieramente Allestimenti`.
- Footer: safety copy `Please confirm by 18:00 on 10 Nov.` Large stacked primary `Accept shift` (48px), secondary bordered `Decline` (48px), gap 10px. Tapping decline opens optional reason select then final `Decline shift` to avoid accidental refusal; Accept submits directly once with disabled/progress state (no financial action).
- Bottom `Questions? Contact the operator` mail link. Minimal privacy note `This link is personal. Don't forward it.`
### Accepted / declined states
- Accepted: large green outline check, `You're confirmed`, `The operator has been notified.`, schedule summary remains visible; no action except `Add to calendar` if supported and `Contact operator`.
- Declined: red-outline icon, `You declined this shift`, `The operator will look for someone else.` Show support contact; not a dead-end page.
- Expired/invalid/reused token: neutral error page `This invitation link is no longer active.` + `Contact the operator`; do not leak names on invalid token. Revisit a valid answered token returns persisted decision without re-submission.
- Loading: header stays, 3 skeleton lines, disabled actions. Network error: preserve action and show `Couldn't send your answer. Try again.` + Retry, no duplicate toggles.
### 1024 (tablet public)
Center card at 440px max-width, do not scale to desktop shell.

## 05. Hours sheet — `/jobs/J-1042/hours`
### Desktop
- Breadcrumb `Jobs / J-1042 / Hours`; title `Approve hours` with status `1 needs review`, secondary `Back to schedule`; right primary `Approve hours` (disabled while unresolved).
- Summary strip: `Planned 96h`, `Actual 96h 30m`, `Difference +30m`, `Payable 3.015,75 €`.
- Full-width editable table with fixed first person column and 12 rows (one per person × day). Columns `Person`, `Date`, `Shift`, `Break`, `Planned paid`, `Actual paid` editable 15min step, `Delta`, `Rate`, `Overtime`, `Pay`, `Review`. Each row **62px**; alternate date/employee grouping with thin separators.
- Giulia on 22 Oct: `8h → 8h 30m`, `+30m`, warning mini-pill and agent note under row `30 minutes over plan. After 8 hours, overtime rate is 1.25×.` CTA `Mark reviewed` + optional explanation box, preserving audit before financial approval. 15 minutes **exactly** is not flagged; **over** 15 minutes is flagged.
- Calculation side panel if employee row open: breakdown `8h × 38,00 €` + `0.5h × 47,50 €`, total for day `327,75 €`.
### 1024
- Table horizontal min-width 1120px; sticky person column 180px, action bar sticky bottom (height 72px). Keep summary 2×2. Avoid tiny 10px cells.
### States / interactions
- Empty: `No completed shifts to review.` with `Back to job`; loading skeleton table; failed save uses inline row error + `Retry save`, does not mark reviewed; approved locks rows with `Request correction` flow.
- Operator can edit actual **paid** hours and breaks independently with confirmation on recalculation; change reopens review when variance >15m; unpaid break can be adjusted only with an explanation. `Approve hours` snapshots amounts and unlocks `Review payouts`.

## 06. Pay crew dialog — `/jobs/J-1042?dialog=pay` — mockup `mockups/06-pay-crew.png`
### Desktop modal
- Overlay over recognizable, dimmed **job detail** shell; dialog **640px** wide centered at x≈400; if viewport height 900, usable max-height 760px. Sticky heading: small lock/arrow icon, **Pay crew**, subtext `Rho Expo · Stand build · J-1042`, sandbox label `PayPal Sandbox`, close (40px).
- First row summary: `6 recipients` and `Approved hours · 96h 30m`, thin line; list **6 recipients**, row height **48px**, avatar initials, name + role, mono amount right (numbers in section 00). Optional truncated PayPal emails in expandable row; mask on screen share for video.
- Dominant footer divider; left label `TOTAL TO SEND` and `3.015,75 €` (mono 26px bold) right aligned; caption `Review recipient details before confirming. This will send PayPal Payouts.`
- **Two step action**: page-level `Review payouts` opens this dialog, then explicit final CTA **`Confirm and pay 3.015,75 €`** (48px). Secondary `Cancel` (44px). No silent payout on opening.
- For real-money production, replace Sandbox chip with unmissable `Live payments` warning and stronger operator acknowledgment checkbox; demo always shows Sandbox and does not falsely imply live transfers.
### In-progress and result
- After final click: freeze snapshot, disable close/submission when needed, title `Sending payouts…`, show batch ID when available; item statuses begin `Pending`. Use status polling/webhook updates; never front-run success.
- Partial result example **same main job**: Marco `Paid` 448,00; Giulia `Paid` 631,75; Davide `Pending` 560,00; Luca `Paid` 448,00; Elisa `Failed` 448,00; Stefano `Unclaimed` 480,00. Confirmed credited total **1.527,75 €**, remaining unresolved/failed **1.488,00 €**. This is a **separate state after submit**, not what initial dialog displays.
- Progress subtitle `3 of 6 paid · 1 pending · 1 failed · 1 unclaimed`. CTA `View payout batch`; `Retry failed` only shown inside Payroll after checking provider state, never blindly in a transient modal.
- Network unknown: `We couldn't verify the payout response. Don't send again yet.` + `Check payout status` (not `Retry payment`).
### 1024
Dialog still 640px wide within 1024; right amount column always aligned; overflow on internal list, sticky footer.
### States
- No PayPal connection: `Connect PayPal Sandbox to send payouts.` link Settings; no final CTA.
- Missing recipient address: inline error with person name and `Edit crew details` action; final CTA disabled.
- Zero/unapproved hours: `Approve hours before paying.` action goes Hours sheet.
- Success confirmed only after actual `SUCCESS` item statuses; status list and corresponding agent activity updated.

## 07. Payroll — `/payroll` — mockup `mockups/07-payroll.png`
### Desktop 1440
- Title **Payroll**, caption `Every payout, from approval to arrival.`; top action quiet `Export CSV` and (if useful) filter `All batches`.
- Top understated **money summary row**, split 3 segments: `Paid to crew 8.947,75 €` (historical+current demo), `Processing 560,00 €`, `Needs attention 928,00 €` (448 failed +480 unclaimed). Caption `Sandbox totals · demo data excluded from real balances`.
- Filter row status chips `All / Processing / Requires action / Completed`, search `Job, person or batch ID`; 20px to white table/card.
- **Batch cards or accordion list** each header height 78px: `Rho Expo · Stand build`, `BATCH-26023`, `23 Oct 2026`, `3/6 paid`, `1.527,75 € paid / 3.015,75 € total`, state `Partially paid`, chevron. Expanded by default for main batch: six person rows **52px**: initials/name, PayPal email masked, amount, status pill, info icon for raw provider code. `Retry failed` distinct **secondary danger-outline** placed only in expanded batch action row; confirmation before retry, with exact subset only (Elisa, 448€), checks terminal `FAILED` state first. Never retry Unclaimed or Pending.
- 2 historical batches: `Palazzo Serbelloni · Event load-out`, `BATCH-26012`, **Demo data** tag, status Completed, `2.410,00 € paid`; `Porta Nuova · Catering`, `BATCH-26003`, **Demo data**, status Completed, `5.010,00 € paid`. Sum of credited payouts: 1.527,75 + 2.410 + 5.010 = **8.947,75 €**.
- `View history` or click a person expands their payout history in right drawer width 420px with date, job, amount, PayPal transaction ID; maintains parent filter state.
### 1024
Header summary 3 equal columns, list/accordion fills 900px. Recipient rows may collapse email into a second line; keep amount/status/Retry legible, min 40px actions. Optional person drawer overlays list rather than pushing it to a cramped 480px.
### States / interactions
- Empty: `No payout batches yet.` + `Pay completed jobs from a job page.` (link Jobs, no deceptive `Pay now` action).
- Loading: three batch skeleton bars + six row skeletons; error `Couldn't load payroll history.` + Retry and any cached rows marked outdated.
- Paid: show status `Paid` only for `SUCCESS`. Pending continues until terminal, Unclaimed is separate, Failed red with safe retry link. Show raw state under details (`ONHOLD`, `RETURNED`, etc.) if applicable.
- Payment retries: a new retry record or explicitly linked payout attempt must be visible in history with the old failure, to preserve audit trail. Use idempotent provider-safe operations.

## 08. Crew — `/crew`
### Desktop
- Header **Crew** + `Your trusted people, ready for the next call.` right action `+ Add crew member` primary.
- Toolbar search name/skill/email, filters `Role`, `Availability`, `Reliability`, sort `Best match / Name / Rate`.
- Table width 1140px, header 44px and rows 68px: `Person`, `Role` (display translated English job-role label; original Italian role in edit form if desired), `Hourly rate`, `PayPal email`, `Reliability`, `Availability`, `More`. People from section 00. Demo emails `marco.riva@example.com`, `giulia.moretti@example.com`, etc. visibly marked fictional in seeded fixtures. Reliability: Marco 96, Giulia 99, Davide 91, Luca 93, Elisa 95, Stefano 89 (out of 100). Signal reliability with **text + bar**, not traffic-light badges; no implication of objective judgment without scoring explainer.
- Availability: `Available`, `On a job`, `Unavailable`, each as semantic label. Click row → slide-over 420px profile: qualifications, upcoming bookings, contact history, payout history (metadata only), editable rates.
### 1024
Hide email as column and place it under name in expanded row; never hide rate or availability. Search spans 320px.
### States / interactions
- Empty `Add the people you work with.` + `Add crew member`; zero filtered `No crew matches your filters.` + clear.
- Loading table skeleton; error `Couldn't load crew.` + Retry. New member form validates email (the Payouts recipient identifier must be verified), rate ≥0, role and qualifications. Success toast `Giulia added to your crew.`; do not call someone available without explicit availability data.

## 09. Settings — `/settings`
### Desktop
- Header **Settings**, subtitle `How your team plans work and pays people.` Left fixed anchors/tabs **Company / Rates / Rules / PayPal** (240px); right settings pane **minmax(0,1fr)**; gap 24px.
- **Company** card fields: Company name `Fieramente Allestimenti`, Base `Milano, Italy`, Currency `EUR` (read-only for existing batch commitments), Time zone `Europe/Rome`, contact email `operations@fieramente.example` (fixture, not deliverable address).
- **Rates** editable small table: Installer `28,00 €/h`, Electrician `38,00 €/h`, Rigger `35,00 €/h`, Driver `30,00 €/h`; per-person override explanatory text `Individual rates take priority over role defaults.` Save confirmation.
- **Rules** card: Overtime `After 8 paid hours in one day`, multiplier **1.25×**, Minimum rest **11h** between shifts; qualification match **Required**; hard rule label `Blocks conflicting assignments`; inform operators that legal correctness varies by contract/region and demo settings are not a legal/payroll compliance determination.
- **PayPal** card: connection badge `Sandbox connected`, masked merchant identifier, last checked timestamp, `Test connection`, `Disconnect sandbox` secondary danger action; note `Sandbox uses simulated transactions. No real money moves.` Do not place access token/secret in client.
- Bottom of each card sticky `Save changes` (44px) and `Cancel`; show unsaved changes guard.
### 1024
Left anchor strip width 180px, right ~696px; can put all sections as full-width stacked panels with in-page anchors if space constrained.
### States / interactions
- Initial sections load independently; failed PayPal connection panel should not blank Company settings. Save success `Settings saved. New plans will use the updated rules.` Existing approved/payout snapshots are immutable. Validation error shows exact field, e.g. `Minimum rest must be at least 0 hours.`; PayPal test `Connection failed. Retry` without showing secrets.

## 10. Shared state library and navigation
### Loading patterns
- Whole screen transition: preserve rail/header, show one skeleton matching content geometry (no spinner in empty blank workspace). Skeleton base `#EDEFEA`, highlight `#F6F7F3`, height congruent with finished rows/cards. Animated only when reduced motion is off.
- Every async user action: spinner within its original button while keeping button width, to prevent page jump; never optimistic `Paid`, `Accepted`, or `Sent` until persistence succeeds.
### Empty patterns
- Jobs: `Your first job starts here` → `Create a job`.
- Scheduler: `No shifts planned` → `Generate plan`.
- Agent: `No actions yet` → contextual instruction.
- Hours: `No completed shifts` → `Back to schedule`.
- Payroll: `No payout batches yet` → `View jobs`.
- Crew: `Add your first crew member` → `Add member`.
### Error / warning patterns
- Global network bar directly under header: `Connection lost. Changes will not be saved until you're online.` with **Retry**. Do not claim queued writes without implementing a durable queue.
- Partial API error is local to its card + **Retry**; preserve rest of page. Error must state whether action was saved, not saved, or **unknown**.
- Agent hard conflict: error label + contextual next action. Soft overtime flag: warning amber + explanation. Payment partial failure: persistent detail in Payroll and Agent log; toast only an additional notice.
- Critical money unknown state: freeze retries and provide `Check payout status`; require provider verification before any retry.
### Rail/navigation
- Rail items: Jobs (`calendar-days`), Crew (`users-round`), Payroll (`wallet-cards`), Settings (`settings-2`). Top brand opens Jobs; bottom company menu opens Settings/Sign out; indicator `Sandbox` persistent in bottom rail and on payout flows. Standard route transitions should not animate entire page more than 120ms.
- Keyboard: tab order follows visual order, `Esc` closes dialogs (unless in-flight payment should remain tracked), route changes announce `h1`, keyboard accessible Scheduler edit path.

## 11. State machines / acceptance scenarios
### Job lifecycle
`Planning → Crew confirmed → In progress → Done · to pay → Paid`. The last transition requires all included item payouts `SUCCESS` **or** an explicit documented business exception; a partial-paid job stays `Done · to pay` or displays a secondary `Partially paid` payout label. Do not mark Paid for batch processing or unclaimed funds. Can revert to Planning only through an audited reopening path.

### Invitation lifecycle
`Draft → Sent/Awaiting response → Accepted | Declined | Expired`; only current accepted assignment is counted. On Declined the agent proposes alternatives subject to hard constraints and **operator review before invitations sent**. Public token cryptographically signed, expiry and anti-replay enforced server-side.

### Timesheet lifecycle
`Draft → Needs review → Approved → Locked by payout`. Any approved edit invalidates unsubmitted payout preview; after submission, corrections require adjustment record rather than mutating sent amounts.

### Payout lifecycle
`Preview → Explicit operator confirmation → Submitted/Pending → Paid | Failed | Unclaimed | On hold | Returned/...`. Batch state computed from item states and amounts. API/webhook idempotence required. Batch vs item distinctions always visible.

### Five hackathon acceptance flows
1. Enter natural-language brief → editable extracted details → review AI plan in Bryntum; no invites sent yet.
2. Confirm invites → one freelancer declines on mobile → agent proposes qualified available replacement and explains choice → operator approves rebalance.
3. Operator adjusts Giulia's actual time +30m → agent highlights >15m → calculates overtime after 8 paid hours, shows **23,75 €** delta and asks for review.
4. `Review payouts` → modal shows 6 recipients and **3.015,75 €** → explicit final click → states visibly update, with partial errors.
5. Payroll contains a failed-only retry protected by provider check; historical batches have clear **Demo data** badges; no false claim of money sent in sandbox.

## 12. Implementation handoff and assets
Delivered previews are **pixel-precise visual references, not a replacement for Bryntum's actual DOM or PayPal API**. Build actual screens with React/Tailwind using A's tokens, and follow exact geometry/content priority/intent here. Use the `mockups/` image filenames, `assets/` SVGs and any included preview HTML for QA only.

**Acceptance metrics:** no clipped money or status at 1024px; targets ≥40px; contrast AA normal text; entire payout snapshot visible before send; `Retry failed` cannot hit Pending/Unclaimed; demo payout figures sum exactly and job record ties out; native Scheduler event rendering uses approved Bryntum APIs and CSS, not a custom table pretending to be Bryntum.
