# Product Image Sourcing — Status & Handoff

**Last updated:** 2026-07-19
**Blocker right now:** local machine is out of disk space (`C:` drive was 476G/476G, 0 bytes free — this is also why the local MongoDB / Atlas connection couldn't be reached). User is restarting the machine to fix storage. **Resume from "Next steps" below once the machine is back and there's free disk space.**

## Goal

Data.txt (repo root, 5,340-line raw ERP stock export: `CODE,DESCRIPTION,QTY,PRICE,,FLAG`, no header) has no product images, categories, or brand data. We're sourcing images for the v1 e-commerce storefront by matching Data.txt's products against other retailers' live catalogs, then seeding the matched results into the `ProductMaster` collection (`database/productmaster.model.ts`), which already has an `imageUrl` field for exactly this purpose.

## Decisions made (don't re-ask these)

1. **Match strictness**: generic/representative images are OK for commodity items when an exact brand/model match can't be found — not exact-match-only.
2. **Execution scope**: validate on a sample before a full run. (Sample pilot done, full run done — see below.)
3. **Image hosting**: hotlink the source site's image URL directly for now (no storage provider is configured in this repo — checked `.env.example`/`package.json`, no S3/Vercel Blob/Cloudinary/UploadThing). Re-hosting on our own storage is a deliberate later step, not blocking.
4. **DB writes**: seed into the **offline/test** Mongo target first, not live. Live requires an explicit `--target=live` flag (matches this repo's existing `seed-roles.mjs` convention).
5. **Medium-confidence matches**: do **not** write `imageUrl` for medium-confidence matches yet — only high-confidence. Medium tier needs a quick human visual pass first (the pilot found real false positives there, e.g. a "camp lamp" matched to an unrelated truck tail-light).
6. Crawling/matching itself costs nothing (no paid APIs, no fees) — see the cost note from the earlier conversation turn if that comes up again.

## What's been done

### 1. Recon
- **electrosales.co.zw** (Zimbabwean general hardware/electrical/plumbing/DIY retailer) is the primary image source — its product mix matches Data.txt closely. It's an Angular SPA, but its frontend calls a **public, unauthenticated JSON API**:
  `GET https://www.electrosales.co.zw:3000/shop/getProductsList?category=<slug>&limit=200&page=N`
  Returns `name`, `st_ldesc`, `brand`, `price`, `images[]` (ImageKit CDN URLs), `specifications`, paginated, `limit` accepts up to at least 200. No auth/session needed. Full details in memory `reference_electrosales_api.md` (see `.claude/.../memory/` if available, otherwise this doc is the source of truth).
  Known department slugs and item counts: `electrical` (1,395), `tools` (1,720), `plumbing` (1,419), `automotive` (1,253), `garden` (958), `building` (607). Slugs tried that did NOT work: `hardware`, `solar`, `timber`, `painting` — the department nav uses different slugs for those which weren't found.
- **em.co.za** (ElectroMechanica, South African industrial-automation distributor, NetSuite, ~15,247 SKUs) — recon only, **not pulled**. Narrow product overlap with Data.txt (mostly cables/capacitors/breakers, not general hardware). `robots.txt` explicitly allows crawling but sets `Crawl-Delay: 20` seconds. It's a phase-2 gap-filler candidate only, not needed for the current pass.

### 2. Bulk catalog pull (electrosales.co.zw)
Pulled all 6 departments above via the API, ~37 paginated requests, under a minute, **7,343 unique products**. No browser/Playwright rendering needed.

### 3. Data.txt parsing
Parsed all 5,340 lines (5,337 non-blank) into structured records: `{ code, description, stockQty, price, category }`. `category` is a rough keyword-based cluster (lighting, cable, capacitor, plug_socket, tools, etc.) used only to build a representative sample — 56% land in "uncategorized" because the real catalog is a wide general-hardware mix (drill bits, contactors, brake cleaner, even a novelty soccer ball), not a failure of the clustering.

### 4. Matching approach
Normalizes Data.txt's trade shorthand (`S/C`=single core, `F/T`=flat twin, `W/S`=whole-sleeve pack qualifier→stripped, `OF`=offcut qualifier→stripped, `DC`=double core, `SQ`=square, `BX`=box, `C/FERULE`=crimping ferrule, etc.), then scores token (Jaccard) overlap against the electrosales catalog (name + st_ldesc + brand + specifications text) — **gated on numeric spec agreement**: if Data.txt has a rating/size like `100UF` or `15A`, the candidate must carry that same value somewhere, or it's capped to "low" confidence regardless of text similarity. This gate is what stops a "100UF capacitor" from matching a "30MF" one on generic word overlap alone — but it isn't perfect; some generic-word collisions with no numeric spec still slip through (see caveats below).

### 5. Pilot (160-item stratified sample) → then full run (all 5,337)
| | Pilot (160) | Full run (5,337) |
|---|---|---|
| High confidence | ~1 (0.6%) | 117 (2.2%) |
| Medium confidence | ~43 (27%) | 1,280 (24%) |
| Low confidence | ~110 (69%) | 3,848 (72%) |
| None | ~6 (4%) | 95 (1.8%) |
| **Usable (high+medium)** | **~27.5%** | **26.2% (1,397/5,337)** |

**Honest caveat**: manual spot-check of the medium tier found real false positives (category-right, product-wrong) that the spec gate doesn't catch when neither side has a numeric spec — e.g. "CAMP LAMP DARK YELLOW" matched a "Truck-lamp Yellow Marker Lamp" (unrelated products, coincidental word overlap). Where it works, it works well — e.g. "MCCB 160A 3P" → "Chint Nxm-250s 3 Pole 35ka 160a Mccb", "OVERLOAD RELAY 12-18A" → "Chint Nxr-25 12-18a Overload Relay". **Conclusion: medium-tier matches need a human glance before publishing — this is why only the 117 high-confidence matches got `imageUrl` in the seed data.**

A published pilot report (Artifact, may still be live — filterable table of all 160 sample rows with image previews): https://claude.ai/code/artifact/70923775-23b9-4577-b450-1c830e0d0f35

### 6. ProductMaster seed prepared
Investigated `lib/upload/processStockUpload.ts` — confirmed the real upload pipeline upserts `ProductMaster` by `{ filter: { standardCode: line.code }, update: { $setOnInsert: { standardCode, name } }, upsert: true }`. So pre-seeding now with the same `standardCode` values is safe: a later real upload with the same codes won't clobber what we set (setOnInsert only fires on insert), and `name` in production is genuinely the raw internal shorthand description (not a cleaned-up display name) — confirmed by reading that pipeline, so the seed uses Data.txt's raw description as `name` too, for consistency with how the app already works and how invoice-line matching (`lib/shop/matchExtractedLine.ts`) expects `name` to look.

**Files created (all still on disk, in the actual repo — not the ephemeral session scratchpad):**
- `scripts/seed-product-master-catalog.mjs` — the seed script. Upserts by `standardCode`, `$set`s `imageUrl` only when present in the seed data. Usage:
  ```
  npm run seed:product-catalog        # offline/test DB (OFFLINE_MONGODB_URI, falls back from MONGODB_URI if unset)
  npm run seed:product-catalog:live    # explicit --target=live, uses MONGODB_URI only
  ```
- `scripts/data/product-master-seed.json` — the actual seed payload: 5,337 `{ code, name, imageUrl?, matchedSku?, matchScore? }` records, `imageUrl` present for 117 high-confidence matches only. **This file is complete and correct — nothing further needs to be regenerated to run the seed once Mongo is reachable.**
- `scripts/data/product-image-pilot/` — the pipeline scripts and intermediate data, kept for reproducibility / re-running with an improved matcher later:
  - `parse-data.mjs` — parses Data.txt → `products-all.json` (also copied here) + a stratified sample.
  - `fetch-electrosales.mjs` — pulls the electrosales.co.zw catalog via the API described above.
  - `match-full.mjs` — the spec-gated matcher, run against all 5,337 products.
  - `match-sample.mjs` — same matcher, used for the 160-item pilot.
  - `products-all.json`, `sample-150.json` — parsed/sampled Data.txt.
  - **NOT included here due to the disk-full incident**: `electrosales-catalog.json` (the 7,343-product raw catalog pull, ~20MB) and `match-results-full.json` (the full match output, ~3MB) — these were only in the session scratchpad, which may not survive into a new session. **They're cheap to regenerate** — re-run `fetch-electrosales.mjs` (~1 min, one-time network pull) then `match-full.mjs` (~6 sec, local computation) to reproduce them exactly. `product-master-seed.json` (the thing that actually matters for seeding) is already safely saved and does NOT need regeneration.

## Blocker

Attempted to run `npm run seed:product-catalog`. Both configured Mongo targets failed:
- `MONGODB_URI` (Atlas, `mongodb+srv://.../cluster0.h39yygn.mongodb.net/...`) — SRV DNS lookup fails, and **not just locally**: `8.8.8.8` (Google public DNS) also reports the domain doesn't exist. This wasn't a sandbox network issue (this same shell successfully hit electrosales.co.zw/em.co.za earlier) — worth checking whether that Atlas cluster still exists / hasn't been renamed, independent of today's task.
- `OFFLINE_MONGODB_URI` (`mongodb://localhost:27017`) — no local `mongod` running in this environment.

Then, while copying pilot artifacts into the repo for safekeeping, hit **`No space left on device`** — `C:` was at 476G/476G (100% full, 0 bytes available). This is very likely also *why* MongoDB wasn't starting locally for the user (storage-related Mongo failures are usually a full or corrupt data/journal volume). User is restarting the machine to address this.

## Next steps (in order)

1. **Free disk space / restart machine** (user is doing this).
2. **Get a reachable Mongo target.** Try `npm run seed:product-catalog` again (offline target). If `OFFLINE_MONGODB_URI` still doesn't work (e.g. local `mongod` isn't set up to auto-start), either start a local MongoDB instance, or confirm the correct `MONGODB_URI` Atlas cluster (the current one in `.env.local` doesn't resolve in public DNS — may need updating).
3. **Run the seed**: `npm run seed:product-catalog` (do not use `:live` unless explicitly told to). This upserts all 5,337 products into `productmasters`, with `imageUrl` set for 117 of them.
4. **Verify**: spot-check a few docs in the `productmasters` collection (e.g. one of the high-confidence codes like `SCHLRD21`, `FGHD12`, `FS2` from the pilot) to confirm `imageUrl` landed correctly and the app's existing product listing (`app/api/admin/products/route.ts`) still joins correctly against `UploadProduct`.
5. **Decide on the medium tier (1,280 products)**: these are sitting in `scripts/data/product-image-pilot/match-results-full.json` (regenerate if needed, see above) tagged `confidence: "medium"`, each with a candidate image/name/score. Options to discuss with the user: (a) quick manual yes/no pass over these before writing `imageUrl`, (b) tighten the matcher further (e.g. extend the spec-gate regex to catch more unit types, or add a second-opinion check) and re-run, or (c) leave them unmatched for v1 and revisit later.
6. **em.co.za (optional, phase 2)**: not pulled yet. Only worth doing for the cable/capacitor/breaker categories where it might fill gaps electrosales doesn't cover — respect its 20s crawl-delay (would need `crawl4ai`/Playwright since, unlike electrosales, it needs real page rendering, or its own backend API found during recon but not fully reverse-engineered — see earlier conversation).
7. **Re-hosting images** (deferred decision, not blocking): currently hotlinking electrosales.co.zw's CDN URLs directly into `imageUrl`. Before relying on this for a real production storefront, pick and configure a storage provider (Vercel Blob, Cloudinary, S3, etc. — none configured in this repo yet) and download+re-host the matched images, per the user's stated preference for durability over hotlinking.

## Key files for context

- `Data.txt` — source data, untouched.
- `database/productmaster.model.ts` — target schema (`name`, `standardCode`, `aliases`, `isActive`, `imageUrl`).
- `lib/upload/processStockUpload.ts` (~line 172) — shows the real upload pipeline's upsert semantics for `ProductMaster`, which the seed script deliberately mirrors.
- `lib/shop/matchExtractedLine.ts` — shows how `name`/`standardCode`/`aliases` get used for invoice-line matching later; relevant if we ever reconsider what goes in `name` vs `aliases`.
- `scripts/seed-product-master-catalog.mjs` + `scripts/data/product-master-seed.json` — ready to run.
- `scripts/data/product-image-pilot/` — reproducible pipeline for re-running/improving the match.
