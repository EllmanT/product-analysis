import { expect, test, type Page } from "@playwright/test";

/**
 * Point of sale end to end tests.
 *
 * Needs: the app running, the demo branch and cashier from `npm run pos:demo`, and
 * TEST_POS_CASHIER_EMAIL / TEST_POS_CASHIER_PASSWORD in .env.test. The fiscalising tests talk to
 * the ZIMRA TEST virtual device and leave a few test receipts on it.
 */
const email = process.env.TEST_POS_CASHIER_EMAIL;
const password = process.env.TEST_POS_CASHIER_PASSWORD;

test.skip(!email || !password, "TEST_POS_CASHIER_EMAIL / TEST_POS_CASHIER_PASSWORD not set");
test.describe.configure({ mode: "serial" });

declare global {
  interface Window {
    __printed?: number;
  }
}

async function openTill(page: Page) {
  // Capture printing instead of opening the browser print dialog.
  await page.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")!;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        const w = d.get!.call(this) as (Window & { __p?: boolean }) | null;
        if (w && !w.__p) {
          try {
            w.print = () => {
              window.__printed = (window.__printed ?? 0) + 1;
            };
            w.__p = true;
          } catch {
            /* cross-origin frame */
          }
        }
        return w;
      },
    });
  });
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email!);
  await page.fill('input[name="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/pos/, { timeout: 60_000 });
  // The product box stays disabled until the catalog has loaded (and the page has hydrated).
  await expect(page.locator("#pos-product")).toBeEnabled({ timeout: 60_000 });
}

/** True once the status bar shows the shared fiscal day as open (waits for the first status poll). */
async function deviceOpen(page: Page): Promise<boolean> {
  return page
    .getByText(/Fiscal day \d+ open/)
    .waitFor({ timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
}

async function addItem(page: Page, search: string, qty?: string) {
  const product = page.locator("#pos-product");
  await product.fill(search);
  await page.keyboard.press("Enter");
  await expect(page.locator("#pos-qty")).toBeFocused();
  if (qty) await page.keyboard.type(qty);
  await page.keyboard.press("Enter");
  await expect(product).toBeFocused();
}

test("keyboard flow: search, quantity, add, currency switch, clear", async ({ page }) => {
  await openTill(page);

  await addItem(page, "LED Bulb 9", "3");
  const row = page.getByRole("row", { name: /LED Bulb 9W/ });
  await expect(row).toContainText("3");
  await expect(row).toContainText("7.50");

  // Same product again at the same price merges into the existing line.
  await addItem(page, "LED Bulb 9", "2");
  await expect(page.getByRole("row", { name: /LED Bulb 9W/ })).toContainText("12.50");

  // F2 reprices every line at the exchange rate (2.50 USD -> 66.25 ZWG at 26.50).
  await page.keyboard.press("F2");
  await expect(page.getByRole("row", { name: /LED Bulb 9W/ })).toContainText("66.25");
  await page.keyboard.press("F2");
  await expect(page.getByRole("row", { name: /LED Bulb 9W/ })).toContainText("2.50");

  // A "price at till" item asks for the price.
  await page.locator("#pos-product").fill("Various");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pos-price")).toBeFocused();
  await page.keyboard.type("15");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pos-qty")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("row", { name: /Various/ })).toContainText("15.00");

  // Esc twice clears the sale.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Press Esc again to clear this sale")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Ready for the next customer")).toBeVisible();
});

test("F12 fiscalises, prints once and the totals strip moves", async ({ page }) => {
  await openTill(page);
  test.skip(!(await deviceOpen(page)), "fiscal device not reachable or day closed");

  await addItem(page, "Wall Switch", "1");
  await page.keyboard.press("F12");
  // The result panel shows the fiscal number (HU0001, HZ0001 ...), not a provisional one (HUP...).
  await expect(page.getByText(/^H[UZ]\d{4,}$/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Fiscalised", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  await expect(page.locator("#pos-product")).toBeFocused();
});

test("a cashier is confined to the till", async ({ page }) => {
  await openTill(page);
  for (const path of ["/api/admin/invoices", "/api/analytics", "/api/pos/products?manage=1", "/api/pos/analytics"]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(403);
  }
  const other = await page.request.get("/api/pos/sales?branchId=000000000000000000000001");
  expect(other.status()).toBe(403);
  const patch = await page.request.patch("/api/pos/branches/000000000000000000000001", { data: { enabled: false } });
  expect(patch.status()).toBe(403);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/pos/);
});

test("offline: sale is saved on the till with a provisional number, then syncs", async ({ page, context }) => {
  await openTill(page);
  test.skip(!(await deviceOpen(page)), "fiscal device not reachable or day closed");
  // Give the till a moment to lease its provisional numbers while it still has a connection.
  await page.waitForTimeout(4_000);

  await context.setOffline(true);
  await addItem(page, "Twin Socket", "1");
  await page.keyboard.press("F12");

  await expect(page.getByText(/^H[UZ]P\d{4,}$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Provisional receipt issued")).toBeVisible();
  await expect(page.getByRole("button", { name: /saved on this till/ })).toBeVisible();
  expect(await page.evaluate(() => window.__printed)).toBe(1);

  // Connection back: the sale is sent automatically and the badge goes away.
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: /saved on this till/ })).toBeHidden({ timeout: 60_000 });

  // The server now holds it, flagged offline and fiscalised.
  const res = await page.request.get("/api/pos/sales?limit=10");
  const sales = (await res.json()).data as { offline?: boolean; status: string; provisionalNumber?: string }[];
  const synced = sales.find((s) => s.offline && s.provisionalNumber);
  expect(synced, "offline sale reached the server").toBeTruthy();
  expect(["FISCALISED", "UNFISCALISED"]).toContain(synced!.status);
});
