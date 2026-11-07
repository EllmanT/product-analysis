/**
 * Drives the admin, branch-manager and cashier screens in a real browser and checks what each role sees and is refused.
 * Uses the test accounts in .env.test. Run the app first (npm run dev), then:
 *
 *   node scripts/verify-ui.cjs [outputFolder]          (default http://localhost:3000, screenshots in test-output/ui-verify)
 *   BASE_URL=http://localhost:3100 node scripts/verify-ui.cjs
 *
 * It does not use the Playwright test config, so it never runs that config's global clean-up of the test branch.
 */
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const PROJECT = path.join(__dirname, "..");
const req = createRequire(path.join(PROJECT, "package.json"));
const { chromium } = req("@playwright/test");
const dotenv = req("dotenv");
dotenv.config({ path: path.join(PROJECT, ".env.test") });

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.argv[2] || path.join(PROJECT, "test-output", "ui-verify");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const note = (ok, name, extra) => {
  results.push({ ok, name, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};

async function login(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let the page's script load before submitting
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 });
  } catch {
    note(false, `sign in as ${email}`, "stayed on sign-in: " + (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " "));
    return { ctx, page, ok: false };
  }
  return { ctx, page, ok: true };
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: false });
};

(async () => {
  const browser = await chromium.launch();

  // ---------------- admin ----------------
  const admin = await login(browser, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
  if (admin.ok) {
    const p = admin.page;
    note(true, "admin signed in", p.url());

    await p.goto(BASE + "/branches", { waitUntil: "networkidle" });
    note((await p.getByRole("button", { name: "Add branch" }).count()) > 0, "Branches page has the Add branch button");
    note((await p.locator("text=No pokemon found").count()) === 0, "Branches page has no leftover search box text");
    await p.getByRole("button", { name: "Add branch" }).click();
    await p.waitForTimeout(500);
    note((await p.getByText("Name your branch").count()) > 0, "wizard opens on step 1");
    await p.getByLabel("Branch name").fill("Branch 2");
    await p.getByLabel("Town or suburb").fill("Harare CBD");
    await p.getByRole("button", { name: "Continue" }).click();
    await p.waitForTimeout(400);
    note((await p.getByText("Which fiscal device will it use?").count()) > 0, "wizard reaches step 2 with 'Branch 2' (digits allowed)");
    await shot(p, "01-add-branch-step2");
    await p.keyboard.press("Escape");

    await p.goto(BASE + "/fiscal-devices", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Add device" }).click();
    await p.waitForTimeout(500);
    note((await p.getByText("Name the device").count()) > 0, "Add device wizard opens");
    await shot(p, "02-add-device-step1");
    await p.keyboard.press("Escape");

    await p.goto(BASE + "/fiscal-settings", { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const body = await p.locator("body").innerText();
    note(/Fiscal devices/.test(body) || /Central device/.test(body), "old central device address forwards to Fiscal devices (service) or shows the editor (legacy)");
    const serviceMode = p.url().includes("/fiscal-devices");
    note(serviceMode || /Automatic open and close/.test(body), "central page has the schedule section (legacy) or points to Fiscal devices (service)");
    note(serviceMode || /Certificate/.test(body), "central page has the certificate section (legacy)");
    note(!/Fiscal service device id/.test(body), "central page hides branch-only fields");
    await shot(p, "03-central-device");

    await p.goto(BASE + "/access", { waitUntil: "networkidle" });
    await p.waitForTimeout(1000);
    note((await p.getByText("Branch manager").count()) > 0, "Menu access page loads for the super admin");
    await shot(p, "04-menu-access");

    await p.goto(BASE + "/pos-settings", { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    await shot(p, "05-pos-settings");
    note((await p.getByRole("button", { name: "Add a till" }).count()) > 0, "POS settings has Add a till");

    await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await shot(p, "06-dashboard");
    const side = await p.locator("[data-sidebar='sidebar'], aside, nav").first().innerText().catch(() => "");
    note(/Upload history/.test(await p.locator("body").innerText()), "sidebar uses the new names");
    await admin.ctx.close();
  }

  // ---------------- branch manager ----------------
  const bm = await login(browser, process.env.TEST_BRANCH_EMAIL, process.env.TEST_BRANCH_PASSWORD);
  if (bm.ok) {
    const p = bm.page;
    note(true, "branch manager signed in", p.url());
    for (const addr of ["/fiscal-devices", "/fiscal-settings", "/users", "/branches", "/pos-settings", "/access", "/settings"]) {
      await p.goto(BASE + addr, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(800);
      const at = new URL(p.url()).pathname;
      note(at !== addr, `branch manager sent away from ${addr}`, "landed on " + at);
    }
    await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const text = await p.locator("body").innerText();
    note(!/Fiscal devices|Menu access|Users\b/.test(text), "branch manager's menu has no Fiscal, Users or Menu access");
    await shot(p, "07-branch-manager-dashboard");
    await bm.ctx.close();
  }

  // ---------------- cashier ----------------
  const ca = await login(browser, process.env.TEST_POS_CASHIER_EMAIL, process.env.TEST_POS_CASHIER_PASSWORD);
  if (ca.ok) {
    const p = ca.page;
    note(true, "cashier signed in", p.url());
    for (const addr of ["/dashboard", "/products", "/pos-sales"]) {
      await p.goto(BASE + addr, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(800);
      note(new URL(p.url()).pathname === "/pos", `cashier sent to the till from ${addr}`, "landed on " + new URL(p.url()).pathname);
    }
    const r = await p.request.get(BASE + "/api/analytics/time-series?storeId=x");
    note(r.status() === 403, "cashier refused on an analytics API", "status " + r.status());
    await p.goto(BASE + "/pos", { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    const t = await p.locator("body").innerText();
    note(/Fiscal day|Fiscal device/i.test(t), "cashier's till shows the fiscal day / device state");
    note(/Sales today/.test(t), "cashier's till has the big 'Sales today' totals");
    note(!/RCPT\d|error code|Virtual ?Device/i.test(t), "cashier's till shows no ZIMRA error codes");
    note(/Issue invoice/.test(t), "cashier's main button says Issue invoice");
    await shot(p, "08-cashier-till");
    await ca.ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("script error:", e);
  process.exit(2);
});
