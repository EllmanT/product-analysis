"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function StaffAccessDeniedSignOut() {
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-4 w-full"
      onClick={() => void signOut({ callbackUrl: "/" })}
    >
      Sign out
    </Button>
  );
}
