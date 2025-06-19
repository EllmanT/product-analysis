"use server"

import { Account, User } from "@/database"
import action from "../handlers/action"
import handleError from "../handlers/error"
import { GetUserSchema, SignUpSchema } from "../validations"
import mongoose from "mongoose"
import { AuthCredentials, GetUserParams} from "@/types/action"
import bcrypt from "bcryptjs"

export async function addUser(
params:AuthCredentials
): Promise<ActionResponse>
{
    const validationResult = await action({
        params,
        schema:SignUpSchema,
        authorize:true
    })
    if(validationResult instanceof Error){
        return handleError(validationResult) as ErrorResponse;

    }

  const { name, surname, email, password } = validationResult.params!;

    const userId = validationResult?.session?.user?.id;

    if(!userId)throw new Error("Not authorised to add users")

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingUser = await User.findOne({ email }).session(session);

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [newUser] = await User.create([{ surname, name, email}], {
      session,
    });

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

    await session.commitTransaction();
    return { success: true };
  } catch (error) {
    await session.abortTransaction();

    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function getUser(params: GetUserParams): Promise<
  ActionResponse<{
    user: User;
  }>
> {
  const validationResult = await action({
    params,
    schema: GetUserSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { userId } = params;

  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    return {
      success: true,
      data: {
        user: JSON.parse(JSON.stringify(user)),
      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}