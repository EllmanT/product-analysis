type NavLink = {
    title: string;
    url: string;
    icon: JSX.Element;
  };
  type Items= {
      title: string
      url: string
      icon?: Icon
    }
    type StatisticsCard= {
      label: string
       value: string
      trend?: string
      description?:string
      icon?:React.ElementType
      period?:string
    }