import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { IconNotification, IconUpload } from "@tabler/icons-react"

export async function SiteHeader() {
  const session = await auth();
  console.log(session)
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] bg-white rounded-md ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        
        <h1 className="text-base font-extralight">
          {/* 📅 {" "}
  {new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })} */}
  VistionTech Enterprises

        </h1>
        <div className="ml-auto flex items-center gap-2">
          <a href="">
          <IconNotification/>
          </a>
          <Button variant="outline" asChild size="sm" className="hidden sm:flex">
            <a
              href="/uploads/upload"
              rel="noopener noreferrer"
              className="dark:text-foreground"
            >
              <IconUpload/>
              Upload File
            </a>
          </Button>
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href=""
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              {session &&
              session?.user?.name
              }
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
