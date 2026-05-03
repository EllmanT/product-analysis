import Link from "next/link";

import { StaffAccessDeniedSignOut } from "@/components/auth/StaffAccessDeniedSignOut";

export default function StaffUnauthorizedPage() {
  return (
    <div className="mt-8 space-y-4 text-center">
      <h2 className="h2-bold text-dark100_light900">Access restricted</h2>
      <p className="paragraph-regular text-dark500_light400">
        This area is for authorized staff only. If you should have access, ask an
        administrator to add your email to the team list.
      </p>
      <p className="paragraph-regular text-dark500_light400">
        <Link
          href="/"
          className="paragraph-semibold primary-text-gradient underline underline-offset-4"
        >
          Return to the shop
        </Link>
      </p>
      <StaffAccessDeniedSignOut />
    </div>
  );
}
