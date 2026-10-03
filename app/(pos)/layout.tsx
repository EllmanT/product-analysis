import type { ReactNode } from "react";

import PosServiceWorker from "@/components/pos/PosServiceWorker";

/** The till is a full-screen workspace: no sidebar, no header, nothing between the cashier and the sale. */
export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <PosServiceWorker />
      {children}
    </div>
  );
}
