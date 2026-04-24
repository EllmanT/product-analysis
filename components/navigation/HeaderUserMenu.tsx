"use client"

import { IconChevronDown, IconLogout } from "@tabler/icons-react"
import { signOut } from "next-auth/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type HeaderUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function HeaderUserMenu({ user }: { user?: HeaderUser | null }) {
  const displayName = user?.name?.trim() || user?.email?.trim() || "Account"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden max-w-[200px] shrink-0 gap-1 sm:flex"
          aria-label="Account menu"
        >
          <span className="truncate">{displayName}</span>
          <IconChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {user?.email ? (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
          onSelect={(e) => {
            e.preventDefault()
            void signOut({ callbackUrl: "/sign-in" })
          }}
        >
          <IconLogout className="size-4" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
