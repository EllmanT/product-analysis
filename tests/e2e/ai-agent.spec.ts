import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test.describe("AI Stock Agent", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/ai-agent");
    await page.waitForLoadState("networkidle");
  });

  test("AI agent page loads with input and quick questions", async ({ page }) => {
    await expect(page.locator('[data-testid="ai-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-send"]')).toBeVisible();
    await expect(page.locator("text=/running low|fast-moving|zero quantity|stock value/i").first()).toBeVisible();
  });

  test("Can ask about low stock and get a response", async ({ page }) => {
    await page.fill('[data-testid="ai-input"]', "What products are running low?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response!.length).toBeGreaterThan(15);
  });

  test("Can ask about total stock value and get a response with numbers", async ({ page }) => {
    await page.fill('[data-testid="ai-input"]', "What is the total stock value?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response!.length).toBeGreaterThan(15);
  });

  test("Can click a quick question chip and get a response", async ({ page }) => {
    await page.locator("text=/running low/i").first().click();
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response!.length).toBeGreaterThan(15);
  });

  test("AI response does not show raw JSON or stack traces", async ({ page }) => {
    await page.fill('[data-testid="ai-input"]', "Which branch uploaded most recently?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).not.toContain('"_id"');
    expect(response).not.toContain("ObjectId");
    expect(response).not.toContain("Error:");
  });
});
