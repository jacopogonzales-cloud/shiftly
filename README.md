# Shiftly

**Book the crew. Run the job. Pay everyone the same day.**

Shiftly is a workspace for a small operator who runs on-call crews: event stand builds, stage rigging, catering, removals. An AI agent turns a free-text brief into shifts, plans who works when on a **Bryntum Scheduler**, collects availability from freelancers on their phones, re-plans when someone declines, reconciles planned against actual hours, and computes pay. After the operator approves the total, it pays everyone through **PayPal Payouts** (Sandbox).

Built for the PayPal AI Hackathon 2026. MIT licensed.

---

## The flow

| Step | Screen | Who acts |
|---|---|---|
| 1. Describe the job in plain words | `/jobs/new` | Operator writes, agent extracts dates, shifts, roles, client, budget |
| 2. Plan the crew | `/jobs/[id]` (Scheduler) | Agent proposes people; operator can drag shifts between people |
| 3. Send availability requests | Job page → Invitations | Operator sends; each person gets one signed link |
| 4. Accept or decline | `/confirm/[token]` (public, mobile) | Freelancer |
| 5. Rebalance a decline | Job page → Agent panel | Agent proposes a replacement; operator sends it |
| 6. Start the job, close shifts | `/jobs/[id]/hours` | Operator enters actual hours; agent flags differences over 15 min |
| 7. Pay the crew | Job page → Pay crew dialog | Operator confirms the total; PayPal Payouts sends it |
| 8. Track payouts | `/payroll` | PayPal reports item states; operator retries failures |

Job lifecycle: `Planning → Crew confirmed → In progress → Done · to pay → Paid`.

---

## The agent: what it decides, and what it can't do on its own

The agent uses OpenAI with structured JSON output (strict schemas) for three tasks:

1. **Extract a job** from a brief: title, client, site, budget, shift lines (date, times, unpaid break, role, headcount) and the assumptions it had to make. The output is always a complete, editable English draft; nothing is saved until the operator confirms it.
2. **Propose assignments** given eligible candidates. The model ranks; it doesn't get the final say:
   - Hard constraints are checked by deterministic code (`src/lib/planning/constraints.ts`, `allocate.ts`): role match, marked availability, no overlapping shifts, minimum rest between working days (11 h by default).
   - Every pick from the model is re-checked against existing bookings and earlier picks in the same run. Rejected picks fall back to a fixed ranking: continuity on the job, then marked available, then reliability, then rate.
   - Slots nobody can fill are reported as open gaps, never invented.
3. **Write the words**: availability requests and one-line reasons for each choice.

If the AI service is down:
- planning falls back to rule-based ranking and the Agent panel says it ranked by rules only;
- invitation messages fall back to a template;
- extracting a brief shows an error, and nothing is saved.

**Rebalancing.** When a freelancer declines, only that person's shifts are re-planned, after their answer is saved. The decliner is never offered the same shift again. The replacement is logged ("Luca declined Sat 14 Nov. Paolo takes over: …") and stays **Proposed, not sent** until the operator sends it.

**Hours.** Actual paid time is entered in 15-minute steps. Differences of more than 15 minutes (exactly 15 is fine) are flagged with a note. If the change pushes the day past the overtime threshold, the note says so. Approval needs every flag marked reviewed.

**Pay.** `src/lib/pay.ts` is pure and integer-only:
- approved minutes × hourly rate, with overtime counted per **working day**, so a split 08:00–12:30 + 13:30–18:00 day is one 9-hour day;
- overtime is paid at 1.25× after 8 paid hours;
- each day is rounded to the cent, and the per-person total is the sum of their days.

### Guardrails

- **A human approves before money moves.** The Pay crew dialog lists every recipient and the total. Only the final *Confirm and pay* click sends anything. The server recomputes the amounts and refuses if the total differs from the one the operator saw.
- **Sandbox only.** The PayPal host is hard-coded to `https://api-m.sandbox.paypal.com`; no setting can point it at live money.
- **Idempotent batches.** One click can never become two payouts (details below).
- **Nobody is paid twice for a job.** This covers anyone with a `SUCCESS` item, and anyone whose money may still arrive: pending, on hold or unclaimed.
- **Everything is audited.** Every state change writes an `ActivityLog` row with an actor (`operator`, `agent`, `paypal` or `crew`), shown in the job's Agent panel.
- **Money is integer cents.** Durations are integer minutes.
- **Invitation links are signed.** They use HMAC-SHA256, are scoped to one person and one job, and expire when that person's first shift starts. An invalid link shows a neutral page that leaks no names.

---

## PayPal Payouts

Payouts isn't covered by `@paypal/paypal-server-sdk`, so Shiftly calls the REST API with `fetch` (`src/lib/paypal/client.ts`). It uses OAuth client credentials with a cached token and a 20 s timeout. Errors fall into two kinds:
- **PayPal refused:** the request was definitely not carried out.
- **Unknown outcome:** network error, timeout or 5xx.

### Flows

**Pay crew** (`approvePayout`)
1. Load approved hours for the Done job and compute one line per person (`payLines`).
2. `planPayout` decides what to do:
   - **reuse:** a batch for this job is still in flight;
   - **nothing:** everyone is already paid or covered;
   - **create** the next attempt.
3. Save a `PayoutBatch` with `senderBatchId = job-{jobId}-{n}` and one `PayoutItem` per person with `senderItemId = job-{jobId}-worker-{workerId}-{n}`. Then log `payout.approved` (operator).
4. `POST /v1/payments/payouts` with header `PayPal-Request-Id = senderBatchId`. Store `paypalBatchId`, then fetch the batch to record per-item ids and states.

**Retry failed** (`retryFailed`, from Payroll)
- Re-fetch the batch from PayPal first.
- Take only the items PayPal still reports as `FAILED`, at their approved amounts.
- Create a new attempt linked to the original (`retryOfId`), so the failure stays visible in history.
- Pending and unclaimed items are never retried.

**Unknown outcome**
- The batch stays `DRAFT` and the UI says *"We couldn't verify the payout response. Don't send again yet."*
- *Check payout status* re-sends the same batch with the same `PayPal-Request-Id` and sender ids, so PayPal returns the original answer instead of paying twice.

**PayPal refused** (validation, insufficient funds, credentials)
- The batch is marked `REJECTED` with PayPal's message and "No money moved".
- *Pay crew* can then start a fresh attempt.

**Double clicks**
- The UI disables the button.
- If two requests still race, the unique `senderBatchId` makes the second insert fail, and that request reuses the first batch.

### Status: webhook and reconcile end in the same function

```
PayPal webhook ──► POST /api/paypal/webhook ──► verify signature ──┐
                                                                   ├─► refreshBatch ─► GET /v1/payments/payouts/{id} ─► applyBatchStatus
cron / job page ─► POST /api/paypal/reconcile (x-cron-secret) ─────┘
```

- **Webhook** `POST /api/paypal/webhook`:
  - verifies each delivery with `POST /v1/notifications/verify-webhook-signature` using `PAYPAL_WEBHOOK_ID`;
  - handles `PAYMENT.PAYOUTSBATCH.SUCCESS|DENIED|PROCESSING` and `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|BLOCKED|UNCLAIMED|RETURNED|REFUNDED|CANCELED`;
  - takes only the batch id from the event, then re-fetches the batch, so repeated or out-of-order deliveries can't apply a stale state;
  - answers `503` until `PAYPAL_WEBHOOK_ID` is set.
- **Reconcile** `POST /api/paypal/reconcile`:
  - requires header `x-cron-secret: $SHIFTLY_CRON_SECRET`;
  - re-fetches every batch still in flight; the optional body `{ "jobId": 4 }` or `{ "batchId": 2 }` narrows it.
- **Job page:** while a batch is open, it polls every 20 s through a server action that runs the same reconcile code. The browser never sees the cron secret.
- **`applyBatchStatus`** (`src/lib/payouts/service.ts`):
  - locks the batch row (`SELECT … FOR UPDATE`) and merges PayPal's snapshot through the pure `mergeSnapshot`;
  - statuses only move forward, and an older snapshot can't undo progress;
  - writes a log entry only when something changed, so applying the same snapshot twice is a no-op;
  - moves the job `Done → Paid` once every person with approved pay has a `SUCCESS` item.

### Statuses

| PayPal `transaction_status` | Shown as | Notes |
|---|---|---|
| `SUCCESS` | Paid | The only state counted as paid |
| `NEW`, `PENDING`, `PROCESSING` | Pending | Polled until final |
| `ONHOLD` | On hold | PayPal review; not retried |
| `UNCLAIMED` | Unclaimed | Recipient has no PayPal account yet. PayPal emails a sign-up link and returns the money after 30 days. Never re-sent |
| `FAILED` | Failed | The only state *Retry failed* acts on |
| `RETURNED`, `REFUNDED`, `BLOCKED`, `CANCELED` | Returned, Refunded, Blocked, Canceled | Final |
| `DRAFT` *(Shiftly)* | Not sent | Saved, PayPal's answer not confirmed yet |
| `REJECTED` *(Shiftly)* | Rejected | PayPal refused the request; no money moved |

A batch's label (Completed, Partially paid, Processing, Needs attention) is computed from its items, never from `batch_status` alone. Hovering a pill shows PayPal's raw status.

`npm run payouts:smoke` (`scripts/payouts-smoke.ts`) is the original Sandbox gate. It sends 3 × 1,00 € to `SHIFTLY_PAYOUT_RECIPIENTS` and polls until the batch settles.

---

## Bryntum Scheduler

- **Package:** the trial 7.3.7, installed as `@bryntum/scheduler@npm:@bryntum/scheduler-trial`.
- **Kept out of the bundler:** bundling Bryntum's 4.6 MB module pushed `next build` past 8 GB of memory on Render.
  - `scripts/vendor-bryntum.mjs` runs before `dev` and `build`. It copies the prebuilt `scheduler.module.js`, `scheduler.css`, `svalbard-light.css` and the Font Awesome files into `public/vendor/bryntum/` (gitignored).
  - `bryntum.ts` loads them in the browser: the module through `import(/* webpackIgnore: true */ url)`, the CSS as `<link>`s placed before the app's own styles. Only Bryntum's TypeScript types are imported at build time.
  - Result: the production build peaks at about 1.3 GB for the whole process tree, down from 1.9 GB, and compiles in about 2 s instead of 45 s.
- **Rendering:** `scheduler-view.tsx` creates a `Scheduler` once the module has loaded, then pushes data, zoom, height and the read-only state through Bryntum's runtime API (`eventStore.data`, `viewPreset`, `setTimeSpan`, …). The React wrapper isn't used, because it imports `@bryntum/scheduler` statically and would pull it back into the bundle. A skeleton shows while Bryntum loads; if it fails to load, the card says *Couldn't load schedule.* with a Retry button.
- **Layout:** people are rows (58 px), with a frozen 248 px name/role column. Hour view uses 76 px ticks; Day view is the other zoom.
- **Time ranges:** nights are tinted with `timeRanges`, plus a `Now` line.
- **Events:** `eventRenderer` adds computed classes: `role-installer|electrician|rigger|driver`, `status-proposed|sent|confirmed|declined`, `declined` and `conflict`. The label shows the time window and role, plus a status icon.
- **Drag & drop:** drag only reassigns a shift to another person, with `constrainDragToTimeSlot`. Before the drop is final, the browser runs the same constraint checker as the server (`checkAssignment`) and rejects the move with the exact reason, e.g. *"Giulia needs 11 hours of rest between working days (only 9h)"*. The server checks again before saving.
- **Locking:** the schedule is read-only once the job starts.
- **Disabled features:** editing, resizing, drag-create, context menus and sorting are off. Shift times come from the job, not from the grid.
- **Theme:** `svalbard-light.css` plus `scheduler-theme.css`, scoped to `.shiftly-scheduler`. It uses only Bryntum 7's documented CSS custom properties (`--b-grid-*`, `--b-sch-event-*`, `--b-primary`, …) and public classes, mapped to Shiftly's tokens.

**Differences from `docs/design/design-system.md` §06:**
- The frozen people column stays 248 px at 1024 (spec: 212 px). The timeline scrolls horizontally instead.
- No `Today` button and no settings icon in the toolbar. Day chips (one per job day) jump to each day instead.
- Resizing shifts is disabled; times are edited on the job, not by dragging bar edges.
- Font Awesome (shipped with Bryntum) is loaded for Bryntum's own icons. Shiftly's UI uses Lucide.
- The `Now` marker uses Bryntum's built-in current-time line.

---

## APIMatic PayPal Context Plugin

The APIMatic Context Plugin for PayPal was installed during development (`npx context-plugins install paypal`, v0.4.1). It gives the coding agent PayPal SDK skills: setup, auth, endpoints, errors, models and testing for TypeScript, Python and .NET.

It was used to check what `@paypal/paypal-server-sdk` covers. Its TypeScript SDK map documents Orders but **not Payouts**, so following the brief, Payouts, OAuth and webhook verification are plain REST calls in `src/lib/paypal/client.ts`.

---

## Stack

- **Next.js 16** (App Router, Cache Components, Turbopack), React 19, TypeScript, **Tailwind CSS 4**
- **Prisma 7** with `@prisma/adapter-pg` on **PostgreSQL** (Render)
- **Bryntum Scheduler** 7.3 trial, loaded at runtime from `public/vendor/bryntum`
- **OpenAI** Chat Completions with JSON Schema output (`OPENAI_MODELS`: first = preferred, the rest are fallbacks)
- **PayPal Payouts** REST, Sandbox
- Fonts Manrope and IBM Plex Mono (`next/font`); icons Lucide
- Tests: Node's built-in test runner via `tsx`

---

## Run locally

Prerequisites: Node 22+ and a PostgreSQL database (local, or the Render external URL).

```bash
cp .env.example .env.local        # fill in the values (names below)
npm ci --ignore-scripts           # see note on the Bryntum trial below
npx prisma generate
npm run db:deploy                 # apply migrations
npm run db:seed                   # demo company, crew and two jobs
npm run dev                       # http://localhost:3000
```

The Bryntum trial package ships an obfuscated `postinstall` script that the app doesn't need. Installing with `--ignore-scripts` skips it, which is also what the Render build does. Prisma's client is generated by `npx prisma generate` (and again by `npm run build`). `npm run dev` and `npm run build` first copy Bryntum's browser files into `public/vendor/bryntum/`.

### Environment variables

Names only; see `.env.example`.

| Name | Used for |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | PayPal REST app credentials (Sandbox) |
| `PAYPAL_WEBHOOK_ID` | Webhook signature verification; optional until the webhook is registered |
| `OPENAI_API_KEY` | OpenAI API |
| `OPENAI_MODELS` | Comma-separated model ids, first = preferred |
| `SHIFTLY_CRON_SECRET` | `x-cron-secret` for `/api/paypal/reconcile`; also derives the invitation-link signing key |
| `SHIFTLY_PAYOUT_RECIPIENTS` | Seed and smoke test only: 3 Sandbox Personal account emails |

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build (runs `prisma generate`), production server |
| `npm test` | Unit tests |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run db:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | Wipes all tables and seeds the demo |
| `npm run db:reset-demo` | Applies pending migrations, then reseeds: back to the two seeded jobs; the next job created is J-0003 |
| `npm run payouts:smoke` | Sandbox Payouts gate (3 × 1,00 €) |

### Seed

The seed creates:
- **The company:** Fieramente Allestimenti, Milan.
- **14 freelancers:** 7 installers, 3 electricians, 2 riggers and 2 drivers, with availability around today.
- **Two jobs**, with dates relative to today:
  - **J-0001**, *Autumn convention build*: Paid last month, with a payout batch marked **Demo data** (never sent to PayPal);
  - **J-0002**, *Concert stage build*: In progress this week.

The three emails in `SHIFTLY_PAYOUT_RECIPIENTS` go to Elena Gallo, Sara Ricci and Paolo Ferrari. Everyone else has an `@example.com` address, so a demo payout shows real `SUCCESS` items next to `UNCLAIMED` ones. `npm run db:reset-demo` wipes everything else, including jobs created during a demo and their payout records.

### Tests

`npm test` runs the unit tests in `src/**/*.test.ts`:
- **pay:** day overtime, rounding, and the design's reference crew (3.015,75 €);
- **planning:** constraints, allocation and rebalancing;
- **hours:** the 15-minute rule and the overtime note;
- **payout logic:** reuse while in flight, never paying anyone twice, attempt numbering, retry subset, idempotent and monotonic snapshot merge, and the Paid rule;
- **formatting** and the database TLS config.

---

## Deploy (Render)

`render.yaml` defines one Node web service in Frankfurt:
- **Build:** `npm ci --ignore-scripts && npx prisma migrate deploy && npm run build`
- **Start:** `npm start`
- **Seed:** never runs on deploy. Reseed on purpose with `npm run db:reset-demo` from a machine whose `DATABASE_URL` points at the Render database.

On Render, set:
- `DATABASE_URL` to the database's **Internal** URL. The app connects without TLS to private hostnames like `dpg-…-a`, and with verified TLS to external URLs.
- `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODELS`, `SHIFTLY_CRON_SECRET`.
- `PAYPAL_WEBHOOK_ID` once the webhook is registered at `https://<service>.onrender.com/api/paypal/webhook`.

---

## Project layout

```
src/app/(operator)/          operator workspace: jobs, job detail, hours, crew, payroll, settings
src/app/confirm/[token]/     public, mobile invitation page
src/app/api/paypal/          webhook + reconcile routes
src/lib/planning/            constraints, allocation, planner (OpenAI + deterministic checks)
src/lib/payouts/             logic.ts (pure), service.ts (DB + PayPal), view.ts
src/lib/paypal/client.ts     Sandbox REST client
src/lib/pay.ts, hours.ts     pay and hours rules (pure)
prisma/                      schema, migrations, seed
docs/                        build brief and design handoff
```

---

## Known gaps vs the design handoff

These are deliberate scope cuts for the hackathon:
- No sign-in.
- Crew and Settings are read-only: no add or edit forms, no PayPal *Test connection* button.
- Jobs: no Status dropdown or sort menu.
- Payroll: no Export CSV, status filter chips or search.
- Hours sheet: no Rate, Overtime or Pay columns, no per-row calculation panel, and unpaid breaks aren't editable. Pay appears on the job page and in the Pay crew dialog.
- Invitations aren't emailed: each person's signed link is opened or copied from the job page.
- Rebalancing proposes a single replacement; the operator approves by sending the new request rather than through a separate diff view.

## License

MIT, see `LICENSE`.
