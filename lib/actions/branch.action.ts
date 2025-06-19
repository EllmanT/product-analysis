"use server"

import { Branch, Store } from "@/database"
import action from "../handlers/action"
import handleError from "../handlers/error"
import { AddBranchSchema, GetBranchesByStoreSchema } from "../validations"
import mongoose from "mongoose"
import { CreateBranchParams, GetBranchesByStoreParams } from "@/types/action"
import { IBranchDoc } from "@/database/branch.model"

export async function addBranch(
params:CreateBranchParams
): Promise<ActionResponse<IBranchDoc>>
{
    const validationResult = await action({
        params,
        schema:AddBranchSchema,
        authorize:true
    })
    if(validationResult instanceof Error){
        return handleError(validationResult) as ErrorResponse;

    }

    const {name, location} = validationResult.params!

    const userId = validationResult?.session?.user?.id;

    const [store] = await Store.find({userId})

    if(!store) throw new Error("No access to create branch");

    const session = await mongoose.startSession()
  session.startTransaction();

    try {

        const existingBranch = await Branch.findOne({name, location})

        if(existingBranch) return {success:false , status:500}

            const [newBranch]= await Branch.create([{
                name:name,
                location:location,
                storeId:store._id,
            }],{session})
      await session.commitTransaction()  
      return {success:true,
        data:JSON.parse(JSON.stringify(newBranch))
      }
    } catch (error) {
        return handleError(error) as ErrorResponse;
    }finally{
        await session.endSession();
    }
}

export async function getBranchesByStore(
  params: GetBranchesByStoreParams
): Promise<ActionResponse<{ branches: Branch[] }>> {
  const validationResult = await action({
    params,
    schema: GetBranchesByStoreSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { storeId } = validationResult.params!;

  try {
    const branches = await Branch.find({ storeId })
    .populate("storeId", "name")
    .lean()
    ;

    if (!branches || branches.length === 0) {
      throw new Error("Branches not found");
    }

    console.log("branches before", branches)
    return {
      success: true,
      data: {
        branches: JSON.parse(JSON.stringify(branches)), // serializes deeply
      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
