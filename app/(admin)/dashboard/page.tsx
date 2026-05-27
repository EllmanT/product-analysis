import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Upload } from "lucide-react"
import { getUser } from "@/lib/actions/user.action"
import { getDashboardStats, getDashboardBranches } from "@/lib/actions/analytics.action"
import { normalizeRole } from "@/lib/auth/role"
import { SectionCards } from "@/components/statistics/StatisticsSection"
import { DashboardClient } from "@/components/dashboard/DashboardClient"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import ROUTES from "@/constants/route"

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) redirect(ROUTES.SIGN_IN)

  const { success, data } = await getUser({ userId: session.user.id })
  if (!success || !data?.user?.storeId) redirect(ROUTES.SIGN_IN)

  const user = data.user
  const role = normalizeRole(user.role)
  const storeId = String(user.storeId)

  // Fetch stats and branches in parallel — no HTTP round-trips
  const [stats, branches] = await Promise.all([
    getDashboardStats(user),
    getDashboardBranches(user),
  ])

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 justify-between py-2">
        <div className="flex items-center gap-2 mt-2">
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">Dashboard</h1>
        </div>
        <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
          <Link href="/uploads/upload">
            <Upload className="size-4" />
            Upload Products
          </Link>
        </Button>
      </div>

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

          {/* Stats — server-rendered, visible immediately */}
          <SectionCards stats={stats} />

          {/* CTA banner */}
          {role === "branch_user" && (
            <div className="mx-4 lg:mx-6">
              <Link
                href="/uploads/upload"
                className="flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 transition-colors hover:border-blue-200 hover:from-blue-100 hover:to-indigo-100"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                    <Upload className="size-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Upload today&apos;s stock file</p>
                    <p className="text-xs text-gray-500">Keep your branch inventory up to date</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white">
                  Go to Upload
                </span>
              </Link>
            </div>
          )}

          {/* Interactive chart — client component, fires its own fetch */}
          <DashboardClient storeId={storeId} branches={branches} />
        </div>
      </div>
    </div>
  )
}
