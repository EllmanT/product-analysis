import { Types } from "mongoose";
import { Branch, Upload, UploadProduct, WeeklyProductSummaries } from "@/database";

const cache = new Map<string, { data: string; expiresAt: number }>();

function toFloat(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as { toString?: () => string }).toString === "function") {
    return parseFloat((v as { toString: () => string }).toString()) || 0;
  }
  return 0;
}

export async function buildStockContext(storeId: string): Promise<string> {
  const cached = cache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const objectStoreId = new Types.ObjectId(storeId);

  // Most recent upload per branch to get latest snapshot
  const latestUploadAgg = await Upload.aggregate([
    { $match: { storeId: objectStoreId } },
    { $sort: { upload_date: -1 } },
    {
      $group: {
        _id: "$branchId",
        uploadId: { $first: "$_id" },
        uploadDate: { $first: "$upload_date" },
        totalProducts: { $first: "$totalProducts" },
        estimatedValue: { $first: "$estimatedValue" },
      },
    },
  ]);

  const latestUploadIds = latestUploadAgg.map((u) => u.uploadId);
  const now = new Date();

  // Branch names
  const branches = await Branch.find({ storeId: objectStoreId })
    .select("_id name location")
    .lean();
  const branchMap = new Map(
    branches.map((b) => [String(b._id), `${b.name} (${b.location})`])
  );

  // Recent upload summary per branch
  const uploadLines = latestUploadAgg.map((u) => {
    const name = branchMap.get(String(u._id)) ?? "Unknown branch";
    const daysAgo = Math.floor(
      (now.getTime() - new Date(u.uploadDate).getTime()) / 86_400_000
    );
    const value = toFloat(u.estimatedValue);
    return `  - ${name}: last upload ${daysAgo === 0 ? "today" : `${daysAgo} day(s) ago`}, ${u.totalProducts} products, stock value $${value.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  });

  // Low stock and out-of-stock from latest snapshots
  const [lowStock, outOfStock, totalProducts, totalValue] = await Promise.all([
    UploadProduct.find({
      storeId: objectStoreId,
      uploadId: { $in: latestUploadIds },
      qty: { $gt: 0, $lte: 5 },
    })
      .select("name code qty branchId")
      .limit(20)
      .lean(),

    UploadProduct.countDocuments({
      storeId: objectStoreId,
      uploadId: { $in: latestUploadIds },
      qty: 0,
    }),

    UploadProduct.countDocuments({
      storeId: objectStoreId,
      uploadId: { $in: latestUploadIds },
    }),

    UploadProduct.aggregate([
      {
        $match: {
          storeId: objectStoreId,
          uploadId: { $in: latestUploadIds },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $multiply: ["$qty", { $toDouble: "$price" }] },
          },
        },
      },
    ]),
  ]);

  const totalStockValue = totalValue[0]?.total ?? 0;

  const lowStockLines = lowStock
    .map((p) => {
      const branch = branchMap.get(String(p.branchId)) ?? "";
      return `  - ${p.name} (code: ${p.code}), qty: ${p.qty}${branch ? `, ${branch}` : ""}`;
    })
    .join("\n");

  // Top 10 fast-moving products (last 4 weeks)
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000);
  const topMoving = await WeeklyProductSummaries.aggregate([
    {
      $match: {
        storeId: objectStoreId,
        upload_date: { $gte: fourWeeksAgo },
      },
    },
    {
      $group: {
        _id: "$productId",
        code: { $first: "$code" },
        totalSales: { $sum: { $toDouble: "$estimatedSales" } },
        totalMoved: {
          $sum: { $subtract: ["$startQuantity", "$endQuantity"] },
        },
      },
    },
    { $sort: { totalSales: -1 } },
    { $limit: 10 },
  ]);

  const topMovingLines = topMoving
    .map(
      (p, i) =>
        `  ${i + 1}. Code: ${p.code}, estimated sales: $${p.totalSales.toLocaleString("en", { maximumFractionDigits: 2 })}, units moved: ${p.totalMoved}`
    )
    .join("\n");

  const context = `
STOCK OVERVIEW (as of ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})
Total products in catalog: ${totalProducts.toLocaleString()}
Total stock value: $${totalStockValue.toLocaleString("en", { maximumFractionDigits: 2 })}
Out of stock (zero quantity): ${outOfStock.toLocaleString()} products

BRANCH UPLOAD STATUS
${uploadLines.join("\n") || "  No uploads found."}

LOW STOCK ITEMS (quantity 1–5)
${lowStockLines || "  None."}

TOP 10 FAST-MOVING PRODUCTS (last 4 weeks by estimated sales)
${topMovingLines || "  No data."}
`.trim();

  cache.set(storeId, { data: context, expiresAt: Date.now() + 5 * 60 * 1000 });
  return context;
}
