import {
    IconChartBar,
    IconDashboard,
    IconSettings,
    IconUser,
    IconPackages,
    IconBuildingStore,
    IconFileUpload,
    IconTrendingUp,
    IconAlertTriangle,
    IconCurrencyDollar
  } from "@tabler/icons-react"
import { Calendar, FileText, Package, Receipt } from "lucide-react"

export const mainSidebarLinks = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
      {
        title: "Uploads",
        url:""
      },

    {
      title: "View All",
      url: "/uploads",
      icon: IconPackages,
    },
    
    {
      title: "Upload",
      url: "/uploads/upload",
      icon: IconFileUpload,
    },
   
    {
        title: "Insights",
        url:""
      },
    {
      title: "Branch Analytics",
      url: "/branch-analytics",
      icon: IconChartBar,
    },
    {
      title: "Product Movement",
      url: "/product-movement",
      icon: IconAlertTriangle,
    },
    {
      title: "Products",
      url: "/products",
      icon: Package,
    },
    {
      title: "Branch Upload Reports",
      url: "/branch-up-reports",
      icon: IconTrendingUp,
    },
   
      {
        title: "Downloads",
        url:""
      },

    {
      title: "Download Centre",
      url: "/download-centre",
      icon: IconPackages,
    },
    // {
    //     title: "Archived Reports",
    //     url: "/archived-reports",
    //     icon: IconBuildingStore,
    //   },
  
    {
      title: "Sales",
      url: "",
    },
    {
      title: "Quotations",
      url: "/admin/quotations",
      icon: FileText,
      adminOnly: true,
    },
    {
      title: "Invoices",
      url: "/admin/invoices",
      icon: Receipt,
      adminOnly: true,
    },
    {
      title: "Fiscal Day",
      url: "/fiscal-day",
      icon: Calendar,
      adminOnly: true,
    },
    {
      title: "Fiscal settings",
      url: "/fiscal-settings",
      icon: IconSettings,
      adminOnly: true,
    },
    {
      title: "Z-reports",
      url: "/z-reports",
      icon: FileText,
      adminOnly: true,
    },

    {
      title: "Payments",
      url: "",
    },
    {
      title: "Exchange Rates",
      url: "/exchange-rates",
      icon: IconCurrencyDollar,
      adminOnly: true,
    },

    {
      title: "Team",
      url: "",
    },
    {
      title: "Users",
      url: "/users",
      icon: IconUser,
      adminOnly: true,
    },
    {
      title: "Branches",
      url: "/branches",
      icon: IconBuildingStore,
      adminOnly: true,
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

  export const GlobalSearchFilters = [
  { name: "Product", value: "product" },
  { name: "Code", value: "code" },

];

  