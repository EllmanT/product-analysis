"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import ProjectName from "@/components/data-table/Name";
import ProjectStatus from "@/components/data-table/ProjectStatus";
import { ProjectActions } from "@/components/data-table/ProjectActions";
import Name from "@/components/data-table/Name";




export const columnAllUsers: ColumnDef<User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="border-border bg-white shadow-lg border data-[state=checked]:border-0"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="border-border bg-white shadow-lg border data-[state=checked]:border-0"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },

  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column} title="Name" />
    ),
    cell: ({ row }) => <Name name={row.getValue("name")} />,
    enableSorting: true,
  },
    {
    accessorKey: "email",
    header: ({ column }) => (
      <SortableHeader column={column} title="email" />
    ),
    cell: ({ row }) => <Name name={row.getValue("email")} />,
    enableSorting: true,
  },

{
  accessorKey: "branchId",
  header: ({ column }) => (
    <SortableHeader column={column} title="Branch" />
  ),
  cell: ({ row }) => {
    const branch = row.getValue("branchId") as { name: string; location: string };
    return <Name name={branch?.location} />;
  },
  enableSorting: true,
},


   { 
    accessorKey: "actions",
    header: "Action",
    cell: ({ row }) => <ProjectActions row={row} />,
  },

 

];
