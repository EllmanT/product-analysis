import { auth } from "@/auth";
import FileUpload from "@/components/FileUpload";
import ROUTES from "@/constants/route";
import { getUser } from "@/lib/actions/user.action";
import { normalizeRole } from "@/lib/auth/role";
import { redirect } from "next/navigation";
import React from "react";

const page = async () => {
  const session = await auth();
  const sessionData = session?.user;
  if (!sessionData?.id) redirect(ROUTES.SIGN_IN);

  const result = await getUser({ userId: sessionData.id });
  if (!result.success || !result.data?.user) redirect(ROUTES.SIGN_IN);

  const user = result.data.user;
  const storeId = user.storeId ? String(user.storeId) : null;
  if (!storeId) {
    redirect(`${ROUTES.HOME}?error=no-store`);
  }

  const role = normalizeRole(user.role);
  if (role === "branch_user") {
    if (!user.branchId) {
      redirect(`${ROUTES.HOME}?error=no-branch`);
    }
    return (
      <div>
        <FileUpload
          userId={sessionData.id}
          storeId={storeId}
          branchId={String(user.branchId)}
        />
      </div>
    );
  }

  const optionalBranchId = user.branchId ? String(user.branchId) : undefined;
  return (
    <div>
      <FileUpload
        userId={sessionData.id}
        storeId={storeId}
        branchId={optionalBranchId}
        allowBranchPicker
      />
    </div>
  );
};

export default page;
