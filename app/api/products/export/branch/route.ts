import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Branch, Store, WeeklyProductSummaries } from "@/database";
import dbConnect from "@/lib/mongoose";
import { getStartAndEndOfWeek } from "../route";

export async function GET(req: NextRequest) {
  console.log("📥 Incoming export request...");

  const { searchParams } = new URL(req.url);
  // const year = searchParams.get("year");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const branchId = searchParams.get("branchId");
// Convert to Date object if needed
const start = new Date(startDate as string);
const end = new Date(endDate as string);

  console.log("🔍 Query params:", { start , end, branchId});

  if (!start || !end) {
    console.warn("⚠️ Missing required query parameters.");
    return new Response("Missing month, year or week", { status: 400 });
  }

  try {
    console.log("🔌 Connecting to MongoDB...");
    await dbConnect();
    console.log("✅ MongoDB connected.");

    // getting the store id

    const branch = await Branch.findById(branchId)
    console.log(branchId)
    if(!branch){
          return new Response("Failed to find the branch details", { status: 400 });
    }

    const storeId = branch.storeId;

    const store  = await Store.findById(storeId)

    if(!store){
        return new Response("Failed to get the store details", { status: 400 });
          }
    // Convert month to index and week number


    console.log("🗓️ Date range for export:", { start, end });

    // Fetch summaries from database
    console.log("📦 Fetching product summaries from DB...");
    const summaries = await WeeklyProductSummaries.find({
        upload_date: {
        $gte: new Date(start),
        $lte: new Date(end),
      },
      branchId:branchId,
      storeId:storeId,
    }).populate("productId");

    console.log(`✅ Retrieved ${summaries.length} summary entries.`);

    // Organize summaries by week
    const dataByWeek = new Map<string, any[]>();
    const weekLabels = new Set<string>();

    summaries.forEach((entry) => {
            const { weekStart, weekEnd } = getStartAndEndOfWeek(entry.week, entry.year);
 const formattedStart = weekStart.toISOString().split('T')[0]; // YYYY-MM-DD
const formattedEnd = weekEnd.toISOString().split('T')[0];     // YYYY-MM-DD
      const weekKey = `${entry.year}-W${entry.week}     ${formattedStart}---->${formattedEnd}`;
      console.log(weekKey)
      weekLabels.add(weekKey);

      if (!dataByWeek.has(weekKey)) {
        dataByWeek.set(weekKey, []);
      }

      const productName = entry.productId?.name || "Unknown";
      const productCode = entry.code ||"Unknown";
      const estNoSales = entry.startQuantity-entry.endQuantity;

      dataByWeek.get(weekKey)!.push({
        code:productCode,
        name: productName,
        price: entry.price,
        startQuantity: entry.startQuantity,
        endQuantity: entry.endQuantity,
        estimatedSales:estNoSales,
        estimatedRevenue:entry.estimatedSales

      });

      // console.log(`🔄 [${index}] ${weekKey} - ${productName}, ${productPrice}, ${entry.startQuantity}, ${entry.startQuantity}`);
    });

    const sortedWeeks = Array.from(weekLabels).sort();
    console.log("📊 Weeks found:", sortedWeeks);

    // Create Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Product Weekly Summary");

    console.log("📄 Generating Excel sheet...");
    const startCol = 1;
      sheet.getRow(1).getCell(1).value = store.name;
      sheet.getRow(2).getCell(1).value = branch.name;
      sheet.getRow(2).getCell(3).value = branch.location;
      sheet.getRow(3).getCell(1).value = "";

    sortedWeeks.forEach((week, i) => {
      const col = startCol + i * 7;
      sheet.getRow(3).getCell(col).value = week;
      sheet.getRow(4).getCell(col).value = "Code";
      sheet.getRow(4).getCell(col+1).value = "Name";
      sheet.getRow(4).getCell(col + 2).value = "Price";
      sheet.getRow(4).getCell(col + 3).value = "Start Qty";
      sheet.getRow(4).getCell(col + 4).value = "End Qty";
      sheet.getRow(4).getCell(col + 5).value = "Est. Sales";
      sheet.getRow(4).getCell(col + 6).value = "Est. Revenue";

      const weekData = dataByWeek.get(week)!;
      weekData.forEach((item, idx) => {
        sheet.getRow(idx + 5).getCell(col).value = item.code;
        sheet.getRow(idx + 5).getCell(col+1).value = item.name;
        sheet.getRow(idx + 5).getCell(col + 2).value = parseFloat(item.price);
        sheet.getRow(idx + 5).getCell(col + 3).value = item.startQuantity;
        sheet.getRow(idx + 5).getCell(col + 4).value = item.endQuantity;
        sheet.getRow(idx + 5).getCell(col + 5).value = item.estimatedSales;
        sheet.getRow(idx + 5).getCell(col + 6).value = parseFloat(item.estimatedRevenue);
      });

      console.log(`🧾 Sheet data written for week: ${week}, entries: ${weekData.length}`);
    });

  const buffer = await workbook.xlsx.writeBuffer();
console.log("📤 Excel file prepared. Returning as response.....");

return new NextResponse(Buffer.from(buffer), {
  status: 200,
  headers: {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename=products-summary.xlsx",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Length": buffer.byteLength.toString(),
  },
});


  } catch (error: any) {
    console.error("❌ Error occurred during export:", error);
    return new Response("Internal server error during export.", { status: 500 });
  }
}
