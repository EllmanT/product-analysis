import { Role } from "@/database";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const ROLE_NAMES = ["admin", "branch_user"] as const;

export async function POST() {
  try {
    await dbConnect();
    const results: { name: string; upserted: boolean }[] = [];

    for (const name of ROLE_NAMES) {
      const res = await Role.updateOne(
        { name },
        { $setOnInsert: { name } },
        { upsert: true }
      );
      results.push({ name, upserted: res.upsertedCount > 0 });
    }

    return NextResponse.json({ success: true, data: results }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to seed roles" } },
      { status: 500 }
    );
  }
}
