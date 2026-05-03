"use server";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { AuthError, CredentialsSignin } from "next-auth";

import { signIn } from "@/auth";
import Account from "@/database/account.model";
import User from "@/database/user.model";
import { stripAuthJsErrorSuffix } from "@/lib/auth/credentials-signin-error";
import { Store } from "@/database";
import { AuthCredentials } from "@/types/action";

import action from "../handlers/action";
import handleError from "../handlers/error";
import { SignInSchema, SignUpSchema } from "../validations";
import { RequestError, UnauthorisedError } from "../http-errors";
import { isStaffEmailAllowed } from "../auth/staff-allowlist";

function mapAuthSignInFailure(error: unknown): ErrorResponse {
  if (error instanceof CredentialsSignin || error instanceof AuthError) {
    const msg = stripAuthJsErrorSuffix((error as Error).message);
    return handleError(
      new UnauthorisedError(msg || "Sign in failed")
    ) as ErrorResponse;
  }
  return handleError(error) as ErrorResponse;
}

export async function signUpWithCredentials(
  params: AuthCredentials
): Promise<ActionResponse> {
  const validationResult = await action({ params, schema: SignUpSchema });
  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { name, surname, store, email, password, branchId, storeId } = validationResult.params!;

  if (!isStaffEmailAllowed(email)) {
    return handleError(
      new RequestError(
        403,
        "Staff registration is by invitation only. If you need access, contact your administrator."
      )
    ) as ErrorResponse;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingUser = await User.findOne({ email }).session(session);

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

  

const hashedPassword = await bcrypt.hash(password, 12);


if(store){
const [newUser] = await User.create(
  [{ surname, name, email, role: "admin" as const }],
  { session }
);

await Account.create(
  [
    {
      userId: newUser._id,
      name,
      provider: "credentials",
      providerAccountId: email,
      password: hashedPassword,
    },
  ],
  { session }
);

const [newStore] = await Store.create(
  [
    {
      name: store,
      userId: newUser._id,
    },
  ],
  { session }
);
// Update the newly created user with the storeId
await User.updateOne(
  { _id: newUser._id },
  { $set: { storeId: newStore._id } },
  { session }
);


// Commit the transaction
await session.commitTransaction();

try {
  await signIn("credentials", { email, password, redirect: false });
  return { success: true };
} catch (error) {
  return mapAuthSignInFailure(error);
}

}else{

const [newUser] = await User.create(
  [{ surname, name, email,branchId, storeId }],
  { session }
);

await Account.create(
  [
    {
      userId: newUser._id,
      name,
      provider: "credentials",
      providerAccountId: email,
      password: hashedPassword,
    },
  ],
  { session }
);




// Commit the transaction
await session.commitTransaction();

try {
  await signIn("credentials", { email, password, redirect: false });
  return { success: true };
} catch (error) {
  return mapAuthSignInFailure(error);
}

}

  } catch (error) {
    await session.abortTransaction();
    console.log("Here 3", error)

    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function signInWithCredentials(
  params: Pick<AuthCredentials, "email" | "password">
): Promise<ActionResponse> {
  const validationResult = await action({ params, schema: SignInSchema });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { email, password } = validationResult.params!;

  try {
    await signIn("credentials", { email, password, redirect: false });
    return { success: true };
  } catch (error) {
    return mapAuthSignInFailure(error);
  }
}
