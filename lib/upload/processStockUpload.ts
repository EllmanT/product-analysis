import mongoose, { Types } from "mongoose";
import { Branch, ProductMaster, Upload, UploadProduct, WeeklyProductSummaries } from "@/database";
import type { ProductUploadSummary } from "@/types/upload-summary";

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getMonthName(date: Date): string {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return monthNames[date.getMonth()];
}

async function generateSHA256Hash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ProcessStockUploadParams = {
  buffer: ArrayBuffer;
  fileName: string;
  originalFileName: string;
  fileSizeBytes: number;
  userId: string;
  storeId: string;
  branchId: string;
  uploadDate?: Date;
};

export type ProcessStockUploadResult =
  | { duplicate: true }
  | {
      duplicate: false;
      uploadId: string;
      summary: ProductUploadSummary;
      restockedCodes: string[];
    };

type ParsedLine = {
  code: string;
  name: string;
  qty: number;
  price: number;
};

type InitializeUploadResult =
  | { duplicate: true }
  | {
      duplicate: false;
      uploadId: Types.ObjectId;
      parsedLines: ParsedLine[];
      upload_date: Date;
      week: number;
      month: string;
      year: number;
    };

/** Quick setup: duplicate check + create Upload record with status "processing".
 *  Returns within ~2 seconds regardless of file size. */
export async function initializeUpload(
  params: ProcessStockUploadParams
): Promise<InitializeUploadResult> {
  const {
    buffer,
    fileName,
    originalFileName,
    fileSizeBytes,
    userId,
    storeId,
    branchId,
    uploadDate: uploadDateParam,
  } = params;

  const upload_date = uploadDateParam ?? new Date();
  const ogcontentHash = await generateSHA256Hash(buffer);
  const contentHash = `${ogcontentHash}_${userId}_${storeId}_${branchId}_${upload_date.toISOString().split("T")[0]}`;

  const existingUpload = await Upload.findOne({ contentHash });
  if (existingUpload) {
    return { duplicate: true };
  }

  const text = new TextDecoder().decode(buffer);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const sortedLines = lines.sort((a, b) => {
    const nameA = a.split(",")[0].trim().toLowerCase();
    const nameB = b.split(",")[0].trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Parse all lines up front, skip invalid rows
  const parsedLines: ParsedLine[] = [];
  for (const line of sortedLines) {
    const parts = line.split(",").map((val) => val.trim());
    const code = parts[0];
    const name = parts[1];
    const qtyRaw = parts[2];
    const priceRaw = parts[3];

    const qty = qtyRaw === "" || qtyRaw === undefined ? 0 : parseInt(qtyRaw, 10) || 0;
    const price = parseFloat(priceRaw);

    if (!code || !name || isNaN(price)) {
      console.warn(`Skipping invalid row: ${line}`);
      continue;
    }
    parsedLines.push({ code, name, qty, price });
  }

  const week = getWeekNumber(upload_date);
  const year = upload_date.getFullYear();
  const month = getMonthName(upload_date);

  const [upload] = await Upload.create([
    {
      uploadedBy: new Types.ObjectId(userId),
      storeId,
      branchId,
      upload_date,
      month,
      week,
      year,
      fileName,
      contentHash,
      totalProducts: 0,
      estimatedValue: mongoose.Types.Decimal128.fromString("0.00"),
      status: "processing",
      originalFileName,
      fileSizeBytes,
    },
  ]);

  return {
    duplicate: false,
    uploadId: upload._id as Types.ObjectId,
    parsedLines,
    upload_date,
    week,
    month,
    year,
  };
}

/** Actual batch processing — all MongoDB work in ~8 total queries regardless of product count. */
export async function executeUploadBatch(
  uploadId: Types.ObjectId,
  parsedLines: ParsedLine[],
  params: Pick<ProcessStockUploadParams, "storeId" | "branchId" | "originalFileName" | "fileSizeBytes">,
  uploadMeta: { upload_date: Date; week: number; month: string; year: number }
): Promise<{ summary: ProductUploadSummary; restockedCodes: string[] }> {
  const { storeId, branchId, originalFileName, fileSizeBytes } = params;
  const { upload_date, week, month, year } = uploadMeta;

  const storeObjId = mongoose.isValidObjectId(storeId)
    ? new Types.ObjectId(storeId)
    : (storeId as unknown as Types.ObjectId);
  const branchObjId = mongoose.isValidObjectId(branchId)
    ? new Types.ObjectId(branchId)
    : (branchId as unknown as Types.ObjectId);

  // --- Step 1: Upsert all ProductMasters in ONE bulk write ---
  const allCodes = parsedLines.map((l) => l.code);

  const masterBulkOps = parsedLines.map((line) => ({
    updateOne: {
      filter: { standardCode: line.code },
      update: {
        $setOnInsert: { standardCode: line.code, name: line.name },
        $addToSet: { aliases: line.name },
      },
      upsert: true,
    },
  }));

  if (masterBulkOps.length > 0) {
    await ProductMaster.bulkWrite(masterBulkOps, { ordered: false });
  }

  // --- Step 2: Fetch all masters to get their _ids (ONE query) ---
  const allMasters = await ProductMaster.find(
    { standardCode: { $in: allCodes } },
    { _id: 1, standardCode: 1 }
  ).lean<{ _id: Types.ObjectId; standardCode: string }[]>();

  const productIdByCode = new Map<string, Types.ObjectId>(
    allMasters.map((m) => [m.standardCode, m._id])
  );

  // --- Step 3: InsertMany UploadProducts in chunks of ≤1000 (ONE bulk insert conceptually) ---
  let totalProducts = 0;
  let estimatedValue = 0;
  let productLineCount = 0;
  let deadStockSkus = 0;
  let activeStockSkus = 0;

  const uploadProductDocs = parsedLines
    .filter((line) => productIdByCode.has(line.code))
    .map((line) => {
      productLineCount += 1;
      totalProducts += line.qty;
      estimatedValue += line.qty * line.price;
      if (line.qty === 0) deadStockSkus += 1;
      else activeStockSkus += 1;

      return {
        uploadId,
        productId: productIdByCode.get(line.code),
        storeId: storeObjId,
        branchId: branchObjId,
        code: line.code,
        name: line.name,
        qty: line.qty,
        price: line.price,
        upload_date,
        month,
        week,
        year,
      };
    });

  for (let i = 0; i < uploadProductDocs.length; i += 1000) {
    await UploadProduct.insertMany(uploadProductDocs.slice(i, i + 1000), { ordered: false });
  }

  // Fetch inserted IDs
  const insertedProducts = await UploadProduct.find(
    { uploadId },
    { _id: 1 }
  ).lean<{ _id: Types.ObjectId }[]>();
  const uploadProductIds = insertedProducts.map((p) => p._id);

  // --- Step 4: Get latest previous upload per product (ONE aggregate) ---
  const allProductObjectIds = allMasters.map((m) => m._id);

  const prevUploads = await UploadProduct.aggregate([
    {
      $match: {
        productId: { $in: allProductObjectIds },
        storeId: storeObjId,
        branchId: branchObjId,
        upload_date: { $lt: upload_date },
      },
    },
    { $sort: { upload_date: -1, createdAt: -1 } },
    {
      $group: {
        _id: "$productId",
        qty: { $first: "$qty" },
        upload_date: { $first: "$upload_date" },
      },
    },
  ]);

  const prevUploadMap = new Map<string, { qty: number; upload_date: Date }>(
    prevUploads.map((p) => [String(p._id), { qty: p.qty, upload_date: p.upload_date }])
  );

  // --- Step 5: Build WeeklyProductSummaries bulk ops ---
  const summaryBulkOps: object[] = [];
  const restockedCodes: string[] = [];

  for (const line of parsedLines) {
    const productId = productIdByCode.get(line.code);
    if (!productId) continue;

    const prev = prevUploadMap.get(String(productId));

    if (!prev) {
      summaryBulkOps.push({
        updateOne: {
          filter: { productId, storeId: storeObjId, branchId: branchObjId, week, year },
          update: {
            $setOnInsert: {
              productId,
              code: line.code,
              week,
              year,
              upload_date,
              storeId: storeObjId,
              branchId: branchObjId,
              price: line.price,
              startQuantity: line.qty,
              endQuantity: null,
              estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
              restocked: false,
              restockAmount: 0,
            },
          },
          upsert: true,
        },
      });
    } else {
      const sales = (prev.qty - line.qty) * line.price;
      const restocked = sales < 0;
      if (restocked) restockedCodes.push(line.code);

      const summaryWeek = getWeekNumber(prev.upload_date);
      const summaryYear = prev.upload_date.getFullYear();

      // Update prev week summary
      summaryBulkOps.push({
        updateOne: {
          filter: {
            productId,
            branchId: branchObjId,
            storeId: storeObjId,
            week: summaryWeek,
            year: summaryYear,
          },
          update: {
            $set: {
              endQuantity: line.qty,
              estimatedSales: mongoose.Types.Decimal128.fromString(
                Math.abs(sales).toFixed(2)
              ),
              restocked,
              restockAmount: restocked ? Math.abs(sales) : 0,
            },
          },
          upsert: true,
        },
      });

      // Ensure current week summary exists
      summaryBulkOps.push({
        updateOne: {
          filter: { productId, storeId: storeObjId, branchId: branchObjId, week, year },
          update: {
            $setOnInsert: {
              productId,
              code: line.code,
              week,
              year,
              price: line.price,
              upload_date,
              storeId: storeObjId,
              branchId: branchObjId,
              startQuantity: line.qty,
              endQuantity: null,
              estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
              restocked: false,
              restockAmount: 0,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (summaryBulkOps.length > 0) {
    await WeeklyProductSummaries.bulkWrite(summaryBulkOps as Parameters<typeof WeeklyProductSummaries.bulkWrite>[0], { ordered: false });
  }

  // --- Step 6: Final Upload update ---
  await Upload.updateOne(
    { _id: uploadId },
    {
      $set: {
        totalProducts,
        productLineCount,
        deadStockSkus,
        activeStockSkus,
        estimatedValue: mongoose.Types.Decimal128.fromString(estimatedValue.toFixed(2)),
        products: uploadProductIds,
        status: "complete",
      },
    }
  );

  const branchLean = await Branch.findById(branchId)
    .select("name location")
    .lean<{ _id: Types.ObjectId; name: string; location: string } | null>();

  const summary: ProductUploadSummary = {
    productLineCount,
    totalQuantity: totalProducts,
    totalValue: estimatedValue,
    deadStockSkus,
    activeStockSkus,
    uploadDate: upload_date.toISOString(),
    originalFileName: originalFileName ?? "",
    fileSizeBytes: fileSizeBytes ?? 0,
    branch: {
      id: String(branchId),
      name: branchLean?.name ?? "Unknown branch",
      location: branchLean?.location ?? "",
    },
  };

  return { summary, restockedCodes };
}

/** Backward-compatible entry point — calls initializeUpload + executeUploadBatch in sequence. */
export async function processStockUpload(
  params: ProcessStockUploadParams
): Promise<ProcessStockUploadResult> {
  const initResult = await initializeUpload(params);

  if (initResult.duplicate) {
    return { duplicate: true };
  }

  const { uploadId, parsedLines, upload_date, week, month, year } = initResult;

  try {
    const { summary, restockedCodes } = await executeUploadBatch(
      uploadId,
      parsedLines,
      {
        storeId: params.storeId,
        branchId: params.branchId,
        originalFileName: params.originalFileName,
        fileSizeBytes: params.fileSizeBytes,
      },
      { upload_date, week, month, year }
    );

    return {
      duplicate: false,
      uploadId: String(uploadId),
      summary,
      restockedCodes,
    };
  } catch (err) {
    await cleanupFailedUpload(uploadId);
    throw err;
  }
}

export async function cleanupFailedUpload(uploadId: Types.ObjectId): Promise<void> {
  await UploadProduct.deleteMany({ uploadId });
  await Upload.deleteOne({ _id: uploadId });
}
