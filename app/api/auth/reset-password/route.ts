import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import Account from "@/database/account.model";
import dbConnect from "@/lib/mongoose";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await dbConnect();

    const account = await Account.findOne({
      provider: "credentials",
      providerAccountId: email.toLowerCase().trim(),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    if (!account.resetOtpVerified) {
      return NextResponse.json({ error: "OTP not verified" }, { status: 400 });
    }

    if (!account.resetOtpExpiry || new Date() > account.resetOtpExpiry) {
      return NextResponse.json({ error: "Reset session expired. Please start over." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await Account.findByIdAndUpdate(account._id, {
      password: hashedPassword,
      resetOtp: null,
      resetOtpExpiry: null,
      resetOtpVerified: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json({ error: "Password reset failed" }, { status: 500 });
  }
}
