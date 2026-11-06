import { AppSidebar } from '@/components/navigation/LeftSidebar';
import { SiteHeader } from '@/components/navigation/Header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import React, { ReactNode } from 'react'
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isStaffEmailAllowed } from '@/lib/auth/staff-allowlist';
import CertExpiryBanner from '@/components/fiscal/CertExpiryBanner';
import { PAGE_PERMISSIONS } from '@/lib/auth/permissions';

const layout =async ({ children }: { children: ReactNode}) => {
  const session = await auth();

  if (!session) redirect("/sign-in");

  // The stored role decides access: admins and branch users use the staff app, cashiers only the till.
  const role = session.user?.role;
  // A cashier works at the till unless a super admin has given them other pages.
  if (role === "cashier" && !(session.user?.perms ?? []).some((k) => k !== "/pos" && PAGE_PERMISSIONS.some((p) => p.key === k))) redirect("/pos");
  if (role !== "admin" && role !== "branch_user" && !isStaffEmailAllowed(session.user?.email)) {
    redirect("/unauthorized");
  }

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
        {session.user?.role === 'admin' && <CertExpiryBanner />}
        {children}
      </SidebarInset>
    </SidebarProvider>
        </>
      );
}

export default layout