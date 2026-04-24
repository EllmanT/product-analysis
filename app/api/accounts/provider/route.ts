import { NextResponse } from "next/server";

import Account from "@/database/account.model";
import User from "@/database/user.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { AccountSchema } from "@/lib/validations";

//POST api/users/email
export async function POST(request: Request) {
  const providerEmail = await request.json();
  console.log("providerEmail", providerEmail, typeof providerEmail);

  if (!providerEmail) {
    throw new NotFoundError("Body not found pkp");
  }

  try {
    await dbConnect();
    const validatedData = AccountSchema.partial().safeParse({
      providerEmail,
    });

    if (!validatedData.success) {
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    const trimmed = String(providerEmail).trim();
    const emailRegex = new RegExp(
      `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    const user = await User.findOne({ email: emailRegex });
    if (!user) throw new NotFoundError("User not found");

    const account = await Account.findOne({
      userId: user._id,
      provider: "credentials",
      providerAccountId: user.email,
    }).sort({ updatedAt: -1 });
    if (!account) throw new NotFoundError("User not found");

    return NextResponse.json({ success: true, data: account }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
