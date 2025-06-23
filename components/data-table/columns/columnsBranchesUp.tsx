"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { ProjectActions } from "@/components/data-table/ProjectActions";
import Name from "@/components/data-table/Name";




export const columnAllUploadReports: ColumnDef<[]>[] = [
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
    accessorKey: "date",
    header: ({ column }) => (
      <SortableHeader column={column} title="date" />
    ),
    cell: ({ row }) => <Name name={row.getValue("date")} />,
    enableSorting: true,
  },

  {
    accessorKey: "branch",
    header: ({ column }) => (
      <SortableHeader column={column} title="Branch" />
    ),
    cell: ({ row }) => <Name name={row.getValue("branch")} />,
    enableSorting: true,
  },

    {
    accessorKey: "revenue",
    header: ({ column }) => (
      <SortableHeader column={column} title="est Revenue" />
    ),
    cell: ({ row }) => <Name name={row.getValue("revenue")} />,
    enableSorting: true,
  },

      {
    accessorKey: "units",
    header: ({ column }) => (
      <SortableHeader column={column} title="Total Units" />
    ),
    cell: ({ row }) => <Name name={row.getValue("units")} />,
    enableSorting: true,
  },

      {
    accessorKey: "sales",
    header: ({ column }) => (
      <SortableHeader column={column} title="est Sales" />
    ),
    cell: ({ row }) => <Name name={row.getValue("sales")} />,
    enableSorting: true,
  },

      


];
