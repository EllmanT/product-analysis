import handleError from "@/lib/handlers/error";
import { ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { uploadProductsSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { Branch } from "@/database";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import { normalizeRole } from "@/lib/auth/role";
import {
  processStockUpload,
} from "@/lib/upload/processStockUpload";

export async function POST(req: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userIdStr = authSession.user.id;

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  await dbConnect();

  const { success: userOk, data: userData } = await getUser({
    userId: userIdStr,
  });
  if (!userOk || !userData?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const dbUser = userData.user;
  let storeId: string;
  let branchId: string;

  if (normalizeRole(dbUser.role) === "admin") {
    const rawStore = formData.get("storeId");
    const rawBranch = formData.get("branchId");
    if (
      typeof rawStore !== "string" ||
      typeof rawBranch !== "string" ||
      !rawStore ||
      !rawBranch
    ) {
      return NextResponse.json(
        { error: "storeId and branchId are required" },
        { status: 400 }
      );
    }
    if (!dbUser.storeId || String(dbUser.storeId) !== rawStore) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const branchDoc = await Branch.findOne({
      _id: rawBranch,
      storeId: dbUser.storeId,
    });
    if (!branchDoc) {
      return NextResponse.json({ error: "Invalid branch" }, { status: 403 });
    }
    storeId = rawStore;
    branchId = rawBranch;
  } else {
    if (!dbUser.storeId || !dbUser.branchId) {
      return NextResponse.json(
        { error: "No branch assigned to your account" },
        { status: 403 }
      );
    }
    storeId = String(dbUser.storeId);
    branchId = String(dbUser.branchId);
  }

  try {
    const validatedData = uploadProductsSchema.safeParse({ file });

    if (!validatedData.success) {
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    const buffer = await file.arrayBuffer();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `upload_${timestamp}_${file.name}`;

    const result = await processStockUpload({
      buffer,
      fileName,
      originalFileName: file.name,
      fileSizeBytes: file.size,
      userId: userIdStr,
      storeId,
      branchId,
    });

    if (result.duplicate) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          message: "Duplicate upload. No changes made.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          uploadId: result.uploadId,
          summary: result.summary,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error during product upload:", error);
    return handleError(error, "api") as APIErrorResponse;
  }
}
