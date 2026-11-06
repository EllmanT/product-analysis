"use client"

import { useEffect, useState } from "react";

import AddBranchWizard from "@/components/branches/AddBranchWizard";
import { columnAllBranches } from "@/components/data-table/columns/columnAllBranches";
import { DataTable } from "@/components/data-table/index";
import { Separator } from "@/components/ui/separator";

export default function Page() {
  const [branches, setBranches] = useState<Branch[]>([]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");
        const { data } = await res.json();
        if (!ignore) setBranches(data.branches);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
        <div className="flex items-center gap-2 mt-2">
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <h1 className="text-base font-medium">Branches</h1>
        </div>
      </div>

      <section className="ml-6 mr-6 mt-5 flex items-center justify-between gap-4 rounded-md bg-white p-4 max-sm:flex-col sm:items-center">
        <p className="text-sm text-muted-foreground">Each branch has its own tills, receipts and staff. Adding one takes about a minute.</p>
        <AddBranchWizard onCreated={() => setReloadKey((k) => k + 1)} />
      </section>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
              <DataTable data={branches} columns={columnAllBranches} isVisible={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
