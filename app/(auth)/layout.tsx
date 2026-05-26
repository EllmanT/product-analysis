import Image from "next/image";
import React, { ReactNode } from "react";

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-light bg-cover bg-center bg-no-repeat px-4 py-10 dark:bg-auth-dark">
      <div className="w-full max-w-md">
        <section className="light-border background-light800_dark200 shadow-light100_dark100 w-full rounded-[10px] border px-4 py-8 shadow-md sm:px-8">
          <div
            className="mb-6 flex items-baseline justify-center gap-0"
            aria-label="StockFlow"
          >
            <span className="text-xl font-bold tracking-tight text-dark100_light900">
              Stock
            </span>
            <Image
              src="images/site-logo.svg"
              alt=""
              height={40}
              width={40}
              className="ml-0.5 h-10 w-10 -z-12 shrink-0 translate-y-4 object-contain"
              aria-hidden
            />
            <span className="-ml-2 text-xl font-bold tracking-tight text-dark100_light900">
              low
            </span>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h1 className="h2-bold text-dark100_light900">
                Welcome back — please sign in
              </h1>
            </div>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
};

export default AuthLayout;
