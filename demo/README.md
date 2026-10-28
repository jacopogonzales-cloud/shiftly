# Demo recorder

`demo/record.mjs` drives the live site end to end with Playwright and records the video for the hackathon demo.

## Output (`demo/out/`, gitignored)

- `raw-<stamp>.webm`: the main window, 1920×1080.
- `popup-<stamp>-N.webm`: one per popup, in order:
  1. Elena accepting on her phone (390×844);
  2. Luca declining on his phone;
  3. PayPal Sandbox activity.
- `marks.json`: named timestamps in milliseconds from the start of `raw-<stamp>.webm` (a mark before and after every scene, plus key moments), the video file names, and any warnings.
- `shots/failure.png`: a screenshot if a run fails.

## Once: log in to PayPal Sandbox

The PayPal scene shows Elena's Sandbox Personal account receiving her payout. The login is kept in `demo/.profile` (gitignored):

```bash
npm run demo:login
```

Log in with Elena's Sandbox Personal account (the address `SHIFTLY_PAYOUT_RECIPIENTS` gives her), then press Enter in the terminal. If the session has expired during a run, the script pauses and asks you to log in again in the PayPal window.

## Every run

```bash
npm run db:reset-demo     # the recorder never resets the database; the new job will be J-0003
npm run demo:record
```

- Uses the installed Google Chrome (`DEMO_CHANNEL=chromium` for Playwright's own Chromium after `npx playwright install chromium`).
- `SHIFTLY_URL` overrides the site (default `https://shiftly-r26a.onrender.com`). On Render's free plan, open the site once first so it isn't asleep.
- `DEMO_STOP_AFTER=4 npm run demo:record` stops after scene 4, for a rehearsal. It still creates a job, so reset again before the real take.

## PayPal scene on its own

```bash
npm run demo:paypal
```

- **Login, off camera:** opens the same Chrome profile at the PayPal Sandbox sign-in page (1280×900) and waits until you're logged in. An existing session skips the login.
- **Recording:** starts in a fresh browser context that reuses the session cookies, so the video begins on the activity page, never on the login form.
- **The shot:** scrolls to the newest "Fieramente Allestimenti · Payment Received" row and holds 6 s. If that row is missing, it falls back to "You have a payment from Fieramente Allestimenti", then to the first "Payment Received" row.
- **Output:** `demo/out/paypal-<stamp>.webm`, plus a `paypal` entry in `demo/out/marks.json`. The recorder's own marks are left untouched.

## Scenes

| # | What | Main holds |
|---|---|---|
| 1 | Jobs list | 3 s |
| 2 | New job: the brief is typed, Generate plan, extracted details, Confirm | 4 s on the details |
| 3 | Plan with AI, hover a shift for its reason | 3 s on the tooltip |
| 4 | Drag an installer shift onto an electrician (refused, reason shown), then onto a free installer (saved) | 3.5 s refused, toast, agent log |
| 5 | Send requests; Elena accepts and Luca declines on phones; the agent rebalances; everyone else accepts off camera until Crew confirmed | 4 s on the rebalance |
| 6 | Start job, Close shifts, +30 min on Elena's Saturday afternoon, Save, flag, Mark reviewed, Approve | 4 s on the flag, 3 s on Done |
| 7 | Review payouts, Confirm and pay, wait for PayPal statuses (up to 90 s) | 4 s on the dialog, 4 s on the result |
| 8 | PayPal Sandbox activity as Elena (popup) | 5 s |
| 9 | Payroll with the new batch, then the job's agent log | 4 s each |
