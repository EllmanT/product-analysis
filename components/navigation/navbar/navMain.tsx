"use client"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Link from "next/link"

export function NavMain({
  items=[],
}: {
items?:Items[]
}) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
       
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.url;
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.title}>
                <Link href={item.url}>
                <SidebarMenuButton
                  tooltip={item.title}
                  className={cn(
                    "duration-200 ease-linear",
                    isActive
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-white active:bg-primary/90 "
                      : "text-muted-foreground hover:text-foreground cursor-pointer"
                  )}
                >
                  {Icon && <Icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  
  )
}
