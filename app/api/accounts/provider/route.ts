import { NextResponse } from "next/server";

import Account from "@/database/account.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { AccountSchema } from "@/lib/validations";

//POST api/users/email
export async function POST(request: Request) {
const providerEmail  = await request.json();
console.log("providerEmail", providerEmail, typeof providerEmail);

  if(!providerEmail){
throw new NotFoundError("Body not found pkp");
} 
const newEmail = providerEmail
console.log(newEmail)
  console.log("provider", providerEmail)

  try {
    await dbConnect();
    const validatedData = AccountSchema.partial().safeParse({
      providerEmail,
    });

    if (!validatedData.success) {
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    const account = await Account.findOne({providerAccountId: providerEmail });
    if (!account) throw new NotFoundError("User not found");

    return NextResponse.json({ success: true, data: account }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
