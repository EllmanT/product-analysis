# Stock Analysis Platform — Implementation Plan

**Date:** 2026-05-21  
**Prepared for:** Orchestrator Agent / Multi-Agent Implementation  
**Goal:** Strip the platform down to its core stock-upload-and-analysis product, hide all e-commerce and fiscalization features, add an AI stock-query agent, and harden UX for non-tech-savvy branch users.

---

## 0. Context & Architecture Overview

This is a **Next.js 16 App Router** project (TypeScript, Tailwind CSS 4, MongoDB/Mongoose, NextAuth v5-beta) deployed as a multi-tenant SaaS.

### Folder layout that matters
```
app/
  (admin)/           ← protected admin shell (layout.tsx wraps all admin pages)
  (auth)/            ← sign-in, sign-up, unauthorized
  (shop)/            ← ENTIRE e-commerce shell — must be hidden, NOT deleted
  api/               ← ~75 REST routes
  page.tsx           ← public root — currently the shop landing page

components/
  navigation/
    LeftSidebar.tsx  ← renders admin nav from constants/constants.ts
    navbar/NavMain.tsx
    navbar/NavSecondary.tsx
  FileUpload.tsx     ← main TXT upload component (keep, improve UX)

constants/
  constants.ts       ← mainSidebarLinks[] and secondarySidebarLinks[]
  route.ts

database/
  upload.model.ts            ← upload batch metadata
  uploadproduct.model.ts     ← product line-items per upload
  weekly_product_summaries.model.ts
  productmaster.model.ts

auth.ts              ← NextAuth config (Credentials + Google + GitHub)
```

### Roles
- `admin` — full access, can see all branches
- `branch_user` — restricted to their assigned branch

---

## 1. WHAT TO KEEP (Core Product)

| Feature | Pages / Files |
|---------|--------------|
| Admin login (credentials only) | `/sign-in`, `auth.ts` |
| Stock upload (TXT) | `/uploads/upload`, `components/FileUpload.tsx`, `api/products/upload` |
| Upload history | `/uploads`, `api/upload` |
| Upload detail view | `/uploads/view` |
| Branch analytics | `/branch-analytics` |
| Product movement | `/product-movement` |
| Products list (stock view) | `/products` |
| Branch upload reports | `/branch-up-reports` |
| User management | `/users` |
| Branch management | `/branches` |
| Settings | `/settings` |
| Dashboard | `/dashboard` |
| **NEW** AI stock chat agent | `/ai-agent` (new page to create) |

---

## 2. WHAT TO HIDE (Not Delete)

**Rule:** Comment-out or conditionally render with a `HIDDEN_FEATURES` env flag or a simple `hidden` CSS class / early-return. Do **not** delete files, routes, or models.

### 2a. Admin Sidebar Nav Items — Hide These
File: `constants/constants.ts`

Items to hide from `mainSidebarLinks`:
- **Quotations** → `/admin/quotations`
- **Invoices** → `/admin/invoices`
- **Fiscal Day** → `/fiscal-day`
- **Fiscal Settings** → `/fiscal-settings`
- **Z-Reports** → `/z-reports`
- **Exchange Rates** → `/exchange-rates`
- **Homepage** (shop homepage config) → `/homepage`
- **Download Centre** → `/download-centre` *(may keep — decide with client)*

Items to **keep** in nav:
- Dashboard, Uploads (both sub-items), Branch Analytics, Product Movement, Products, Branch Upload Reports, Users, Branches, Settings

### 2b. Homepage — Redirect Away from Shop
File: `app/page.tsx`

Currently renders the e-commerce shop landing page. Change it to a redirect to `/sign-in` (or `/dashboard` if the user is already authenticated).

**Implementation:**
```tsx
// app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/sign-in");
}
```

### 2c. Google / GitHub Login Buttons — Hide on Sign-In Page
File: `app/(auth)/sign-in/page.tsx` (and any auth form components)

- Keep the **credentials form** (email + password) fully functional.
- Wrap the Google and GitHub OAuth buttons in `{false && <GoogleButton />}` or remove them from the JSX render (do not delete the provider config in `auth.ts`).
- The `auth.ts` providers array should remain unchanged so OAuth still works when un-hidden later.

### 2d. Shop Routes — Block Access Gracefully
Files: `app/(shop)/layout.tsx` and all pages under `app/(shop)/`

Two options (pick one — option A is safer):

**Option A:** Add a redirect at the top of `app/(shop)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  redirect("/sign-in"); // shop temporarily disabled
}
```

**Option B:** Add middleware rule to redirect `/browse`, `/cart`, `/checkout`, `/payment`, `/login`, `/register` to `/sign-in`.

Use **Option A** — it keeps all shop files intact and is a one-line change.

### 2e. Admin Pages — Hide (Not Delete) Fiscalization Pages
Files: The page components under:
- `app/(admin)/fiscal-day/`
- `app/(admin)/fiscal-settings/`
- `app/(admin)/z-reports/`
- `app/(admin)/invoices/`
- `app/(admin)/quotations/`
- `app/(admin)/exchange-rates/`
- `app/(admin)/homepage/`

These pages do not need to be changed internally. They will become unreachable once the sidebar links are hidden (Step 2a) and no navigation points to them. No code changes needed in the page files themselves.

---

## 3. UPLOAD HISTORY & TRACKING — Enhancement

The upload model already tracks: `uploadedBy`, `branchId`, `upload_date`, `week`, `month`, `year`, `fileName`, `totalProducts`, `estimatedValue`.

### 3a. What to Add / Improve

**Upload list page** (`app/(admin)/uploads/page.tsx`):
- Ensure the uploads are sorted by `upload_date DESC` (most recent first) by default.
- Add a **"Days since last upload"** indicator per branch on the dashboard or a new summary card so admins can see which branches haven't uploaded recently.
- Add a clear **timestamp column** (date + time) rather than just date in the data table.
- Show the **branch name** prominently.
- Add a **"Upload streak"** indicator: how many consecutive days a branch has uploaded.

**Upload detail page** (`app/(admin)/uploads/view/page.tsx`):
- Ensure it clearly shows: who uploaded, from which branch, at what exact time, file name, total products, total estimated value.

### 3b. New API Endpoint — Branch Upload Status

Create: `app/api/analytics/upload-status/route.ts`

Purpose: For each branch in the store, return:
- `branchName`
- `lastUploadDate`
- `daysSinceLastUpload`
- `totalUploadsLast7Days`
- `totalUploadsAllTime`

This feeds a new **dashboard card** showing branch upload health.

---

## 4. DASHBOARD — Refocus on Stock KPIs

File: `app/(admin)/dashboard/page.tsx`

The existing dashboard may show mixed metrics. Refocus to show only stock-relevant KPIs:

### Cards to Show:
1. **Total Products in Catalog** — count from ProductMaster
2. **Last Upload Per Branch** — branch name + days ago
3. **Branches Not Uploaded Today** — count/list
4. **Low Stock Items** — count of products with qty below threshold
5. **Dead Stock** — count of products with qty = 0
6. **Top 10 Fast-Moving Products** — by estimated sales velocity (from WeeklyProductSummaries)

### Charts to Show:
- **Upload frequency chart** — bar chart, last 30 days, uploads per branch per day
- **Stock level trend** — line chart of total quantity across all branches over time

Remove or hide: any e-commerce/revenue/invoice KPIs from the dashboard.

---

## 5. STOCK UPLOAD UI — UX Audit & Improvements

File: `components/FileUpload.tsx`, `app/(admin)/uploads/upload/page.tsx`

### UX Improvements for Non-Tech-Savvy Users:

1. **Page Heading:** Change to "Upload Today's Stock File" — simple, action-oriented.

2. **Instructions Panel:** Add a clearly visible step-by-step panel above the upload dropzone:
   - Step 1: Make sure your stock file is in `.txt` format
   - Step 2: Select your branch from the dropdown (admin only)
   - Step 3: Click "Choose File" or drag it into the box below
   - Step 4: Click "Upload" and wait for confirmation

3. **Dropzone Copy:** Change the dropzone placeholder text from technical copy to:
   - "Drag your stock .txt file here, or click to browse"
   - Show a file icon and the accepted format clearly: "Accepts: .txt files only"

4. **Branch Selector (Admin):** Label it clearly as "Which branch is this stock for?" instead of a generic "Branch" label.

5. **Upload Button:** Label it "Upload Stock File" — avoid "Submit" or "Upload".

6. **Success State:** After upload, show a friendly success message:
   - "Stock file uploaded successfully!"
   - Show: Products loaded: X | Date: [today] | Branch: [name]
   - Green checkmark icon

7. **Duplicate Detection Message:** If duplicate detected, say:
   - "This file has already been uploaded. If you meant to upload new stock, please use today's file."
   - Avoid showing raw hash values or technical errors.

8. **Error Messages:** All error messages must be in plain English. No JSON, no stack traces. For example:
   - File format error → "Please use a .txt stock file. Other formats are not supported."
   - Missing branch → "Please select a branch before uploading."
   - Network error → "Something went wrong. Please try again or contact support."

9. **Loading State:** While uploading, show a clear progress indicator with text: "Uploading your stock file, please wait..."

10. **Mobile Responsive:** Ensure the upload page works cleanly on tablets (branch managers may use tablets).

---

## 6. TERMINOLOGY AUDIT — Plain Language

Replace technical/jargon terms across the admin UI:

| Current Term | Replace With |
|-------------|-------------|
| "Dead Stock" | "Out of Stock" or "Zero Quantity" |
| "EstimatedValue" | "Stock Value" |
| "ProductMaster" | "Product Catalog" |
| "UploadProduct" | "Stock Entry" |
| "contentHash" | (never show to user) |
| "Week 21, 2026" | "Week of May 18, 2026" |
| "branchId" | "Branch" |
| "storeId" | (never show to user) |
| "SKU" | "Product Code" |
| "qty" / "Quantity" | "Stock Quantity" |
| "Restock" | "Needs Restocking" |
| "branch_user" | "Branch Staff" |
| "admin" | "Administrator" |

---

## 7. AI STOCK QUERY AGENT — New Feature

**Goal:** A simple chat interface where a user (admin or branch staff) can ask questions about stock data in plain English and get real-time answers drawn from the database.

### 7a. New Page

Create: `app/(admin)/ai-agent/page.tsx`

UI: A split-panel layout:
- **Left panel:** Chat window (messages list + input)
- **Right panel (optional, can be below on mobile):** Quick question suggestions

Chat UI elements:
- Message bubbles (user right, agent left)
- Input box with "Ask a question..." placeholder
- Send button
- Quick-start question chips:
  - "What products are running low?"
  - "Which branch uploaded most recently?"
  - "Show me the top 10 fast-moving products"
  - "Which products haven't moved in 2 weeks?"
  - "What is the total stock value?"

### 7b. New API Route

Create: `app/api/ai-agent/route.ts`

**Flow:**
1. Receive user question as plain text from the client.
2. Query relevant data from MongoDB based on the question's intent:
   - Use structured queries (NOT raw SQL injection risk — always parameterized Mongoose queries)
   - Pre-fetch relevant data slices: low stock, recent uploads, product movement, upload status
3. Pass the question + data context to the Claude API (or OpenAI — already installed).
4. Return the AI's answer as a stream or JSON response.
5. Log the question and answer (optional, for quality improvement).

**Implementation using Claude API (claude-sonnet-4-6 or claude-haiku-4-5):**

```typescript
// app/api/ai-agent/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
// ... import relevant DB models

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { question, storeId } = await req.json();

  // 1. Fetch relevant stock context from DB
  const [lowStockItems, recentUploads, topProducts] = await Promise.all([
    fetchLowStockItems(storeId),
    fetchRecentUploads(storeId),
    fetchTopMovingProducts(storeId),
  ]);

  const stockContext = buildStockContext({ lowStockItems, recentUploads, topProducts });

  // 2. Ask Claude
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You are a stock analysis assistant for a retail business. 
You have access to real-time stock data. Answer questions clearly and concisely.
Use plain, simple language. Format numbers with commas. Avoid jargon.
If asked about a specific product not in the data, say you don't have that information.

Current Stock Data:
${stockContext}`,
    messages: [{ role: "user", content: question }],
  });

  return Response.json({ answer: message.content[0].text });
}
```

### 7c. Context Builder

Create: `lib/ai/buildStockContext.ts`

This function assembles a clean, token-efficient text summary of current stock state:
- Total products, total stock value
- Low stock products (name, code, qty, branch)
- Dead stock count
- Recent uploads per branch (last upload date, days ago)
- Top 10 fast-moving products (by estimated sales)
- Branches with no upload in last 24 hours

Keep the context under 4,000 tokens to avoid high API costs. Use caching (in-memory or Redis — Upstash Redis is already installed) with a 5-minute TTL so repeated questions don't re-query the DB every time.

### 7d. Add to Sidebar Nav

Add to `constants/constants.ts`:
```ts
{
  title: "Ask AI",
  url: "/ai-agent",
  icon: MessageCircle, // from lucide-react
}
```

Place it prominently — after Uploads, before Insights.

---

## 8. PERFORMANCE — Large Product Lists

The product list (`/products`, `/uploads/view`) can have thousands of rows from large TXT files.

### 8a. Server-Side Pagination for Product List

Current state: TanStack Table client-side pagination (loads all records, paginates in browser).

For large datasets (1000+ products), switch to **server-side pagination**:

API: `GET /api/admin/products?page=1&limit=50&filter=lowstock&search=milk`

Ensure the existing `/api/admin/products` route supports:
- `page` and `limit` query params
- Returns `{ products: [...], total: N, page: N, totalPages: N }`

Frontend: Pass `manualPagination={true}` to TanStack Table and fetch on page change.

### 8b. Search Debounce

Product search input should debounce at 400ms to avoid triggering API calls on every keystroke.

### 8c. MongoDB Index Audit

Verify these indexes exist:
- `UploadProduct`: `{ branchId: 1, upload_date: -1 }`
- `UploadProduct`: `{ storeId: 1, productId: 1, upload_date: -1 }`
- `Upload`: `{ storeId: 1, upload_date: -1 }`
- `ProductMaster`: `{ storeId: 1, isActive: 1 }`

Add any missing indexes via a migration script in `scripts/`.

### 8d. React Query Caching

Ensure all data-fetching hooks use `staleTime` of at least 60 seconds for list queries. This prevents unnecessary re-fetches when navigating between pages.

---

## 9. AUTHENTICATION — Credentials-Only UX

### 9a. Sign-In Page

File: `app/(auth)/sign-in/page.tsx`

- **Show only** the email + password form.
- **Hide** (wrap in `{false && ...}`) the Google and GitHub sign-in buttons and any "Or continue with" divider.
- Keep the "Forgot password?" link.
- Update the page heading to: **"Welcome back — please sign in"**
- Add a simple subtitle: "Enter your username and password to continue."
- The `auth.ts` file should NOT be modified — providers stay registered.

### 9b. Sign-Up Page

File: `app/(auth)/sign-up/page.tsx`

Evaluate whether to hide the sign-up page entirely. If branch users are only created by admins (via `/users`), the public sign-up page is not needed for the MVP.

**Recommendation:** Redirect `/sign-up` to `/sign-in` with a message: "Account creation is managed by your administrator."

Implement this in `app/(auth)/sign-up/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function SignUpPage() {
  redirect("/sign-in");
}
```

---

## 10. BRANCH USER — SCOPED VIEW

When a `branch_user` logs in, they should see a simplified view:

- The upload page pre-selects their branch (already implemented — verify this).
- The uploads list only shows their branch's uploads (already scoped — verify).
- The products page filters to their branch's stock.
- Navigation shows: Upload, View Uploads, Products, Ask AI (once built).
- Navigation hides: Users, Branches, full analytics (these are admin-only).

Verify scoping in:
- `app/(admin)/uploads/page.tsx` — confirm it filters by branchId for branch_user
- `app/(admin)/products/page.tsx` — confirm branch_user only sees their branch
- `constants/constants.ts` — confirm `adminOnly` flags are set correctly on Users, Branches nav items

---

## 11. IMPLEMENTATION ORDER (for Orchestrator Agent)

Execute these tasks in order. Tasks 1-5 are blocking; tasks 6-9 can run in parallel after task 5.

### Phase 1 — Hiding & Routing (Blocking, Do First)
1. **Task 1:** Modify `app/page.tsx` to redirect to `/sign-in` or `/dashboard`.
2. **Task 2:** Modify `app/(shop)/layout.tsx` to redirect to `/sign-in`.
3. **Task 3:** Modify `constants/constants.ts` — add `hidden: true` flag (or use a `featureFlags` object) to fiscalization/sales nav items; update `LeftSidebar.tsx` to skip hidden items.
4. **Task 4:** Modify `app/(auth)/sign-in/...` — hide OAuth buttons, update copy.
5. **Task 5:** Modify `app/(auth)/sign-up/page.tsx` — redirect to sign-in.

### Phase 2 — UX Polish (Can Parallelize)
6. **Task 6:** Audit and improve `components/FileUpload.tsx` UX (Step 5 of this plan).
7. **Task 7:** Audit and update terminology across admin pages (Step 6 of this plan).
8. **Task 8:** Refocus `app/(admin)/dashboard/page.tsx` to stock KPIs only.
9. **Task 9:** Enhance upload history — add "days since last upload" summary and better timestamp display.

### Phase 3 — New Feature: AI Agent
10. **Task 10:** Create `lib/ai/buildStockContext.ts`.
11. **Task 11:** Create `app/api/ai-agent/route.ts`.
12. **Task 12:** Create `app/(admin)/ai-agent/page.tsx` with chat UI.
13. **Task 13:** Add "Ask AI" to sidebar nav in `constants/constants.ts`.

### Phase 4 — Performance
14. **Task 14:** Add server-side pagination to `app/api/admin/products/route.ts`.
15. **Task 15:** Update frontend product table to use server-side pagination.
16. **Task 16:** Audit MongoDB indexes; add missing ones via `scripts/add-indexes.ts`.
17. **Task 17:** Add `staleTime` to TanStack Query hooks for list data.

### Phase 5 — Branch Upload Status API
18. **Task 18:** Create `app/api/analytics/upload-status/route.ts`.
19. **Task 19:** Add upload-status card(s) to dashboard.

---

## 12. FILES TO CHANGE (Summary)

| File | Change |
|------|--------|
| `app/page.tsx` | Redirect to /sign-in or /dashboard |
| `app/(shop)/layout.tsx` | Redirect all shop routes to /sign-in |
| `app/(auth)/sign-in/page.tsx` | Hide OAuth buttons, update copy |
| `app/(auth)/sign-up/page.tsx` | Redirect to /sign-in |
| `constants/constants.ts` | Add hidden flag to fiscal/sales nav items; add AI Agent nav item |
| `components/navigation/LeftSidebar.tsx` | Filter out hidden nav items |
| `components/FileUpload.tsx` | UX improvements (copy, states, error messages) |
| `app/(admin)/uploads/upload/page.tsx` | Updated page heading and instructions |
| `app/(admin)/uploads/page.tsx` | Better timestamp display, days-since indicator |
| `app/(admin)/dashboard/page.tsx` | Refocus to stock KPIs |

---

## 13. NEW FILES TO CREATE

| File | Purpose |
|------|---------|
| `app/(admin)/ai-agent/page.tsx` | AI chat UI |
| `app/api/ai-agent/route.ts` | AI agent API endpoint |
| `lib/ai/buildStockContext.ts` | Assembles stock context for AI |
| `app/api/analytics/upload-status/route.ts` | Branch upload health endpoint |
| `scripts/add-indexes.ts` | MongoDB index migration |

---

## 14. DO NOT TOUCH (Risk of Breaking)

- `auth.ts` — do not change providers array
- All database model files — no schema changes needed
- All existing API routes — do not delete, only add new ones
- `app/(shop)/` page files — leave as-is (layout redirect handles the hiding)
- `app/(admin)/fiscal-*/` page files — leave as-is (sidebar hiding handles it)
- `lib/jobs/` — queue infrastructure, leave untouched
- Any payment/fiscalization API routes — leave untouched

---

## 15. ENVIRONMENT VARIABLES NEEDED

For the AI agent (Task 10-13), ensure this is in `.env.local`:
```
ANTHROPIC_API_KEY=<your-key>
```

The project already has `openai` installed. Using the Anthropic SDK (`@anthropic-ai/sdk`) is preferred as the platform runs on Claude. Install if not present:
```bash
npm install @anthropic-ai/sdk
```

---

## 16. ACCEPTANCE CRITERIA

When done, a non-tech-savvy branch user should be able to:
1. Open the app URL → immediately see the login screen (not a shop page)
2. Log in with email + password (no Google button visible)
3. Be taken to the dashboard showing stock KPIs
4. Navigate to "Upload" and clearly understand what to do without any help
5. Upload their TXT stock file and see a friendly success confirmation
6. See a list of their past uploads with dates and branch name
7. Navigate to "Ask AI" and type a question like "what products are low?" and get a plain-English answer

An admin should additionally be able to:
1. See all branches' upload history
2. See which branches haven't uploaded today
3. Manage users and branches
4. View branch analytics and product movement

---

*This plan was created by analyzing the full codebase. All file paths are relative to the project root. The implementation agent should read each file before editing it.*
