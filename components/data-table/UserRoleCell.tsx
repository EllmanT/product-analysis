"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeRole } from "@/lib/auth/role";

type Props = {
  userId: string;
  role: string | undefined | null;
  onUpdated?: () => void;
};

export function UserRoleCell({ userId, role, onUpdated }: Props) {
  const normalized = normalizeRole(role);
  const [value, setValue] = useState<"admin" | "branch_user">(normalized);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValue(normalizeRole(role));
  }, [role]);

  async function onChange(next: "admin" | "branch_user") {
    if (next === normalizeRole(role)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.error(payload.error?.message ?? "Could not update role");
        return;
      }
      setValue(next);
      toast.success("Role updated", {
        description:
          "Ask this user to sign out and sign back in so permissions update.",
      });
      onUpdated?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => onChange(v as "admin" | "branch_user")}
    >
      <SelectTrigger className="h-8 w-[140px]" aria-label="User role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="branch_user">Branch user</SelectItem>
      </SelectContent>
    </Select>
  );
}
