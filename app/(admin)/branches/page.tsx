"use client"

// import data from "./data.json";
import { projects} from "@/app/data";
import { DataTable } from "@/components/data-table/index";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { columnAllUsers } from "@/components/data-table/columns/columnAllUsers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AutoComplete } from "@/components/Autocomplete";
import GenericForm from "@/components/forms/GenericForm";
import { AddBranchSchema } from "@/lib/validations";
import { addBranch } from "@/lib/actions/branch.action";
import { Dialog, DialogClose, DialogContent, DialogFooter,DialogTrigger } from "@/components/ui/dialog";

export default function Page() {
      const queryClient = new QueryClient()
    const [searchValue, setSearchValue] = useState<string>("");
  const [selectedValue, setSelectedValue] = useState<string>("");


  return (
    <div className="flex flex-1 flex-col">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between">
  <div className="flex items-center gap-2 mt-2">
    <Separator
      orientation="vertical"
      className="mx-2 data-[orientation=vertical]:h-4"
    />
    <h1 className="text-base font-medium">Branches</h1>
  </div>
  </div>
<section className="ml-6 mr-6 mt-5 flex justify-between gap-4 max-sm:flex-col sm:items-center bg-white rounded-md p-4">
  {/* Left side: AutoComplete */}
  <div className="w-[200px]">
    <QueryClientProvider client={queryClient}>
      <AutoComplete
        selectedValue={selectedValue}
        onSelectedValueChange={setSelectedValue}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        items={[]}
        isLoading={false}
        emptyMessage="No pokemon found."
      />
    </QueryClientProvider>
   
  </div>
   <div>
     
    </div>

    <Dialog>
      <form>
        <DialogTrigger asChild>
          <Button variant="outline">Add Branch</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
        <GenericForm
      title="Add New Branch"
      schema={AddBranchSchema}
      defaultValues={{name: "", location: ""}}
      onSubmit={addBranch}
      submitText="Create Branch"
    />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="w-full bg-amber-600 hover:cursor-pointer">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>



</section>
    
   
          
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {/* Statistics cards section */}
         
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
