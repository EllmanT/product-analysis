import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsBranchUser } from "../helpers/auth";

test.describe("Authentication", () => {
  test("unauthenticated user visiting / is redirected to /sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("unauthenticated user visiting /dashboard is redirected to /sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("sign-in page shows only email+password form, no OAuth buttons", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Google")')).not.toBeVisible();
    await expect(page.locator('button:has-text("GitHub")')).not.toBeVisible();
  });

  test("admin can log in and reaches dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('a[href*="/users"]')).toBeVisible();
  });

  test("branch user can log in", async ({ page }) => {
    await loginAsBranchUser(page);
    await expect(page).toHaveURL(/dashboard|uploads/);
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/dashboard/);
  });

  test("sign-up page redirects to sign-in", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/sign-in/);
  });
});
