// Shiftly demo recorder. Drives the live site end to end and records the main window at 1920x1080 (webm),
// plus one webm per popup (the freelancer's phone pages and PayPal), and writes named timestamps to demo/out/marks.json.
//
// It does NOT reset the database: run `npm run db:reset-demo` first, so the new job is J-0003.
// First time only: `npm run demo:login` and log in to PayPal Sandbox as Elena's Personal account (kept in demo/.profile).
// Run:  npm run demo:record          (SHIFTLY_URL overrides the site, DEMO_CHANNEL the browser: chrome | chromium | msedge,
//                                     DEMO_STOP_AFTER=4 stops after scene 4 for a rehearsal)

import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const BASE = (process.env.SHIFTLY_URL ?? "https://shiftly-r26a.onrender.com").replace(/\/$/, "");
const CHANNEL = process.env.DEMO_CHANNEL ?? "chrome";
const OUT = path.resolve("demo/out");
const PROFILE = path.resolve("demo/.profile");
const SHOTS = path.join(OUT, "shots");
const PAYPAL_ACTIVITY = "https://www.sandbox.paypal.com/myaccount/activities";
const LOGIN_ONLY = process.argv.includes("--login");
const STOP_AFTER = Number(process.env.DEMO_STOP_AFTER ?? 9); // rehearse the first N scenes only

const BRIEF =
  "Trade fair stand build for Orbis Expo in Rho, Fiera Milano hall 7, 14-15 November. Two shifts per day, 08:00-12:30 and 13:30-18:00. Each shift: 5 installers and 1 certified electrician. Crew budget 4,000 euros.";
const ACCEPTER = "Elena Gallo"; // holds a Sandbox Personal account: her payout lands in the PayPal scene
const DECLINER = "Luca Bianchi";
const DECLINE_REASON = "Not available on these dates";

mkdirSync(SHOTS, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const waitEnter = (msg) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n>>> ${msg}\n>>> Press Enter here when done. `, () => {
      rl.close();
      resolve();
    });
  });

// --- login mode: no recording, just a session in the persistent profile --------------------------------------

if (LOGIN_ONLY) {
  const context = await chromium.launchPersistentContext(PROFILE, { channel: CHANNEL, headless: false, viewport: { width: 1280, height: 900 } });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.sandbox.paypal.com/signin", { waitUntil: "domcontentloaded" });
  await waitEnter("Log in to PayPal SANDBOX as Elena's Personal account in the opened window.");
  await context.close();
  console.log("Session saved in demo/.profile.");
  process.exit(0);
}

// --- recording ------------------------------------------------------------------------------------------------

let t0 = Date.now(); // reset when the main page (and its video) starts, so marks line up with raw-*.webm
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const marks = [];
const mark = (name) => {
  const at = Date.now() - t0;
  marks.push({ name, at });
  console.log(`[${(at / 1000).toFixed(1)}s] ${name}`);
};
const warn = (msg) => {
  console.warn(`  ! ${msg}`);
  marks.push({ name: `warning: ${msg}`, at: Date.now() - t0 });
};

// Main window: the persistent profile (PayPal login lives here). Every page in it records its own webm.
const context = await chromium.launchPersistentContext(PROFILE, {
  channel: CHANNEL,
  headless: false,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  args: ["--window-size=1920,1160", "--hide-scrollbars"],
  colorScheme: "light",
  locale: "en-GB",
  timezoneId: "Europe/Rome",
});
context.setDefaultTimeout(60_000);
// A fresh profile can replace its startup tab right after launch: record our own page and drop the others.
const page = await context.newPage();
for (const p of context.pages()) {
  if (p === page) continue;
  const video = p.video();
  await p.close().catch(() => {});
  await video?.delete().catch(() => {});
}
t0 = Date.now();

// Freelancers' phones: a separate browser, 390x844, each page recorded as its own webm.
const phoneBrowser = await chromium.launch({ channel: CHANNEL, headless: false });
const phone = await phoneBrowser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  recordVideo: { dir: OUT, size: { width: 780, height: 1688 } },
  locale: "en-GB",
  timezoneId: "Europe/Rome",
});
// The remaining accepts: same phone layout, not recorded.
const quiet = await phoneBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const popupVideos = []; // { video, label } in the order the popups were opened

async function shot(p, name) {
  try {
    await p.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  } catch {}
}

async function scrollTo(locator, block = "center") {
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
  await pause(900);
}

async function scrollTop(p = page) {
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(900);
}

async function goto(p, url) {
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle").catch(() => {});
}

/** Reloads until `check()` is true (the job page doesn't refresh itself for invitations and rebalancing). */
async function reloadUntil(check, { timeout = 120_000, every = 5_000 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() > until) return false;
    await pause(every);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

async function declineCookies(p) {
  const btn = p.getByRole("button", { name: /^(decline|reject all|reject|rifiuta|rifiuta tutto)$/i });
  if (await btn.count()) {
    await btn.first().click().catch(() => {});
    await pause(800);
  }
}

const agentPanel = () => page.locator('aside[aria-label="Agent"]');
const statusPill = (label) => page.locator("header").getByText(label, { exact: true });

/** Invitation rows on the job page: name, state label and confirm link. */
async function invitations() {
  return page.evaluate(() => {
    const card = [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Invitations")?.closest("section");
    if (!card) return [];
    return [...card.querySelectorAll("li")]
      .map((li) => {
        const a = li.querySelector('a[href^="/confirm/"]');
        const name = li.querySelector("p")?.textContent?.trim() ?? "";
        const state = ["Awaiting response", "Accepted", "Declined", "Not sent", "Withdrawn"].find((s) => li.textContent?.includes(s)) ?? "";
        return { name, state, href: a?.getAttribute("href") ?? null };
      })
      .filter((r) => r.href);
  });
}

/** Opens a confirm link on a phone and answers it. Recorded when ctx is `phone`. */
async function answer(ctx, href, decision, label) {
  const p = await ctx.newPage();
  if (ctx === phone) popupVideos.push({ video: p.video(), label });
  await goto(p, `${BASE}${href}`);
  await p.getByRole("button", { name: /^Accept shift$/ }).waitFor({ timeout: 60_000 });
  if (ctx === phone) await pause(2000);
  if (decision === "accept") {
    await p.getByRole("button", { name: /^Accept shift$/ }).click();
    await p.getByText("You're confirmed", { exact: false }).waitFor({ timeout: 60_000 });
  } else {
    await p.getByRole("button", { name: /^Decline$/ }).click();
    await pause(ctx === phone ? 1200 : 200);
    await p.locator("#reason").selectOption({ label: DECLINE_REASON });
    await pause(ctx === phone ? 1200 : 200);
    await p.getByRole("button", { name: /^Decline shift$/ }).click();
    await p.getByText("You declined this shift", { exact: false }).waitFor({ timeout: 60_000 });
  }
  if (ctx === phone) await pause(2000);
  await p.close();
}

/** Geometry of the scheduler: people rows (name, role text, y) and event bars (x, y, row name, role class). */
async function schedulerGeometry() {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll(".shiftly-scheduler .shiftly-person")].map((el) => {
      const r = el.closest(".b-grid-row").getBoundingClientRect();
      return {
        name: el.querySelector(".shiftly-person-name")?.textContent ?? "",
        role: el.querySelector(".shiftly-person-role")?.textContent ?? "",
        top: r.top,
        bottom: r.bottom,
        y: r.top + r.height / 2,
      };
    });
    const events = [...document.querySelectorAll(".shiftly-scheduler .b-sch-event")].map((el) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      return {
        x: Math.max(r.left + 30, Math.min(r.left + r.width / 2, window.innerWidth - 60)),
        y,
        installer: el.classList.contains("role-installer"),
        declined: el.classList.contains("declined"),
        row: rows.find((row) => y >= row.top && y <= row.bottom)?.name ?? "",
      };
    });
    return { rows, events };
  });
}

const dragTip = async () =>
  (await page.locator(".b-tooltip:visible").allInnerTexts().catch(() => [])).join(" ").replace(/\s+/g, " ").trim();

class Stop extends Error {}
const after = (n) => {
  if (n >= STOP_AFTER) throw new Stop(`stopped after scene ${n}`);
};

try {
  // 1. Jobs ----------------------------------------------------------------------------------------------------
  mark("1 jobs: start");
  await goto(page, `${BASE}/jobs`);
  await page.getByRole("heading", { name: "Jobs", level: 1 }).waitFor();
  await pause(3000);
  mark("1 jobs: end");
  after(1);

  // 2. New job from a brief --------------------------------------------------------------------------------------
  mark("2 new job: start");
  await page.getByRole("link", { name: /New job/ }).click();
  await page.locator("#brief").waitFor();
  await pause(1500);
  await page.locator("#brief").click();
  await page.locator("#brief").pressSequentially(BRIEF, { delay: 32 });
  await pause(2000);
  await page.getByRole("button", { name: /^Generate plan$/ }).click();
  mark("2 new job: extracting");
  await page.getByRole("button", { name: /Confirm details/ }).waitFor({ timeout: 120_000 });
  await pause(2000);
  mark("2 new job: extracted details");
  await pause(4000);
  await page.getByRole("button", { name: /Confirm details/ }).click();
  await page.waitForURL(/\/jobs\/\d+$/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const jobUrl = page.url();
  mark(`2 new job: end (${jobUrl.replace(BASE, "")})`);
  await pause(2000);
  after(2);

  // 3. Plan with AI ---------------------------------------------------------------------------------------------
  mark("3 plan: start");
  await page.getByRole("button", { name: /Plan with AI/ }).click();
  mark("3 plan: planning");
  await page.locator(".shiftly-scheduler .b-sch-event").first().waitFor({ timeout: 180_000 });
  await pause(2500);
  await scrollTo(page.locator("#schedule-title"), "start");
  mark("3 plan: scheduler filled");
  await pause(2000);
  {
    const { events } = await schedulerGeometry();
    const target = events.find((e) => e.installer && !e.declined) ?? events[0];
    await page.mouse.move(target.x - 40, target.y - 60, { steps: 8 });
    await page.mouse.move(target.x, target.y, { steps: 12 });
    mark("3 plan: reason tooltip");
    await pause(3000);
    await page.mouse.move(target.x, target.y - 140, { steps: 10 });
  }
  await pause(2000);
  mark("3 plan: end");
  after(3);

  // 4. Drag & drop: refused, then accepted -------------------------------------------------------------------------
  mark("4 drag: start");
  await scrollTo(page.locator("#schedule-title"), "start");
  {
    const { rows, events } = await schedulerGeometry();
    const source = events.find((e) => e.installer && !e.declined && e.row && e.row !== ACCEPTER && e.row !== DECLINER);
    const electrician = rows.find((r) => r.role.startsWith("Electrician"));
    // Free installers first, then installers already on the job (another shift may still fit them).
    const installers = rows.filter((r) => r.role.startsWith("Installer") && r.name !== source?.row && r.name !== ACCEPTER && r.name !== DECLINER);
    const freeInstallers = [...installers.filter((r) => r.role.includes("not on this job")), ...installers.filter((r) => !r.role.includes("not on this job"))];
    if (!source || !electrician) throw new Error("No installer shift or electrician row to drag between.");

    await page.mouse.move(source.x, source.y, { steps: 10 });
    await pause(600);
    await page.mouse.down();
    await page.mouse.move(source.x + 6, source.y + 6, { steps: 6 });
    await page.mouse.move(source.x + 10, electrician.y, { steps: 30 });
    await pause(800);
    mark(`4 drag: refused on ${electrician.name} (${await dragTip()})`);
    await pause(3500);

    let accepted = null;
    for (const row of freeInstallers) {
      await page.mouse.move(source.x + 10, row.y, { steps: 25 });
      await pause(900);
      const tip = await dragTip();
      if (/Give this shift to/.test(tip)) {
        accepted = row;
        break;
      }
      console.log(`  ${row.name}: ${tip || "no tooltip"}`);
    }
    if (accepted) {
      mark(`4 drag: allowed on ${accepted.name}`);
      await pause(2500);
      await page.mouse.up();
      await page.locator('[role="status"]').filter({ hasText: /./ }).first().waitFor({ timeout: 30_000 }).catch(() => {});
      mark("4 drag: saved toast");
      await pause(3000);
      await scrollTo(agentPanel(), "center");
      mark("4 drag: agent log");
      await pause(3500);
      await scrollTop();
    } else {
      warn("no free installer accepted the shift; drag cancelled");
      await page.mouse.move(source.x, source.y, { steps: 20 });
      await page.mouse.up();
    }
  }
  await pause(2000);
  mark("4 drag: end");
  after(4);

  // 5. Availability requests, phone answers, rebalance -------------------------------------------------------------
  mark("5 invitations: start");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await scrollTo(agentPanel(), "center");
  await pause(1500);
  await page.getByRole("button", { name: /Send availability requests/ }).click();
  mark("5 invitations: sending");
  await page.getByRole("heading", { name: "Invitations" }).waitFor({ timeout: 180_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await pause(1500);
  await scrollTo(page.getByRole("heading", { name: "Invitations" }), "start");
  mark("5 invitations: links ready");
  await pause(2000);

  let invites = await invitations();
  const elena = invites.find((i) => i.name === ACCEPTER);
  const luca = invites.find((i) => i.name === DECLINER);
  if (!elena) warn(`${ACCEPTER} is not on this plan: the PayPal scene will not show her payment`);
  if (!luca) warn(`${DECLINER} is not on this plan: no decline scene`);

  if (elena) {
    mark(`5 phone: ${ACCEPTER} opens her link`);
    await answer(phone, elena.href, "accept", "accept");
    mark(`5 phone: ${ACCEPTER} accepted`);
    await pause(2000);
  }
  if (luca) {
    mark(`5 phone: ${DECLINER} opens his link`);
    await answer(phone, luca.href, "decline", "decline");
    mark(`5 phone: ${DECLINER} declined`);
    await pause(2000);

    mark("5 rebalance: waiting");
    const rebalanced = await reloadUntil(() => agentPanel().getByText("Crew rebalanced").first().isVisible());
    if (!rebalanced) warn("no rebalance entry within 120 s");
    await scrollTo(agentPanel(), "center");
    mark("5 rebalance: agent log");
    await pause(4000);
  }
  mark("5 invitations: end");

  // Everyone else accepts (not recorded on the phone, no marks) until the crew is confirmed.
  for (let round = 0; round < 6; round++) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await statusPill("Crew confirmed").isVisible().catch(() => false)) break;
    const send = page.getByRole("button", { name: /Send availability requests/ });
    const fill = page.getByRole("button", { name: /Fill open slots/ });
    if ((await send.count()) && (await send.isEnabled())) {
      await send.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await pause(3000);
      continue;
    }
    if (await fill.count()) {
      await fill.click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await pause(3000);
      continue;
    }
    invites = await invitations();
    for (const inv of invites.filter((i) => i.state === "Awaiting response")) await answer(quiet, inv.href, "accept", inv.name);
    await pause(3000);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (!(await statusPill("Crew confirmed").isVisible().catch(() => false))) throw new Error("The job did not reach Crew confirmed.");
  await scrollTop();
  mark("5 crew confirmed");
  await pause(2000);
  after(5);

  // 6. Start job, close shifts, hours ---------------------------------------------------------------------------
  mark("6 hours: start");
  await scrollTo(agentPanel(), "center");
  await page.getByRole("button", { name: /^Start job$/ }).click();
  await statusPill("In progress").waitFor({ timeout: 60_000 });
  await pause(2000);
  await page.getByRole("link", { name: /Close shifts/ }).click();
  await page.waitForURL(/\/hours$/);
  await page.getByRole("button", { name: /^Approve hours$/ }).waitFor();
  mark("6 hours: sheet");
  await pause(2500);
  let plus = page.getByRole("button", { name: new RegExp(`^${ACCEPTER}, Sat [^,]*13:30.18:00: 15 minutes more$`) }).first();
  if (!(await plus.count())) {
    warn(`no Saturday afternoon row for ${ACCEPTER}; using the first row`);
    plus = page.getByRole("button", { name: /15 minutes more$/ }).first();
  }
  await scrollTo(plus);
  await pause(1000);
  await plus.click();
  await pause(700);
  await plus.click();
  mark("6 hours: +30 min");
  await pause(2000);
  await scrollTop();
  await page.getByRole("button", { name: /^Save hours$/ }).click();
  const reviewed = page.getByLabel("Mark reviewed").first();
  await reviewed.waitFor({ timeout: 60_000 });
  await scrollTo(reviewed);
  mark("6 hours: flagged");
  await pause(4000);
  await reviewed.check();
  await pause(1500);
  await page.getByRole("button", { name: /^Approve hours$/ }).click();
  await page.getByText("Done · to pay").first().waitFor({ timeout: 60_000 });
  await scrollTop();
  mark("6 hours: approved, done");
  await pause(3000);
  mark("6 hours: end");
  after(6);

  // 7. Pay crew ---------------------------------------------------------------------------------------------------
  mark("7 pay: start");
  await goto(page, jobUrl);
  await scrollTo(agentPanel(), "center");
  await pause(1500);
  await page.getByRole("button", { name: /Review payouts/ }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: /Confirm and pay/ }).waitFor();
  mark("7 pay: dialog");
  await pause(4000);
  await dialog.getByRole("button", { name: /Confirm and pay/ }).click();
  mark("7 pay: confirmed");
  await dialog.getByText(/CONFIRMED PAID|Confirmed paid/i).first().waitFor({ timeout: 120_000 });
  const pending = new Set(["DRAFT", "NEW", "PENDING", "PROCESSING"]);
  const until = Date.now() + 90_000;
  for (;;) {
    const statuses = (await dialog.locator('[title^="PayPal status: "]').evaluateAll((els) => els.map((e) => e.getAttribute("title").slice(15)))) ?? [];
    if (statuses.length && statuses.every((s) => !pending.has(s))) break;
    if (Date.now() > until) {
      warn("payout statuses still pending after 90 s");
      break;
    }
    await pause(2000);
  }
  mark("7 pay: statuses settled");
  await pause(4000);
  await dialog.getByRole("button", { name: /^Close$/ }).last().click().catch(() => {});
  mark("7 pay: end");
  after(7);

  // 8. PayPal Sandbox, as Elena ------------------------------------------------------------------------------------
  mark("8 paypal: start");
  const paypal = await context.newPage();
  popupVideos.push({ video: paypal.video(), label: "paypal" });
  await goto(paypal, PAYPAL_ACTIVITY);
  await pause(2500);
  await declineCookies(paypal);
  if (/signin|login/i.test(paypal.url())) {
    await waitEnter("PayPal asks to log in. Log in as Elena's Sandbox Personal account in the PayPal window (then trim this part).");
    await goto(paypal, PAYPAL_ACTIVITY);
    await declineCookies(paypal);
  }
  await pause(3000);
  const entry = paypal.getByText(/Fieramente Allestimenti|You have a payment/i).first();
  if (await entry.count()) await scrollTo(entry);
  else warn("payment entry not found on the PayPal activity page");
  mark("8 paypal: payment entry");
  await pause(5000);
  await paypal.close();
  mark("8 paypal: end");
  after(8);

  // 9. Payroll and the agent log -----------------------------------------------------------------------------------
  mark("9 payroll: start");
  await page.bringToFront();
  await goto(page, `${BASE}/payroll`);
  const first = page.locator("details").first();
  await first.waitFor();
  if (!(await first.evaluate((d) => d.open))) await first.locator("summary").click();
  await scrollTo(first, "start");
  mark("9 payroll: new batch");
  await pause(4000);
  await goto(page, jobUrl);
  await scrollTo(agentPanel(), "center");
  mark("9 job: agent log");
  await pause(4000);
  mark("end");
} catch (err) {
  if (err instanceof Stop) {
    mark(err.message);
  } else {
    console.error("\nRecording failed:", err.message);
    await shot(page, "failure");
    marks.push({ name: "FAILED: " + err.message, at: Date.now() - t0 });
  }
} finally {
  const mainVideo = page.video();
  await quiet.close().catch(() => {});
  await phone.close().catch(() => {});
  await phoneBrowser.close().catch(() => {});
  await context.close().catch(() => {});

  // Rename: Playwright knows which file belongs to which page; anything left over from this run goes by size.
  const renamed = [];
  const move = (from, to) => {
    if (!from || !existsSync(from)) return;
    renameSync(from, path.join(OUT, to));
    renamed.push(to);
  };
  move(await mainVideo?.path().catch(() => null), `raw-${stamp}.webm`);
  for (const [i, { video }] of popupVideos.entries()) move(await video?.path().catch(() => null), `popup-${stamp}-${i + 1}.webm`);
  const leftovers = readdirSync(OUT)
    .filter((f) => f.endsWith(".webm") && !/^(raw|popup)-/.test(f))
    .map((f) => path.join(OUT, f))
    .filter((f) => statSync(f).mtimeMs >= t0)
    .sort((a, b) => statSync(b).size - statSync(a).size);
  let n = popupVideos.length;
  for (const f of leftovers) move(f, renamed.some((r) => r.startsWith("raw-")) ? `popup-${stamp}-${++n}.webm` : `raw-${stamp}.webm`);

  writeFileSync(
    path.join(OUT, "marks.json"),
    JSON.stringify({ base: BASE, stamp, videos: { main: `raw-${stamp}.webm`, popups: popupVideos.map((p, i) => ({ file: `popup-${stamp}-${i + 1}.webm`, scene: p.label })) }, marks }, null, 2),
  );
  console.log(`\nVideos: ${renamed.map((r) => `demo/out/${r}`).join(", ") || "none"}\nMarks:  demo/out/marks.json`);
}
