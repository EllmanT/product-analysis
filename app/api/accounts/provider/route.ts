import { NextResponse } from "next/server";

import Account from "@/database/account.model";
import User from "@/database/user.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";

export async function POST(request: Request) {
  try {
    const providerEmail = await request.json();

    if (
      providerEmail === null ||
      providerEmail === undefined ||
      (typeof providerEmail === "string" && !providerEmail.trim())
    ) {
      throw new ValidationError({
        body: ["Provider identifier is required"],
      });
    }

    await dbConnect();

    const trimmed = String(providerEmail).trim();

    // OAuth provider account IDs (e.g. Google `sub`) are not emails.
    if (!trimmed.includes("@")) {
      const account = await Account.findOne({ providerAccountId: trimmed });
      if (!account) throw new NotFoundError("Account");
      return NextResponse.json({ success: true, data: account }, { status: 200 });
    }

    const emailRegex = new RegExp(
      `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    const user = await User.findOne({ email: emailRegex });
    if (!user) throw new NotFoundError("User");

    const account = await Account.findOne({
      userId: user._id,
      provider: "credentials",
      providerAccountId: user.email,
    }).sort({ updatedAt: -1 });
    if (!account) throw new NotFoundError("Account");

    return NextResponse.json({ success: true, data: account }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
