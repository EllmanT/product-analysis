import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { uploadProductsSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import mongoose, { Decimal128, Types } from "mongoose";
import { ProductMaster, Upload, UploadProduct, User, WeeklyProductSummaries } from "@/database";
import { uploadProcessingQueue } from "@/lib/jobs/queues/upload.queue";
import { processUploadJob } from "@/lib/jobs/processors/upload.processor";
import { getISOWeek } from 'date-fns';

export async function POST(req: Request) {
  console.log("📥 Received request for product upload");

    await dbConnect();
  const session = await mongoose.startSession();

  console.log("session");
  session.startTransaction();
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const userId = formData.get("userId");
    const branchId= formData.get("branchId")
    const storeId= formData.get("storeId")

    console.log("iser id", userId)

    console.log("📄 Uploaded file:", file);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    console.log("✅ Connected to database");

    const validatedData = uploadProductsSchema.safeParse({ file });

    if (!validatedData.success) {
      console.warn("❌ Validation failed:", validatedData.error.flatten().fieldErrors);
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    console.log("✅ File validated successfully");


    // Continue with processing `validatedData.data.file` if needed
    console.log(validatedData.data.file)

        
    // Convert file to Buffer and read text
    const buffer = await file.arrayBuffer();
     // ✅ Compute hash of file content

    const ogcontentHash = await generateSHA256Hash(buffer);
       const upload_date = new Date();
    upload_date.setDate(upload_date.getDate()+14);
    console.log("content Hash", ogcontentHash)

const contentHash = `${ogcontentHash}_${userId}_${storeId}_${branchId}_${upload_date.toISOString().split('T')[0]}`;
 // 🔍 Check if this hash already exists
    const existingUpload = await Upload.findOne({ contentHash}).session(session);
    if (existingUpload) {
      console.log("♻️ Duplicate upload detected. Aborting...");
      return NextResponse.json({ message: "Duplicate upload. No changes made." }, { status: 200 });
    }

    
    // Store file locally for auditing
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `upload_${timestamp}_${file.name}`;
    // const uploadDir = path.resolve("./uploads");

    // await fstat.mkdir(uploadDir, { recursive: true }); // Ensure directory exists
    // const fullPath = path.join(uploadDir, fileName);
    // await fs.writeFile(fullPath, buffer);
    // console.log(`📁 File saved locally at: ${fullPath}`);




    const text = new TextDecoder().decode(buffer);
    const lines = text.split("\n").map((line) => line.trim()).filter(line => line.length > 0);
    const sortedLines = lines.sort((a, b) => {
      const nameA = a.split(",")[0].trim().toLowerCase();
      const nameB = b.split(",")[0].trim().toLowerCase();
      return nameA.localeCompare(nameB); // Sort alphabetically
  });

 console.log(`🔢 Parsed ${sortedLines.length} product lines`);

    // Extract additional metadata (e.g., from formData or auth)
    const uploaded_by = formData.get("userId")?.toString() || "unknown_user";
    console.log("uploaded by", uploaded_by)

    console.log("date format 2",upload_date);
    const week = getWeekNumber(upload_date);
    const year = upload_date.getFullYear();
    const month = getMonthName(upload_date);

    // Save Upload document (without products for now, just metadata and file)
    const [upload] = await Upload.create(
      [
        {
          uploadedBy:userId,
          storeId: storeId,
          branchId: branchId,
          upload_date: upload_date,
          month:month,
          week: week,
          year:year,
          fileName,
          contentHash,
              totalProducts:0,
   estimatedValue: mongoose.Types.Decimal128.fromString("0.00"),

        //   filePath: fullPath,
        },
      ],
      { session }
    );

    console.log("📦 Upload metadata saved:", upload._id);

 const productObjectIds: Types.ObjectId[] = [];
let totalProducts: number = 0;
let estimatedValue = 0;

for (const line of sortedLines) {
  const [codeRaw, nameRaw, priceRaw, qtyRaw] = line.split(",").map((val) => val.trim());

  const code = codeRaw;
  const name = nameRaw;
  const price = parseFloat(priceRaw);
  const qty = parseInt(qtyRaw, 10);

  if (!code || !name || isNaN(price) || isNaN(qty)) {
    console.warn(`⚠️ Skipping invalid row: ${line}`);
    continue;
  }

  let product = await ProductMaster.findOne({ standardCode: code }).session(session);
  console.log("product", product)

  if (!product) {
    const created = await ProductMaster.create(
      [{ standardCode: code, name, aliases: [] }],
      { session }
    );
    product = created[0];
  } else {
    if (!product.aliases.includes(name)) {
      await ProductMaster.updateOne(
        { _id: product._id },
        { $addToSet: { aliases: name } },
        { session }
      );
    }
  }

  productObjectIds.push(product._id);

  // Create UploadProduct
  const currentUpload = await UploadProduct.create(
    [{
      uploadId: upload._id,
      productId: product._id,
      storeId:storeId,
      branchId:branchId,
      code,
      name,
      qty,
      price,
      upload_date: upload_date,
      month,
      week,
      year,
    }],
    { session }
  );

  totalProducts += qty;
  estimatedValue += qty * price;

  // === Weekly Summary Logic ===
  const previousUpload = await UploadProduct.findOne({
    productId: product._id,
    storeId:storeId,
    branchId:branchId,
    // createdAt: { $lt: currentUpload[0].createdAt },//this would be ideal
    upload_date: { $lt: currentUpload[0].upload_date },//this is for testing purposes

  }).sort({ createdAt: -1 }).session(session);

  console.log("previous upload",previousUpload);

  if (!previousUpload) {
    // First upload for this product
    await WeeklyProductSummaries.create(
      [{
        productId: product._id,
        code: code,
        week: week,
        year: year,
        upload_date: upload_date,
        storeId: storeId,
        branchId: branchId,
        price:price,
        startQuantity: qty,
        endQuantity: null,
        estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
        restocked: false,
        restockAmount: 0,
      }],
      { session }
    );
  } else {
    const prevQty = previousUpload.qty;
    const sales = (prevQty - qty)*price;
    const restocked = sales < 0;
    const summaryWeek = getWeekNumber(previousUpload.upload_date);
    const summaryYear = previousUpload.upload_date.getFullYear();
    console.log("sales", sales)
    console.log("qty", qty)
    console.log(summaryWeek)
    console.log(summaryYear)
    console.log("product id",product._id)
    await WeeklyProductSummaries.updateOne(
      { productId: product._id, branchId:branchId,storeId:storeId, week: summaryWeek, year: summaryYear },
      {
        $set: {
          endQuantity: qty,
          estimatedSales: mongoose.Types.Decimal128.fromString(Math.abs(sales).toFixed(2)),
          restocked,
          restockAmount: restocked ? Math.abs(sales) : 0,
        },
      },
      { upsert: true, session }
    );
    console.log("sales", sales)
    console.log("qty", qty)

    // Also check if a summary already exists for current week (if not, insert it with startQuantity)
    const currentSummary = await WeeklyProductSummaries.findOne({
      productId: product._id,
      storeId:storeId,
      branchId:branchId,
      week,
      year
    }).session(session);

    if (!currentSummary) {
      await WeeklyProductSummaries.create(
        [{
          productId: product._id,
          code: code,
          week:week,
          year:year,
          price:price,
          upload_date: upload_date,
          storeId: storeId,
          branchId: branchId,
          startQuantity: qty,
          endQuantity: null,
          estimatedSales: mongoose.Types.Decimal128.fromString("0.00"),
          restocked: false,
          restockAmount: 0,
        }],
        { session }
      );
    }
  }
}
// === Upload metadata update ===

await Upload.updateOne(
  { _id: upload._id },
  {
    $set: {
      totalProducts,
      estimatedValue: mongoose.Types.Decimal128.fromString(estimatedValue.toFixed(2)),
    }
  },
  { session }
);

await Upload.updateOne(
  { _id: upload._id },
  { $set: { products: productObjectIds } },
  { session }
);




    await session.commitTransaction();
    console.log("✅ Upload transaction committed");

    // 
//  await processUploadJob(upload);



    return NextResponse.json({ success: true, uploadId: upload._id }, { status: 201 });
  } catch (error) {
    console.error("🔥 Error during product upload:", error);
    await session.abortTransaction();
    return handleError(error, "api") as APIErrorResponse;
  } finally {
    session.endSession();
  }
}

// Helper to get ISO week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday = 7
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  // Get first day of the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  // Calculate week number
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return weekNo;
}
function getMonthName(date:Date) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return monthNames[date.getMonth()];
}

async function generateSHA256Hash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}


