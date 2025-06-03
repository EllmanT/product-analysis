"use client"

import * as React from "react"

import { NavMain } from "@/components/navigation/navbar/NavMain"
import { NavSecondary } from "@/components/navigation/navbar/NavSecondary"
import { NavUser } from "@/components/navigation/navbar/NavUser"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { IconInnerShadowTop } from "@tabler/icons-react"
import { mainSidebarLinks, secondarySidebarLinks } from "@/constants/constants"
import { auth } from "@/auth"


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // const session = await auth();
  // const user = session?.user
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="#">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">StockFlow.</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainSidebarLinks} />
        <NavSecondary items={secondarySidebarLinks} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        {/* <NavUser user={user||undefined} /> */}
      </SidebarFooter>
    </Sidebar>
  )
}
