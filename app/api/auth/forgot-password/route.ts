import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import Account from "@/database/account.model";
import User from "@/database/user.model";
import { sendPasswordResetOtp } from "@/lib/email";
import dbConnect from "@/lib/mongoose";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await dbConnect();

    // Always return 200 to avoid leaking which emails are registered
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const account = await Account.findOne({
      provider: "credentials",
      providerAccountId: email.toLowerCase().trim(),
    });

    if (!account) {
      return NextResponse.json({ success: true });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Account.findByIdAndUpdate(account._id, {
      resetOtp: hashedOtp,
      resetOtpExpiry: expiry,
      resetOtpVerified: false,
    });

    await sendPasswordResetOtp(email, otp);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("forgot-password error:", error);
    return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
  }
}
