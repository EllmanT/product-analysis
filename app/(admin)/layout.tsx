import { AppSidebar } from '@/components/navigation/LeftSidebar';
import { SiteHeader } from '@/components/navigation/Header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import React, { ReactNode } from 'react'
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

const layout =async ({ children }: { children: ReactNode}) => {
  const session = await auth();

  if (!session) return redirect("/sign-in");

    return (
        <>
         <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
      className='bg-gray-50'
    >
      <AppSidebar variant="floating" />
      <SidebarInset className='bg-gray-50' >
        <SiteHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
        </>
      );
}

export default layout