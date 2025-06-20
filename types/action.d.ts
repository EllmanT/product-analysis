interface AuthCredentials {
  name: string;
  surname: string;
  store?:string;
  branchId?:string;
  storeId?:string;
  email: string;
  password: string;
}
  interface SignInWithOAuthParams {
    provider: "github" | "google";
    providerAccountId: string;
    user: {
      name: string;
      email: string;
      image?: string;
    };
  }

export interface UploadProductsParams {
  file: File;
}

interface CreateBranchParams{
  name:string;
  location:string
}
  interface GetBranchesByStoreParams {
  storeId: string;
}

interface CreateUserParams{
  name:string;
  surname:string;
  password?:string;
  email:string;
  image?:string;
  storeId?:string;
  branchId?:string;
  
}
interface GetUserParams {
  userId: string;
}