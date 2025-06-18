"use server"

import { Branch } from "@/database"
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

    const {branch_name, location} = validationResult.params!
    const session = await mongoose.startSession()

    try {

        const existingBranch = await Branch.findOne({branch_name:branch_name})

        if(existingBranch) throw new Error("Branch already exists")

            const [newBranch]= await Branch.create([{
                branch_name:branch_name,
                location:location
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