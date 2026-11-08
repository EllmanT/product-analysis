"use client"

import * as React from "react"

import { NavMain } from "@/components/navigation/navbar/NavMain"
import { NavSecondary } from "@/components/navigation/navbar/NavSecondary"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import Link from "next/link"
import Logo from "@/components/brand/Logo"
import { IconLock } from "@tabler/icons-react"
import { mainSidebarLinks, secondarySidebarLinks } from "@/constants/constants"
import { pruneEmptySections } from "@/lib/auth/menu-access"
import { pageKeyForPath } from "@/lib/auth/permissions"
import { normalizeRole } from "@/lib/auth/role"
import { useSession } from "next-auth/react"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();
  const [access, setAccess] = React.useState<{ allowed: string[] | null; isSuperAdmin: boolean } | null>(null);
  const userId = session?.user?.id;

  React.useEffect(() => {
    if (!userId) return;
    let ignore = false;
    (async () => {
      try {
        const r = await fetch("/api/menu-access", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!ignore && j?.success) setAccess(j.data);
      } catch {
        // Keep the default menu; the server still enforces who may open what.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [userId]);

  const mainItems = React.useMemo(() => {
    const role = normalizeRole(session?.user?.role);
    let items: Items[] = (mainSidebarLinks as Items[]).filter((item) => !item.hidden);
    if (role !== "admin") {
      // Wait for the rules so a page that is not theirs never flashes up first.
      if (!access?.allowed) return [];
      const allowed = new Set(access.allowed);
      items = items.filter((item) => !item.url || allowed.has(pageKeyForPath(item.url) ?? item.url));
    }
    if (access?.isSuperAdmin) {
      items = [...items, { title: "Menu access", url: "/access", icon: IconLock }];
    }
    return pruneEmptySections(items);
  }, [session?.user?.role, access]);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/dashboard" aria-label="StockFlow dashboard">
                <Logo />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainItems} />
        <NavSecondary items={secondarySidebarLinks} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        {/* <NavUser user={user||undefined} /> */}
      </SidebarFooter>
    </Sidebar>
  )
}
