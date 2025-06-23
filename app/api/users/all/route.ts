// pages/api/branches.ts
import { auth } from "@/auth";
import { getBranchesByStore } from "@/lib/actions/branch.action";
import { getUser, getUsers } from "@/lib/actions/user.action";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
console.log("her now 22")
  if (!session?.user?.id) {
    // return res.status(401).json({ message: "Unauthorized" });
   return NextResponse.json({success:false,},{status:404})

  }
console.log("her now 23")

  const { success, data } = await getUser({ userId: session.user.id });
  if (!success || !data?.user.storeId) {
    // return res.status(404).json({ message: "User or store not found" });
       return NextResponse.json({success:false,},{status:404})

  }
console.log("her now 24")

  const { data: newData } = await getUsers({ userId:data.user._id,storeId: data.user.storeId });
console.log("her now 25")
console.log("data", data)
console.log("new Data", newData)


//   return res.status(200).json({ branches: newData?.branches ?? [] });
   return NextResponse.json({success:true,data:newData},{status:200})
}
