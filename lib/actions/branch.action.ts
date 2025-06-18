"use server"

import { Branch, Store } from "@/database"
import action from "../handlers/action"
import handleError from "../handlers/error"
import { AddBranchSchema } from "../validations"
import mongoose from "mongoose"
import { CreateBranchParams } from "@/types/action"
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