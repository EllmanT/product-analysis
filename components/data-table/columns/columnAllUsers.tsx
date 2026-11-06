"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { ProjectActions } from "@/components/data-table/ProjectActions";
import Name from "@/components/data-table/Name";
import { UserRoleCell } from "@/components/data-table/UserRoleCell";
import { UserBranchCell } from "@/components/data-table/UserBranchCell";

export function buildColumnAllUsers(options?: {
  onRoleUpdated?: () => void;
  branches?: Branch[];
}): ColumnDef<User>[] {
  const onRoleUpdated = options?.onRoleUpdated;
  const branches = options?.branches ?? [];

  return [
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
      accessorKey: "role",
      header: ({ column }) => (
        <SortableHeader column={column} title="Role" />
      ),
      cell: ({ row }) => {
        const u = row.original;
        const id = u._id;
        if (!id) return null;
        return (
          <UserRoleCell
            userId={id}
            role={u.role}
            onUpdated={onRoleUpdated}
          />
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "branchId",
      header: ({ column }) => (
        <SortableHeader column={column} title="Branch" />
      ),
      cell: ({ row }) => {
        const u = row.original;
        const current = row.getValue("branchId") as { _id?: string; name: string; location: string } | null | undefined;
        if (!u._id) return null;
        return (
          <UserBranchCell
            userId={u._id}
            branchId={current?._id ? String(current._id) : null}
            branches={branches}
            onUpdated={onRoleUpdated}
          />
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "actions",
      header: "Action",
      cell: ({ row }) => <ProjectActions row={row} />,
    },
  ];
}

/** Default columns without role-change refresh callback (e.g. legacy imports). */
export const columnAllUsers: ColumnDef<User>[] = buildColumnAllUsers();
