"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DefaultValues,
  FieldValues,
  Path,
  SubmitHandler,
  useForm,
} from "react-hook-form";
import { z, ZodType } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";

import ROUTES from "@/constants/route";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";

interface AuthFormProps<T extends FieldValues> {
  schema: ZodType<T>;
  defaultValues: T;
  onSubmit: (data: T) => Promise<ActionResponse>;
  formType: "SIGN_IN" | "SIGN_UP";
  menuItems?:Branch[]
}

const AuthForm = <T extends FieldValues>({
  schema,
  defaultValues,
  formType,
  onSubmit,
  menuItems
}: AuthFormProps<T>) => {
  // 1. Define your form.
  const router = useRouter();
  const [forgotOpen, setForgotOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<T>,
  });
    console.log("here now 1")
    console.log(defaultValues)
  console.log(menuItems)
  const handleSubmit: SubmitHandler<T> = async (data) => {
  console.log("here now !!!!!!")
    console.log("data", data)
    const result = (await onSubmit(data)) as ActionResponse;

    if (result?.success) {
      router.push(ROUTES.HOME);
    } else {
      const message =
        result?.error?.message ??
        (formType === "SIGN_IN" ? "Sign in failed." : "Sign up failed.");
      toast.error(message);
    }
  };

  const buttonText = formType === "SIGN_IN" ? "Sign In" : "Sign Up";

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="mt-10 space-y-6 " 
      >
        {Object.keys(defaultValues).map((field) => (
          <FormField
            key={field}
            control={form.control}
            name={field as Path<T>}
            render={({ field }) => (
              <FormItem className="flex w-full flex-col gap-2.5">
                <FormLabel className="paragraph-medium text-dark400_light700">
                  {field.name === "email"
                    ? "Email Address"
                    : field.name !=="storeId" &&field.name.charAt(0).toUpperCase() + field.name.slice(1)}
                </FormLabel>
               <FormControl>
              {/* 👇 Conditionally render a dropdown for `branchId`, otherwise Input */}
              {field.name === "branchId" ? (
                
                 <Select onValueChange={field.onChange} defaultValue={field.value}
                 value={field.value}
                 >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
           {menuItems &&menuItems.map((item)=>(
                    <SelectItem key={item._id} value={item._id}>{item.name} {item.location}</SelectItem>

          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
 
               
              ) : (
                field.name !=="storeId"&& (
                  <Input
                  required
                  type={field.name === "password" ? "password" : "text"}
                  className="paragraph-regular background-light900_dark300 light-border-2 text-dark300_light700 no-focus min-h-12 rounded-1.5 border"
                  {...field}
                />
                
                )
              
              )}
            </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <Button
          // disabled={form.formState.isSubmitting}
          className="primary-gradient paragraph-medium min-h-12 w-full rounded-2 px-4 py-3 font-inter !text-light-900"
          type="submit"
          // onClick={handleClick}
        >
          {form.formState.isSubmitting
            ? buttonText === "Sign In"
              ? "Signing In...."
              : "Signing Up...."
            : buttonText}
        </Button>

        {formType === "SIGN_IN" && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                const currentEmail = form.getValues("email" as Path<T>) as string;
                if (!currentEmail) {
                  form.setError("email" as Path<T>, { message: "Please enter your email address first" });
                  return;
                }
                setForgotOpen(true);
              }}
              className="paragraph-regular primary-text-gradient hover:underline underline-offset-4"
            >
              Forgot password?
            </button>
          </div>
        )}

        {formType === "SIGN_IN" ? (
          <p>
            Dont have an account?{" "}
            <Link
              href={ROUTES.SIGN_UP}
              className="paragraph-semibold primary-text-gradient"
            >
              Sign Up
            </Link>
          </p>
        ) : (
          <p>
            Already have an account?{" "}
            <Link
              href={ROUTES.SIGN_IN}
              className="paragraph-semibold primary-text-gradient"
            >
              Sign In
            </Link>
          </p>
        )}

        <ForgotPasswordModal
          open={forgotOpen}
          onClose={() => setForgotOpen(false)}
          email={form.getValues("email" as Path<T>) as string ?? ""}
        />
      </form>
    </Form>
  );
};
export default AuthForm;
