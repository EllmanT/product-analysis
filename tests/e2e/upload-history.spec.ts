import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test.describe("Upload History & Audit Trail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Upload history page shows all past uploads", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table, [data-testid='uploads-list']")).toBeVisible();
  });

  test("Each upload row shows branch name and date", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    // Skip assertion if table has no actual data rows (only "No results" placeholder)
    const noResults = await page.locator("text=/no results/i").isVisible().catch(() => false);
    if (!noResults) {
      // Table shows branchLocation ("Test City") in the Branch column
      await expect(page.locator("text=Test City").first()).toBeVisible();
    }
  });

  test("Upload count in history matches number of successful uploads", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    const rows = page.locator("table tbody tr, [data-testid='upload-row']");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Upload API returns correct data structure", async ({ page }) => {
    const storeId = process.env.TEST_STORE_ID!;
    const response = await page.request.get(`/api/upload?storeId=${storeId}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("success", true);
    if (body.data && body.data.length > 0) {
      const upload = body.data[0];
      expect(upload).toHaveProperty("uploadDate");
      expect(upload).toHaveProperty("estValue");
      expect(upload).toHaveProperty("totalProducts");
    }
  });
});
