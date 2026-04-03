import bcrypt from "bcryptjs";
import { z } from "zod";

import Customer from "@/database/customer.model";
import handleError from "@/lib/handlers/error";
import { RequestError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { NextResponse } from "next/server";

const RegisterBodySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(1),
  tradeName: z.string().min(1),
  tinNumber: z.string().min(1),
  vatNumber: z.string().min(1),
  address: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await dbConnect();
    const json = await request.json();
    const parsed = RegisterBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const body = parsed.data;
    const existing = await Customer.findOne({
      email: body.email.toLowerCase(),
    }).lean();
    if (existing) {
      throw new RequestError(409, "An account with this email already exists");
    }

    const hashed = await bcrypt.hash(body.password, 10);
    const customer = await Customer.create({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email.toLowerCase(),
      password: hashed,
      phone: body.phone,
      tradeName: body.tradeName,
      tinNumber: body.tinNumber,
      vatNumber: body.vatNumber,
      address: body.address,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: customer._id.toString(),
          email: customer.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return handleError(
        new RequestError(409, "An account with this email already exists"),
        "api"
      ) as APIErrorResponse;
    }
    return handleError(error, "api") as APIErrorResponse;
  }
}
