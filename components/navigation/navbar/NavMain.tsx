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
  items = [],
}: {
  items?: Items[]
}) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              item.url.length > 0 &&
              (pathname === item.url || pathname.startsWith(`${item.url}/`));
            const Icon = item.icon;

            if (!item.url) {
              return (
                <SidebarMenuItem key={item.title}>
                  <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.title}
                  </div>
                </SidebarMenuItem>
              );
            }

            return (
              <SidebarMenuItem key={item.title}>
                <Link href={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={cn(
                      "duration-200 ease-linear",
                      isActive
                        ? "bg-primary text-primary-foreground hover:bg-primary hover:text-white active:bg-primary/90 "
                        : "cursor-pointer text-muted-foreground hover:text-foreground"
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
