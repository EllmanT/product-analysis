"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { Project } from "../../../app/data";
import ProjectName from "@/components/data-table/Name";
import ProjectStatus from "@/components/data-table/ProjectStatus";
import ProjectResources from "@/components/data-table/ProjectResources";
import { ProjectActions } from "@/components/data-table/ProjectActions";
import ProjectLastUpdate from "../ProjectLastUpdate";

// function formatCurrency(amount: number) {
//   if (amount >= 1000) {
//     return `US$ ${(amount / 1000).toFixed(1)}k`;
//   }
//   return `US$ ${amount}`;
// }

export const columnsUploadDetails: ColumnDef<Project>[] = [
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
    accessorKey: "id",
    header: ({ column }) => (
      <SortableHeader column={column} title="#" className="w-[50px]" />
    ),
    cell: ({ row }) => <div className="w-[50px]">{row.getValue("id")}</div>,
    enableSorting: true,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column} title="Product Name" />
    ),
    cell: ({ row }) => <ProjectName name={row.getValue("name")} />,
    enableSorting: true,
  },
     {
    accessorKey: "id",
    header: ({ column }) => (
      <SortableHeader column={column} title="Price" />
    ),
    enableSorting: true,
  },

  {
    accessorKey: "id",
    header: ({ column }) => (
      <SortableHeader column={column} title="Qty Left" />
    ),
    enableSorting: true,
  },

   {
    accessorKey: "id",
    header: ({ column }) => (
      <SortableHeader column={column} title="Total Value" />
    ),
    enableSorting: true,
  },
  
  {
    accessorKey: "status",
    header: "Stock Level",
    cell: ({ row }) => <ProjectStatus status={row.getValue("status")} />,
  },

 

 

];
