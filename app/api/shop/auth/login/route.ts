import bcrypt from "bcryptjs";
import { z } from "zod";

import Customer, { type ICustomerDoc } from "@/database/customer.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { signShopJwt } from "@/lib/shop/jwt";
import { NextResponse } from "next/server";

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const SHOP_COOKIE = "shop_token";

export async function POST(request: Request) {
  try {
    await dbConnect();
    const json = await request.json();
    const parsed = LoginBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const { email, password } = parsed.data;
    const customer: ICustomerDoc | null = await Customer.findOne({
      email: email.toLowerCase(),
    });

    if (!customer) {
      throw new UnauthorisedError("Invalid email or password");
    }

    const ok = await bcrypt.compare(password, customer.password);
    if (!ok) {
      throw new UnauthorisedError("Invalid email or password");
    }

    const customerId = String(customer._id);

    const token = signShopJwt({
      sub: customerId,
      email: customer.email,
    });

    const res = NextResponse.json(
      {
        success: true,
        data: {
          id: customerId,
          email: customer.email,
          firstName: customer.firstName,
        },
      },
      { status: 200 }
    );

    res.cookies.set(SHOP_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
