import { NextResponse } from "next/server";

/** Legacy registration removed; shop accounts use Clerk Sign up. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        message:
          "Email and password registration has been replaced. Use the shop Sign up page to create an account.",
      },
    },
    { status: 410 }
  );
}
