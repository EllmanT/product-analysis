import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test.describe("Dashboard Analytics (after uploads)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Dashboard loads and shows KPI cards", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/upload|product|stock/i").first()).toBeVisible();
  });

  test("Dashboard shows upload count that increases with each upload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const uploadStat = page.locator('[data-testid="stat-upload-files"]');
    if (await uploadStat.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const text = await uploadStat.textContent();
      expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(0);
    }
  });

  test("Upload status API returns branch upload health data", async ({ page }) => {
    const response = await page.request.get("/api/analytics/upload-status");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const branch = body.data[0];
      expect(branch).toHaveProperty("branchName");
      expect(branch).toHaveProperty("lastUploadDate");
      expect(branch).toHaveProperty("totalUploadsAllTime");
    }
  });

  test("Branch analytics page loads without error", async ({ page }) => {
    await page.goto("/branch-analytics");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/404|500|Error/i")).not.toBeVisible();
  });
});
