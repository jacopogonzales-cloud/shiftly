# Shiftly — Light-first Product Design Handoff v1.0

A detailed product-design handoff for the **Shiftly** B2B scheduling and PayPal Payouts application. Interface strings and technical specs are in English.

## Primary deliverables

- `design-system.md` — design principles, tokens, typography, spacing, components, accessibility, Bryntum CSS theming contract, money-action safeguards, SVG logo geometry.
- `screens.md` — layout and interaction specifications for all 11 requested screen groups, including 1440px desktop, 1024px compact-desktop behavior, mobile public invite, realistic demo content, and loading/error/empty/success states.
- `mockups/01-jobs.png` — Jobs, 1440px desktop.
- `mockups/03-job-detail.png` — Job detail with themed Scheduler visual reference, hours table, sticky Agent panel, 1440px desktop.
- `mockups/06-pay-crew.png` — Explicit payout confirmation dialog, 1440px desktop.
- `mockups/07-payroll.png` — Payroll batches and item statuses, 1440px desktop.
- `mockups/04-confirm-mobile.png` — Public freelancer shift confirmation, 390×844 mobile.

## Secondary assets

- `assets/shiftly-mark.svg` — vector icon.
- `assets/shiftly-wordmark.svg` — full wordmark.
- `assets/favicon.svg` — app favicon.
- `assets/shiftly-previews.html` — inspectable, static HTML/CSS composition with preview routes via `?screen=jobs|detail|pay|payroll|confirm`. These are **layout references**; buttons are intentionally not wired to production actions. Open in a browser or serve with any simple static server. Requires online Google Fonts for the final Manrope/IBM Plex Mono appearance; fallback fonts show otherwise.
- `assets/build_mockups.py` — generator source for the static visual-reference HTML. Requires no external Python packages.

## Implementation boundaries

**Do not ship the Scheduler-like grid in the visual-reference HTML.** Replace that visual with the licensed Bryntum Scheduler React integration and theme it per `design-system.md`. Keep business constraints in application logic, not CSS. Likewise, payout status must come from actual persisted PayPal Sandbox API results, never from static mockups.

## Integrity and QA

- Brand: daylight light theme with persimmon accent `#C4452D`.
- Main job: six people, 96h planned, 96h 30m actual, 3.015,75 € approved (including +23,75 € overtime).
- After demo payout: 1.527,75 € Paid, 560,00 € Pending, 448,00 € Failed, 480,00 € Unclaimed.
- No mockup depicts genuine money transfers: environment is labeled `Sandbox`.
- Two historical payroll batches are marked `Demo data`.
- Screenshots were produced deterministically with local browser rendering; optional Google Fonts may fall back in the screenshots when offline. The tokenized system remains authoritative.
