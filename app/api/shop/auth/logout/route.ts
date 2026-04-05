import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set("shop_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
