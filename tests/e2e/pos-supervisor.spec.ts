import net from "node:net";

import { expect, test, type Page } from "@playwright/test";

/**
 * Supervisor-side point of sale tests: credit notes, the cashier restriction on them, and the
 * emailed invoice. Same prerequisites as pos.spec.ts, plus the admin test account
 * (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD). The email test also needs the app started with
 * SMTP_HOST=127.0.0.1 SMTP_PORT=<TEST_SMTP_SINK_PORT> and TEST_SMTP_SINK_PORT set for the tests.
 */
const cashierEmail = process.env.TEST_POS_CASHIER_EMAIL;
const cashierPassword = process.env.TEST_POS_CASHIER_PASSWORD;
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

test.skip(!cashierEmail || !cashierPassword || !adminEmail || !adminPassword, "POS and admin test accounts not configured");
test.describe.configure({ mode: "serial" });

declare global {
  interface Window {
    __printed?: number;
  }
}

async function stubPrint(page: Page) {
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
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|\/pos|\/uploads/, { timeout: 60_000 });
}

async function harareBranchId(page: Page): Promise<string> {
  const res = await page.request.get("/api/pos/branches");
  const branches = (await res.json()).data as { id: string; pos: { enabled: boolean; invoicePrefix?: string } }[];
  const b = branches.find((x) => x.pos.enabled && x.pos.invoicePrefix === "H");
  if (!b) throw new Error("Demo branch not found; run npm run pos:demo");
  return b.id;
}

async function deviceOpen(page: Page): Promise<boolean> {
  return page
    .getByText(/Fiscal day \d+ open/)
    .waitFor({ timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
}

test("a cashier cannot issue a credit note and is not offered one", async ({ page }) => {
  await stubPrint(page);
  await signIn(page, cashierEmail!, cashierPassword!);
  const res = await page.request.post("/api/pos/sales/000000000000000000000001/credit-note", { data: {} });
  expect(res.status()).toBe(403);

  await page.goto("/pos");
  await expect(page.locator("#pos-product")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("F8");
  await expect(page.getByRole("heading", { name: "Today's sales" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Credit note" })).toHaveCount(0);
});

test("a supervisor sells, then reverses the sale with a fiscal credit note", async ({ page }) => {
  await stubPrint(page);
  await signIn(page, adminEmail!, adminPassword!);
  const branchId = await harareBranchId(page);
  await page.goto(`/pos?branchId=${branchId}`);
  await expect(page.locator("#pos-product")).toBeEnabled({ timeout: 60_000 });
  test.skip(!(await deviceOpen(page)), "fiscal device not reachable or day closed");

  const product = page.locator("#pos-product");
  await product.fill("Wall Switch");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("F12");
  const sold = page.getByText(/^H[UZ]\d{4,}$/);
  await expect(sold).toBeVisible({ timeout: 90_000 });
  const number = (await sold.textContent())!.trim();

  await page.keyboard.press("F8");
  const row = page.getByRole("listitem").filter({ hasText: number }).filter({ hasText: "Fiscalised" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Credit note" }).click();
  await row.getByLabel("Reason for the credit note").fill("Customer returned the item");
  await row.getByRole("button", { name: "Issue credit note" }).click();

  await expect(page.getByText(/Credit note H[UZ]C\d{4} issued/)).toBeVisible({ timeout: 90_000 });
  // The sale now says it was credited, and the credit note is listed against it.
  await expect(row).toContainText("credited");
  await expect(row.getByRole("button", { name: "Credit note" })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: `for ${number}` })).toBeVisible();
  expect(await page.evaluate(() => window.__printed)).toBeGreaterThanOrEqual(2); // the sale slip and the credit note slip
});

test("POS settings can print a test slip to check the real printer", async ({ page }) => {
  await stubPrint(page);
  await signIn(page, adminEmail!, adminPassword!);
  await page.goto("/pos-settings");
  await page.getByRole("button", { name: "Print test slip" }).click();
  await expect.poll(() => page.evaluate(() => window.__printed ?? 0), { timeout: 20_000 }).toBe(1);
});

/** A tiny SMTP server that keeps every message it is given. */
function startSmtpSink(port: number): Promise<{ mails: string[]; close: () => Promise<void> }> {
  const mails: string[] = [];
  const server = net.createServer((sock) => {
    let inData = false;
    let data = "";
    let authStep = 0;
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", (buf) => {
      const text = buf.toString("utf8");
      if (inData) {
        data += text;
        if (data.endsWith("\r\n.\r\n")) {
          inData = false;
          mails.push(data);
          data = "";
          sock.write("250 OK queued\r\n");
        }
        return;
      }
      for (const line of text.split("\r\n").filter(Boolean)) {
        const cmd = line.toUpperCase();
        if (authStep === 1) {
          authStep = 2;
          sock.write("334 UGFzc3dvcmQ6\r\n");
        } else if (authStep === 2) {
          authStep = 0;
          sock.write("235 Authentication successful\r\n");
        } else if (cmd.startsWith("AUTH PLAIN")) sock.write("235 Authentication successful\r\n");
        else if (cmd === "AUTH LOGIN") {
          authStep = 1;
          sock.write("334 VXNlcm5hbWU6\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          sock.write("354 go ahead\r\n");
        } else if (cmd === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        } else if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => undefined);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({ mails, close: () => new Promise<void>((r) => server.close(() => r())) })
    );
  });
}

function decodeBody(raw: string): string {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const body = rest.join("\r\n\r\n");
  if (/content-transfer-encoding:\s*base64/i.test(head)) return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  return body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

test("emailing a fiscal invoice sends the slip through SMTP", async ({ page }) => {
  const port = Number(process.env.TEST_SMTP_SINK_PORT);
  test.skip(!port, "TEST_SMTP_SINK_PORT not set (start the app with SMTP_HOST=127.0.0.1 SMTP_PORT=<same port>)");
  const sink = await startSmtpSink(port);
  try {
    await stubPrint(page);
    await signIn(page, cashierEmail!, cashierPassword!);
    const list = await page.request.get("/api/pos/sales?limit=50");
    const sales = (await list.json()).data as { _id: string; status: string; kind?: string; invoiceNumber?: string }[];
    const sale = sales.find((s) => s.status === "FISCALISED" && s.kind !== "CREDIT_NOTE");
    expect(sale, "a fiscalised sale to email").toBeTruthy();

    const bad = await page.request.post(`/api/pos/sales/${sale!._id}/email`, { data: { to: "not-an-email" } });
    expect(bad.status()).toBe(400);

    const ok = await page.request.post(`/api/pos/sales/${sale!._id}/email`, { data: { to: "customer@example.test" } });
    expect(ok.status(), await ok.text()).toBe(200);
    await expect.poll(() => sink.mails.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const raw = sink.mails[0];
    expect(raw).toMatch(/^To:.*customer@example\.test/im);
    expect(raw).toMatch(/^Subject:.*Fiscal tax invoice H[UZ]\d+/im);
    const body = decodeBody(raw);
    expect(body).toContain("FISCAL TAX INVOICE");
    expect(body).toContain(sale!.invoiceNumber!);
    expect(body).toContain("data:image/png;base64"); // the QR code
  } finally {
    await sink.close();
  }
});
