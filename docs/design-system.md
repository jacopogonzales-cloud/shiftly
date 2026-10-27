# Shiftly design system

Shiftly is a sibling of Quotely: same dark "Obsidian" base, different accent (amber instead of lime), its own wordmark. Anyone seeing both should read them as products from the same hand, never as the same product.

## 1. Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0C0F` | page background |
| `--bg-1` | `#121419` | cards, panels |
| `--bg-2` | `#1A1D24` | hover rows, inputs |
| `--line` | `#262A33` | hairlines, borders |
| `--text` | `#EDEEF2` | primary text |
| `--text-2` | `#9AA0AD` | secondary text |
| `--text-3` | `#646A78` | hints, timestamps |
| `--accent` | `#F5B23D` | amber: primary actions, agent, highlights |
| `--accent-ink` | `#1A1200` | text on amber |
| `--ok` | `#4ADE80` | paid, confirmed |
| `--warn` | `#FBBF24` | pending, needs review (use sparingly, close to accent: prefer `--text-2` + icon) |
| `--err` | `#F87171` | failed, declined, conflicts |
| `--info` | `#60A5FA` | PayPal references, links |
| `--radius` | `10px` (cards 14px) | |
| `--shadow` | `0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px rgba(0,0,0,.35)` | floating panels |

Dark only. No light theme.

## 2. Type

- UI: **Manrope** (400/500/600/700). Headings 600, tracking −0.01em.
- Numbers, money, times, ids: **IBM Plex Mono** 500, tabular. Every amount is `€ 1.234,50` (it-IT formatting, 2 decimals), every time `08:00–16:30`.
- Scale: 32 / 24 / 18 / 15 (body) / 13 (meta) / 11 (mono caps labels, letter-spacing .08em, uppercase).

## 3. Money and work states

One pill style, colour by state:

| State | Colour | Where |
|---|---|---|
| Planning | `--text-2` | job |
| Crew confirmed | `--info` | job |
| In progress | `--accent` | job |
| Done · to pay | `--warn` | job |
| Paid | `--ok` | job, payout item |
| Pending | `--text-2` | payout item (PayPal `PENDING`/`UNCLAIMED`) |
| Failed | `--err` | payout item |
| Proposed / Sent / Declined / Confirmed | text-2 / info / err / ok | shift assignment |

## 4. Layout

- Left rail 232 px: wordmark, nav (Jobs, Crew, Payroll, Settings), company name at bottom.
- Content max 1440 px, 24 px gutters.
- **Job detail** is the hero screen: header (title, dates, site, state pill, budget vs forecast) → Bryntum Scheduler full width, min-height 420 px → below it two columns: left "Shifts & hours" table, right "Agent" panel (sticky).
- Agent panel: amber dot + "Agent" label, chronological cards (plan, rebalance, reconcile, payout) each with a one-line reason in `--text-2`, actions as small buttons. Money-moving actions always open a confirmation dialog with the total in mono 24 px.

## 5. Bryntum Scheduler theming

Load `scheduler.css` plus the **Svalbard dark** theme (`svalbard-dark.css`, v7). Override with CSS variables on `.b-scheduler`:

- background `--bg-1`, grid lines `--line`, header text `--text-2`, row height 52.
- Event bars: `eventColor` per role (montatore amber, elettricista info, rigger violet `#A78BFA`, autista `#34D399`), 8 px radius, label = role · hours.
- Conflicts (rest < 11 h, overlap, unavailable): event bar gets a dashed `--err` outline and `⚠` prefix.
- Declined shifts: 40 % opacity, strikethrough label, until the agent rebalances.
- Non-working time shaded `rgba(255,255,255,.03)`.

Whatever cannot be themed through documented params is documented in the README as a known substitution (same rule as Quotely).

## 6. Motion

- Panel/dialog in: 160 ms ease-out, 8 px translate.
- Scheduler events appearing after "Plan with AI": stagger 30 ms per event, fade + 4 px rise.
- Payout progress: item rows switch pill colour on each poll; no spinners longer than 2 s without text.

## 7. Voice

Short, operational, Italian names in demo data, English UI. The agent explains in one sentence, never apologises, never hides a failure ("Payout to Luca failed: receiver unconfirmed. Retry or pay later.").
