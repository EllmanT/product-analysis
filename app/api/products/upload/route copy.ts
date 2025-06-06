import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { uploadProductsSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import mongoose, { Decimal128, Types } from "mongoose";
import { ProductMaster, Upload, UploadProduct, User } from "@/database";
import { uploadProcessingQueue } from "@/lib/jobs/queues/upload.queue";
import { processUploadJob } from "@/lib/jobs/processors/upload.processor";

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

    const contentHash = await generateSHA256Hash(buffer);
    console.log("content Hash", contentHash)

 // 🔍 Check if this hash already exists
    const existingUpload = await Upload.findOne({ contentHash: contentHash }).session(session);
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

    const user = await User.findById(uploaded_by);

    console.log("user", user)
    const branch_id = formData.get("branch_id")?.toString() || "unknown_branch";
    const upload_date = new Date();

    const week = getWeekNumber(upload_date);
    const year = upload_date.getFullYear();
    const month = getMonthName(upload_date);

    // Save Upload document (without products for now, just metadata and file)
    const [upload] = await Upload.create(
      [
        {
          uploadedBy:user._id,
        //   branch_id,
          upload_date: Date.now(),
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

    // TODO: Process and insert UploadProduct, ProductMaster, and handle aliases here
    // UploadProduct logic goes here

    const productObjectIds: Types.ObjectId[] = [];
let totalProducts:number = 0;
let estimatedValue= 0;

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

  if (!product) {
    product = await ProductMaster.create([{
      standardCode: code,
      name: name,
      aliases: [],
    }], { session });
    product = product[0];
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

  await UploadProduct.create([{
    uploadId: upload._id,
    productId: product._id,
    code,
    name,
    qty,
    price,
    upload_date: Date.now(),
    month:month,
    week: week,
    year:year,

  }], { session });

  totalProducts += 1;
  estimatedValue += qty * price;
}

console.log(estimatedValue)
console.log(totalProducts)

// Update Upload model
await Upload.updateOne(
  { _id: upload._id },
  {
    $set: {
  totalProducts,
estimatedValue: mongoose.Types.Decimal128.fromString(estimatedValue.toFixed(2))
    }
  },
  { session }
);


await Upload.updateOne(
  { _id: upload._id },
  { $set: { products: productObjectIds } },
  { session }
);




    // UploadProduct Logic ends here
    


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
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.floor(diff / (7 * 24 * 3600 * 1000));
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
