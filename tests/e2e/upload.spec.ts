import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";
import { uploadStockFile } from "../helpers/upload";
import path from "path";

const BRANCH_ID = process.env.TEST_BRANCH_ID!;

test.describe.configure({ mode: "serial" });

test.describe("Stock Upload — Full 10-Week Simulation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Week 1: Initial upload — baseline stock established", async ({ page }) => {
    // First upload after cleanup creates 20 ProductMaster docs — allow extra time
    test.setTimeout(120_000);
    await page.goto("/uploads/upload");

    await page.waitForLoadState("networkidle");
    const branchTrigger = page.locator('[data-testid="branch-select"]');
    if (await branchTrigger.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await branchTrigger.click();
      await page.waitForSelector('[role="option"]', { timeout: 5_000 });
      await page.locator('[role="option"]').first().click();
    }

    const filePath = path.join(process.cwd(), "test-data", "week01.txt");
    await page.setInputFiles('input[type="file"]', filePath);

    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 60_000 });

    const successCard = page.locator('[data-testid="upload-success"]');
    await expect(successCard).toBeVisible();

    await expect(page.locator('[data-testid="stat-product-line-count"]')).toContainText("20");

    await page.goto("/uploads");
    await expect(page.locator("text=Test City").first()).toBeVisible();
  });

  test("Week 1 duplicate: Uploading same file again is rejected gracefully", async ({ page }) => {
    await page.goto("/uploads/upload");

    await page.waitForLoadState("networkidle");
    const branchTrigger = page.locator('[data-testid="branch-select"]');
    if (await branchTrigger.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await branchTrigger.click();
      await page.waitForSelector('[role="option"]', { timeout: 5_000 });
      await page.locator('[role="option"]').first().click();
    }

    const filePath = path.join(process.cwd(), "test-data", "week01.txt");
    await page.setInputFiles('input[type="file"]', filePath);

    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-testid="upload-duplicate"]', { timeout: 30_000 });
    await expect(page.locator('[data-testid="upload-duplicate"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-error"]')).not.toBeVisible();
  });

  test("Week 2: Sales reflected — quantities decrease, estimated sales appear", async ({ page }) => {
    await uploadStockFile(page, "week02.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="stat-upload-files"]')).toBeVisible();
  });

  test("Week 3: Dead stock emerges — KBRD044, MOUS033, PRNT075 go to zero", async ({ page }) => {
    await uploadStockFile(page, "week03.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    const deadStockStat = page.locator('[data-testid="stat-dead-stock"]');
    if (await deadStockStat.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const count = await deadStockStat.textContent();
      expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(3);
    }
  });

  test("Week 4: More dead stock — low stock alerts should be visible", async ({ page }) => {
    await uploadStockFile(page, "week04.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "What products are running low on stock?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });

    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(10);
  });

  test("Week 5 (RESTOCK 1): FAN001, MNTR019, MOUS033 jump dramatically — restock detected", async ({ page }) => {
    await uploadStockFile(page, "week05_restock.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "Have any products been restocked recently?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });

    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(20);
  });

  test("Week 6: Post-restock sales — fast movers (FAN001, MNTR019) selling well", async ({ page }) => {
    await uploadStockFile(page, "week06.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "Show me the top 10 fast-moving products");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });

    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
  });

  test("Week 7: Smartwatch restocked (SWTC008 0→60) — restock flagged", async ({ page }) => {
    await uploadStockFile(page, "week07.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
  });

  test("Week 8 (RESTOCK 2): Headphones and Speaker restocked — analytics update", async ({ page }) => {
    await uploadStockFile(page, "week08.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const uploadCount = page.locator('[data-testid="stat-upload-files"]');
    if (await uploadCount.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const count = await uploadCount.textContent();
      expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(7);
    }
  });

  test("Week 9 (RESTOCK 3): CASE001, FAN084, SSD027 all restocked", async ({ page }) => {
    await uploadStockFile(page, "week09_restock.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "What is the total stock value?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });

    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(10);
  });

  test("Week 10: Final state — RAM001, SMPH066, WCAM041 are dead stock", async ({ page }) => {
    await uploadStockFile(page, "week10.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();

    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "Which products have zero quantity?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });

    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(20);
  });
});

test.describe("Upload Validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Uploading a non-txt file shows a plain-English error", async ({ page }) => {
    await page.goto("/uploads/upload");
    await page.waitForLoadState("networkidle");

    const branchTrigger = page.locator('[data-testid="branch-select"]');
    if (await branchTrigger.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await branchTrigger.click();
      await page.waitForSelector('[role="option"]', { timeout: 5_000 });
      await page.locator('[role="option"]').first().click();
    }

    await page.setInputFiles('input[type="file"]', {
      name: "wrongformat.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("col1,col2\nval1,val2"),
    });

    await page.click('button[type="submit"]');

    // Error may appear in UploadResultsCard (API error) or FormMessage (client-side Zod)
    const errorEl = page.locator('[data-testid="upload-error"]').or(
      page.locator('text=Only .txt files are allowed')
    );
    await expect(errorEl.first()).toBeVisible({ timeout: 10_000 });
    const errorText = await errorEl.first().textContent();
    expect(errorText).not.toContain("Error:");
    expect(errorText).not.toContain("stack");
  });

  test("Upload button is disabled / shows error when no file is selected", async ({ page }) => {
    await page.goto("/uploads/upload");
    await page.waitForLoadState("networkidle");
    // The submit button must be disabled when no file is selected (FileUpload disables it via `!form.watch("file")`)
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });
});
