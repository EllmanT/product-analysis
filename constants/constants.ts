import {
    IconChartBar,
    IconDashboard,
    IconSettings,
    IconUser,
    IconPackages,
    IconBuildingStore,
    IconFileUpload,
    IconFileExport,
    IconTrendingUp,
    IconTrendingDown,
    IconAlertTriangle
  } from "@tabler/icons-react"
  
  export const mainSidebarLinks = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
        title: "Insights",
        url:""
      },
    {
      title: "Inventory Analytics",
      url: "/insights",
      icon: IconChartBar,
    },
    {
      title: "Re-order Needed",
      url: "/reorder-needed",
      icon: IconAlertTriangle,
    },
    {
      title: "Fast Moving",
      url: "/fast-moving",
      icon: IconTrendingUp,
    },
    {
      title: "Slow Moving",
      url: "/slow-moving",
      icon: IconTrendingDown,
    },
    {
        title: "Inventory Management",
        url:""
      },

    {
      title: "Products",
      url: "/products",
      icon: IconPackages,
    },
    {
        title: "Stores",
        url: "/stores",
        icon: IconBuildingStore,
      },
    {
      title: "Uploads",
      url: "/uploads",
      icon: IconFileUpload,
    },
    {
      title: "Exports",
      url: "/exports",
      icon: IconFileExport,
    },
    
  ]
  
  export const secondarySidebarLinks = [
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
    },
    {
      title: "Account",
      // url: "/account",
      icon: IconUser,
    },
  ]
  
  export const user = {
    name: "Tapiwa Muranda",
    email: "Manager",
    avatar: "/avatars/shadcn.jpg",
  }
  