"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// import { toast } from "@/hooks/use-toast";
import ROUTES from "@/constants/route";
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
      // toast({
      //   title: "Success",
      //   description:
      //     formType === "SIGN_IN"
      //       ? "You have successfully signed in"
      //       : "You have successfully signed up",
      // });
      console.log(result?.status)

      router.push(ROUTES.HOME);
    } else {
      // toast({
      //   title: `Error ${result?.status}`,
      //   description: result?.error?.message,
      //   variant: "destructive",
      // });
      console.log(result?.status)
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
      </form>
    </Form>
  );
};
export default AuthForm;
