import Customer from "@/database/customer.model";
import handleError from "@/lib/handlers/error";
import { UnauthorisedError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { getShopCustomerIdForRequest } from "@/lib/shop/customer-auth";
import { signShopJwt } from "@/lib/shop/jwt";
import { NextResponse } from "next/server";
import { z } from "zod";

const SHOP_COOKIE = "shop_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const PatchCustomerSchema = z
  .object({
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    phone: z.string().min(1).max(40),
    address: z.string().min(1).max(2000),
    buyerType: z.enum(["individual", "business"]),
    tradeName: z.string().max(200).optional().default(""),
    tinNumber: z.string().max(80).optional().default(""),
    vatNumber: z.string().max(80).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.buyerType === "business") {
      if (!data.tradeName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["tradeName"],
          message: "Company / trade name is required for a business account.",
        });
      }
      if (!data.tinNumber?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["tinNumber"],
          message: "TIN is required for a business account.",
        });
      }
      if (!data.vatNumber?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["vatNumber"],
          message: "VAT number is required for a business account.",
        });
      }
    }
  });

function dataShape(
  c: { id: string } & {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    tradeName: string;
    tinNumber: string;
    vatNumber: string;
    address: string;
    buyerType?: string;
  }
) {
  const buyerType = c.buyerType === "business" ? "business" : "individual";
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    tradeName: c.tradeName,
    tinNumber: c.tinNumber,
    vatNumber: c.vatNumber,
    address: c.address,
    buyerType,
  };
}

export async function GET() {
  try {
    await dbConnect();
    const customerId = await getShopCustomerIdForRequest();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const customer = await Customer.findById(customerId).select(
      "firstName lastName email phone tradeName tinNumber vatNumber address buyerType"
    );

    if (!customer) {
      throw new UnauthorisedError("Please sign in");
    }

    const idStr = customer.id;

    return NextResponse.json(
      {
        success: true,
        data: dataShape({ ...customer.toObject(), id: idStr }),
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
    const customerId = await getShopCustomerIdForRequest();
    if (!customerId) {
      throw new UnauthorisedError("Please sign in");
    }

    const json: unknown = await request.json();
    const parsed = PatchCustomerSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const body = parsed.data;
    const trade = body.tradeName.trim();
    const tin = body.tinNumber.trim();
    const vat = body.vatNumber.trim();

    const update = {
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      phone: body.phone.trim(),
      address: body.address.trim(),
      buyerType: body.buyerType,
      tradeName: body.buyerType === "business" ? trade : "",
      tinNumber: body.buyerType === "business" ? tin : "",
      vatNumber: body.buyerType === "business" ? vat : "",
    };

    const customer = await Customer.findByIdAndUpdate(customerId, update, {
      new: true,
    }).select(
      "firstName lastName email phone tradeName tinNumber vatNumber address buyerType"
    );

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
        data: dataShape({ ...customer.toObject(), id: customer.id }),
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
