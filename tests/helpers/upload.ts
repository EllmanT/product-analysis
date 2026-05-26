import { Page } from "@playwright/test";
import path from "path";

async function selectBranchIfVisible(page: Page) {
  // Handle Radix UI Select (not a native <select>). Wait for network idle so branches have loaded.
  await page.waitForLoadState("networkidle");
  const branchTrigger = page.locator('[data-testid="branch-select"]');
  if (await branchTrigger.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await branchTrigger.click();
    await page.waitForSelector('[role="option"]', { timeout: 5_000 });
    await page.locator('[role="option"]').first().click();
  }
}

export async function uploadStockFile(
  page: Page,
  filename: string,
  _branchId?: string
) {
  await page.goto("/uploads/upload");

  await selectBranchIfVisible(page);

  const filePath = path.join(process.cwd(), "test-data", filename);
  await page.setInputFiles('input[type="file"]', filePath);

  await page.click('button[type="submit"]');

  await page.waitForSelector(
    '[data-testid="upload-success"], [data-testid="upload-duplicate"], [data-testid="upload-error"]',
    { timeout: 50_000 }
  );
}

export async function getDashboardStats(page: Page) {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  return {
    productCount: await page.locator('[data-testid="stat-product-count"]').textContent(),
    stockValue: await page.locator('[data-testid="stat-stock-value"]').textContent(),
    uploadFiles: await page.locator('[data-testid="stat-upload-files"]').textContent(),
  };
}
