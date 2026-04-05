"use client"

import { DataTable } from "@/components/data-table/index";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buildColumnAllUsers } from "@/components/data-table/columns/columnAllUsers";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { signUpWithCredentials } from "@/lib/actions/auth.action";
import {  SignUpSchema } from "@/lib/validations";
import AuthForm from "@/components/forms/AuthForm";
import { useCallback, useEffect, useMemo, useState } from "react";

export default  function Page() {
const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId]= useState("");
  const [users, setUsers] = useState<User[]>([])

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users/all");
      if (!res.ok) throw new Error("Failed to fetch users");
      const { data } = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches");
      if (!res.ok) throw new Error("Failed to fetch branches");
      const { data } = await res.json();
      setBranches(data.branches ?? []);
      const first = data.branches?.[0] as
        | { storeId?: { _id?: string } }
        | undefined;
      if (first?.storeId?._id) {
        setStoreId(String(first.storeId._id));
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadBranches(), loadUsers()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBranches, loadUsers]);

  const userColumns = useMemo(
    () => buildColumnAllUsers({ onRoleUpdated: loadUsers }),
    [loadUsers]
  );

  if (loading) return <div>Loading branches...</div>;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
  <div className="flex items-center gap-2 mt-2">
    <Separator
      orientation="vertical"
      className="mx-2 data-[orientation=vertical]:h-4"
    />
    <h1 className="text-base font-medium">Users</h1>
  </div>
  </div>
<section className="ml-6 mr-6 mt-5 flex justify-between gap-4 max-sm:flex-col sm:items-center bg-white rounded-md p-4">
  {/* Left side: AutoComplete */}


  
    <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Add User</Button>
        </DialogTrigger>
        <DialogTitle></DialogTitle>
        <DialogContent className="sm:max-w-[425px]">      

     <AuthForm
      formType="SIGN_UP"
      schema={SignUpSchema}
      defaultValues={{ email: "", password: "", name: "", surname: "", branchId:"", storeId:storeId }}
      onSubmit={signUpWithCredentials}
      menuItems={branches}

    />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="w-full bg-amber-600 hover:cursor-pointer">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
    </Dialog>

</section>

      <p className="mx-6 mt-3 text-sm text-muted-foreground">
        Changing a user&apos;s role applies after they sign out and sign back in.
      </p>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">

          </div>
         
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
      <DataTable data={users} columns={userColumns} isVisible={false} />

              </div>
            </div>
       
        </div>
      </div>
    </div>
  );
}
