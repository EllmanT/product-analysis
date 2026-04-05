import { auth } from "@/auth";
import { HomepageConfig } from "@/database";
import handleError from "@/lib/handlers/error";
import dbConnect from "@/lib/mongoose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";

const PatchSchema = z.object({
  promotionalProductIds: z.array(z.string()).optional(),
  featuredText: z.string().optional(),
  bannerText: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    await dbConnect();
    const config = await HomepageConfig.findOne().lean();

    return NextResponse.json({
      success: true,
      data: config ?? {
        promotionalProductIds: [],
        featuredText: "",
        bannerText: "",
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    await dbConnect();
    const json = await request.json();
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.featuredText !== undefined)
      update.featuredText = parsed.data.featuredText;
    if (parsed.data.bannerText !== undefined)
      update.bannerText = parsed.data.bannerText;
    if (parsed.data.promotionalProductIds !== undefined) {
      update.promotionalProductIds = parsed.data.promotionalProductIds.map(
        (id) => new Types.ObjectId(id)
      );
    }

    const doc = await HomepageConfig.findOneAndUpdate(
      {},
      { $set: update },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
