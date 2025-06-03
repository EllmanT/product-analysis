import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { WeeklyProductSummaries } from "@/database";
import dbConnect from "@/lib/mongoose";

export async function GET(req: NextRequest) {
  console.log("📥 Incoming export request...");

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const week = searchParams.get("week");

  console.log("🔍 Query params:", { month, year, week });

  if (!month || !year || !week) {
    console.warn("⚠️ Missing required query parameters.");
    return new Response("Missing month, year or week", { status: 400 });
  }

  try {
    console.log("🔌 Connecting to MongoDB...");
    await dbConnect();
    console.log("✅ MongoDB connected.");

    // Convert month to index and week number
    const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
    const weekNumber = parseInt(week.replace("week", ""));
    console.log("📅 Calculated monthIndex:", monthIndex, "weekNumber:", weekNumber);

    const startOfMonth = new Date(parseInt(year), monthIndex, 1);
    const from = new Date(startOfMonth);
    from.setDate(1 + (weekNumber - 1) * 7);

    const to = new Date(from);
    to.setDate(from.getDate() + 6);

    const format = (d: Date) => d.toISOString().split("T")[0];
    const fromStr = format(from);
    const toStr = format(to);

    console.log("🗓️ Date range for export:", { fromStr, toStr });

    // Fetch summaries from database
    console.log("📦 Fetching product summaries from DB...");
    const summaries = await WeeklyProductSummaries.find({
      createdAt: {
        $gte: new Date(fromStr),
        $lte: new Date(toStr),
      },
    }).populate("productId");

    console.log(`✅ Retrieved ${summaries.length} summary entries.`);

    // Organize summaries by week
    const dataByWeek = new Map<string, any[]>();
    const weekLabels = new Set<string>();

    summaries.forEach((entry, index) => {
      const weekKey = `${entry.year}-W${entry.week}`;
      weekLabels.add(weekKey);

      if (!dataByWeek.has(weekKey)) {
        dataByWeek.set(weekKey, []);
      }

      const productName = entry.productId?.name || "Unknown";
      const productPrice = entry.price || 0;
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

      console.log(`🔄 [${index}] ${weekKey} - ${productName}, ${productPrice}, ${entry.startQuantity}, ${entry.startQuantity}`);
    });

    const sortedWeeks = Array.from(weekLabels).sort();
    console.log("📊 Weeks found:", sortedWeeks);

    // Create Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Product Weekly Summary");

    console.log("📄 Generating Excel sheet...");
    let startCol = 1;

    sortedWeeks.forEach((week, i) => {
      const col = startCol + i * 7;

      sheet.getRow(1).getCell(col).value = week;
      sheet.getRow(2).getCell(col).value = "Code";
      sheet.getRow(2).getCell(col+1).value = "Name";
      sheet.getRow(2).getCell(col + 2).value = "Price";
      sheet.getRow(2).getCell(col + 3).value = "Start Qty";
      sheet.getRow(2).getCell(col + 4).value = "End Qty";
      sheet.getRow(2).getCell(col + 5).value = "Est. Sales";
      sheet.getRow(2).getCell(col + 6).value = "Est. Revenue";

      const weekData = dataByWeek.get(week)!;
      weekData.forEach((item, idx) => {
        sheet.getRow(idx + 3).getCell(col).value = item.code;
        sheet.getRow(idx + 3).getCell(col+1).value = item.name;
        sheet.getRow(idx + 3).getCell(col + 2).value = parseFloat(item.price);
        sheet.getRow(idx + 3).getCell(col + 3).value = item.startQuantity;
        sheet.getRow(idx + 3).getCell(col + 4).value = item.endQuantity;
        sheet.getRow(idx + 3).getCell(col + 5).value = item.estimatedSales;
        sheet.getRow(idx + 3).getCell(col + 6).value = parseFloat(item.estimatedRevenue);
      });

      console.log(`🧾 Sheet data written for week: ${week}, entries: ${weekData.length}`);
    });

    // Return Excel as buffer
    const buffer = await workbook.xlsx.writeBuffer();
    console.log("📤 Excel file prepared. Returning as response...");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=products-summary.xlsx",
      },
    });

  } catch (error: any) {
    console.error("❌ Error occurred during export:", error);
    return new Response("Internal server error during export.", { status: 500 });
  }
}
