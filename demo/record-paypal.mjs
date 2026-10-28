// PayPal Sandbox scene on its own: Elena's activity page with the payout from Fieramente Allestimenti.
// 1. Opens the recorder's Chrome profile (demo/.profile) at the Sandbox sign-in page, not recorded.
// 2. Waits until you are logged in (the URL moves under /myaccount, or a localized /xx/home); an existing session skips this.
// 3. Copies the session into a fresh, recording context and films only the activity page.
// Output: demo/out/paypal-<stamp>.webm (1280x900), plus a `paypal` entry in demo/out/marks.json.
// Run: npm run demo:paypal   (DEMO_CHANNEL overrides the browser, as for demo:record)

import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const CHANNEL = process.env.DEMO_CHANNEL ?? "chrome";
const OUT = path.resolve("demo/out");
const PROFILE = path.resolve("demo/.profile");
const SIGNIN = "https://www.sandbox.paypal.com/signin";
const ACTIVITY = "https://www.sandbox.paypal.com/myaccount/activities";
const VIEWPORT = { width: 1280, height: 900 };
const LOGIN_TIMEOUT_MS = 10 * 60_000;

mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
// After sign-in PayPal lands on /myaccount/… or, for some accounts, a localized home such as /it/home.
const loggedIn = (url) => {
  try {
    return /^\/(myaccount|[a-z]{2}\/home)(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

// 1–2. Log in, off camera.
const profile = await chromium.launchPersistentContext(PROFILE, { channel: CHANNEL, headless: false, viewport: VIEWPORT, locale: "en-GB" });
const login = profile.pages()[0] ?? (await profile.newPage());
await login.goto(SIGNIN, { waitUntil: "domcontentloaded" });
console.log("Log in to PayPal Sandbox as Elena's Personal account in the opened window. Waiting…");
const until = Date.now() + LOGIN_TIMEOUT_MS;
while (!loggedIn(login.url())) {
  if (Date.now() > until) {
    await profile.close();
    throw new Error("Not logged in after 10 minutes.");
  }
  await pause(1000);
}
console.log("Logged in.");
await login.waitForLoadState("domcontentloaded").catch(() => {});
await pause(1500); // let PayPal finish setting its session cookies
const session = await profile.storageState();
await profile.close(); // the profile keeps the login for next time

// 3. Record in a fresh context that reuses the session.
const browser = await chromium.launch({ channel: CHANNEL, headless: false, args: ["--hide-scrollbars"] });
const context = await browser.newContext({
  storageState: session,
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: VIEWPORT },
  locale: "en-GB",
  timezoneId: "Europe/Rome",
});
const page = await context.newPage();
const t0 = Date.now(); // the video starts with this page
const marks = [];
const mark = (name) => {
  const at = Date.now() - t0;
  marks.push({ name, at });
  console.log(`[${(at / 1000).toFixed(1)}s] ${name}`);
};

try {
  // No networkidle: PayPal pages keep polling and never go idle. Wait for the content instead.
  await page.goto(ACTIVITY, { waitUntil: "domcontentloaded" });
  const decline = page.getByRole("button", { name: /^(decline|reject all|reject|rifiuta|rifiuta tutto)$/i });
  if (await decline.count()) {
    await decline.first().click().catch(() => {});
    await pause(800);
  }
  if (!loggedIn(page.url())) throw new Error(`The session didn't carry over (landed on ${page.url()}).`);

  // The activity list shows the sender ("Fieramente Allestimenti · 28 Oct . Payment Received"); the email subject
  // ("You have a payment from …") is kept as a fallback, then the first "Payment Received" row.
  const candidates = [
    { label: "payment from Fieramente Allestimenti", locator: page.getByText("Fieramente Allestimenti", { exact: true }).first() },
    { label: "You have a payment from Fieramente Allestimenti", locator: page.getByText("You have a payment from Fieramente Allestimenti").first() },
    { label: "first Payment Received", locator: page.getByText(/Payment Received/i).first() },
  ];
  await page
    .getByText(/Fieramente Allestimenti|Payment Received/i)
    .first()
    .waitFor({ timeout: 45_000 })
    .catch(() => {});
  let entry = null;
  for (const c of candidates) if (await c.locator.isVisible().catch(() => false)) {
    entry = c;
    break;
  }
  if (entry) {
    await entry.locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await pause(900);
    mark(`paypal: activity ready (${entry.label})`);
  } else {
    mark("paypal: activity ready (payment entry not found)");
    console.warn("  ! no payout entry found on the activity page");
  }
  await pause(6000);
  mark("paypal: end");
} catch (err) {
  console.error("\nRecording failed:", err.message);
  marks.push({ name: "FAILED: " + err.message, at: Date.now() - t0 });
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const file = `paypal-${stamp}.webm`;
  const from = await video?.path().catch(() => null);
  if (from && existsSync(from)) renameSync(from, path.join(OUT, file));

  // Add to the recorder's marks.json without touching its own entries.
  const marksPath = path.join(OUT, "marks.json");
  let all = {};
  try {
    all = JSON.parse(readFileSync(marksPath, "utf8"));
  } catch {}
  all.paypal = [...(all.paypal ?? []), { file, stamp, marks }];
  writeFileSync(marksPath, JSON.stringify(all, null, 2));
  console.log(`\nVideo: demo/out/${file}\nMarks: demo/out/marks.json (paypal)`);
}
