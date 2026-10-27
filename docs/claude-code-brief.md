# Shiftly — build brief for Claude Code

> Paste this as the first message of a Claude Code session opened in `~/Progetti/shiftly`. Work one milestone at a time, stop after each and wait for my OK.

## What we are building

**Shiftly** — "Book the crew. Run the job. Pay everyone the same day."

A web app for a small operator who runs on-call crews (event setups, catering, removals). An AI agent plans shifts on a **Bryntum Scheduler**, collects availability, reconciles planned vs actual hours, computes pay, and pays freelancers through **PayPal Payouts** (sandbox) after explicit human approval. Entry for the PayPal AI Hackathon 2026 (targets: Best Use of Agentic Commerce / Most Impactful + Bryntum sponsor prize + APIMatic prize + Render).

Read the design handoff in `docs/design/` before writing any UI: `design-system.md` (tokens, type, components, Bryntum theming contract), `screens.md` (layouts and states per screen), `mockups/*.png`, and `assets/*.svg` (mark, wordmark, favicon). Follow it. The light theme there is the only theme. Keep the app's own data model and seed data; the handoff's demo figures are layout references only.

## Hard rules

1. **Never read, print, cat, or commit `.env.local`.** It already exists with: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODELS`, `SHIFTLY_CRON_SECRET`, `SHIFTLY_PAYOUT_RECIPIENTS` (3 sandbox Personal emails, comma-separated). Reference variables by name only. Add `DATABASE_URL` and `PAYPAL_WEBHOOK_ID` yourself when needed, by telling me what to add.
2. **Never `git push`.** Commit locally with clear messages; I push.
3. PayPal host hard-coded to `https://api-m.sandbox.paypal.com`. This app must never be able to touch live money.
4. No Anthropic API in the app. AI = OpenAI with structured JSON output (model from `OPENAI_MODELS`).
5. No `npm audit fix --force`. No paid services beyond what exists.
6. Money moves only after a human clicks a confirm dialog that shows the total. The agent may do everything reversible on its own.
7. Money stored as integer cents. Every state change written to an `ActivityLog` with actor (`operator` | `agent` | `paypal`).
8. No code copied from Quotely except the generic PayPal auth/webhook-verify helpers and the design tokens. Different domain, different schema, different flows.
9. Install the **APIMatic PayPal Context Plugin** before writing PayPal code: `npx context-plugins install paypal` (verify the command on https://context.apimatic.io/#catalog if it fails). Use it for SDK/API lookups and mention in README that it was used. If the plugin does not cover Payouts, use REST directly and say so.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind 4, Prisma + PostgreSQL (Render), `@paypal/paypal-server-sdk` where it covers the API, plain `fetch` for Payouts.
- **Bryntum Scheduler trial** (45-day trial, public npm):
  ```
  npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial @bryntum/scheduler-react
  ```
  (`@bryntum/scheduler-react` imports from `@bryntum/scheduler`, hence the alias; current version 7.3.x.) Render it in a client component (`'use client'`) loaded with `next/dynamic({ ssr: false })`. CSS: `@bryntum/scheduler/scheduler.css` + the Svalbard light theme, imported once in the scheduler component and themed per `docs/design/design-system.md` §06.
- OpenAI: three structured tasks — (a) extract job requirements from free text, (b) propose assignments given candidates + constraints (hard constraints checked by deterministic code, never trusted to the model), (c) write availability requests and explanations.

## Milestone 0 — Payouts gate (do this first, nothing else)

Goal: prove Payouts works in sandbox before any product code exists.

1. `scripts/payouts-smoke.ts`: OAuth client-credentials, then `POST /v1/payments/payouts` with `sender_batch_header.sender_batch_id = "smoke-" + timestamp`, `email_subject`, 3 items (`recipient_type: EMAIL`, `amount: { value: "1.00", currency: "EUR" }`, `note`, `sender_item_id`) to the emails in `SHIFTLY_PAYOUT_RECIPIENTS`. Then poll `GET /v1/payments/payouts/{batch_id}` until `batch_status` is `SUCCESS` or an item is `FAILED`/`UNCLAIMED`/`RETURNED`, printing item statuses. Max 60 s.
2. Run it with `npx tsx --env-file=.env.local scripts/payouts-smoke.ts`. Report the full status output (batch and items). Do not retry blindly: if the API returns an error, show it to me and stop.

**Stop here and wait.** If this works we continue; if Payouts is blocked in this sandbox, we switch project (plan B is a different app, I will give a new brief).

## Milestone 1 — Schema, seed, shell

Prisma schema:

- `Worker` (name, role enum: MONTATORE | ELETTRICISTA | RIGGER | AUTISTA, hourlyRateCents, paypalEmail, phone, reliability 0-100, notes)
- `Job` (title, client, site, startsAt, endsAt, status enum: PLANNING | CREW_CONFIRMED | IN_PROGRESS | DONE | PAID, budgetCents, requirementsText, requirements JSON)
- `Shift` (jobId, startsAt, endsAt, role, headcount, notes)
- `Assignment` (shiftId, workerId, status enum: PROPOSED | SENT | CONFIRMED | DECLINED, plannedMinutes, actualMinutes nullable, reason text, token for the confirm link)
- `Availability` (workerId, date, available bool)
- `PayoutBatch` (jobId, senderBatchId unique, paypalBatchId, status, totalCents, createdBy, approvedAt)
- `PayoutItem` (batchId, workerId, amountCents, senderItemId unique, paypalItemId, status, errorMessage)
- `ActivityLog` (jobId nullable, actor, type, message, data JSON, createdAt)
- `Settings` (single row: companyName, overtimeAfterMinutes=480, overtimeMultiplier=1.25, minRestHours=11)

Seed: company **Fieramente Allestimenti** (Milan). 10 workers; the first 3 use the emails from `SHIFTLY_PAYOUT_RECIPIENTS` (read at seed time), the others fake `@example.com`. Jobs: one DONE and PAID last month (with a real-looking PayoutBatch history), one IN_PROGRESS this week, and none for the demo (the demo creates "Montaggio stand fiera, Rho" live).

Shell: left rail + pages Jobs (list), Crew (table), Payroll (batches), Settings. Read-only. Empty states designed.

## Milestone 2 — Planning agent + Scheduler

- "New job" page: textarea for the description → OpenAI extracts `{title, client, site, dates, shifts:[{day, start, end, role, headcount}]}` → preview and save.
- "Plan with AI" on a job: deterministic candidate filter (role match, availability, no overlap, rest ≥ `minRestHours`, worker reliability) → OpenAI picks among valid candidates and writes a one-sentence reason per assignment → assignments saved as PROPOSED.
- Job detail: Bryntum Scheduler with workers as resources, assignments as events (colour by role, label role · hours), drag & drop updates the assignment (server action), conflicts flagged by the same deterministic checker and shown per the design doc. Agent panel on the right with the plan explanation and a "Send availability requests" button.

## Milestone 3 — Engagement and rebalancing

- "Send requests": assignments → SENT, each gets a public confirm page `/confirm/[token]` with Accept / Decline (no real email; the demo opens the link). Log it.
- On DECLINED: the agent reruns planning for that shift only, proposes a replacement with reason, marks it PROPOSED, logs "rebalanced". When all CONFIRMED → job CREW_CONFIRMED.
- Simulated clock: a "Start job" button moves to IN_PROGRESS; "Close shifts" opens the hours sheet.

## Milestone 4 — Hours, pay, Payouts

- Hours sheet: per assignment, planned vs actual minutes (prefilled with planned, editable). Reconciliation agent flags deltas > 15 min with a note; operator confirms.
- Pay computation (pure function, unit-tested): minutes × rate, overtime after `overtimeAfterMinutes` at `overtimeMultiplier`, rounded to cents. Per-worker total across the job's shifts.
- "Pay crew" → confirmation dialog (names, amounts, total) → creates `PayoutBatch` with `senderBatchId = "job-{id}-{n}"` and items `senderItemId = "job-{id}-worker-{id}-{n}"`, calls Payouts, stores `paypalBatchId`.
- Idempotency: a second click while a batch is in flight reuses it; a worker already in a SUCCESS item for that job is never paid twice.
- Status: webhook `POST /api/paypal/webhook` (verify signature via `/v1/notifications/verify-webhook-signature`, events `PAYMENT.PAYOUTSBATCH.SUCCESS|DENIED|PROCESSING`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|BLOCKED|UNCLAIMED|RETURNED|REFUNDED|CANCELED`) and `POST /api/paypal/reconcile` (header `x-cron-secret` = `SHIFTLY_CRON_SECRET`) that re-fetches the batch. Both converge on the same idempotent `applyBatchStatus`. The job page polls reconcile every 20 s while a batch is open. Job → PAID when all items SUCCESS.
- Payroll page: batches, items with pill states, per-worker history, "Retry failed" (creates a new batch only for FAILED items).

## Milestone 5 — Polish, deploy

- README (what, how, stack, PayPal flows, Bryntum notes, APIMatic plugin usage, known theming substitutions, how to run), MIT `LICENSE` is already there.
- Error and empty states, loading skeletons, keyboard focus.
- `render.yaml` (web service + Postgres), build command includes `prisma migrate deploy`, seed command documented.
- Tell me the exact env vars to set on Render and the webhook URL to register in the PayPal developer dashboard.

## Definition of done per milestone

`npm run build` clean, `npm run lint` clean, no TypeScript errors, a short note of what was built and what to check in the browser.
