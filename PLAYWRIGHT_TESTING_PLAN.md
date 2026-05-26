# Stock Analysis Platform — Playwright E2E Testing Plan
**Date:** 2026-05-21  
**Purpose:** Orchestration prompt for a new Claude Code session to implement and run end-to-end Playwright tests for the stock analysis platform.

---

## HOW TO USE THIS FILE

Paste the contents of this file into a new Claude Code chat and say:
> "Read PLAYWRIGHT_TESTING_PLAN.md and implement everything in it step by step, spinning up specialized sub-agents as described."

---

## 1. PLATFORM OVERVIEW (Read This Before Writing Any Code)

This is a **Next.js 16 App Router** project (TypeScript, Tailwind CSS, MongoDB/Mongoose, NextAuth v5-beta).

**Core user flow:**
1. Branch user (or admin) logs in with email + password
2. Navigates to `/uploads/upload`
3. Uploads a `.txt` stock file once per day
4. The system parses the file, stores products, calculates weekly analytics
5. User views analytics at `/dashboard`, `/branch-analytics`, `/product-movement`
6. User can query stock data via the AI agent at `/ai-agent`

### Critical file paths
```
app/(admin)/dashboard/page.tsx        — dashboard KPIs
app/(admin)/uploads/upload/page.tsx   — upload form
app/(admin)/uploads/page.tsx          — upload history list
app/(admin)/ai-agent/page.tsx         — AI chat agent
app/(auth)/sign-in/page.tsx           — login page
components/FileUpload.tsx             — main upload component
app/api/products/upload/route.ts      — upload API
app/api/analytics/route.ts            — dashboard KPIs API
app/api/ai-agent/route.ts             — AI agent API
lib/ai/buildStockContext.ts           — AI data context builder
```

### TXT file format (4 columns, comma-separated)
```
productCode,productName,quantity,price
CASE001,Case 1,81,820.83
FAN001,Fan 1,5,1823.23
```
- Column 0: Unique product code
- Column 1: Product name/description
- Column 2: Quantity (integer; 0 = dead stock; blank = treated as 0)
- Column 3: Unit price (float)

### Upload API internals
- `POST /api/products/upload` — multipart FormData: `file`, `storeId`, `branchId`
- Duplicate detection: SHA256 hash + userId + storeId + branchId + date (prevents same file uploaded twice in one day; **different content on same day is allowed**)
- Creates `Upload` (metadata) + `UploadProduct` (one per line) + `ProductMaster` (auto-creates new products)
- **Weekly summary logic**: On each upload, compares current qty to previous upload for same product+branch. If `currentQty > prevQty` → `restocked = true` in `WeeklyProductSummaries`.

### Stock classification logic
| Status | Condition |
|--------|-----------|
| Active stock | qty > 0 |
| Low stock | qty between 1 and 5 (inclusive) |
| Dead stock | qty = 0 |
| Restock detected | currentQty > previousQty for same product+branch |

### Analytics KPIs (from `/api/analytics`)
Returns: `estStockValue`, `productCount`, `currentStockQty`, `totalEstimatedSales`, `totalQuantitySold`, `totalBranches`, `totalUploadFiles`, `totalStoreUsers`

### AI Agent
- `POST /api/ai-agent` with body `{ question: string }`
- Uses Claude Haiku 4.5, queries live DB for context (low stock, dead stock, top movers, upload status)
- Context cached 5 minutes per storeId

---

## 2. TEST DATA (Already Created)

The folder `test-data/` contains 10 pre-built upload files simulating 10 weeks of real-world use. **All files use unique product codes** so the system correctly tracks each product across uploads.

### Files and their scenarios

| File | Scenario | Key Events |
|------|----------|------------|
| `test-data/week01.txt` | Initial stock baseline | First upload ever, 20 products |
| `test-data/week02.txt` | Week 2 — regular sales | Most products down 10–20% |
| `test-data/week03.txt` | Week 3 — sales continue | KBRD044, MOUS033, PRNT075 go to dead stock (qty=0) |
| `test-data/week04.txt` | Week 4 — more sales | CHRG090, LAPT090 go dead; HDPH005, SWTC008 critical (qty=1) |
| `test-data/week05_restock.txt` | **RESTOCK EVENT 1** | FAN001: 2→100, MNTR019: 6→100, MOUS033: 0→100 |
| `test-data/week06.txt` | Week 6 — post-restock sales | CASE043, SWTC008, SPKR018, HDPH005 go dead |
| `test-data/week07.txt` | Week 7 — more sales | SWTC008 restocked (0→60); CASE043 goes to dead stock |
| `test-data/week08.txt` | **RESTOCK EVENT 2 (partial)** | HDPH005: 0→80, SPKR018: 0→100; CASE001 critical (qty=2) |
| `test-data/week09_restock.txt` | **RESTOCK EVENT 3** | CASE001: 2→90, CASE043: 0→50, FAN084: 0→100, SSD027: 0→75 |
| `test-data/week10.txt` | Current state | RAM001, SMPH066, WCAM041 at 0 (dead stock); others stable |

### Products and their behavior story
| Code | Name | Price | Behavior |
|------|------|-------|----------|
| CASE001 | Case 1 | 820.83 | Fast mover; restocked at W9 |
| CASE043 | Case 43 | 1679.27 | Medium mover; dead W7, restocked W9 |
| CHRG003 | Charger 3 | 35.87 | Slow mover; dead by W8 (never restocked) |
| CHRG090 | Charger 90 | 1484.86 | Dead by W4, never restocked (dead stock) |
| CPU038 | CPU 38 | 934.18 | Very slow mover; always 1-5 (low stock alert) |
| FAN001 | Fan 1 | 1823.23 | Fast mover after W5 restock (2→100) |
| FAN084 | Fan 84 | 639.31 | Dead W6, massive restock at W9 (0→100) |
| HDPH005 | Headphones 5 | 1567.88 | Dead W6, restocked W8 (0→80) |
| KBRD044 | Keyboard 44 | 1283.41 | Dead by W3 (never restocked) — dead stock |
| LAPT090 | Laptop 90 | 1257.21 | Dead by W4 (never restocked) — dead stock |
| MICR028 | Microphone 28 | 1377.73 | Very slow mover; always low (1-3 units) |
| MNTR019 | Monitor 19 | 54.37 | Fast mover after W5 restock |
| MOUS033 | Mouse 33 | 563.27 | Dead W3, restocked W5 (0→100) |
| PRNT075 | Printer 75 | 1100.62 | Dead by W3 (never restocked) — dead stock |
| RAM001 | RAM 1 | 1761.52 | Steady decline; dead at W10 |
| SMPH066 | Smartphone 66 | 222.50 | Steady decline; dead at W10 |
| SWTC008 | Smartwatch 8 | 1482.89 | Dead W6, restocked W7 (0→60) |
| SPKR018 | Speaker 18 | 1564.32 | Dead W6, restocked W8 (0→100) |
| SSD027 | SSD 27 | 1454.68 | Dead W5, restocked W9 (0→75) |
| WCAM041 | Webcam 41 | 1560.40 | Steady decline; dead at W10 |

---

## 3. PRE-TEST SETUP REQUIREMENTS

Before running Playwright tests, the following must exist in the MongoDB database:

### 3a. Required DB State
- **Store**: One store record
- **Branch**: One branch assigned to the test store (e.g., name: "Test Branch", location: "Test City")
- **Admin user**: Email: `admin@testbranch.com`, password: `Admin@123456`, role: `admin`, storeId: the store above
- **Branch user**: Email: `branch@testbranch.com`, password: `Branch@123456`, role: `branch_user`, storeId: the store, branchId: the branch above

### 3b. How to Set Up Test Users
Option A: Use the app's admin UI:
1. Start the app (`npm run dev`)
2. Log in as an existing admin
3. Navigate to `/branches` → create a branch called "Test Branch" in "Test City"
4. Navigate to `/users` → create the admin and branch users above

Option B: Create a seed script at `scripts/seed-test-data.ts` that inserts the above records directly into MongoDB (safer for CI).

**IMPORTANT**: After creating the users and branch, get the `storeId` and `branchId` from the DB and put them in `.env.test`.

### 3c. Environment File
Create `.env.test` in the project root:
```env
TEST_BASE_URL=http://localhost:3000
TEST_ADMIN_EMAIL=admin@testbranch.com
TEST_ADMIN_PASSWORD=Admin@123456
TEST_BRANCH_EMAIL=branch@testbranch.com
TEST_BRANCH_PASSWORD=Branch@123456
TEST_STORE_ID=<paste-store-objectid-here>
TEST_BRANCH_ID=<paste-branch-objectid-here>
TEST_BRANCH_NAME=Test Branch
```

---

## 4. PLAYWRIGHT SETUP (Agent 1 Task)

### 4a. Install Playwright
```bash
npm install -D @playwright/test
npx playwright install chromium
```

### 4b. Create `playwright.config.ts` in project root
```typescript
import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // uploads must be sequential
  retries: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

### 4c. Add test scripts to `package.json`
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## 5. TEST FILE STRUCTURE TO CREATE

```
tests/
  e2e/
    auth.spec.ts          — Login/logout flows
    upload.spec.ts        — File upload scenarios (the main test suite)
    analytics.spec.ts     — Dashboard KPI validation after uploads
    ai-agent.spec.ts      — AI agent question/answer tests
    upload-history.spec.ts — Upload history list and audit trail
  helpers/
    auth.ts               — Shared login helper
    upload.ts             — Shared file upload helper
    db.ts                 — DB query helpers for test assertions
```

---

## 6. DETAILED TEST SPECIFICATIONS

### 6a. `tests/helpers/auth.ts`
```typescript
import { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|\/uploads/, { timeout: 15_000 });
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!);
}

export async function loginAsBranchUser(page: Page) {
  await loginAs(page, process.env.TEST_BRANCH_EMAIL!, process.env.TEST_BRANCH_PASSWORD!);
}
```

### 6b. `tests/helpers/upload.ts`
```typescript
import { Page, expect } from "@playwright/test";
import path from "path";

export async function uploadStockFile(
  page: Page,
  filename: string,
  branchId?: string
) {
  await page.goto("/uploads/upload");
  
  // Select branch if branch picker is visible (admin only)
  const branchSelect = page.locator('select[name="branchId"], [data-testid="branch-select"]');
  if (await branchSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if (branchId) {
      await branchSelect.selectOption(branchId);
    }
  }

  // Upload the file
  const filePath = path.join(process.cwd(), "test-data", filename);
  await page.setInputFiles('input[type="file"]', filePath);
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for result (success, duplicate, or error)
  await page.waitForSelector(
    '[data-testid="upload-success"], [data-testid="upload-duplicate"], [data-testid="upload-error"]',
    { timeout: 30_000 }
  );
}

export async function getDashboardStats(page: Page) {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  // Extract KPI values from the dashboard — adjust selectors to match actual rendered text
  return {
    productCount: await page.locator('[data-testid="stat-product-count"]').textContent(),
    stockValue: await page.locator('[data-testid="stat-stock-value"]').textContent(),
    uploadFiles: await page.locator('[data-testid="stat-upload-files"]').textContent(),
  };
}
```

### 6c. `tests/e2e/auth.spec.ts`
```typescript
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
    // OAuth buttons should NOT be visible
    await expect(page.locator('button:has-text("Google")')).not.toBeVisible();
    await expect(page.locator('button:has-text("GitHub")')).not.toBeVisible();
  });

  test("admin can log in and reaches dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/dashboard/);
    // Admin nav should show Users and Branches
    await expect(page.locator('a[href*="/users"]')).toBeVisible();
  });

  test("branch user can log in", async ({ page }) => {
    await loginAsBranchUser(page);
    // Branch user should also reach dashboard or upload page
    await expect(page).toHaveURL(/dashboard|uploads/);
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Should stay on sign-in or show error
    await expect(page).not.toHaveURL(/dashboard/);
  });

  test("sign-up page redirects to sign-in", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/sign-in/);
  });
});
```

### 6d. `tests/e2e/upload.spec.ts`
This is the MAIN test suite. It simulates the full 10-week upload sequence.

```typescript
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";
import { uploadStockFile } from "../helpers/upload";
import path from "path";

const BRANCH_ID = process.env.TEST_BRANCH_ID!;

test.describe("Stock Upload — Full 10-Week Simulation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Week 1: Initial upload — baseline stock established", async ({ page }) => {
    await page.goto("/uploads/upload");
    
    const filePath = path.join(process.cwd(), "test-data", "week01.txt");
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Select branch
    const branchSelect = page.locator('select[name="branchId"]');
    if (await branchSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await branchSelect.selectOption(BRANCH_ID);
    }
    await page.click('button[type="submit"]');
    
    // Wait for success
    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30_000 });
    
    // Verify success card shows correct data
    const successCard = page.locator('[data-testid="upload-success"]');
    await expect(successCard).toBeVisible();
    
    // Should show 20 products were loaded
    await expect(page.locator('[data-testid="stat-product-line-count"]')).toContainText("20");
    
    // Verify upload appears in history
    await page.goto("/uploads");
    await expect(page.locator('text="Test Branch"').first()).toBeVisible();
  });

  test("Week 1 duplicate: Uploading same file again is rejected gracefully", async ({ page }) => {
    await page.goto("/uploads/upload");
    
    const filePath = path.join(process.cwd(), "test-data", "week01.txt");
    await page.setInputFiles('input[type="file"]', filePath);
    
    const branchSelect = page.locator('select[name="branchId"]');
    if (await branchSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await branchSelect.selectOption(BRANCH_ID);
    }
    await page.click('button[type="submit"]');
    
    // Should show duplicate message, NOT an error
    await page.waitForSelector('[data-testid="upload-duplicate"]', { timeout: 30_000 });
    await expect(page.locator('[data-testid="upload-duplicate"]')).toBeVisible();
    // Must NOT show a raw error or stack trace
    await expect(page.locator('[data-testid="upload-error"]')).not.toBeVisible();
  });

  test("Week 2: Sales reflected — quantities decrease, estimated sales appear", async ({ page }) => {
    // Upload Week 2
    await uploadStockFile(page, "week02.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // Verify dashboard shows updated stock value (lower than after Week 1)
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Dashboard should still show 20 products and some estimated sales
    await expect(page.locator('[data-testid="stat-upload-files"]')).toBeVisible();
  });

  test("Week 3: Dead stock emerges — KBRD044, MOUS033, PRNT075 go to zero", async ({ page }) => {
    await uploadStockFile(page, "week03.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // Upload result card should show some "out of stock" count
    const deadStockStat = page.locator('[data-testid="stat-dead-stock"]');
    if (await deadStockStat.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const count = await deadStockStat.textContent();
      expect(parseInt(count ?? "0")).toBeGreaterThanOrEqual(3);
    }
  });

  test("Week 4: More dead stock — low stock alerts should be visible", async ({ page }) => {
    await uploadStockFile(page, "week04.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // At this point: HDPH005(1), SWTC008(1), FAN001(2), FAN084(2) are at 1-2 units
    // AI agent should confirm low stock items
    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "What products are running low on stock?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    // Response should mention one or more of the low-stock items
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(10);
  });

  test("Week 5 (RESTOCK 1): FAN001, MNTR019, MOUS033 jump dramatically — restock detected", async ({ page }) => {
    await uploadStockFile(page, "week05_restock.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // AI agent should detect restocks
    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "Have any products been restocked recently?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    // Response should be meaningful (not empty or error)
    expect(response!.length).toBeGreaterThan(20);
  });

  test("Week 6: Post-restock sales — fast movers (FAN001, MNTR019) selling well", async ({ page }) => {
    await uploadStockFile(page, "week06.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // Ask AI about fast-moving products
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
    
    // Verify total upload count on dashboard
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
    
    // AI: total stock value should now be higher (restocked)
    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "What is the total stock value?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    // Value should be a dollar figure
    expect(response).toMatch(/\$|dollar|value/i);
  });

  test("Week 10: Final state — RAM001, SMPH066, WCAM041 are dead stock", async ({ page }) => {
    await uploadStockFile(page, "week10.txt", BRANCH_ID);
    await expect(page.locator('[data-testid="upload-success"]')).toBeVisible();
    
    // AI: query zero-quantity products
    await page.goto("/ai-agent");
    await page.fill('[data-testid="ai-input"]', "Which products have zero quantity?");
    await page.click('[data-testid="ai-send"]');
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 20_000 });
    
    const response = await page.locator('[data-testid="ai-response"]').last().textContent();
    expect(response).toBeTruthy();
    // Should mention at least one product that is out of stock
    expect(response!.length).toBeGreaterThan(20);
  });
});

test.describe("Upload Validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Uploading a non-txt file shows a plain-English error", async ({ page }) => {
    await page.goto("/uploads/upload");
    // Try uploading a .csv file (wrong format)
    // Create a temp blob/file reference
    await page.setInputFiles('input[type="file"]', {
      name: "wrongformat.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("col1,col2\nval1,val2"),
    });
    
    const branchSelect = page.locator('select[name="branchId"]');
    if (await branchSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await branchSelect.selectOption(BRANCH_ID);
    }
    await page.click('button[type="submit"]');
    
    // Should show error
    await page.waitForSelector('[data-testid="upload-error"]', { timeout: 10_000 });
    const errorText = await page.locator('[data-testid="upload-error"]').textContent();
    // Error must be in plain English, not a stack trace
    expect(errorText).not.toContain("Error:");
    expect(errorText).not.toContain("stack");
  });

  test("Upload button is disabled / shows error when no file is selected", async ({ page }) => {
    await page.goto("/uploads/upload");
    await page.click('button[type="submit"]');
    // Should show validation error or button should be disabled
    const hasError = await page.locator('[data-testid="upload-error"]').isVisible({ timeout: 3_000 }).catch(() => false);
    const isDisabled = await page.locator('button[type="submit"]').isDisabled({ timeout: 1_000 }).catch(() => false);
    expect(hasError || isDisabled).toBeTruthy();
  });
});
```

### 6e. `tests/e2e/analytics.spec.ts`
```typescript
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test.describe("Dashboard Analytics (after uploads)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Dashboard loads and shows KPI cards", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // At minimum, key stat cards should be visible
    await expect(page.locator("text=/upload|product|stock/i").first()).toBeVisible();
  });

  test("Dashboard shows upload count that increases with each upload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // After 10 uploads, count should be >= 10
    const uploadStat = page.locator('[data-testid="stat-upload-files"]');
    if (await uploadStat.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const text = await uploadStat.textContent();
      expect(parseInt(text ?? "0")).toBeGreaterThanOrEqual(1);
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
    // Should not show a 404 or 500 error
    await expect(page.locator("text=/404|500|Error/i")).not.toBeVisible();
  });
});
```

### 6f. `tests/e2e/ai-agent.spec.ts`
```typescript
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
    // At least some quick question chips should be visible
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
    // Click one of the quick question buttons
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
```

### 6g. `tests/e2e/upload-history.spec.ts`
```typescript
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/auth";

test.describe("Upload History & Audit Trail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Upload history page shows all past uploads", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    // Should show a list/table of past uploads
    await expect(page.locator("table, [data-testid='uploads-list']")).toBeVisible();
  });

  test("Each upload row shows branch name and date", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    // Branch name should appear
    await expect(page.locator("text=Test Branch").first()).toBeVisible();
  });

  test("Upload count in history matches number of successful uploads", async ({ page }) => {
    await page.goto("/uploads");
    await page.waitForLoadState("networkidle");
    // After 10 successful uploads (same branch, different content), should show >= 10 rows
    const rows = page.locator("table tbody tr, [data-testid='upload-row']");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Upload API returns correct data structure", async ({ page }) => {
    const response = await page.request.get("/api/upload");
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
```

---

## 7. REQUIRED `data-testid` ATTRIBUTES (Agent 2 Task)

The Playwright tests use `data-testid` attributes to find elements reliably. The implementing agent must add these to the React components.

### `components/FileUpload.tsx` — Add these testids
| Element | data-testid |
|---------|-------------|
| File input | (already `input[type="file"]`, no testid needed) |
| Branch select | `branch-select` |
| Submit button | (already `button[type="submit"]`) |
| Success state container | `upload-success` |
| Duplicate state container | `upload-duplicate` |
| Error state container | `upload-error` |
| Product line count stat | `stat-product-line-count` |
| Dead stock stat | `stat-dead-stock` |

### `app/(admin)/ai-agent/page.tsx` — Add these testids
| Element | data-testid |
|---------|-------------|
| Text input | `ai-input` |
| Send button | `ai-send` |
| Each AI response message | `ai-response` |

### `app/(admin)/dashboard/page.tsx` — Add these testids
| Element | data-testid |
|---------|-------------|
| Product count KPI | `stat-product-count` |
| Stock value KPI | `stat-stock-value` |
| Upload files count | `stat-upload-files` |
| Total sales KPI | `stat-total-sales` |

---

## 8. IMPLEMENTATION AGENT ASSIGNMENTS

Spin up these agents in sequence (or some in parallel where noted):

### Agent A — Setup & Config (run first)
**Task:** Set up Playwright in the project.
1. Install `@playwright/test` and `playwright` as dev dependencies
2. Run `npx playwright install chromium`
3. Create `playwright.config.ts` (spec above in section 4b)
4. Add test scripts to `package.json` (section 4c)
5. Create the directory structure: `tests/e2e/` and `tests/helpers/`
6. Create the `.env.test` file template (with placeholder values)

### Agent B — Add data-testid attributes (run after Agent A, can parallel with Agent C)
**Task:** Add `data-testid` attributes to React components.
1. Read `components/FileUpload.tsx` and `components/uploads/UploadResultsCard.tsx`
2. Add `data-testid="upload-success"` to the success state container in UploadResultsCard
3. Add `data-testid="upload-duplicate"` to the duplicate state container
4. Add `data-testid="upload-error"` to the error state container
5. Add `data-testid="stat-product-line-count"` to the product line count stat pill
6. Add `data-testid="stat-dead-stock"` to the dead stock stat pill
7. Read `app/(admin)/ai-agent/page.tsx`
8. Add `data-testid="ai-input"` to the question text input
9. Add `data-testid="ai-send"` to the send button
10. Add `data-testid="ai-response"` to each assistant message container
11. Read `app/(admin)/dashboard/page.tsx`
12. Add `data-testid="stat-upload-files"` to the upload count card
13. Add `data-testid="stat-stock-value"` to the stock value card
14. Add `data-testid="stat-product-count"` to the product count card

### Agent C — Write Helper Files (can parallel with Agent B)
**Task:** Create the test helper files.
1. Create `tests/helpers/auth.ts` (spec in section 6a)
2. Create `tests/helpers/upload.ts` (spec in section 6b)

### Agent D — Write Test Files (run after Agents B and C)
**Task:** Create all e2e test files.
1. Create `tests/e2e/auth.spec.ts` (spec in section 6c)
2. Create `tests/e2e/upload.spec.ts` (spec in section 6d)
3. Create `tests/e2e/analytics.spec.ts` (spec in section 6e)
4. Create `tests/e2e/ai-agent.spec.ts` (spec in section 6f)
5. Create `tests/e2e/upload-history.spec.ts` (spec in section 6g)

### Agent E — Seed Script (can run parallel with Agents B/C/D)
**Task:** Create a DB seed script for test users.
File: `scripts/seed-test-users.ts`
Purpose: Creates the test store, branch, admin user, and branch user in MongoDB.

The seed script should:
1. Connect to MongoDB using the `MONGODB_URI` from `.env`
2. Create a Store document if one doesn't exist for test
3. Create a Branch: `{ name: "Test Branch", location: "Test City", storeId }`
4. Create admin user: `{ email: "admin@testbranch.com", name: "Test Admin", role: "admin", storeId }`
5. Create branch user: `{ email: "branch@testbranch.com", name: "Test Branch User", role: "branch_user", storeId, branchId }`
6. Hash passwords with bcrypt (use the same method as the existing user creation in the codebase)
7. Print out the storeId and branchId so they can be put in `.env.test`

Run with: `npx ts-node scripts/seed-test-users.ts`

### Agent F — Run Tests & Report (run last, after all others complete)
**Task:** Start the app and run the Playwright test suite.
1. Ensure the app is running (`npm run dev` in background or check if it's running)
2. Verify `.env.test` has real values for storeId and branchId
3. Run `npm run test:e2e` 
4. Report which tests pass and which fail
5. For any failing tests: read the error, identify the selector mismatch, and fix it
6. Re-run until all critical tests pass (auth, upload week01, dashboard, ai-agent basic)

---

## 9. WHAT SUCCESS LOOKS LIKE

After full implementation, these scenarios must all work:

### Authentication scenarios ✓
- [ ] Visiting `/` redirects to `/sign-in`
- [ ] Can log in as admin with email + password
- [ ] Can log in as branch user
- [ ] Wrong credentials don't log in
- [ ] `/sign-up` redirects to `/sign-in`
- [ ] OAuth buttons are not visible on sign-in page

### Upload scenarios ✓
- [ ] Week01 upload succeeds and shows 20 products in success card
- [ ] Same file uploaded twice shows duplicate warning (not a crash)
- [ ] Week02 uploads and shows decreased quantities
- [ ] Week05 (restock) uploads successfully
- [ ] Week10 upload succeeds
- [ ] All 10 files can be uploaded sequentially without errors
- [ ] Uploading a non-`.txt` file shows plain-English error

### Analytics scenarios ✓
- [ ] Dashboard shows KPI cards after upload
- [ ] Upload count increases with each successful upload
- [ ] `/api/analytics/upload-status` returns branch health data
- [ ] Branch analytics page loads without error

### AI Agent scenarios ✓
- [ ] AI agent page loads with input and quick questions
- [ ] Can ask "What products are running low?" and get a useful answer
- [ ] Can ask "What is the total stock value?" and get a numeric answer
- [ ] Clicking a quick question chip triggers a response
- [ ] AI responses don't contain raw JSON or ObjectIds

### Upload History scenarios ✓
- [ ] Upload history page shows all past uploads
- [ ] Each row shows branch name and upload date
- [ ] `/api/upload` returns correct data structure

---

## 10. KNOWN CAVEATS & IMPORTANT NOTES FOR IMPLEMENTING AGENTS

1. **Test isolation**: The 10-week upload test suite is sequential — each test builds on the previous. Use `test.describe.configure({ mode: "serial" })` for the upload suite.

2. **Duplicate detection**: The system prevents the same file from being uploaded twice ON THE SAME CALENDAR DAY. Since all 10 uploads happen during testing on the same day, each file must have genuinely different content (they do — quantities differ).

3. **Selector fragility**: The provided selectors (e.g., `'button[type="submit"]'`) are best guesses from reading the component code. The implementing agent must READ the actual component JSX to confirm selectors before writing tests, then adjust if needed.

4. **AI response assertions**: AI responses are non-deterministic. Never assert exact string matches. Always check: length > 15, contains no raw JSON/error, and is truthy.

5. **Timing**: The upload API processes products line by line. For 20 products, allow up to 30 seconds for the upload API to respond. This is already set in the `waitForSelector` calls.

6. **Auth tokens**: After login, NextAuth sets a session cookie. Playwright persists cookies within a test but NOT between tests unless `storageState` is used. Add a global setup in `playwright.config.ts` to save auth state once and reuse it.

7. **Port conflicts**: If port 3000 is taken, update `TEST_BASE_URL` in `.env.test` accordingly.

8. **MongoDB**: Tests require a live MongoDB connection. Ensure `MONGODB_URI` is set in `.env.local` or `.env`.

9. **ANTHROPIC_API_KEY**: The AI agent tests call the real Claude API. Ensure `ANTHROPIC_API_KEY` is set in `.env.local`. If you want to mock Claude in CI, skip `ai-agent.spec.ts` in CI runs.

10. **The products.txt file format mismatch**: The existing `public/products.txt` file uses format `date,name,price,qty` which does NOT match the current API column order (`code,name,qty,price`). The 10 new test data files in `test-data/` use the CORRECT format (`code,name,qty,price`) and are what should be used for testing.

---

## 11. REFERENCE — Key API Endpoints for Manual Testing

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/products/upload` | POST | Upload TXT stock file |
| `GET /api/upload` | GET | Upload history list |
| `GET /api/analytics` | GET | Dashboard KPIs |
| `GET /api/analytics/upload-status` | GET | Branch upload health |
| `GET /api/analytics/branches?storeId=X` | GET | Branch sales chart data |
| `GET /api/analytics/products?storeId=X&productId=Y` | GET | Product sales history |
| `POST /api/ai-agent` | POST | AI stock query |
| `GET /api/branches` | GET | Available branches |
| `GET /api/admin/products?page=1&limit=20` | GET | Product list |

---

*This plan was prepared by analyzing the full codebase including: `app/api/products/upload/route.ts`, `app/api/analytics/route.ts`, `app/api/ai-agent/route.ts`, `lib/ai/buildStockContext.ts`, `database/*.model.ts`, `components/FileUpload.tsx`, `components/uploads/UploadResultsCard.tsx`, and `app/(admin)/dashboard/page.tsx`.*

*The 10 test data files are in `test-data/` and are ready to use.*
