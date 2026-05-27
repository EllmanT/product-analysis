import { auth } from "@/auth";
import dbConnect from "@/lib/mongoose";
import { Upload, Branch } from "@/database";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const { jobId } = await params;

  const upload = await Upload.findById(jobId).lean<{
    _id: unknown;
    branchId: unknown;
    status?: string;
    processingError?: string;
    productLineCount?: number;
    totalProducts?: number;
    estimatedValue?: { toString(): string };
    deadStockSkus?: number;
    activeStockSkus?: number;
    upload_date?: Date;
    originalFileName?: string;
    fileName?: string;
    fileSizeBytes?: number;
  }>();

  if (!upload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = upload.status ?? "complete"; // backward compat for old records

  if (status === "complete") {
    const branch = await Branch.findById(upload.branchId)
      .select("name location")
      .lean<{ _id: unknown; name: string; location: string } | null>();

    return NextResponse.json({
      success: true,
      data: {
        status: "complete",
        summary: {
          productLineCount: upload.productLineCount ?? upload.totalProducts ?? 0,
          totalQuantity: upload.totalProducts ?? 0,
          totalValue: parseFloat(upload.estimatedValue?.toString() ?? "0"),
          deadStockSkus: upload.deadStockSkus ?? 0,
          activeStockSkus: upload.activeStockSkus ?? 0,
          uploadDate: upload.upload_date?.toISOString() ?? new Date().toISOString(),
          originalFileName: upload.originalFileName ?? upload.fileName ?? "",
          fileSizeBytes: upload.fileSizeBytes ?? 0,
          branch: {
            id: String(upload.branchId),
            name: branch?.name ?? "Unknown",
            location: branch?.location ?? "",
          },
        },
      },
    });
  }

  if (status === "failed") {
    return NextResponse.json({
      success: true,
      data: {
        status: "failed",
        error: upload.processingError ?? "Processing failed.",
      },
    });
  }

  // Still processing
  return NextResponse.json({ success: true, data: { status: "processing" } });
}
