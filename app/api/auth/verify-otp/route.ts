import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import Account from "@/database/account.model";
import dbConnect from "@/lib/mongoose";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    await dbConnect();

    const account = await Account.findOne({
      provider: "credentials",
      providerAccountId: email.toLowerCase().trim(),
    });

    if (!account || !account.resetOtp || !account.resetOtpExpiry) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (new Date() > account.resetOtpExpiry) {
      return NextResponse.json({ error: "Code has expired. Please request a new one." }, { status: 400 });
    }

    const isMatch = await bcrypt.compare(otp.toString(), account.resetOtp);

    if (!isMatch) {
      return NextResponse.json({ error: "Invalid code. Please try again." }, { status: 400 });
    }

    await Account.findByIdAndUpdate(account._id, { resetOtpVerified: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("verify-otp error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
