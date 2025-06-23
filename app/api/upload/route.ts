import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import ExcelJS from "exceljs";
import fs from "fs";
import dbConnect from "@/lib/mongoose";
import { Types } from "mongoose";
import { Upload, WeeklyProductSummaries } from "@/database";
import { addWeeks, formatDate, startOfISOWeek } from "date-fns";
import handleError from "@/lib/handlers/error";

// Function to get the formatted date
function getFormattedDate(): string {
  const today = new Date();
  const day = String(today.getDate()+1).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}

// Helper function to parse date strings ("dd-mm-yyyy") into Date objects for sorting
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to append or update data in the text file and keep it sorted by date
async function appendToTextFile(lines: string[]) {
  const textFilePath = path.join(process.cwd(), "public", "products.txt");
  const currentDate = getFormattedDate();

  // Read existing data
  let existingData: string[] = [];
  if (fs.existsSync(textFilePath)) {
    existingData = fs.readFileSync(textFilePath, "utf8").split("\n").map(line => line.trim()).filter(line => line.length > 0);
  }

  // Create a map to store unique entries
  const dataMap = new Map<string, string>();

  // Populate map with existing data
  existingData.forEach(line => {
    const [date, name, price, qty] = line.split(",");
    if (date && name) {
      dataMap.set(`${date}-${name}`, `${date},${name},${price},${qty}`);
    }
  });

  // Process new data
  lines.forEach(line => {
    const [name, price, qty] = line.split(",").map(item => item.trim());
    if (name && price && qty) {
      // Update existing entry or add new one
      dataMap.set(`${currentDate}-${name}`, `${currentDate},${name},${price},${qty}`);
    }
  });

  // Convert the map to an array and sort it by date
  const sortedData = Array.from(dataMap.values()).sort((a, b) => {
    const dateA = parseDate(a.split(",")[0]);
    const dateB = parseDate(b.split(",")[0]);
    return dateA.getTime() - dateB.getTime();
  });

  const uniqueDates = new Set(
    sortedData.map((entry) => entry.split(",")[0]) // Extract the date from each entry
  );
  
  const uniqueDateCount = uniqueDates.size;
  console.log(`Number of unique dates: ${uniqueDateCount}`);
  

  const sortedDataLength = sortedData.length
  // Write the sorted data back to the file
  fs.writeFileSync(textFilePath, sortedData.join("\n") + "\n", "utf8");

  return {sortedData, sortedDataLength, uniqueDateCount};
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Parse the uploaded CSV file
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert file to Buffer and read text
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    const lines = text.split("\n").map((line) => line.trim()).filter(line => line.length > 0);
    const sortedLines = lines.sort((a, b) => {
      const nameA = a.split(",")[0].trim().toLowerCase();
      const nameB = b.split(",")[0].trim().toLowerCase();
      return nameA.localeCompare(nameB); // Sort alphabetically
  });

  console.log("Sorted lines", sortedLines)
    // Step 2: Append the data to the text file
    const {sortedData, uniqueDateCount} = await appendToTextFile(sortedLines);

    // Step 3: Prepare to generate Excel file
    const filePath = path.join(process.cwd(), "public", "products.xlsx");
    const workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet;

    // Load existing workbook or create new
    if (fs.existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
      worksheet = workbook.getWorksheet("Products") || workbook.addWorksheet("Products");
    } else {
      worksheet = workbook.addWorksheet("Products");
    }

    // getting the length of the sorted data
    console.log("sortedData", sortedData)
    console.log("unique dates", uniqueDateCount)
const uniqueDates = Array.from(new Set(sortedData.map((entry) => entry.split(",")[0])));

// Step 2: Initialize Start Column
let startColumn = 1;
let currentProcessingDate = uniqueDates[0]; // Start with the first date
let rowcount = 0;
// Step 3: Loop Through Sorted Data
sortedData.forEach((line) => {
 
    const [dat, name, price, qty] = line.split(",").map((item) => item.trim());
    if (!dat || !name || !price || !qty) {
        console.warn(`Skipping malformed line: ${line}`);
        return;
    }

    // Step 4: Check if we detected a new date
    if (dat !== currentProcessingDate) {
        currentProcessingDate = dat;
        startColumn += 3; // Move to the next set of columns for the new date
        rowcount=0;
    }
  // Step 5: Write headers once per date (if not already written)
    worksheet.getRow(1).getCell(startColumn).value = currentProcessingDate;
  
  
    // Step 5: Write headers once per date (if not already written)
    if (!worksheet.getRow(2).getCell(startColumn).value) {
        worksheet.getRow(2).getCell(startColumn).value = "Product Name";
        worksheet.getRow(2).getCell(startColumn + 1).value = "Price";
        worksheet.getRow(2).getCell(startColumn + 2).value = "Quantity Left";
    }

    // Step 6: Write Product Data
    const rowIndex = rowcount + 3; // Start from row 3
    worksheet.getRow(rowIndex).getCell(startColumn).value = name;
    worksheet.getRow(rowIndex).getCell(startColumn + 1).value = parseFloat(price);
    worksheet.getRow(rowIndex).getCell(startColumn + 2).value = parseInt(qty);
    rowcount ++;
});



   

    // Step 7: Save the updated Excel file
    await workbook.xlsx.writeFile(filePath);

    return NextResponse.json({ downloadUrl: "/products.xlsx" }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: `Error processing file: ${error}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
  // const year = searchParams.get("year");

  const storeId = searchParams.get("storeId");

    console.log("📥 Incoming export request...");

  if(!storeId){
    return NextResponse.json("Failed",{status:404})
  }
  console.log("storeId",storeId)
 await dbConnect()



const objectStoreId = new Types.ObjectId(storeId)



  try {

const uploads = await Upload.find({
  storeId: objectStoreId,

}).populate("branchId", "name location");

const formattedUploads = uploads.map(upload => ({
  uploadId:upload._id,
  branchId: upload.branchId._id, // or include location: `${name} (${location})`
  branchLocation: upload.branchId.location, // or include location: `${name} (${location})`
  uploadDate: formatDate(upload.upload_date, "dd/MM/yyyy"),
  estValue: parseFloat(upload.estimatedValue),
  totalProducts: upload.totalProducts,
}));

    console.log("the users are", uploads)
  
         return NextResponse.json({success:true,data:formattedUploads},{status:200})


  } catch (error) {
    return handleError(error) as ErrorResponse;
  }

//   res.status(200).json(chartData)
  
}
