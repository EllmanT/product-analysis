import { auth } from "@/auth";
import { requirePermission } from "@/lib/auth/role";
import { getUser, getUsers } from "@/lib/actions/user.action";
import { managerBranchId } from "@/lib/auth/delegated-users";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const denied = requirePermission(session, "/users");
  if (denied) return denied;

  const userId = session!.user.id;

console.log("her now 23")

  const { success, data } = await getUser({ userId });
  if (!success || !data?.user.storeId) {
    // return res.status(404).json({ message: "User or store not found" });
       return NextResponse.json({success:false,},{status:404})

  }
console.log("her now 24")

  const { data: newData } = await getUsers({
    userId,
    storeId: String(data.user.storeId),
  });
console.log("her now 25")
console.log("data", data)
console.log("new Data", newData)


//   return res.status(200).json({ branches: newData?.branches ?? [] });
   const mine = await managerBranchId(session);
   if (mine === "none") return NextResponse.json({ success: false }, { status: 403 });
   if (mine && newData) {
     // Someone who was granted Users without being an admin sees only their own branch's staff, never administrators.
     const users = (newData.users as unknown as { role?: string; branchId?: { _id?: string } | string | null }[]).filter(
       (u) => u.role !== "admin" && String(typeof u.branchId === "object" && u.branchId ? u.branchId._id : (u.branchId ?? "")) === mine
     );
     return NextResponse.json({ success: true, data: { ...newData, users } }, { status: 200 });
   }
   return NextResponse.json({success:true,data:newData},{status:200})
}
