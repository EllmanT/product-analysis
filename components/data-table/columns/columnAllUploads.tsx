"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import Name from "@/components/data-table/Name";




export const columnAllUploads: ColumnDef<[]>[] = [
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
    accessorKey: "uploadDate",
    header: ({ column }) => (
      <SortableHeader column={column} title="date" />
    ),
    cell: ({ row }) => <Name name={row.getValue("uploadDate")} />,
    enableSorting: true,
  },

  {
    accessorKey: "branchLocation",
    header: ({ column }) => (
      <SortableHeader column={column} title="Branch" />
    ),
    cell: ({ row }) => <Name name={row.getValue("branchLocation")} />,
    enableSorting: true,
  },

    {
    accessorKey: "estValue",
    header: ({ column }) => (
      <SortableHeader column={column} title="Est Value" />
    ),
    cell: ({ row }) => <Name name={row.getValue("estValue")} />,
    enableSorting: true,
  },

      {
    accessorKey: "totalProducts",
    header: ({ column }) => (
      <SortableHeader column={column} title="Total Products" />
    ),
    cell: ({ row }) => <Name name={row.getValue("totalProducts")} />,
    enableSorting: true,
  },


      


];
