import { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|\/uploads/, { timeout: 30_000 });
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!);
}

export async function loginAsBranchUser(page: Page) {
  await loginAs(page, process.env.TEST_BRANCH_EMAIL!, process.env.TEST_BRANCH_PASSWORD!);
}
