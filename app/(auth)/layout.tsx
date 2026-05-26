import Image from "next/image";
import React, { ReactNode } from "react";

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-light bg-cover bg-center bg-no-repeat px-4 py-10 dark:bg-auth-dark">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Image
            src={"images/site-logo.svg"}
            alt="StockFlow Logo"
            height={36}
            width={36}
            className="object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-dark100_light900">
            StockFlow
          </span>
        </div>
        <section className="light-border background-light800_dark200 shadow-light100_dark100 w-full rounded-[10px] border px-4 py-8 shadow-md sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h1 className="h2-bold text-dark100_light900">
                Welcome back — please sign in
              </h1>
              {/* <p className="paragraph-regular text-dark500_light400">
                Enter your email and password to continue.
              </p> */}
            </div>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
};

export default AuthLayout;
