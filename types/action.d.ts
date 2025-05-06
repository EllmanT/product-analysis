interface AuthCredentials {
    name: string;
    surname: string;
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
  