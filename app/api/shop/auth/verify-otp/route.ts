import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import Customer from "@/database/customer.model";
import dbConnect from "@/lib/mongoose";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    await dbConnect();

    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });

    if (!customer || !customer.resetOtp || !customer.resetOtpExpiry) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (new Date() > customer.resetOtpExpiry) {
      return NextResponse.json({ error: "Code has expired. Please request a new one." }, { status: 400 });
    }

    const isMatch = await bcrypt.compare(otp.toString(), customer.resetOtp);

    if (!isMatch) {
      return NextResponse.json({ error: "Invalid code. Please try again." }, { status: 400 });
    }

    await Customer.findByIdAndUpdate(customer._id, { resetOtpVerified: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("shop verify-otp error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
