import { UploadProduct, WeeklyProductSummaries } from '@/database';
// import { Job } from 'bullmq';

export const processUploadJob = async (upload:Upload) => {
  const { _id:uploadId, week, year } = upload;

  console.log("uploadId",uploadId)

  console.log(`📥 Starting processing for uploadId: ${uploadId}, branchId: week: ${week}, year: ${year}`);

  try {
    const products = await UploadProduct.find({ uploadId });

    if (!products || products.length === 0) {
      console.warn(`⚠️ No products found for uploadId: ${uploadId}`);
      return;
    }

    // Create a map for quick lookups to avoid multiple DB queries
    const summaryKeys = products.map(p => ({
      productId: p.productId,
      code: p.code,
    }));

    const existingSummaries = await WeeklyProductSummaries.find({
      // branchId,
      week,
      year,
      $or: summaryKeys.map(k => ({ productId: k.productId, code: k.code })),
    });

    const summaryMap = new Map<string, any>();
    for (const summary of existingSummaries) {
      const key = `${summary.productId}_${summary.code}`;
      summaryMap.set(key, summary);
    }

    // Prepare bulk operations
    const bulkOps = products.map(item => {
      const { productId, qty, price, code } = item;
      const numericPrice = Number(price);
      const estimatedSales = numericPrice * qty;
      const key = `${productId}_${code}`;

      const existing = summaryMap.get(key);

      if (existing) {
        return {
          updateOne: {
            filter: {
              // branchId,
              productId,
              code,
              week,
              year,
            },
            update: {
              $inc: {
                endQuantity: qty,
                estimatedSales: estimatedSales,
              },
            },
          },
        };
      } else {
        return {
          insertOne: {
            document: {
              // branchId,
              productId,
              code,
              week,
              year,
              startQuantity: 0,
              endQuantity: qty,
              estimatedSales: estimatedSales,
              restocked: false,
              restockAmount: 0,
            },
          },
        };
      }
    });

    if (bulkOps.length > 0) {
      const result = await WeeklyProductSummaries.bulkWrite(bulkOps);
      console.log(`✅ Weekly summaries processed. Inserted: ${result.insertedCount}, Modified: ${result.modifiedCount}`);
    }

    console.log(`📊 Weekly summary job completed for uploadId: ${uploadId}`);
  } catch (error) {
    console.error(`🔥 Failed to process weekly summary for uploadId: ${uploadId}`, error);
    throw error; // So the queue can retry if needed
  }
};
