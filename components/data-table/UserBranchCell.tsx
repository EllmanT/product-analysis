"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

type Props = {
  userId: string;
  branchId: string | null;
  branches: Branch[];
  onUpdated?: () => void;
};

/** Shows a user's branch by NAME and lets an administrator move them to another branch. */
export function UserBranchCell({ userId, branchId, branches, onUpdated }: Props) {
  // What the admin just picked, remembered only until the saved branch changes under it (after a reload).
  const [picked, setPicked] = useState<{ from: string | null; value: string } | null>(null);
  const [pending, setPending] = useState(false);
  const value = picked && picked.from === branchId ? picked.value : (branchId ?? NONE);

  async function onChange(next: string) {
    if (next === value) return;
    setPending(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: next === NONE ? null : next }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(payload.error?.message ?? "Could not change the branch");
        return;
      }
      setPicked({ from: branchId, value: next });
      toast.success("Branch updated", { description: "Ask this user to sign out and back in." });
      onUpdated?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={value} disabled={pending} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[170px]" aria-label="User branch">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No branch</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b._id} value={b._id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
