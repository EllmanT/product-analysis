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

export async function processStockUpload(
  params: ProcessStockUploadParams
): Promise<ProcessStockUploadResult> {
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

  const userIdStr = userId;
  const upload_date = uploadDateParam ?? new Date();
  const ogcontentHash = await generateSHA256Hash(buffer);
  const contentHash = `${ogcontentHash}_${userIdStr}_${storeId}_${branchId}_${upload_date.toISOString().split("T")[0]}`;

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

  const week = getWeekNumber(upload_date);
  const year = upload_date.getFullYear();
  const month = getMonthName(upload_date);

  const [upload] = await Upload.create([
    {
      uploadedBy: new Types.ObjectId(userIdStr),
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
    },
  ]);

  const uploadProductIds: Types.ObjectId[] = [];
  let totalProducts = 0;
  let estimatedValue = 0;
  let productLineCount = 0;
  let deadStockSkus = 0;
  let activeStockSkus = 0;
  const restockedCodes: string[] = [];

  try {
  for (const line of sortedLines) {
    const parts = line.split(",").map((val) => val.trim());
    const code = parts[0];
    const name = parts[1];
    const qtyRaw = parts[2];
    const priceRaw = parts[3];

    const qty =
      qtyRaw === "" || qtyRaw === undefined ? 0 : parseInt(qtyRaw, 10) || 0;
    const price = parseFloat(priceRaw);

    if (!code || !name || isNaN(price)) {
      console.warn(`Skipping invalid row: ${line}`);
      continue;
    }

    let product = await ProductMaster.findOne({ standardCode: code });

    if (!product) {
      const created = await ProductMaster.create([
        { standardCode: code, name, aliases: [] },
      ]);
      product = created[0];
    } else if (!product.aliases.includes(name)) {
      await ProductMaster.updateOne(
        { _id: product._id },
        { $addToSet: { aliases: name } }
      );
    }

    const currentUpload = await UploadProduct.create([
      {
        uploadId: upload._id,
        productId: product._id,
        storeId,
        branchId,
        code,
        name,
        qty,
        price,
        upload_date,
        month,
        week,
        year,
      },
    ]);

    uploadProductIds.push(currentUpload[0]._id);

    productLineCount += 1;
    totalProducts += qty;
    estimatedValue += qty * price;
    if (qty === 0) deadStockSkus += 1;
    else activeStockSkus += 1;

    const previousUpload = await UploadProduct.findOne({
      productId: product._id,
      storeId,
      branchId,
      upload_date: { $lt: currentUpload[0].upload_date },
    }).sort({ createdAt: -1 });

    if (!previousUpload) {
      await WeeklyProductSummaries.create([
        {
          productId: product._id,
          code,
          week,
          year,
          upload_date,
          storeId,
          branchId,
          price,
          startQuantity: qty,
          endQuantity: null,
          estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
          restocked: false,
          restockAmount: 0,
        },
      ]);
    } else {
      const prevQty = previousUpload.qty;
      const sales = (prevQty - qty) * price;
      const restocked = sales < 0;
      if (restocked) restockedCodes.push(code);

      const summaryWeek = getWeekNumber(previousUpload.upload_date);
      const summaryYear = previousUpload.upload_date.getFullYear();

      await WeeklyProductSummaries.updateOne(
        {
          productId: product._id,
          branchId,
          storeId,
          week: summaryWeek,
          year: summaryYear,
        },
        {
          $set: {
            endQuantity: qty,
            estimatedSales: mongoose.Types.Decimal128.fromString(
              Math.abs(sales).toFixed(2)
            ),
            restocked,
            restockAmount: restocked ? Math.abs(sales) : 0,
          },
        },
        { upsert: true }
      );

      const currentSummary = await WeeklyProductSummaries.findOne({
        productId: product._id,
        storeId,
        branchId,
        week,
        year,
      });

      if (!currentSummary) {
        await WeeklyProductSummaries.create([
          {
            productId: product._id,
            code,
            week,
            year,
            price,
            upload_date,
            storeId,
            branchId,
            startQuantity: qty,
            endQuantity: null,
            estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
            restocked: false,
            restockAmount: 0,
          },
        ]);
      }
    }
  }

  await Upload.updateOne(
    { _id: upload._id },
    {
      $set: {
        totalProducts,
        estimatedValue: mongoose.Types.Decimal128.fromString(
          estimatedValue.toFixed(2)
        ),
      },
    }
  );

  await Upload.updateOne(
    { _id: upload._id },
    { $set: { products: uploadProductIds } }
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
    originalFileName,
    fileSizeBytes,
    branch: {
      id: branchId,
      name: branchLean?.name ?? "Unknown branch",
      location: branchLean?.location ?? "",
    },
  };

  return {
    duplicate: false,
    uploadId: String(upload._id),
    summary,
    restockedCodes,
  };
  } catch (err) {
    await cleanupFailedUpload(upload._id);
    throw err;
  }
}

export async function cleanupFailedUpload(uploadId: Types.ObjectId): Promise<void> {
  await UploadProduct.deleteMany({ uploadId });
  await Upload.deleteOne({ _id: uploadId });
}
