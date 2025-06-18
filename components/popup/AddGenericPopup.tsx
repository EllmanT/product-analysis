"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, SubmitHandler, FieldValues, Path, DefaultValues } from "react-hook-form";
import { z, ZodType } from "zod";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// import { toast } from "@/hooks/use-toast";

interface GenericFormProps<T extends FieldValues> {
  title?: string;
  schema: ZodType<T>;
  defaultValues: T;
  onSubmit: (data: T) => Promise<ActionResponse>;
  submitText?: string;
}

const GenericForm = <T extends FieldValues>({
  title,
  schema,
  defaultValues,
  onSubmit,
  submitText = "Submit",
}: GenericFormProps<T>) => {
  // 1. Define your form.
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<T>,
  });
  const handleSubmit: SubmitHandler<T> = async (data) => {
    const result = (await onSubmit(data)) as ActionResponse;

    if (result?.success) {
      // toast({ title: "Success", description: "Action successful!" });
    } else {
      // toast({ title: "Error", description: result?.error?.message, variant: "destructive" });
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="mt-10 space-y-6"
      >
        {title && <h2 className="text-xl font-bold">{title}</h2>}

        {Object.keys(defaultValues).map((field) => (
          <FormField
            key={field}
            control={form.control}
            name={field as Path<T>}
            render={({ field }) => (
              <FormItem className="flex w-full flex-col gap-2.5">
                <FormLabel className="text-sm font-semibold capitalize">
                  {field.name.replace(/([A-Z])/g, " $1")}
                </FormLabel>
                <FormControl>
                  <Input
                    required
                    type={field.name.toLowerCase().includes("password") ? "password" : "text"}
                    className="min-h-12 rounded-md border px-4 py-2"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <Button
          disabled={form.formState.isSubmitting}
          className="w-full rounded-md bg-primary px-4 py-3 text-white"
          type="submit"
        >
          {form.formState.isSubmitting ? "Submitting..." : submitText}
        </Button>
      </form>
    </Form>
  );
};

export default GenericForm;
