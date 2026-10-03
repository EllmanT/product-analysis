import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import PosTerminal from "@/components/pos/PosTerminal";
import User from "@/database/user.model";
import { resolvePosScope } from "@/lib/auth/pos-scope";
import dbConnect from "@/lib/mongoose";
import { currentZwgRate } from "@/lib/services/posCatalog.service";
import { getPosBranch, listPosBranches } from "@/lib/services/posBranch.service";

export const metadata = { title: "Point of sale" };
export const dynamic = "force-dynamic";

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </main>
  );
}

export default async function PosPage({ searchParams }: { searchParams: Promise<{ branchId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { branchId: requested } = await searchParams;
  const scoped = await resolvePosScope(session, requested);
  if (!scoped.ok) {
    if (scoped.response.status === 401) redirect("/sign-in");
    return (
      <Notice
        title="This account can't use the till yet"
        body="Ask an administrator to assign your account to a branch."
      />
    );
  }
  const { scope } = scoped;

  // Administrators pick which branch's till to open.
  if (!scope.branchId) {
    const branches = (await listPosBranches(null)).filter((b) => b.pos.enabled);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold">Open a till</h1>
        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No branch has the point of sale enabled yet.{" "}
            <Link href="/pos-settings" className="underline underline-offset-4">
              Set one up
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {branches.map((b) => (
              <li key={b.id}>
                <Link href={`/pos?branchId=${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-accent">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-sm text-muted-foreground">{b.pos.invoicePrefix}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  const branch = await getPosBranch(scope.branchId);
  if (!branch?.pos.enabled || !branch.pos.invoicePrefix) {
    return (
      <Notice
        title="Point of sale is not enabled for this branch"
        body={
          scope.isAdmin
            ? "Turn it on and set an invoice prefix in POS settings."
            : "Ask an administrator to enable it for your branch."
        }
        action={
          scope.isAdmin ? (
            <Link href="/pos-settings" className="text-sm underline underline-offset-4">
              Open POS settings
            </Link>
          ) : undefined
        }
      />
    );
  }

  await dbConnect();
  const [user, rate] = await Promise.all([
    User.findById(scope.userId).select("name surname").lean<{ name?: string; surname?: string }>(),
    currentZwgRate(),
  ]);
  const cashierName = [user?.name, user?.surname].filter(Boolean).join(" ") || "Cashier";

  return <PosTerminal branch={branch} cashierName={cashierName} rate={rate} isAdmin={scope.isAdmin} canCredit={scope.role !== "cashier"} />;
}
