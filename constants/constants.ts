import {
    IconChartBar,
    IconDashboard,
    IconSettings,
    IconUser,
    IconPackages,
    IconBuildingStore,
    IconFileUpload,
    IconTrendingUp,
    IconAlertTriangle
  } from "@tabler/icons-react"
  
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
        title: "Management",
        url:""
      },

    {
      title: "Users",
      url: "/users",
      icon: IconPackages,
    },
    {
        title: "Branches",
        url: "/branches",
        icon: IconBuildingStore,
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
  