"use server"

import { Account, User } from "@/database"
import action from "../handlers/action"
import handleError from "../handlers/error"
import { CreateUserSchema, GetUserSchema,   } from "../validations"
import mongoose from "mongoose"
import { CreateUserParams, GetUserParams} from "@/types/action"
import bcrypt from "bcryptjs"
import { IUserDoc } from "@/database/user.model"


export async function addUser(
params:CreateUserParams
): Promise<ActionResponse<IUserDoc>>
{
    const validationResult = await action({
        params,
        schema:CreateUserSchema,
        authorize:true
    })
    if(validationResult instanceof Error){
        return handleError(validationResult) as ErrorResponse;

    }

  const { name, surname, email, password, branchId, storeId} = validationResult.params!;

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

    const [newUser] = await User.create([{ surname, name, email, branchId, storeId}], {
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
    return { success: true, data:JSON.parse(JSON.stringify(newUser)) };
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


export async function getUsers(params:GetUserParams): Promise<
  ActionResponse<{
    users: User[];
  }>
> {
  const validationResult = await action({
    params,
    schema: GetUserSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const storeId = validationResult.params?.storeId
  const adminId = validationResult.params?.userId


  try {

const users = await User.find({
  storeId: storeId,
  _id: { $ne: adminId }, // $ne means "not equal"
}).populate("branchId", "name location");

    console.log("the users are", users)
    return {
      success: true,
      data: {
        users: JSON.parse(JSON.stringify(users)),

      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}