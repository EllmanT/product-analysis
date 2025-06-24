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
       value?: string
      trend?: string
      description?:string
      icon?:React.ElementType
      period?:string
      bgColor?:string
    }

    type ActionResponse<T = null> = {
      success: boolean;
      data?: T;
      error?: {
        message: string;
        details?: Record<string, string[]>;
      };
      status?: number;
    };

type ErrorResponse = ActionResponse<undefined> & { success: false };
type SuccessResponse<T = null> = ActionResponse<T> & {sucess:true};

type APIErrorResponse = NextResponse<ErrorResponse>;
type APIResponse<T = null> = NextResponse<SuccessResponse<T> | ErrorResponse>;


interface Upload{
  _id:string;
  uploaded_by:Uploader;
  upload_date:Date;
  week:number;
  month:string;
  year:number;
  file_name:string;
  products:Product[];
}


interface Product{
  _id:string;
  name:string;
  standardCode:string;
  aliases?:string;
}

interface Branch{
  _id:string;
  name:string;
  storeId:string;
  location:string;
}

interface Uploader{
  _id:string;
  name:string;
}

interface User {
  _id: string;
  name: string;
  surname: string;
  email: string;
  image?:string;
  storeId?:string;
  branchId?:string;
}


interface GlobalSearchedItem {
  id: string;
  type: "product" | "code" ;
  title: string;
  code:string;
}