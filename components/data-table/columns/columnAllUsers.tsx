"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { Project } from "../../../app/data";
import ProjectName from "@/components/data-table/ProjectName";
import ProjectStatus from "@/components/data-table/ProjectStatus";
import { ProjectActions } from "@/components/data-table/ProjectActions";




export const columnAllUsers: ColumnDef<Project>[] = [
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
    cell: ({ row }) => <ProjectName name={row.getValue("name")} />,
    enableSorting: true,
  },
    {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column} title="email" />
    ),
    cell: ({ row }) => <ProjectName name={row.getValue("name")} />,
    enableSorting: true,
  },


  
  {
    accessorKey: "status",
    header: "Role",
    cell: ({ row }) => <ProjectStatus status={row.getValue("status")} />,
  },
      {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column} title="Branch" />
    ),
    cell: ({ row }) => <ProjectName name={row.getValue("name")} />,
    enableSorting: true,
  },

   { 
    accessorKey: "actions",
    header: "Action",
    cell: ({ row }) => <ProjectActions row={row} />,
  },

 

];
