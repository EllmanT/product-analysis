import Customer from "@/database/customer.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdFromCookies } from "@/lib/shop/customer-auth";
import { signShopJwt } from "@/lib/shop/jwt";
import { NextResponse } from "next/server";
import { z } from "zod";

const SHOP_COOKIE = "shop_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const PatchCustomerSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  phone: z.string().min(1).max(40),
  tradeName: z.string().min(1).max(200),
  tinNumber: z.string().min(1).max(80),
  vatNumber: z.string().min(1).max(80),
  address: z.string().min(1).max(2000),
});

export async function GET() {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const customer = await Customer.findById(customerId).select(
      "firstName lastName email phone tradeName tinNumber vatNumber address"
    );

    if (!customer) {
      throw new UnauthorisedError("Please sign in");
    }

    const idStr = customer.id;

    return NextResponse.json(
      {
        success: true,
        data: {
          id: idStr,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          tradeName: customer.tradeName,
          tinNumber: customer.tinNumber,
          vatNumber: customer.vatNumber,
          address: customer.address,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

export async function PATCH(request: Request) {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdFromCookies();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const json: unknown = await request.json();
    const parsed = PatchCustomerSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const body = parsed.data;
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone.trim(),
        tradeName: body.tradeName.trim(),
        tinNumber: body.tinNumber.trim(),
        vatNumber: body.vatNumber.trim(),
        address: body.address.trim(),
      },
      { new: true }
    ).select("firstName lastName email phone tradeName tinNumber vatNumber address");

    if (!customer) {
      throw new UnauthorisedError("Please sign in");
    }

    const token = signShopJwt(
      {
        sub: customer.id,
        email: customer.email,
        firstName: customer.firstName,
      },
      COOKIE_MAX_AGE
    );

    const res = NextResponse.json(
      {
        success: true,
        data: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          tradeName: customer.tradeName,
          tinNumber: customer.tinNumber,
          vatNumber: customer.vatNumber,
          address: customer.address,
        },
      },
      { status: 200 }
    );

    res.cookies.set(SHOP_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return res;
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
