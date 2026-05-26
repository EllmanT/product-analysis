import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUser } from "@/lib/actions/user.action";
import dbConnect from "@/lib/mongoose";
import { Branch, Upload } from "@/database";
import { Types } from "mongoose";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  await dbConnect();

  const storeId = new Types.ObjectId(data.user.storeId);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const branches = await Branch.find({ storeId }).select("_id name location").lean();

  const results = await Promise.all(
    branches.map(async (branch) => {
      const branchId = branch._id;

      const [lastUpload, uploadsLast7Days, totalUploads] = await Promise.all([
        Upload.findOne({ storeId, branchId })
          .sort({ upload_date: -1 })
          .select("upload_date")
          .lean(),
        Upload.countDocuments({
          storeId,
          branchId,
          upload_date: { $gte: sevenDaysAgo },
        }),
        Upload.countDocuments({ storeId, branchId }),
      ]);

      const lastUploadDate = lastUpload?.upload_date ?? null;
      const daysSinceLastUpload = lastUploadDate
        ? Math.floor(
            (now.getTime() - new Date(lastUploadDate).getTime()) / 86_400_000
          )
        : null;

      return {
        branchId: String(branchId),
        branchName: `${branch.name} (${branch.location})`,
        lastUploadDate: lastUploadDate ? new Date(lastUploadDate).toISOString() : null,
        daysSinceLastUpload,
        totalUploadsLast7Days: uploadsLast7Days,
        totalUploadsAllTime: totalUploads,
      };
    })
  );

  results.sort((a, b) => {
    if (a.daysSinceLastUpload === null) return 1;
    if (b.daysSinceLastUpload === null) return -1;
    return b.daysSinceLastUpload - a.daysSinceLastUpload;
  });

  return NextResponse.json({ success: true, data: results });
}
