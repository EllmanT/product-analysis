"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import ProjectName from "@/components/data-table/Name";
import ProjectStatus from "@/components/data-table/ProjectStatus";
import { ProjectActions } from "@/components/data-table/ProjectActions";
import Name from "@/components/data-table/Name";




export const columnAllBranches: ColumnDef<Branch>[] = [
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
    accessorKey: "location",
    header: ({ column }) => (
      <SortableHeader column={column} title="location" />
    ),
    cell: ({ row }) => <Name name={row.getValue("location")} />,
    enableSorting: true,
  },



   { 
    accessorKey: "actions",
    header: "Action",
    cell: ({ row }) => <ProjectActions row={row} />,
  },

 

];
