"use client"

// import data from "./data.json";
import { projects} from "@/app/data";
import { DataTable } from "@/components/data-table/index";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { columnAllUsers } from "@/components/data-table/columns/columnAllUsers";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { signUpWithCredentials } from "@/lib/actions/auth.action";
import {  SignUpSchema } from "@/lib/validations";
import AuthForm from "@/components/forms/AuthForm";
import { useEffect, useState } from "react";

export default  function Page() {
const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId]= useState("");
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        console.log("here")
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to fetch branches");

        const {data} = await res.json();

        console.log("data", data)
        console.log("data branches", data.branches)
        setBranches(data.branches);
        setStoreId(data.branches[0].storeId._id)
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

        const fetchUsers = async () => {
      try {
        console.log("here")
        const res = await fetch("/api/users/all");
        if (!res.ok) throw new Error("Failed to fetch users");

        const {data} = await res.json();

        console.log("data", data)
        console.log("data branches", data.users)
        setUsers(data.users);
        
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
    fetchUsers();
  }, []);

          console.log("branches",branches)
          console.log("users",users)

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

       
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
          <div className="flex-col">

          </div>
         
           <div className="px-4 lg:px-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-12">
      <DataTable data={projects} columns={columnAllUsers} isVisible={false} />

              </div>
            </div>
       
        </div>
      </div>
    </div>
  );
}
