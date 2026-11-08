"use client";

import { useState } from "react";

import AddBranchWizard from "@/components/branches/AddBranchWizard";
import BranchesTable from "@/components/branches/BranchesTable";

export default function Page() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="w-full space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Each branch has its own receipt code, address and contact details, so you can tell where a receipt was issued. Tills, devices and selling settings are under Tills and POS settings.
          </p>
        </div>
        <AddBranchWizard onCreated={() => setReloadKey((k) => k + 1)} />
      </div>
      <BranchesTable reloadKey={reloadKey} />
    </div>
  );
}
