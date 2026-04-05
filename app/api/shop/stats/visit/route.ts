import { ShopPublicStats } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const STATS_KEY = "default";

export async function POST() {
  try {
    await dbConnect();
    const doc = await ShopPublicStats.findOneAndUpdate(
      { key: STATS_KEY },
      { $inc: { totalVisits: 1 } },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json(
      {
        success: true,
        data: { totalVisits: doc?.totalVisits ?? 1 },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
